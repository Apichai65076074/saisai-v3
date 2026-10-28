// rag-worker (T12) · ตรรกะ ingest ที่ไม่พึ่งคิว (ทดสอบตรงได้): extract (Python/PyMuPDF) → embed (TEI) → doc_chunks
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const EXTRACT_PY = path.join(HERE, 'extract.py');

export const cfg = {
  embedUrl: (process.env.EMBED_URL || 'http://embedder:80').replace(/\/+$/, ''),
  embedBatch: Math.min(16, Math.max(1, Number.parseInt(process.env.EMBED_BATCH || '16', 10) || 16)),
  embedTimeoutMs: Number(process.env.EMBED_TIMEOUT_MS || 600_000),
  python: process.env.PYTHON || 'python3',
  // จำลองงานยาว (ทดสอบ Q03 "หยุดกลางงาน" · ค่าเริ่มต้น 0)
  holdMs: Number(process.env.RAG_HOLD_MS || 0),
};

/** โฟลเดอร์ PDF ตั้งต้น: DOCS_DIR → /app/docs → <repo>/docs/pdf (dev) */
export function docsDir() {
  for (const d of [process.env.DOCS_DIR, '/app/docs', path.resolve(HERE, '../../docs/pdf')]) {
    if (d && existsSync(d)) return d;
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** PDF bytes → {pages, chunks:[{page, chunk_index, kind, content}]} ผ่าน extract.py (stdin → stdout JSON) */
export function extractPdf(bytes, filename) {
  return new Promise((resolve, reject) => {
    const p = spawn(cfg.python, [EXTRACT_PY, '-', '--name', filename], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    p.stdout.on('data', (b) => out.push(b));
    p.stderr.on('data', (b) => err.push(b));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) {
        const msg = Buffer.concat(err).toString('utf8').split('\n').filter((l) => l && !/Warning/.test(l)).slice(-3).join(' | ');
        return reject(new Error(`extract.py exit ${code}: ${msg || 'อ่าน PDF ไม่ได้'}`));
      }
      try {
        resolve(JSON.parse(Buffer.concat(out).toString('utf8')));
      } catch (e) {
        reject(new Error(`extract.py JSON เสีย: ${e.message}`));
      }
    });
    p.stdin.on('error', () => {});
    p.stdin.end(bytes);
  });
}

/** embed ข้อความ (ใส่ prefix เองก่อนเรียก) · batch ≤ EMBED_BATCH · ลองใหม่ 3 ครั้ง */
export async function embed(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += cfg.embedBatch) {
    const batch = texts.slice(i, i + cfg.embedBatch);
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`${cfg.embedUrl}/embed`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ inputs: batch, truncate: true }),
          signal: AbortSignal.timeout(cfg.embedTimeoutMs),
        });
        if (!r.ok) throw new Error(`embedder HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
        const vecs = await r.json();
        if (!Array.isArray(vecs) || vecs.length !== batch.length) throw new Error('embedder ตอบจำนวนเวกเตอร์ไม่ตรง');
        if (vecs.some((v) => !Array.isArray(v) || v.length !== 384 || v.some((x) => typeof x !== 'number' || !Number.isFinite(x)))) {
          throw new Error('embedder ต้องตอบเวกเตอร์ 384 มิติที่เป็นตัวเลข finite');
        }
        out.push(...vecs);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        await sleep(1000 * (attempt + 1));
      }
    }
    if (lastErr) throw lastErr;
  }
  return out;
}

export const toVector = (v) => `[${v.map((x) => Number(x).toFixed(7)).join(',')}]`;

/**
 * ingest เอกสาร 1 ไฟล์: processing → extract → embed → แทนที่ doc_chunks ใน transaction → ready (+pages, chunks)
 * @returns {{skipped?:true, pages?:number, chunks?:number}}
 * throw เมื่อล้ม (ผู้เรียกตัดสินว่าลองใหม่หรือ failed)
 */
export async function ingestDoc(pool, docId, log = () => {}) {
  const { rows } = await pool.query('SELECT id, filename, bytes, status FROM docs WHERE id = $1', [docId]);
  const doc = rows[0];
  if (!doc) return { skipped: true, reason: 'not-found' };
  if (doc.status === 'ready') return { skipped: true, reason: 'ready' }; // ข้อความซ้ำ (เช่น ส่งซ้ำตอนเริ่ม)
  if (!doc.bytes || doc.bytes.length === 0) throw Object.assign(new Error('ไฟล์ว่าง'), { permanent: true });

  await pool.query(`UPDATE docs SET status = 'processing', error = NULL, updated_at = now() WHERE id = $1`, [docId]);
  const t0 = Date.now();
  if (cfg.holdMs > 0) await sleep(cfg.holdMs);

  let ex;
  try {
    ex = await extractPdf(doc.bytes, doc.filename);
  } catch (e) {
    throw Object.assign(e, { permanent: true }); // PDF เสีย ลองใหม่ก็ไม่หาย
  }
  const chunks = (ex.chunks || []).filter((c) => c.content && c.content.trim());
  const vecs = await embed(chunks.map((c) => `passage: ${c.content}`));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // ถูกอัปโหลดทับระหว่างทำ (bytes เปลี่ยน) → ไม่เขียนทับ ให้ข้อความใหม่ทำแทน
    const cur = await client.query('SELECT md5(bytes) = md5($2::bytea) AS same FROM docs WHERE id = $1 FOR UPDATE', [docId, doc.bytes]);
    if (!cur.rows[0]?.same) {
      await client.query('ROLLBACK');
      return { skipped: true, reason: 'replaced' };
    }
    await client.query('DELETE FROM doc_chunks WHERE doc_id = $1', [docId]);
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      await client.query(
        `INSERT INTO doc_chunks (doc_id, filename, page, chunk_index, content, embedding, tsv)
         VALUES ($1, $2, $3, $4, $5, $6::vector, to_tsvector('simple', $5))`,
        [docId, doc.filename, c.page, i, c.content, toVector(vecs[i])],
      );
    }
    await client.query(
      `UPDATE docs SET status = 'ready', pages = $2, chunks = $3, error = NULL, updated_at = now() WHERE id = $1`,
      [docId, ex.pages, chunks.length],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  log(`ready #${docId} ${doc.filename} pages=${ex.pages} chunks=${chunks.length} ${Date.now() - t0}ms`);
  return { pages: ex.pages, chunks: chunks.length };
}

export async function markFailed(pool, docId, err) {
  await pool.query(`UPDATE docs SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`, [
    docId,
    String(err?.message || err).slice(0, 500),
  ]);
}

/**
 * ตอนเริ่ม: PDF ใน docsDir() ที่ยังไม่มีใน docs → INSERT (queued)
 * @returns docId ทั้งหมดที่ยังไม่ ready (queued/processing ค้างจากรอบก่อน) → ผู้เรียก publish rag.ingest
 */
export async function seedDocs(pool, dir = docsDir(), log = () => {}) {
  if (dir) {
    const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
    for (const f of files) {
      const bytes = readFileSync(path.join(dir, f));
      const r = await pool.query(
        `INSERT INTO docs (filename, bytes, status) VALUES ($1, $2, 'queued') ON CONFLICT (filename) DO NOTHING RETURNING id`,
        [f, bytes],
      );
      if (r.rows[0]) log(`seed ${f} → #${r.rows[0].id}`);
    }
  }
  const { rows } = await pool.query(`SELECT id FROM docs WHERE status IN ('queued', 'processing') ORDER BY id`);
  return rows.map((r) => r.id);
}
