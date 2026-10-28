import { queryOne } from '@/lib/db';
import { fail } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** GET /api/docs/<file>.pdf → application/pdf inline (ลิงก์ chat-cite `/api/docs/<file>#page=N`) · ไม่มี → 404 */
export async function GET(_req: Request, { params }: { params: { filename: string } }) {
  const name = params.filename || '';
  const row = await queryOne<{ filename: string; bytes: Buffer | null }>('SELECT filename, bytes FROM docs WHERE filename = $1', [name]);
  if (!row || !row.bytes) return fail(404, { code: 'NOT_FOUND', message: 'ไม่พบเอกสาร' });
  return new Response(new Uint8Array(row.bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${row.filename.replace(/"/g, '')}"`,
      'content-length': String(row.bytes.length),
      'cache-control': 'private, max-age=60',
    },
  });
}
