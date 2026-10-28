"""SaiSai real GPU adapter. No output, prefix, result or audio reuse."""
import asyncio
from contextlib import asynccontextmanager
import hmac
import io
import os
from pathlib import Path
import tempfile
import time

from fastapi import FastAPI, Header, HTTPException, UploadFile, File, Form, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field

MODELS = set(os.environ.get('MODELS', '').split(','))
STATE = {}
COUNTERS = {'stt': 0, 'tts': 0, 'rerank': 0}
GATES = {name: asyncio.Semaphore(n) for name, n in [('stt', 4), ('tts', 2), ('rerank', 4)]}
# VoxCPM owns mutable autoregressive KV buffers (setup_cache batch=1).
# Prefetch/admission stays2, but one model instance must execute serially.
TTS_EXECUTION = asyncio.Lock()
STT_EXECUTION = asyncio.Lock()
STT_DECODE = dict(beam_size=1, best_of=1, temperature=0.0, vad_filter=True,
                  condition_on_previous_text=False)
STT_TIMINGS = []


def auth(authorization: str = Header(default='')):
    key = os.environ.get('AIBOX_API_KEY', '')
    if not key or not hmac.compare_digest(authorization, 'Bearer ' + key):
        raise HTTPException(401, 'Unauthorized')


def load():
    if 'stt' in MODELS:
        from faster_whisper import WhisperModel
        STATE['stt'] = {name: WhisperModel(name, device='cuda', compute_type='float16', cpu_threads=4, num_workers=1)
                        for name in ('large-v3', 'large-v3-turbo')}
    if 'tts' in MODELS:
        import torch
        from voxcpm import VoxCPM
        if not torch.cuda.is_available():
            raise RuntimeError('VoxCPM2 requires CUDA')
        STATE['tts'] = VoxCPM.from_pretrained('openbmb/VoxCPM2', load_denoiser=False, device='cuda', optimize=True)
        if type(STATE['tts'].tts_model).__name__ != 'VoxCPM2Model' or STATE['tts'].tts_model.sample_rate != 48000:
            raise RuntimeError('VoxCPM2 architecture and 48 kHz output are required')
        if next(STATE['tts'].tts_model.parameters()).device.type != 'cuda':
            raise RuntimeError('VoxCPM2 did not load on CUDA')
    if 'rerank' in MODELS:
        from sentence_transformers import CrossEncoder
        STATE['rerank'] = CrossEncoder('BAAI/bge-reranker-v2-m3', device='cuda', model_kwargs={'torch_dtype': 'float16'})


@asynccontextmanager
async def lifespan(app):
    await asyncio.to_thread(load)
    yield


app = FastAPI(lifespan=lifespan)


@app.middleware('http')
async def no_response_cache(request, call_next):
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    return response


@app.get('/health')
def health():
    return {'status': 'ok', 'models': {m: ('VoxCPM2' if m == 'tts' else os.environ.get('WHISPER_MODEL', 'large-v3') if m == 'stt' else 'bge-reranker-v2-m3') for m in STATE},
            'response_cache': 'off', 'audio_cache': 'off', 'tts_execution_concurrency': 1, 'stt_execution_concurrency': 1, 'stt_decode': STT_DECODE}


def require(name):
    if name not in STATE:
        raise HTTPException(503, 'Model unavailable')
    return STATE[name]


@app.get('/metrics', dependencies=[Depends(auth)])
def metrics():
    return {'upstream_calls': dict(COUNTERS), 'response_cache': 'off', 'audio_cache': 'off', 'stt_recent_timings': list(STT_TIMINGS)}


@app.post('/v1/audio/transcriptions', dependencies=[Depends(auth)])
async def transcribe(file: UploadFile = File(...), language: str | None = Form(default=None), model: str | None = Form(default=None)):
    engines = require('stt')
    engine = engines.get(model, engines[os.environ.get('WHISPER_MODEL', 'large-v3')])
    raw = await file.read(2 * 1024 * 1024 + 1)
    if len(raw) > 2 * 1024 * 1024:
        raise HTTPException(413, 'Audio too large')
    queued = time.monotonic()
    def work():
        with tempfile.NamedTemporaryFile(suffix='.audio') as audio:
            audio.write(raw)
            audio.flush()
            segments, info = engine.transcribe(audio.name, language=language if language in ('th', 'en') else None,
                **STT_DECODE, initial_prompt='ขวดแก้ว B-100 B-150 B-250 B-500 สีชา พิมพ์โลโก้ เลขล็อต เครดิต ใบเสนอราคา')
            # The shop supports Thai/English. A short Thai utterance may be
            # misdetected as Vietnamese; retry in Thai without using fixture text.
            if info.language not in ('th', 'en'):
                segments, info = engine.transcribe(audio.name, language='th',
                    **STT_DECODE, initial_prompt='ขวดแก้ว B-100 B-150 B-250 B-500 สีชา พิมพ์โลโก้ เลขล็อต เครดิต ใบเสนอราคา')
            text = ''.join(s.text for s in segments).strip()
            return {'text': text, 'language': info.language, 'duration': info.duration}
    async with GATES['stt']:
        async with STT_EXECUTION:
            started = time.monotonic()
            COUNTERS['stt'] += 1
            try:
                return await asyncio.to_thread(work)
            finally:
                timing = {'queue_ms': round((started-queued)*1000), 'decode_ms': round((time.monotonic()-started)*1000)}
                STT_TIMINGS.append(timing)
                del STT_TIMINGS[:-40]
                print('stt_timing', timing, flush=True)


class STTChoice(BaseModel):
    model: str


@app.post('/admin/stt/select', dependencies=[Depends(auth)])
def select_stt(body: STTChoice):
    if body.model not in require('stt'):
        raise HTTPException(400, 'Unknown model')
    os.environ['WHISPER_MODEL'] = body.model
    return {'model': body.model}


class Speech(BaseModel):
    input: str = Field(min_length=1, max_length=600)
    voice: str = 'nongsai'
    language: str = 'th'
    model: str | None = None
    response_format: str | None = None


@app.post('/v1/audio/speech', dependencies=[Depends(auth)])
async def speak(body: Speech):
    engine = require('tts')
    if body.voice != 'nongsai':
        raise HTTPException(400, 'Unknown voice')
    def work():
        import soundfile as sf
        started = time.monotonic()
        # No text-keyed output or prompt-audio cache is used by this adapter.
        wav = engine.generate(text=body.input, prompt_wav_path='/workspace/voices/nongsai.wav',
            prompt_text=Path('/workspace/voices/nongsai.txt').read_text(encoding='utf-8-sig').strip(),
            reference_wav_path='/workspace/voices/nongsai.wav')
        out = io.BytesIO()
        rate = engine.tts_model.sample_rate
        sf.write(out, wav, rate, format='WAV', subtype='PCM_16')
        return out.getvalue(), len(wav) / rate, time.monotonic()-started
    async with GATES['tts']:
        async with TTS_EXECUTION:
            COUNTERS['tts'] += 1
            wav, duration, elapsed = await asyncio.to_thread(work)
    return Response(wav, media_type='audio/wav', headers={'Cache-Control': 'no-store',
        'X-Engine': 'VoxCPM2', 'X-Audio-Duration': str(duration), 'X-Generation-Seconds': str(elapsed),
        'X-RTF': str(elapsed/duration) if duration else 'unavailable'})


class Rerank(BaseModel):
    query: str
    documents: list[str]
    model: str | None = None


@app.post('/v1/rerank', dependencies=[Depends(auth)])
async def rerank(body: Rerank):
    engine = require('rerank')
    async with GATES['rerank']:
        COUNTERS['rerank'] += 1
        scores = await asyncio.to_thread(engine.predict, [(body.query, d) for d in body.documents])
    return {'results': sorted([{'index': i, 'relevance_score': float(s), 'score': float(s)} for i, s in enumerate(scores)],
                             key=lambda r: r['relevance_score'], reverse=True)}
