import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { VOICE_DIR, MODE } from './env';

export type VoiceMetrics = {
  states: string[]; maxMouth: number; speechEndedAt: number; speechStartedAt: number; doneAt: number;
  plays: { seq: number; lang: string; at: number; duration: number }[];
  ended: number[]; micCalls: number; stoppedTracks: number;
  speechActualEndedAt: number; firstAudibleAt: number;
};
declare global {
  interface Window {
    __setMicFile: (url: string) => Promise<number>;
    __micEnded: boolean;
    __voiceMetrics: VoiceMetrics;
    __resetVoiceMetrics: () => void;
    __startVoiceCapture: () => Promise<void>;
    __stopVoiceCapture: () => Promise<{ bytes: number[]; offsetMs: number }>;
    __voiceCaptureActive: boolean;
  }
}

/** Install before navigation. The WAV really passes through WebAudio → MediaRecorder → STT. */
export async function installFakeMic(page: Page) {
  if (MODE === 'ai') {
    // Preserve genuine question/reply audio even when an AI assertion fails.
    // The original test result remains failed; no fixture or answer is replaced.
    const info = test.info();
    const context = page.context();
    const close = context.close.bind(context);
    context.close = async options => {
      if (!page.isClosed() && await page.evaluate(() => window.__voiceCaptureActive === true).catch(() => false)) {
        try { await saveVoiceMp4(page, info); }
        catch (error) {
          await info.attach('voice-capture-error', { body: String(error), contentType: 'text/plain' });
          if (await stat(info.outputPath('voice.mp4')).then(() => true).catch(() => false)) {
            await info.attach('voice-mp4', { path: info.outputPath('voice.mp4'), contentType: 'video/mp4' });
          }
        }
      }
      await close(options);
    };
  }
  await page.route('**/__voice-fixtures/*.wav', async route => {
    const name = path.basename(new URL(route.request().url()).pathname);
    if (!/^V\d{2}\.wav$/.test(name)) return route.abort();
    await route.fulfill({ contentType: 'audio/wav', body: await readFile(path.join(VOICE_DIR, name)) });
  });
  await page.addInitScript(() => {
    let context: AudioContext;
    let mix: MediaStreamAudioDestinationNode;
    let buffer: AudioBuffer | null = null;
    let recorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let offsetMs = 0;
    const ensure = () => {
      if (!context) {
        context = new AudioContext({ sampleRate: 48000 }); mix = context.createMediaStreamDestination();
        // Keep the recorder clock running through silence before/between questions and replies.
        const silence = context.createConstantSource(); silence.offset.value = 0; silence.connect(mix); silence.start();
      }
      return context;
    };
    const fresh = (): VoiceMetrics => ({ states: [], maxMouth: 0, speechEndedAt: 0, speechStartedAt: 0, doneAt: 0, plays: [], ended: [], micCalls: 0, stoppedTracks: 0, speechActualEndedAt: 0, firstAudibleAt: 0 });
    window.__voiceMetrics = fresh();
    window.__resetVoiceMetrics = () => { window.__voiceMetrics = fresh(); };
    window.__micEnded = false;
    window.__voiceCaptureActive = false;
    window.__setMicFile = async url => {
      ensure(); await context.resume();
      buffer = await context.decodeAudioData(await (await fetch(url)).arrayBuffer());
      window.__micEnded = false;
      return buffer.duration;
    };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      if (!buffer) throw new Error('Call __setMicFile first');
      ensure(); await context.resume();
      window.__voiceMetrics.micCalls++;
      const destination = context.createMediaStreamDestination();
      const source = context.createBufferSource(); source.buffer = buffer;
      source.connect(destination); source.connect(mix); // actual question audio in the evidence recording
      source.onended = () => { window.__micEnded = true; window.__voiceMetrics.speechEndedAt = performance.now(); window.__voiceMetrics.speechActualEndedAt = Math.min(window.__voiceMetrics.speechActualEndedAt, performance.now()); };
      for (const track of destination.stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { window.__voiceMetrics.stoppedTracks++; stop(); try { source.stop(); } catch {} source.disconnect(); };
      }
      window.__voiceMetrics.speechStartedAt = performance.now() + 150;
      const pcm = buffer.getChannelData(0);
      let lastSpeech = pcm.length - 1;
      while (lastSpeech >= 0 && Math.abs(pcm[lastSpeech]) <= 0.01) lastSpeech--;
      window.__voiceMetrics.speechActualEndedAt = window.__voiceMetrics.speechStartedAt + (lastSpeech + 1) / buffer.sampleRate * 1000;
      source.start(context.currentTime + 0.15);
      return destination.stream;
    } });
    // Tap the existing mascot WebAudio source: a media element permits only one source node.
    const original = AudioContext.prototype.createMediaElementSource;
    AudioContext.prototype.createMediaElementSource = function(element) {
      const source = original.call(this, element);
      if (element.dataset.testid === 'chat-audio') {
        const audible = this.createAnalyser(); audible.fftSize = 1024; source.connect(audible);
        const samples = new Float32Array(audible.fftSize);
        const detect = () => {
          audible.getFloatTimeDomainData(samples);
          if (!window.__voiceMetrics.firstAudibleAt && samples.some(x => Math.abs(x) > 0.01)) window.__voiceMetrics.firstAudibleAt = performance.now();
          requestAnimationFrame(detect);
        };
        requestAnimationFrame(detect);
        ensure();
        const branch = this.createMediaStreamDestination(); source.connect(branch);
        context.createMediaStreamSource(branch.stream).connect(mix);
      }
      return source;
    };
    window.__startVoiceCapture = async () => {
      ensure(); await context.resume(); chunks = []; offsetMs = performance.now();
      recorder = new MediaRecorder(mix.stream, { mimeType: 'audio/webm;codecs=opus' });
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.start(250);
      window.__voiceCaptureActive = true;
    };
    window.__stopVoiceCapture = async () => {
      const r = recorder;
      if (!r) throw new Error('Capture has not started');
      await new Promise<void>(resolve => { r.onstop = () => resolve(); r.stop(); });
      window.__voiceCaptureActive = false;
      return { bytes: Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())), offsetMs };
    };
    document.addEventListener('playing', event => {
      const el = event.target;
      if (el instanceof HTMLAudioElement && el.dataset.testid === 'chat-audio') {
        window.__voiceMetrics.plays.push({ seq: Number(el.dataset.seq), lang: el.dataset.lang || '', at: performance.now(), duration: el.duration });
      }
    }, true);
    document.addEventListener('ended', event => {
      const el = event.target;
      if (el instanceof HTMLAudioElement && el.dataset.testid === 'chat-audio') window.__voiceMetrics.ended.push(Number(el.dataset.seq));
    }, true);
    const observe = () => new MutationObserver(() => {
      const metrics = window.__voiceMetrics;
      const mascot = document.querySelector('[data-testid="mascot"]');
      const state = mascot?.getAttribute('data-state');
      if (state && metrics.states.at(-1) !== state) metrics.states.push(state);
      metrics.maxMouth = Math.max(metrics.maxMouth, Number(mascot?.getAttribute('data-mouth') || 0));
      const bots = document.querySelectorAll('[data-testid="chat-msg-bot"]');
      if (!metrics.doneAt && bots.length && bots[bots.length - 1].getAttribute('data-done') === 'true') metrics.doneAt = performance.now();
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true });
    if (document.documentElement) observe(); else document.addEventListener('DOMContentLoaded', observe, { once: true });
  });
}

export async function speakFixture(page: Page, id: string) {
  await page.evaluate(() => window.__resetVoiceMetrics());
  await page.evaluate(id => window.__setMicFile(`/__voice-fixtures/${id}.wav`), id);
  const mic = page.getByTestId('voice-mic');
  await expect(mic).toBeEnabled(); await mic.click();
  await expect(page.getByTestId('mascot')).toHaveAttribute('data-state', 'listening');
  await page.waitForFunction(() => window.__micEnded);
  await page.waitForTimeout(200); await mic.click();
}

function run(args: string[]): Promise<string> {
  if (!ffmpeg) throw new Error('ffmpeg-static binary missing');
  const binary = ffmpeg;
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let log = ''; child.stderr.on('data', b => { log += b.toString(); });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(log) : reject(new Error(log)));
  });
}

/** Stop capture before closing the page; mux after close so Playwright finalizes its video. */
export async function saveVoiceMp4(page: Page, info: TestInfo, rounds?: VoiceMetrics[]) {
  const capture = await page.evaluate(() => window.__stopVoiceCapture());
  const metrics = await page.evaluate(() => window.__voiceMetrics);
  const audioPath = info.outputPath('question-and-answer.webm');
  await mkdir(path.dirname(audioPath), { recursive: true });
  await writeFile(audioPath, Buffer.from(capture.bytes));
  const video = page.video(); await page.close();
  if (!video) throw new Error('Playwright video must be enabled');
  const mp4 = info.outputPath('voice.mp4');
  await run(['-y', '-i', await video.path(), '-itsoffset', String(capture.offsetMs / 1000), '-i', audioPath, '-map', '0:v:0', '-map', '1:a:0', '-r', '25', '-c:v', 'libx264', '-threads', '2', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', mp4]);
  const probe = await run(['-i', mp4, '-af', 'volumedetect', '-vn', '-f', 'null', '-']);
  expect(probe).toContain('Audio: aac');
  expect(probe).toMatch(/mean_volume: -\d+(?:\.\d+)? dB/);
  for (const round of rounds || [metrics]) {
    for (const [label, start, end] of [
      ...(round.speechEndedAt ? [['question', round.speechStartedAt, round.speechEndedAt] as const] : []),
      ...round.plays.map(p => ['answer', p.at, p.at + p.duration * 1000] as const),
    ]) {
      const volume = await run(['-i', mp4, '-af', `atrim=start=${start / 1000}:end=${end / 1000},volumedetect`, '-vn', '-f', 'null', '-']);
      expect(volume, `${label} segment must contain sound`).toMatch(/mean_volume: -\d+(?:\.\d+)? dB/);
    }
  }
  const result = { ...metrics, stopToFirstAudioMs: metrics.speechEndedAt && metrics.plays.length ? metrics.plays[0].at - metrics.speechEndedAt : null,
    stopToFirstAudibleMs: metrics.speechActualEndedAt && metrics.firstAudibleAt ? metrics.firstAudibleAt - metrics.speechActualEndedAt : null,
    audibleThreshold: 0.01, audibleSampling: 'WebAudio PCM peak >0.01; requestAnimationFrame; fixture trailing silence excluded' };
  await writeFile(info.outputPath('voice-metrics.json'), JSON.stringify(result, null, 2));
  await info.attach('voice-mp4', { path: mp4, contentType: 'video/mp4' });
  await info.attach('voice-metrics', { body: JSON.stringify(result), contentType: 'application/json' });
  return result;
}

/** Assert each spoken turn independently, including the complete real audio queue. */
export async function assertVoiceTurn(page: Page, fixture: { file: string; text: string; language: string }, answer: RegExp, withAudio = true) {
  const count = await page.getByTestId('chat-msg-bot').count();
  const responsePromise = page.waitForResponse(r => new URL(r.url()).pathname === '/api/chat' && r.request().method() === 'POST');
  await speakFixture(page, fixture.file.replace('.wav', ''));
  const transcript = page.getByTestId('chat-msg-voice').last();
  if (MODE === 'ai') {
    // AI contract: retain the question's numbers/concepts without requiring a
    // character-identical transcript. In particular 17,000 cannot pass 10,000.
    const concepts: Record<string, RegExp[]> = {
      'V01.wav': [/(?:^|\D)250(?:\D|$)|สองร้อยห้าสิบ/, /เขียว/],
      'V02.wav': [/(?:^|\D)10000(?:\D|$)|หมื่น/, /ลด/],
      'V03.wav': [/โลโก้/, /เพิ่ม|ราคา|เท่า/],
      'V04.wav': [/สวรรค์/, /ส่ง/],
      'V05.wav': [/เสนอราคา/],
      'V06.wav': [/เคลม/, /วัน/],
      'V07.wav': [/(?:^|\D)500(?:\D|$)|ห้าร้อย/, /ขั้นต่ำ/],
      'V08.wav': [/minimum/i, /(?:^|\D)150(?:\D|$)|onehundred(?:and)?fifty/i],
      'V09.wav': [/วัน/, /รับ|เร็ว/],
      'V10.wav': [/free/i, /sample/i],
    };
    const checks = concepts[fixture.file];
    expect(checks, `AI transcript checks for ${fixture.file}`).toBeTruthy();
    await expect(transcript).not.toBeEmpty();
    const normalized = (await transcript.innerText()).replace(/[\s,]/g, '');
    for (const check of checks) expect(normalized).toMatch(check);
  } else await expect(transcript).toHaveText(fixture.text);
  const bot = page.getByTestId('chat-msg-bot').nth(count);
  await expect(bot).toHaveAttribute('data-done', 'true', { timeout: 90_000 });
  await expect(bot).toContainText(answer);
  await expect(page.getByTestId('chat-input')).toBeEditable({ timeout: 90_000 });
  const events = (await (await responsePromise).text()).split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  const sentenceCount = events.filter(event => event.type === 'sentence').length;
  if (withAudio) {
    expect(sentenceCount).toBeGreaterThan(0);
    await page.waitForFunction(expected => {
      const m = window.__voiceMetrics;
      return m.ended.length === expected && document.querySelector('[data-testid="mascot"]')?.getAttribute('data-state') === 'idle';
    }, sentenceCount, { timeout: 90_000 });
    const m = await page.evaluate(() => window.__voiceMetrics);
    expect(m.plays.every(p => p.duration > 1)).toBe(true);
    expect(m.plays[0].lang).toBe(fixture.language);
    expect(m.plays.every(p => p.lang === 'th' || p.lang === 'en')).toBe(true);
    expect(m.maxMouth).toBeGreaterThan(0);
    let last = -1;
    for (const state of ['listening', 'thinking', 'talking', 'idle']) {
      last = m.states.indexOf(state, last + 1); expect(last, `${state}: ${m.states}`).toBeGreaterThanOrEqual(0);
    }
  } else {
    expect((await page.evaluate(() => window.__voiceMetrics)).plays).toEqual([]);
  }
  const metrics = await page.evaluate(() => window.__voiceMetrics);
  expect(metrics.micCalls).toBe(1); expect(metrics.stoppedTracks).toBe(1);
  return { fixture: fixture.file, transcript: await page.getByTestId('chat-msg-voice').last().innerText(), answer: await bot.innerText(), ...metrics, stopToFirstAudioMs: metrics.speechEndedAt && metrics.plays.length ? metrics.plays[0].at - metrics.speechEndedAt : null,
    stopToFirstAudibleMs: metrics.speechActualEndedAt && metrics.firstAudibleAt ? metrics.firstAudibleAt - metrics.speechActualEndedAt : null };
}
