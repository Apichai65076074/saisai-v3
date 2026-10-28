import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { capacities, parseRun, type Run } from './model';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
async function authorized(req: NextRequest) {
  const expected = process.env.EVAL_TOKEN || 'ss-eval';
  const supplied = req.headers.get('x-eval-token') || '';
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return (a.length === b.length && timingSafeEqual(a, b)) || (await getSession())?.role === 'owner';
}
const denied = () => NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
export async function GET(req: NextRequest) {
  if (!await authorized(req)) return denied();
  const id = req.nextUrl.searchParams.get('id');
  if (id !== null && !/^[1-9]\d*$/.test(id)) return NextResponse.json({ ok: false, error: 'Invalid id' }, { status: 400 });
  const runs = await query<Run>(`SELECT id, label, created_at, config, stages FROM load_runs ${id ? 'WHERE id = $1' : ''} ORDER BY id DESC`, id ? [id] : []);
  return NextResponse.json({ ok: true, runs: runs.map(r => ({ ...r, max_users_ok: capacities(r.stages) })) });
}
export async function POST(req: NextRequest) {
  if (!await authorized(req)) return denied();
  let run: ReturnType<typeof parseRun>;
  try { run = parseRun(await req.json()); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' }, { status: 400 }); }
  const [row] = await query<Run>(`INSERT INTO load_runs (label, config, stages, max_users_ok) VALUES ($1,$2::jsonb,$3::jsonb,$4) RETURNING id, label, created_at, config, stages`,
    [run.label, JSON.stringify(run.config), JSON.stringify(run.stages), Math.max(...Object.values(run.max_users_ok))]);
  return NextResponse.json({ ok: true, run: { ...row, max_users_ok: run.max_users_ok } }, { status: 201 });
}
