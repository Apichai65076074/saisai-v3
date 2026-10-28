import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const fixtureDir = fileURLToPath(new URL('../../e2e/voice-fixtures/', import.meta.url));
export const digest = data => createHash('sha256').update(data).digest('hex');
let fixtures;
async function index() { return fixtures ||= JSON.parse(await readFile(`${fixtureDir}index.json`, 'utf8')); }
export function processBytes(binary, args, input, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let bytes = 0;
    const chunks = [];
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Audio process timed out')); }, timeoutMs);
    child.stdout.on('data', b => { bytes += b.length; if (bytes > 8 * 1024 * 1024) child.kill('SIGKILL'); else chunks.push(b); });
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('Audio process failed')); });
    child.stdin.end(input);
  });
}
export function decode(bytes) {
  return processBytes(process.env.FFMPEG_BIN || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-t', '31', '-f', 's16le', '-ac', '1', '-ar', '16000', 'pipe:1'], bytes);
}
export function fingerprint(pcm) {
  const envelope = [];
  for (let i = 0; i + 320 <= pcm.length; i += 320) {
    let sum = 0;
    for (let j = i; j < i + 320; j += 2) sum += (pcm.readInt16LE(j) / 32768) ** 2;
    envelope.push(Math.sqrt(sum / 160));
  }
  const peak = Math.max(0, ...envelope);
  if (peak < 0.003) return [];
  let start = envelope.findIndex(x => x > peak * 0.035);
  let end = envelope.findLastIndex(x => x > peak * 0.035) + 1;
  return envelope.slice(start, end).map(x => x / peak);
}
export function similarity(a, b) {
  if (!a.length || !b.length || Math.min(a.length, b.length) / Math.max(a.length, b.length) < 0.82) return 0;
  // Small shifts and resampling tolerate Opus frame padding and MediaRecorder clocks.
  let best = 0;
  for (const scale of [1, a.length / b.length]) for (let shift = -8; shift <= 8; shift++) {
    let xy = 0, xx = 0, yy = 0;
    const meanA = a.reduce((sum, x) => sum + x, 0) / a.length;
    const meanB = b.reduce((sum, x) => sum + x, 0) / b.length;
    for (let i = 0; i < b.length; i++) {
      const at = Math.round(i * scale) + shift;
      const x = (a[at] || 0) - meanA, y = b[i] - meanB;
      xy += x * y; xx += x * x; yy += y * y;
    }
    best = Math.max(best, xy / (Math.sqrt(xx * yy) || 1));
  }
  return best;
}
let referencePromise;
async function references() {
  if (!referencePromise) referencePromise = Promise.all(Object.values(await index()).map(async entry => ({ entry, envelope: fingerprint(await decode(await readFile(fixtureDir + entry.file))) }))).catch(error => { referencePromise = null; throw error; });
  return referencePromise;
}
export async function transcribe(bytes) {
  const hit = (await index())[digest(bytes)];
  if (hit) return { text: hit.text, language: hit.language, duration: hit.durationMs / 1000 };
  try {
    const pcm = await decode(bytes);
    const duration = pcm.length / 32000;
    const envelope = fingerprint(pcm);
    if (!envelope.length || duration > 30) return { text: '', language: 'th', duration };
    const ranked = (await references()).map(r => ({ ...r, score: similarity(envelope, r.envelope) })).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (best?.score >= 0.88 && best.score - (ranked[1]?.score || 0) >= 0.035) return { text: best.entry.text, language: best.entry.language, duration };
    return { text: '', language: 'th', duration };
  } catch { return { text: '', language: 'th', duration: 0 }; }
}
export function toneWav(text) {
  const seconds = Math.max(1.2, Math.min(8, [...text].length * 0.06));
  const frames = Math.round(seconds * 16000);
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) {
    const t = i / 16000;
    const envelope = Math.min(1, t * 20, (seconds - t) * 20) * (0.25 + 0.75 * Math.sin(t * Math.PI * 3.2) ** 2);
    wav.writeInt16LE(Math.round(Math.sin(t * Math.PI * 440) * envelope * 5500), 44 + i * 2);
  }
  return wav;
}
const speechCache = new Map();
export async function speech(text, lang) {
  const key = digest(text + lang);
  // T22: cold measurements also bypass provider memory/disk replay.
  if (process.env.TTS_CACHE !== 'off') {
  if (speechCache.has(key)) return speechCache.get(key);
  try { return await readFile(`${fixtureDir}tts-cache/${key}.wav`); } catch {}
  }
  let wav;
  try {
    wav = await processBytes(process.env.ESPEAK_BIN || 'espeak-ng', ['--stdout', '-v', lang === 'en' ? 'en' : 'th', '--stdin'], Buffer.from(text));
    if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.length < 44) throw new Error('Invalid speech');
    // espeak writes unknown streaming lengths; repair the actual RIFF/data lengths.
    wav.writeUInt32LE(wav.length - 8, 4);
    for (let at = 12; at + 8 <= wav.length;) {
      const length = wav.readUInt32LE(at + 4);
      if (wav.toString('ascii', at, at + 4) === 'data') { wav.writeUInt32LE(wav.length - at - 8, at + 4); break; }
      at += 8 + length + (length % 2);
    }
  } catch { wav = toneWav(text); }
  if (process.env.TTS_CACHE !== 'off') {
  if (speechCache.size >= 100) speechCache.delete(speechCache.keys().next().value);
  speechCache.set(key, wav);
  }
  return wav;
}
