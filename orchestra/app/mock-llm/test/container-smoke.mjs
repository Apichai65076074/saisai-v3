// Runs inside the built image: native ffmpeg + espeak-ng, no dev dependencies.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transcribe, processBytes, speech } from '../lib/audio.mjs';
const dir = new URL('../../e2e/voice-fixtures/', import.meta.url);
const fixtures = JSON.parse(await readFile(new URL('questions.json', dir)));
for (const fixture of fixtures) {
  const wav = await readFile(new URL(fixture.file, dir));
  assert.equal((await transcribe(wav)).text, fixture.text);
  const webm = await processBytes('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-c:a', 'libopus', '-f', 'webm', 'pipe:1'], wav);
  assert.equal((await transcribe(webm)).text, fixture.text);
}
for (const [lang, text] of [['th', 'สวัสดีค่ะ น้องใสยินดีให้บริการค่ะ'], ['en', 'Hello, welcome to SaiSai Glassware.']]) {
  const wav = await speech(text, lang);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  const pcm = await processBytes('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 's16le', '-ar', '16000', '-ac', '1', 'pipe:1'], wav);
  assert.ok(pcm.length / 32000 > 1);
}
console.log('Image smoke: native STT exact + Opus 10/10; TTS th/en WAV > 1 second: PASS');
