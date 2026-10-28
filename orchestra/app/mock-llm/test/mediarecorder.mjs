// Real Chromium MediaRecorder (same WebAudio stream used by fake microphones).
// Run separately because the ten fixtures take about one minute of real playback.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import ffmpeg from 'ffmpeg-static';
import { createServer } from '../server.mjs';
process.env.FFMPEG_BIN ||= ffmpeg;
const server = createServer({ latencyMs: 0 });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const tab = await browser.newPage();
  await tab.goto(base + '/health');
  const questions = JSON.parse(await readFile(new URL('../../e2e/voice-fixtures/questions.json', import.meta.url)));
  for (const fixture of questions) {
    const wav = await readFile(new URL(`../../e2e/voice-fixtures/${fixture.file}`, import.meta.url));
    const response = await tab.evaluate(async ({ wavB64, base }) => {
      const bytes = Uint8Array.from(atob(wavB64), c => c.charCodeAt(0));
      const context = new AudioContext({ sampleRate: 48000 });
      await context.resume();
      const buffer = await context.decodeAudioData(bytes.buffer);
      const destination = context.createMediaStreamDestination();
      const source = context.createBufferSource(); source.buffer = buffer; source.connect(destination);
      const recorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm;codecs=opus' });
      const parts = [];
      recorder.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
      const stopped = new Promise(resolve => { recorder.onstop = resolve; });
      recorder.start(100);
      source.start(context.currentTime + 0.15);
      await new Promise(resolve => { source.onended = resolve; });
      await new Promise(resolve => setTimeout(resolve, 200));
      recorder.stop(); await stopped; destination.stream.getTracks().forEach(t => t.stop()); await context.close();
      const form = new FormData(); form.append('file', new Blob(parts, { type: recorder.mimeType }), 'microphone.webm');
      return (await fetch(base + '/v1/audio/transcriptions', { method: 'POST', body: form })).json();
    }, { wavB64: wav.toString('base64'), base });
    assert.equal(response.text, fixture.text, fixture.id);
    assert.equal(response.language, fixture.language, fixture.id);
    console.log(`${fixture.id} Chromium MediaRecorder: PASS`);
  }
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
