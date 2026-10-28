#!/usr/bin/env node
// T21: test-results/report.json (Playwright json reporter) + raw .webm
//   → test-gifs/<CASE>.gif   ทุกเคส (5 fps · กว้าง 720 px · เวลาเท่าจริง ให้คนดูทัน · หลายหน้า = วางคู่กัน · หลาย test = ต่อกัน)
//   → test-videos/<CASE>.mp4 เคส T/V (voice.mp4 ที่ saveVoiceMp4 mux เสียงคำถาม+คำตอบไว้แล้ว) + ตรวจ stream เสียงด้วย ffmpeg
//   → test-results/media.json (สรุปให้ make-report.mjs)
// usage: node scripts/make-media.mjs [CASE ...]   (env SS_OUTPUT_DIR = โฟลเดอร์ผล · ค่าเริ่มต้น e2e/test-results)
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const E2E = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(E2E, '..');
const OUT = path.resolve(E2E, process.env.SS_OUTPUT_DIR || 'test-results');
const VARIANT = process.env.SS_MEDIA_VARIANT || '';
if (VARIANT && VARIANT !== 'ai') throw new Error('SS_MEDIA_VARIANT must be ai or empty');
const GIFS = path.join(ROOT, 'test-gifs', VARIANT);
const VIDEOS = path.join(ROOT, 'test-videos', VARIANT);
let TMP = '';
const only = new Set(process.argv.slice(2));

const ff = args => execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-threads', '4', ...args], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 1 << 26 });
const probe = file => spawnSync(ffmpegPath, ['-hide_banner', '-i', file], { encoding: 'utf8' }).stderr;
function duration(file) {
  const m = probe(file).match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
}

function findWebm(id) {
  const found = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.webm') && e.name !== 'question-and-answer.webm') found.push(p);
    }
  };
  for (const base of new Set(VARIANT ? [OUT] : [OUT, path.join(E2E, 'test-results')])) {
    if (!fs.existsSync(base)) continue;
    for (const e of fs.readdirSync(base, { withFileTypes: true })) if (e.isDirectory() && e.name.startsWith(`${id}-`)) walk(path.join(base, e.name));
  }
  // window-1 … window-20 in numeric order
  return found.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

/** collect tests from the json reporter → Map<CASE, [{title, status, videos[], voiceMp4, metrics}]> */
export function collect(reportFile = path.join(OUT, 'report.json')) {
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const cases = new Map();
  const walk = suite => {
    for (const spec of suite.specs || []) {
      const id = spec.title.match(/^([A-Z]\d\d)\b/)?.[1];
      if (!id) continue;
      for (const t of spec.tests) {
        const r = t.results.at(-1) || {};
        const att = r.attachments || [];
        const body = name => {
          const a = att.find(x => x.name === name);
          if (!a) return null;
          if (a.body) return JSON.parse(Buffer.from(a.body, 'base64').toString('utf8'));
          if (a.path && fs.existsSync(a.path)) return JSON.parse(fs.readFileSync(a.path, 'utf8'));
          return null;
        };
        let videos = att.filter(a => a.name === 'video' && a.path && fs.existsSync(a.path)).map(a => a.path);
        // tests that open their own browser/contexts (D03 · Q01) record into <OUT>/<ID>-…/ without attaching
        if (!videos.length) videos = findWebm(id);
        const list = cases.get(id) || [];
        list.push({
          title: spec.title, file: spec.file, status: r.status, duration: r.duration,
          error: r.error?.message?.replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 3).join(' '),
          videos,
          voiceMp4: att.find(a => a.name === 'voice-mp4')?.path,
          metrics: body('voice-metrics'), rounds: body('all-rounds'),
        });
        cases.set(id, list);
      }
    }
    for (const s of suite.suites || []) walk(s);
  };
  for (const s of report.suites) walk(s);
  return cases;
}

/** one test → one clip (several pages of the same test in a grid, each padded to the longest) */
function testClip(videos, out) {
  if (videos.length === 1) { ff(['-i', videos[0], '-vf', 'fps=5,scale=720:-2', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', out]); return; }
  const lens = videos.map(duration);
  const longest = Math.max(...lens);
  const cols = Math.ceil(Math.sqrt(videos.length));
  const rows = Math.ceil(videos.length / cols);
  const w = Math.floor(1440 / cols / 2) * 2;
  const h = Math.floor((w * 0.75) / 2) * 2;
  const inputs = videos.flatMap(v => ['-i', v]);
  const scaled = videos.map((v, i) => `[${i}:v]fps=5,scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,tpad=stop_mode=clone:stop_duration=${Math.ceil(longest - lens[i] + 1)}[v${i}]`).join(';');
  const layout = videos.map((_, i) => `${(i % cols) * w}_${Math.floor(i / cols) * h}`).join('|');
  ff([...inputs, '-filter_complex', `${scaled};${videos.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${videos.length}:layout=${layout}:fill=black,scale=${cols * w}:${rows * h}[o]`, '-map', '[o]', '-t', String(longest), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', out]);
}

function makeGif(id, tests) {
  const clips = [];
  tests.forEach((t, i) => {
    if (!t.videos.length) return;
    const clip = path.join(TMP, `${id}-${i}.mp4`);
    testClip(t.videos, clip);
    clips.push(clip);
  });
  if (!clips.length) return null;
  let src = clips[0];
  if (clips.length > 1) {
    src = path.join(TMP, `${id}-all.mp4`);
    // normalise sizes before concat (a single-page clip is 720 wide, a two-page clip 1440)
    const inputs = clips.flatMap(c => ['-i', c]);
    const norm = clips.map((_, i) => `[${i}:v]scale=1440:900:force_original_aspect_ratio=decrease,pad=1440:900:(ow-iw)/2:(oh-ih)/2,setsar=1[c${i}]`).join(';');
    ff([...inputs, '-filter_complex', `${norm};${clips.map((_, i) => `[c${i}]`).join('')}concat=n=${clips.length}:v=1:a=0[o]`, '-map', '[o]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', src]);
  }
  const gif = path.join(GIFS, `${id}.gif`);
  const width = clips.length > 1 || tests.some(t => t.videos.length > 1) ? 960 : 720;
  ff(['-i', src, '-vf', `fps=5,scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, '-loop', '0', gif]);
  return { gif: path.relative(ROOT, gif), seconds: +duration(src).toFixed(1), gifMB: +(fs.statSync(gif).size / 1e6).toFixed(2), pages: tests.map(t => t.videos.length) };
}

// เคส V ที่ spec ไม่ได้เล่นเสียง/ไม่ได้ mux เสียงเอง (V06: หยุด stt-worker แล้วตรวจว่า "ข้อความและ TTS ยังใช้ได้")
// → ถามคำถามเดียวกันกับระบบจริงอีกครั้ง (/api/chat) แล้วสังเคราะห์คำตอบด้วย /api/tts ของระบบ
//   วางเสียงช่วงค้างภาพท้ายวิดีโอ · ระบุใน media.json ว่า audioSource = 'post-run-tts'
const POST_RUN_TTS = { V06: 'B-500 ขั้นต่ำกี่ใบ' };
const BASE_URL = process.env.BASE_URL || 'http://localhost:3600';
async function postRunTts(question) {
  const chat = await fetch(`${BASE_URL}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: question, tts: false }) });
  const events = (await chat.text()).split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)));
  const answer = events.find(e => e.type === 'done')?.text;
  if (!answer) throw new Error(`post-run chat: no answer for ${question}`);
  const tts = await (await fetch(`${BASE_URL}/api/tts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: answer }) })).json();
  const wav = Buffer.from(await (await fetch(`${BASE_URL}/api/tts/${tts.audioId}`)).arrayBuffer());
  const file = path.join(TMP, `${tts.audioId}.wav`);
  fs.writeFileSync(file, wav);
  return { file, durationMs: tts.durationMs, answer };
}

async function makeMp4(id, tests) {
  const t = tests.find(x => x.voiceMp4 && fs.existsSync(x.voiceMp4));
  const mp4 = path.join(VIDEOS, `${id}.mp4`);
  let audioSource = 'test-capture';
  let extra = {};
  if (t) {
    // re-encode smaller for the repo; keep the audio track as-is (aac)
    ff(['-i', t.voiceMp4, '-map', '0:v:0', '-map', '0:a:0', '-vf', 'scale=960:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', mp4]);
  } else if (POST_RUN_TTS[id] && tests[0]?.videos.length) {
    const video = tests[0].videos[0];
    const tts = await postRunTts(POST_RUN_TTS[id]);
    const at = Math.max(0, duration(video) - tts.durationMs / 1000 - 0.5);
    ff(['-i', video, '-i', tts.file, '-filter_complex', `[1:a]aresample=48000,adelay=${Math.round(at * 1000)}:all=1,apad[a]`, '-map', '0:v:0', '-map', '[a]', '-shortest', '-vf', 'scale=960:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', mp4]);
    audioSource = 'post-run-tts';
    extra = { audioAt: +at.toFixed(2), ttsMs: tts.durationMs, answer: tts.answer };
  } else return { mp4: null, audio: false };
  const info = probe(mp4);
  const audioStream = info.match(/Stream #\S+: Audio: [^\n]+/)?.[0] || null;
  const vol = spawnSync(ffmpegPath, ['-hide_banner', '-i', mp4, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const mean = vol.match(/mean_volume: (-?[\d.]+) dB/)?.[1];
  const max = vol.match(/max_volume: (-?[\d.]+) dB/)?.[1];
  return { ...extra, audioSource, mp4: path.relative(ROOT, mp4), mp4MB: +(fs.statSync(mp4).size / 1e6).toFixed(2), audio: !!audioStream && max !== undefined && +max > -60, audioStream, meanVolumeDb: mean ? +mean : null, maxVolumeDb: max ? +max : null };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't21-media-'));
  fs.mkdirSync(GIFS, { recursive: true });
  fs.mkdirSync(VIDEOS, { recursive: true });
  const cases = collect();
  const mediaFile = path.join(OUT, 'media.json');
  const media = fs.existsSync(mediaFile) ? JSON.parse(fs.readFileSync(mediaFile, 'utf8')) : {};
  for (const [id, tests] of [...cases].sort()) {
    if (only.size && !only.has(id)) continue;
    const t0 = Date.now();
    const entry = { ...makeGif(id, tests) };
    if (/^[TV]\d\d$/.test(id)) Object.assign(entry, await makeMp4(id, tests));
    media[id] = entry;
    console.log(`${id}: ${entry.gif ? `gif ${entry.gifMB} MB ${entry.seconds}s` : 'ไม่มีวิดีโอ'}${entry.mp4 !== undefined ? ` · mp4 ${entry.mp4 ? `${entry.mp4MB} MB เสียง ${entry.audio ? 'มี' : 'ไม่มี'} (max ${entry.maxVolumeDb} dB)` : 'ไม่มี'}` : ''} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  fs.writeFileSync(mediaFile, JSON.stringify(media, null, 2));
  fs.rmSync(TMP, { recursive: true, force: true });
}
