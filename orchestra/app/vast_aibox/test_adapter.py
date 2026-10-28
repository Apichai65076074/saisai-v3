"""CPU-only adapter contracts. GPU measurements live in eval/results separately."""
import asyncio
import threading
import time
import importlib.util
import io
import os
from pathlib import Path
from types import SimpleNamespace
import unittest

from fastapi.testclient import TestClient

os.environ['MODELS'] = ''
os.environ['AIBOX_API_KEY'] = 'unit-only-key'
spec = importlib.util.spec_from_file_location('adapter', Path(__file__).with_name('server.py'))
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class Engine:
    def __init__(self, language):
        self.language = language
        self.languages = []
        self.options = []

    def transcribe(self, path, language=None, **kwargs):
        self.languages.append(language)
        self.options.append(kwargs)
        result = language or self.language
        return iter([SimpleNamespace(text='ไทย' if result == 'th' else 'English')]), SimpleNamespace(language=result, duration=2.5)


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.engine = Engine('vi')
        adapter.STATE.clear()
        adapter.STATE['stt'] = {'large-v3': self.engine, 'large-v3-turbo': self.engine}
        self.context = TestClient(adapter.app)
        self.client = self.context.__enter__()
        self.headers = {'Authorization': 'Bearer unit-only-key'}

    def tearDown(self):
        self.context.__exit__(None, None, None)

    def test_bearer_is_required_for_inference_and_metrics(self):
        self.assertEqual(self.client.get('/health').status_code, 200)
        self.assertEqual(self.client.get('/metrics').status_code, 401)
        response = self.client.post('/v1/audio/transcriptions', files={'file': ('voice.wav', b'RIFF')})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(self.engine.languages, [])

    def test_unsupported_auto_language_retries_thai(self):
        response = self.client.post('/v1/audio/transcriptions', headers=self.headers,
                                    files={'file': ('voice.wav', b'RIFF')})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['language'], 'th')
        self.assertEqual(response.json()['text'], 'ไทย')
        self.assertEqual(self.engine.languages, [None, 'th'])

    def test_english_and_explicit_language_are_preserved(self):
        self.engine.language = 'en'
        response = self.client.post('/v1/audio/transcriptions', headers=self.headers,
                                    files={'file': ('voice.wav', b'RIFF')})
        self.assertEqual(response.json()['language'], 'en')
        self.assertEqual(self.engine.languages, [None])
        response = self.client.post('/v1/audio/transcriptions', headers=self.headers,
                                    data={'language': 'th'}, files={'file': ('voice.wav', b'RIFF')})
        self.assertEqual(response.json()['language'], 'th')
        self.assertEqual(self.engine.languages, [None, 'th'])

    def test_decode_policy_is_bounded_and_no_cache(self):
        self.client.post('/v1/audio/transcriptions', headers=self.headers,
                         files={'file': ('voice.wav', b'RIFF')})
        self.assertTrue(all(o['vad_filter'] and o['beam_size'] == 1 and
                            o['temperature'] == 0 and not o['condition_on_previous_text']
                            for o in self.engine.options))
        health = self.client.get('/health').json()
        self.assertEqual(health['stt_execution_concurrency'], 1)
        self.assertEqual(health['audio_cache'], 'off')
        self.assertGreater(len(self.client.get('/metrics', headers=self.headers).json()['stt_recent_timings']), 0)

    def test_concurrent_lazy_decode_is_serialized_without_losing_requests(self):
        from starlette.datastructures import UploadFile
        active = 0
        peak = 0
        calls = 0
        lock = threading.Lock()
        def decode(path, **kwargs):
            def segments():
                nonlocal active, peak, calls
                with lock:
                    active += 1
                    peak = max(peak, active)
                    calls += 1
                time.sleep(.03)
                yield SimpleNamespace(text='ไทย')
                with lock: active -= 1
            return segments(), SimpleNamespace(language='th', duration=2)
        self.engine.transcribe = decode
        async def concurrent():
            adapter.STT_EXECUTION = asyncio.Lock()
            adapter.GATES['stt'] = asyncio.Semaphore(4)
            return await asyncio.gather(*[adapter.transcribe(UploadFile(io.BytesIO(b'RIFF')), 'th', None) for _ in range(4)])
        responses = asyncio.run(concurrent())
        self.assertEqual(peak, 1)
        self.assertEqual(calls, 4)
        self.assertEqual([r['text'] for r in responses], ['ไทย'] * 4)

    def test_oversize_audio_never_reaches_gpu(self):
        response = self.client.post('/v1/audio/transcriptions', headers=self.headers,
            files={'file': ('voice.wav', b'x' * (2 * 1024 * 1024 + 1))})
        self.assertEqual(response.status_code, 413)
        self.assertEqual(self.engine.languages, [])


if __name__ == '__main__':
    unittest.main()
