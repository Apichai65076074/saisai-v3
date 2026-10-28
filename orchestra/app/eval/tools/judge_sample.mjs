// สุ่มข้อสำหรับผู้ตัดสินตรวจด้วยตนเอง (แบ่งชั้นตามเล่ม/ประเภท · seed คงที่) แล้วพิมพ์ question/expected/answer/คะแนนอัตโนมัติ
//   node eval/tools/judge_sample.mjs --label mock-rerank-on [--n 8] [--seed 18]
// ผลตัดสินเขียนลง eval/judgments.json: {"<id>": {"correctness":0|0.5|1, "faithfulness"?, "reason", "answer_sha"}}
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { answerSha } from '../score.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const run = JSON.parse(readFileSync(path.join(here, '../results', `${arg('--label', 'mock-rerank-on')}.json`), 'utf8'));
const perDoc = Number(arg('--n', 8));
let seed = Number(arg('--seed', 18));
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (list, n) => [...list].sort(() => rnd() - 0.5).slice(0, n);

const rag = run.items.filter((i) => i.set === 'rag');
const sample = [];
for (const doc of [...new Set(rag.map((i) => i.doc))]) {
  const l = rag.filter((i) => i.doc === doc);
  // ทุกเล่ม: ผ่าน/ไม่ผ่านปนกัน และมีอย่างน้อย 1 ข้อ table / unanswerable / crosspage-footnote
  const special = ['table', 'unanswerable', 'crosspage', 'footnote'].map((t) => pick(l.filter((i) => i.type === t), 1)[0]).filter(Boolean);
  const rest = pick(l.filter((i) => !special.includes(i)), perDoc - special.length);
  sample.push(...special, ...rest);
}
sample.push(...pick(run.items.filter((i) => i.set === 'qa'), 8));
for (const i of sample) {
  console.log(`\n### ${i.id} [${i.set}${i.doc ? ` ${i.doc}` : ''} · ${i.type}] auto=${i.metrics.correctness} pass=${i.pass} sha=${answerSha(i.answer)}`);
  console.log(`Q: ${i.question}\nE: ${i.expected}\nA: ${String(i.answer).replace(/\s+/g, ' ').slice(0, 900)}`);
  if (i.set === 'rag') console.log(`pages=${JSON.stringify(i.pages)} retrieved=${(i.retrieved || []).map((r) => `${r.filename.replace('.pdf', '')}#${r.page}`).join(' ')} cites=${(i.cites || []).map((r) => `${r.filename.replace('.pdf', '')}#${r.page}`).join(' ')}`);
  if (i.reason) console.log(`auto-reason: ${i.reason}`);
}
console.error(`sample ${sample.length} ข้อ`);
