// T12 · ตรวจผล ingest บน dev db (ต้องรัน rag-worker จน 7 ไฟล์ ready ก่อน)
// DATABASE_URL=… EMBED_URL=… node --test workers/rag-worker/test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { embed, toVector, extractPdf } from '../lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
test.after(() => pool.end());

const BOOKS = ['SS-CAT-BOTTLES.pdf', 'SS-FAQ-EN.pdf', 'SS-LOGISTICS.pdf', 'SS-LOGO-PRINT.pdf', 'SS-POLICY.pdf', 'SS-QC-STANDARD.pdf', 'SS-USE-CARE.pdf'];
// สระ/วรรณยุกต์ลอย = เครื่องหมายบน/ล่างที่ไม่มีพยัญชนะ/สระนำ (เช่นหลังช่องว่าง หรือต้นข้อความ)
const FLOATING = /(^|[^ก-ะาำเ-ๆัิ-ฺ็-๎])[ัิ-ฺ็-๎]/u;

test('extract.py ตรงต้นฉบับ data/facts ทุกหน้า (ไม่มีข้อความหาย · ไทยไม่เพี้ยน)', () => {
  const out = execFileSync('python3', [path.join(HERE, 'check_extract.py')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  assert.match(out, /problems=0/, out);
});

test('docs 7 แถว ready · pages/chunks ครบ', async () => {
  const { rows } = await pool.query(`SELECT filename, status, pages, chunks, (SELECT count(*)::int FROM doc_chunks c WHERE c.doc_id = d.id) AS n
    FROM docs d WHERE filename = ANY($1) ORDER BY filename`, [BOOKS]);
  assert.equal(rows.length, 7);
  for (const r of rows) {
    assert.equal(r.status, 'ready', r.filename);
    assert.ok(r.pages > 0 && r.chunks > 0 && r.chunks === r.n, JSON.stringify(r));
  }
  const pages = rows.reduce((s, r) => s + r.pages, 0);
  assert.equal(pages, 122);
});

test('ทุก chunk มี filename + page + embedding · ไม่มี NUL/อักขระเสีย/สระลอย', async () => {
  const { rows } = await pool.query(`SELECT c.id, c.filename, c.page, c.content, c.embedding IS NULL AS noemb, c.tsv IS NULL AS notsv, d.pages
    FROM doc_chunks c JOIN docs d ON d.id = c.doc_id WHERE d.filename = ANY($1)`, [BOOKS]);
  assert.ok(rows.length > 300);
  for (const r of rows) {
    assert.ok(r.filename && r.page >= 1 && r.page <= r.pages, `chunk ${r.id} page`);
    assert.ok(!r.noemb && !r.notsv, `chunk ${r.id} embedding/tsv`);
    assert.ok(!/[\u0000�-]/u.test(r.content), `chunk ${r.id} bad char`);
    assert.ok(!FLOATING.test(r.content), `chunk ${r.id} สระลอย: ${r.content.slice(0, 80)}`);
    assert.ok(r.content.length <= 700, `chunk ${r.id} ยาว ${r.content.length}`);
  }
});

test('LOG-026: chunk ที่มี 24 ของ B-500 ในตาราง 1.1 มีชื่อตาราง + หัวคอลัมน์ 2 ชั้น', async () => {
  const { rows } = await pool.query(`SELECT page, content FROM doc_chunks WHERE filename = 'SS-LOGISTICS.pdf'
    AND content LIKE '%ตาราง 1.1%' AND content LIKE '%รุ่น: B-500;%'`);
  assert.ok(rows.length >= 1, 'ไม่พบ chunk ตาราง 1.1 แถว B-500');
  for (const r of rows) {
    assert.equal(r.page, 4);
    assert.match(r.content, /ตาราง 1\.1 การบรรจุต่อกล่อง/);
    assert.match(r.content, /รุ่น: B-500; กล่อง > ใบ\/กล่อง: 24;/);
    assert.match(r.content, /ทุกสีของรุ่นเดียวกันบรรจุเท่ากัน/); // เชิงอรรถติดกับตาราง
  }
});

test('เชิงอรรถ ¹ ใต้ตาราง 3.1 ติดกับ chunk ตาราง (CAT-038)', async () => {
  const { rows } = await pool.query(`SELECT content FROM doc_chunks WHERE filename = 'SS-CAT-BOTTLES.pdf' AND content LIKE '%ตาราง 3.1%'`);
  assert.ok(rows.some((r) => r.content.includes('สี > เขียว¹: มี') && r.content.includes('¹ B-250 เท่านั้นที่มีสีเขียว')));
});

test('trigram: ค้น "B-250" / "LOT-" / "P07" เจอ', async () => {
  for (const q of ['B-250', 'LOT-', 'P07']) {
    const { rows } = await pool.query(`SELECT filename, page, word_similarity($1, content) AS s FROM doc_chunks
      WHERE $1 <% content ORDER BY s DESC LIMIT 20`, [q]);
    assert.ok(rows.length > 0, `trigram ${q}`);
  }
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM doc_chunks WHERE content ILIKE '%B-250%'`);
  assert.ok(rows[0].n > 10);
});

test('vector: "B-500 กล่องละกี่ใบ" → top 5 มี SS-LOGISTICS หน้า 4', async () => {
  const [v] = await embed(['query: ขวด B-500 บรรจุกล่องละกี่ใบ']);
  const { rows } = await pool.query(`SELECT filename, page FROM doc_chunks ORDER BY embedding <=> $1::vector LIMIT 5`, [toVector(v)]);
  assert.ok(rows.some((r) => r.filename === 'SS-LOGISTICS.pdf' && r.page === 4), JSON.stringify(rows));
});

test('PDF เสีย → extractPdf throw', async () => {
  await assert.rejects(extractPdf(Buffer.from('%PDF-1.4 garbage'), 'bad.pdf'));
});
