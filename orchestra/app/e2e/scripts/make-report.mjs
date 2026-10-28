#!/usr/bin/env node
// T21: test-results/report.json + media.json + unit log → TEST_REPORT.md (คอลัมน์ mock · แถว ai = รอ T22)
// usage: node scripts/make-report.mjs   env: SS_OUTPUT_DIR · SS_UNIT_LOG (ผล `npx vitest run tests/unit/rules.test.ts`)
//        SS_PROBLEM (PROBLEM.md สำหรับคำอธิบายเคส · ไม่มีก็ใช้ชื่อ test) · SS_RUN_INFO (json: {started, finished, command, note})
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect } from './make-media.mjs';

const E2E = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(E2E, '..');
const OUT = path.resolve(E2E, process.env.SS_OUTPUT_DIR || 'test-results');
const GROUPS = [['W', 'เว็บ', 14], ['C', 'แชทบอท', 14], ['R', 'เอกสาร · RAG', 8], ['Q', 'คิว RabbitMQ', 3], ['T', 'อ่านออกเสียง', 3], ['M', 'หลายรอบ', 6], ['V', 'เสียง', 6], ['D', '3D + มาสคอต', 3], ['E', 'ประเมิน RAG', 3], ['L', 'Load dashboard', 2]];
const TOTAL = GROUPS.reduce((n, g) => n + g[2], 0);

const cases = collect();
const media = fs.existsSync(path.join(OUT, 'media.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'media.json'), 'utf8')) : {};
const run = process.env.SS_RUN_INFO && fs.existsSync(process.env.SS_RUN_INFO) ? JSON.parse(fs.readFileSync(process.env.SS_RUN_INFO, 'utf8')) : {};

// คำอธิบายเคสจากตาราง PROBLEM ข้อ 7 (| ID | … | ผ่านเมื่อ |)
const desc = {};
const problem = process.env.SS_PROBLEM || path.resolve(ROOT, '../../PROBLEM.md');
if (fs.existsSync(problem)) {
  for (const line of fs.readFileSync(problem, 'utf8').split('\n')) {
    const m = line.match(/^\| ([A-Z]\d\d) \| (.+) \|\s*$/);
    if (m) desc[m[1]] = m[2].split(' | ').join(' → ').replace(/\|/g, '/');
  }
}
const cell = s => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');

const status = id => {
  const tests = cases.get(id) || [];
  if (!tests.length) return 'missing';
  return tests.every(t => t.status === 'passed') ? 'passed' : tests.find(t => t.status !== 'passed').status;
};
const ids = GROUPS.flatMap(([g, , n]) => Array.from({ length: n }, (_, i) => `${g}${String(i + 1).padStart(2, '0')}`));
const passed = ids.filter(id => status(id) === 'passed');
const gifs = ids.filter(id => media[id]?.gif && fs.existsSync(path.join(ROOT, media[id].gif)));
const tv = ids.filter(id => /^[TV]/.test(id));
const mp4s = tv.filter(id => media[id]?.mp4 && media[id].audio && fs.existsSync(path.join(ROOT, media[id].mp4)));

// unit rules.ts
const unitLog = process.env.SS_UNIT_LOG && fs.existsSync(process.env.SS_UNIT_LOG) ? fs.readFileSync(process.env.SS_UNIT_LOG, 'utf8').replace(/\u001b\[[0-9;]*m/g, '') : '';
const unit = unitLog.match(/Tests\s+(\d+) passed(?: \((\d+)\))?/);
const unitFailed = /Tests\s+.*\d+ failed/.test(unitLog);
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
const RULES_SHA = '1f880cd34c63667d90b7fac8e0cdbd6dfaa0a80ef270cda007e4957dfbf3122c';
const rulesSha = sha('web/lib/rules.ts');
const legacySha = sha('legacy/web/lib/rules.ts');

const L = [];
L.push('# TEST_REPORT — SaiSai v3', '');
L.push('| โหมด | ผ่าน / ทั้งหมด |', '|---|---|');
L.push(`| mock | **${passed.length} / ${TOTAL}** |`);
L.push(`| ai | รอ T22 |`, '');
L.push(`- รันเมื่อ: ${run.started || '-'} → ${run.finished || '-'} (Asia/Bangkok) · ระบบ: \`docker compose --profile mock up -d --build\` (project \`saisai3\` · web :3600 · chat-worker ×2 · stt/tts/rag/notify-worker ×1 · mock-llm)`);
if (run.command) L.push(`- คำสั่ง: \`${run.command}\``);
L.push(`- Playwright 63 test ใน 62 ไฟล์เคส (W14 มี 2 test · นับผ่านเมื่อผ่านทั้งคู่) · workers 1 · retries 0 · video on`);
L.push(`- GIF: **${gifs.length} / ${TOTAL}** ไฟล์ใน \`test-gifs/\` · MP4 มีเสียง (เคส T/V): **${mp4s.length} / ${tv.length}** ไฟล์ใน \`test-videos/\` (ตรวจ stream \`Audio: aac\` + volumedetect)`);
L.push(`- unit \`rules.ts\`: ${unit && !unitFailed ? `**ผ่าน ${unit[1]}${unit[2] ? ` / ${unit[2]}` : ''}**` : '⚠️ ไม่ผ่าน/ไม่มีผล'} · sha256 \`web/lib/rules.ts\` = \`${rulesSha}\` ${rulesSha === RULES_SHA && rulesSha === legacySha ? '✅ ตรงสัญญาและ legacy' : '⚠️ ไม่ตรง'}`);
if (run.note) L.push(`- ${run.note}`);
L.push('');

L.push('## สรุปต่อกลุ่ม (mock)', '', '| กลุ่ม | ผ่าน / ทั้งหมด | ai |', '|---|---|---|');
for (const [g, name, n] of GROUPS) {
  const list = ids.filter(id => id[0] === g);
  L.push(`| ${g} ${name} | ${list.filter(id => status(id) === 'passed').length} / ${n} | รอ T22 |`);
}
L.push(`| **รวม** | **${passed.length} / ${TOTAL}** | รอ T22 |`, '');

for (const [g, name] of GROUPS) {
  L.push(`## ${g} — ${name}`, '');
  const voice = g === 'T' || g === 'V';
  L.push(`| เคส | ผ่านเมื่อ (PROBLEM ข้อ 7) | mock | เวลา | GIF${voice ? ' | MP4 (เสียง)' : ''}${g === 'V' ? ' | หยุดพูด → เสียงแรก' : ''} |`);
  L.push(`|---|---|---|---|---${voice ? '|---' : ''}${g === 'V' ? '|---' : ''}|`);
  for (const id of ids.filter(x => x[0] === g)) {
    const tests = cases.get(id) || [];
    const st = status(id);
    const secs = tests.reduce((s, t) => s + (t.duration || 0), 0) / 1000;
    const m = media[id] || {};
    const what = desc[id] || tests.map(t => t.title.replace(/^[A-Z]\d\d\s*/, '')).join(' · ');
    let row = `| ${id} | ${cell(what)} | ${st === 'passed' ? '✅' : `❌ ${st}${tests.find(t => t.error) ? ` — ${cell(tests.find(t => t.error).error).slice(0, 160)}` : ''}`} | ${secs.toFixed(1)} วิ | ${m.gif ? `[GIF](${m.gif})` : '—'} |`;
    if (voice) row += ` ${m.mp4 ? `[MP4](${m.mp4}) ${m.audio ? `🔊 aac · max ${m.maxVolumeDb} dB${m.audioSource === 'post-run-tts' ? ` · เสียง = TTS ของระบบสำหรับคำตอบเดียวกัน ("${cell(m.answer)}") สร้างหลังรัน วางช่วงค้างภาพ (spec V06 ไม่กดเล่นเสียง)` : ` · ${g === 'T' ? 'เสียงคำตอบ (TTS) ที่เล่นจริงในเทสต์' : id === 'V05' ? 'เสียงคำถามจากไมค์ (คำตอบเป็นข้อความ ไม่เล่นเสียงตามเคส)' : 'เสียงคำถามจากไมค์ + คำตอบ TTS ที่เล่นจริงในเทสต์'}`}` : '⚠️ ไม่มีเสียง'}` : '—'} |`;
    if (g === 'V') {
      const rounds = tests.flatMap(t => Array.isArray(t.rounds) && t.rounds.length ? t.rounds : t.metrics ? [t.metrics] : []);
      const lat = rounds.map(r => r.stopToFirstAudioMs).filter(x => typeof x === 'number');
      row += ` ${lat.length ? lat.map(x => `${(x / 1000).toFixed(2)} วิ`).join(' · ') : (id === 'V06' ? 'ไม่ได้พูด (ไมค์ถูกซ่อนตามเคส)' : 'ไม่เล่นเสียง (ตามเคส)')} |`;
    }
    L.push(row);
  }
  L.push('');
}

{
  const lat = ids.filter(id => id[0] === 'V').flatMap(id => (cases.get(id) || []).flatMap(t => Array.isArray(t.rounds) && t.rounds.length ? t.rounds : t.metrics ? [t.metrics] : [])).map(r => r.stopToFirstAudioMs).filter(x => typeof x === 'number').sort((a, b) => a - b);
  if (lat.length) {
    const sec = x => `${(x / 1000).toFixed(2)} วิ`;
    L.push('## เวลาหยุดพูด → เสียงแรก (V · mock)', '');
    L.push(`- ${lat.length} รอบที่มีเสียงตอบ: ต่ำสุด ${sec(lat[0])} · มัธยฐาน ${sec(lat[Math.floor(lat.length / 2)])} · สูงสุด ${sec(lat.at(-1))}`);
    L.push('- วัดใน browser: เวลาที่ไมค์ปลอมเล่นไฟล์ WAV จบ → `chat-audio` เริ่มเล่นประโยคแรก (รวม STT mock + chat-worker + TTS mock · `MOCK_LATENCY_MS=800` ต่อการเรียกแต่ละครั้ง)', '');
  }
}
const history = path.join(E2E, 'scripts', 'fix-history.md');
if (fs.existsSync(history)) L.push(fs.readFileSync(history, 'utf8').trim(), '');
L.push('## Unit test `rules.ts`', '');
L.push('- คำสั่ง: `cd web && npx vitest run tests/unit/rules.test.ts` (และ `npm test` ทั้งชุด)');
L.push(`- ผล: ${unit ? `${unit[1]} passed` : '-'}${unitFailed ? ' ⚠️ มีที่ไม่ผ่าน' : ''}`);
L.push(`- \`sha256sum web/lib/rules.ts\` = \`${rulesSha}\` · legacy = \`${legacySha}\` · สัญญา = \`${RULES_SHA}\``, '');
L.push('## วิธีสร้างรายงานนี้ใหม่', '');
L.push('```bash');
L.push('cd e2e && COMPOSE_PROJECT=saisai3 MQ_API=http://localhost:15673 BASE_URL=http://localhost:3600 npx playwright test');
L.push('node scripts/make-media.mjs          # → test-gifs/*.gif · test-videos/*.mp4 · test-results/media.json');
L.push('SS_UNIT_LOG=/tmp/unit.log node scripts/make-report.mjs   # → TEST_REPORT.md');
L.push('```', '');
fs.writeFileSync(path.join(ROOT, 'TEST_REPORT.md'), L.join('\n'));
console.log(`TEST_REPORT.md: mock ${passed.length}/${TOTAL} · GIF ${gifs.length} · MP4 เสียง ${mp4s.length}/${tv.length} · unit ${unit?.[1] ?? '-'}`);
