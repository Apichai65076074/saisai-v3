// /admin/load (T19) · owner เท่านั้น (middleware กัน /admin/*) · อ่าน load_runs ตรงจาก DB แล้วให้ client เลือก/เทียบ run
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { capacities, criteria, type Run } from '../../api/admin/load/model';
import LoadDashboard from './LoadDashboard';
import { defaultRun } from './kind';
import './load.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Load test · SaiSai Glass' };

export default async function LoadPage({ searchParams }: { searchParams: { runs?: string } }) {
  const s = await getSession();
  if (s?.role !== 'owner') redirect('/login?next=/admin/load');
  const rows = await query<Omit<Run, 'created_at' | 'max_users_ok'> & { created_at: Date | string }>('SELECT id, label, created_at, config, stages FROM load_runs ORDER BY id DESC');
  const runs: Run[] = rows.map(r => ({
    ...r,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    max_users_ok: capacities(r.stages),
  }));
  const wanted = (searchParams.runs || '').split(',').map(Number).filter(id => runs.some(r => r.id === id));
  // T24: ไม่ระบุ ?runs → run หลัก (ปิด cache · rag770 · prefetch 4/4/2) ล่าสุด
  const fallback = defaultRun(runs);
  const initial = wanted.length ? wanted : fallback === undefined ? [] : [fallback];
  return <div className="load-page">
    <h1>ผล Load test</h1>
    <LoadDashboard runs={runs} initial={initial} criteria={criteria} />
  </div>;
}
