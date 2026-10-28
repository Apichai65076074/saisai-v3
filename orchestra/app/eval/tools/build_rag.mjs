// แปลง gemini/rag-questions/*.jsonl (770 ข้อ · ห้ามแก้ต้นฉบับ) → eval/rag.json
// map: qid→id · book→doc (.pdf) · answer→expected · คง pages/type/fact_ids/difficulty · lang ตามตัวอักษรของคำถาม
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = path.join(root, 'gemini/rag-questions');
const items = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()) {
  for (const line of readFileSync(path.join(dir, f), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const q = JSON.parse(line);
    items.push({
      id: q.qid,
      doc: `${q.book}.pdf`,
      question: q.question,
      expected: q.answer,
      pages: q.pages,
      type: q.type,
      fact_ids: q.fact_ids,
      difficulty: q.difficulty,
      lang: /[฀-๿]/.test(q.question) ? 'th' : 'en',
    });
  }
}
const ids = new Set(items.map((i) => i.id));
if (ids.size !== items.length) throw new Error('duplicate qid');
writeFileSync(path.join(root, 'eval/rag.json'), JSON.stringify(items, null, 1) + '\n');
const by = {};
for (const i of items) (by[i.doc] ??= { n: 0, en: 0, types: {} }), by[i.doc].n++, i.lang === 'en' && by[i.doc].en++, (by[i.doc].types[i.type] = (by[i.doc].types[i.type] || 0) + 1);
console.log(`eval/rag.json: ${items.length} ข้อ`);
console.table(Object.fromEntries(Object.entries(by).map(([d, v]) => [d, { n: v.n, en: v.en, ...v.types }])));
