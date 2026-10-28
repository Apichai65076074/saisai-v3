import { NextResponse } from 'next/server';
import { getSession, isOwner } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { fail, msg } from '@/lib/http';
import { send } from '@/lib/mq';
import { MAX_UPLOAD_BYTES, listDocs, safePdfName } from './docs';

export const dynamic = 'force-dynamic';

async function guard() {
  const s = await getSession();
  if (!s) return fail(401, { code: 'UNAUTHORIZED', message: msg('UNAUTHORIZED') });
  if (!isOwner(s)) return fail(403, { code: 'FORBIDDEN', message: msg('FORBIDDEN') });
  return null;
}

/** GET /api/admin/docs (owner) → {ok, docs:[{id, filename, pages, chunks, status, error, size, updatedAt}]} */
export async function GET() {
  const g = await guard();
  if (g) return g;
  return NextResponse.json({ ok: true, docs: await listDocs() });
}

/**
 * POST /api/admin/docs (owner) multipart `file` (.pdf · ขึ้นต้น %PDF- · ≤ 20 MB)
 * → upsert docs (ชื่อซ้ำ = แทนที่ · ทำใหม่) status queued → rag.ingest {docId} → 201 {ok, id, filename, queued}
 * คิวล่ม → queued:false (rag-worker หยิบตอนเริ่มเพราะ status ยังไม่ ready)
 */
export async function POST(req: Request) {
  const g = await guard();
  if (g) return g;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, { code: 'BAD_REQUEST', field: 'file', message: 'ต้องส่งไฟล์แบบ multipart (file)' });
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') return fail(400, { code: 'FILE_REQUIRED', field: 'file', message: 'กรุณาเลือกไฟล์ PDF' });
  const filename = safePdfName(file.name);
  if (!filename) return fail(400, { code: 'FILE_NAME', field: 'file', message: 'ชื่อไฟล์ต้องเป็น A-Z 0-9 . _ - และลงท้าย .pdf' });
  if (file.size > MAX_UPLOAD_BYTES) return fail(413, { code: 'FILE_TOO_LARGE', field: 'file', message: 'ไฟล์ต้องไม่เกิน 20 MB' });
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0 || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return fail(400, { code: 'FILE_TYPE', field: 'file', message: 'ไฟล์ต้องเป็น PDF' });
  }
  const row = await queryOne<{ id: number }>(
    `INSERT INTO docs (filename, bytes, status) VALUES ($1, $2, 'queued')
     ON CONFLICT (filename) DO UPDATE SET bytes = EXCLUDED.bytes, status = 'queued', error = NULL, pages = NULL,
       chunks = 0, updated_at = now()
     RETURNING id`,
    [filename, bytes],
  );
  const id = row!.id;
  let queued = true;
  try {
    await send('rag.ingest', { docId: id });
  } catch {
    queued = false;
  }
  return NextResponse.json({ ok: true, id, filename, queued }, { status: 201 });
}
