// สร้างตารางตัวเลขของ eval/REPORT.md จากผลที่ score แล้ว 2 run (on/off)
//   node eval/tools/report.mjs --on mock-rerank-on --off mock-rerank-off > /tmp/tables.md
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const load = (label) => JSON.parse(readFileSync(path.join(here, '../results', `${label}.json`), 'utf8'));
const on = load(arg('--on', 'mock-rerank-on')), off = load(arg('--off', 'mock-rerank-off'));
const p = (x) => (x == null ? '–' : `${(x * 100).toFixed(1)}%`);
const d = (a, b) => (a == null || b == null ? '–' : `${a - b >= 0 ? '+' : ''}${((a - b) * 100).toFixed(1)}`);
const out = [];
const row = (...c) => out.push(`| ${c.join(' | ')} |`);

out.push('### สรุป metric (on · off · ผลต่าง จุด %)', '');
row('ชุด', 'metric', 'rerank on', 'rerank off', 'ผลต่าง');
row('---', '---', '---:', '---:', '---:');
for (const set of ['rag', 'qa', 'conv']) {
  for (const [k, v] of Object.entries(on.summary[set])) {
    if (k === 'n') { row(set, 'n', v, off.summary[set].n, ''); continue; }
    row(set, k, p(v), p(off.summary[set][k]), d(v, off.summary[set][k]));
  }
}
out.push('', '### by_doc (ชุด rag · % ถูก = correctness)', '');
row('เล่ม', 'n', 'ถูก on', 'ถูก off', 'ผลต่าง', 'Hit@4 on', 'Hit@4 off', 'MRR on', 'MRR off', 'cite on', 'faith on');
row('---', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:');
for (const a of on.by_doc) {
  const b = off.by_doc.find((x) => x.doc === a.doc) || {};
  row(a.doc, a.n, p(a.correctness), p(b.correctness), d(a.correctness, b.correctness), p(a.hit_at_4), p(b.hit_at_4), p(a.mrr), p(b.mrr), p(a.citation_acc), p(a.faithfulness));
}
row('**รวม**', on.summary.rag.n, p(on.summary.rag.correctness), p(off.summary.rag.correctness), d(on.summary.rag.correctness, off.summary.rag.correctness),
  p(on.summary.rag.hit_at_4), p(off.summary.rag.hit_at_4), p(on.summary.rag.mrr), p(off.summary.rag.mrr), p(on.summary.rag.citation_acc), p(on.summary.rag.faithfulness));
out.push('', '### by_type', '');
row('type', 'n', 'ถูก on', 'ถูก off', 'ผลต่าง', 'Hit@4 on', 'Hit@4 off');
row('---', '---:', '---:', '---:', '---:', '---:', '---:');
for (const a of on.by_type) {
  const b = off.by_type.find((x) => x.type === a.type) || {};
  row(a.type, a.n, p(a.correctness), p(b.correctness), d(a.correctness, b.correctness), p(a.hit_at_4), p(b.hit_at_4));
}
// rag ไทย vs อังกฤษ (ข้ามภาษา: คำถามอังกฤษจาก SS-FAQ-EN)
out.push('', '### ภาษา (rag)', '');
row('ภาษา', 'n', 'ถูก on', 'Hit@4 on', 'ถูก off', 'Hit@4 off');
row('---', '---:', '---:', '---:', '---:', '---:');
for (const lang of ['th', 'en']) {
  const f = (r) => r.items.filter((i) => i.set === 'rag' && i.lang === lang);
  const mean = (l, k) => { const v = l.map((i) => i.metrics[k]).filter((x) => typeof x === 'number'); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  row(lang, f(on).length, p(mean(f(on), 'correctness')), p(mean(f(on), 'hit_at_4')), p(mean(f(off), 'correctness')), p(mean(f(off), 'hit_at_4')));
}
// ข้อที่ผลต่างระหว่าง on/off
const flips = on.items.filter((i) => { const b = off.items.find((x) => x.id === i.id); return b && b.pass !== i.pass; });
out.push('', `ข้อที่ผ่าน/ไม่ผ่านต่างกันระหว่าง on/off: ${flips.length} ข้อ${flips.length ? ` (${flips.slice(0, 20).map((i) => `${i.id}:${i.pass ? 'on✓' : 'off✓'}`).join(', ')})` : ''}`);
const retrDiff = on.items.filter((i) => { const b = off.items.find((x) => x.id === i.id); return i.set === 'rag' && b && JSON.stringify((i.retrieved || []).map((r) => [r.filename, r.page])) !== JSON.stringify((b.retrieved || []).map((r) => [r.filename, r.page])); });
out.push(`ข้อ rag ที่ลำดับ top 4 (ไฟล์+หน้า) ต่างกัน: ${retrDiff.length} ข้อ`);
console.log(out.join('\n'));
