// GET/POST /api/admin/eval (T17) · สิทธิ์ = cookie owner หรือ header x-eval-token = EVAL_TOKEN · รูปแบบตาม SCHEMA.md
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getSession } from '@/lib/auth';
import { fail, msg } from '@/lib/http';
import { getRun, insertRun, listRuns, parseRun } from './runs';

export const dynamic = 'force-dynamic';

function tokenOk(req: Request): boolean {
  const got = Buffer.from(req.headers.get('x-eval-token') ?? '');
  const want = Buffer.from(process.env.EVAL_TOKEN || 'ss-eval');
  return got.length > 0 && got.length === want.length && timingSafeEqual(got, want);
}

/** null = ผ่าน · ไม่งั้น = response 401/403 */
async function guard(req: Request): Promise<NextResponse | null> {
  if (tokenOk(req)) return null;
  const s = await getSession();
  if (s?.role === 'owner') return null;
  return s
    ? fail(403, { code: 'FORBIDDEN', message: msg('FORBIDDEN', s.lang) })
    : fail(401, { code: 'UNAUTHORIZED', message: msg('UNAUTHORIZED') });
}

export async function GET(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get('id');
  if (id !== null) {
    if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2147483647) return fail(400, { code: 'BAD_REQUEST', field: 'id', message: msg('BAD_REQUEST') });
    const run = await getRun(Number(id));
    return run ? NextResponse.json({ ok: true, run }) : fail(404, { code: 'NOT_FOUND', message: msg('NOT_FOUND') });
  }
  return NextResponse.json({ ok: true, runs: await listRuns() });
}

export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, { code: 'EVAL_INVALID', message: 'JSON ไม่ถูกต้อง' });
  }
  const p = parseRun(body);
  if (!p.ok) return fail(400, { code: 'EVAL_INVALID', field: p.field || undefined, message: p.message });
  const id = await insertRun(p.run);
  return NextResponse.json({ ok: true, id }, { status: 201 });
}
