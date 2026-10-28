// T24: แยก run "ค่าหลัก" (ปิด cache · คำถามไม่ซ้ำ rag770 · prefetch 4/4/2) ออกจาก run "เสริม"
// ผลที่ไม่มี config.cache = รันก่อน T24 (T20) · label 'mock-mix' ของ T20 = final ที่เปิด RRF candidate cache (loadtest/REPORT.md)
import type { Run } from '../../api/admin/load/model';

export type RunKind = { primary: boolean; cache: 'on' | 'off' | 'unknown'; questions: 'rag770' | 'qa' | 'synthetic' | 'unknown'; prefetch: string | null; badge: string };
const DEFAULT_PREFETCH = '4/4/2';

function prefetchOf(c: Run['config']): string | null {
  const p = (c.prefetch ?? c.prefetch_hint) as { chat?: unknown; stt?: unknown; tts?: unknown } | undefined;
  if (!p || typeof p !== 'object') return null;
  return [p.chat, p.stt, p.tts].map(v => (typeof v === 'number' ? v : '?')).join('/');
}

export function runKind(run: Pick<Run, 'label' | 'config'>): RunKind {
  const c = run.config;
  const legacy = c.cache === undefined;
  const cache: RunKind['cache'] = c.cache === 'on' || c.cache === 'off' ? c.cache : legacy && run.label === 'mock-mix' ? 'on' : 'unknown';
  const questions: RunKind['questions'] = c.questions === 'rag770' || c.questions === 'qa' ? c.questions : c.synthetic ? 'synthetic' : legacy && c.environment === 'mock' ? 'qa' : 'unknown';
  // ผลจาก T20 ก่อนมี prefetch_hint ใช้ค่าเริ่มต้น 4/4/2 (baseline)
  const prefetch = prefetchOf(c) ?? (legacy && !c.synthetic && c.environment === 'mock' ? DEFAULT_PREFETCH : null);
  const primary = !c.capacity_censored && c.tts_cache === 'off' && cache === 'off' && questions === 'rag770' && prefetch === DEFAULT_PREFETCH && !c.synthetic;
  const q = c.capacity_censored ? 'ชุดคำถามหมด · ข้อมูลไม่ครบ' : questions === 'rag770' ? 'คำถามไม่ซ้ำ (rag770)' : questions === 'qa' ? 'คำถามซ้ำ (eval/qa.json)' : questions === 'synthetic' ? 'ข้อมูลสังเคราะห์' : 'ไม่ระบุชุดคำถาม';
  const parts = primary
    ? ['ค่าหลัก', 'ปิด cache', q, `prefetch ${prefetch}`]
    : ['เสริม', cache === 'on' ? 'เปิด cache' : cache === 'off' ? (c.tts_cache === 'off' ? 'ปิด retrieval/TTS cache' : 'ปิด retrieval cache เท่านั้น · TTS เปิด/ไม่ระบุ') : 'ไม่ระบุ cache', questions === 'qa' && cache === 'on' ? 'คำถามซ้ำ' : q,
      ...(prefetch && prefetch !== DEFAULT_PREFETCH ? [`prefetch ${prefetch}`] : []), ...(legacy && !c.synthetic ? ['รันก่อน T24'] : [])];
  return { primary, cache, questions, prefetch, badge: parts.join(' · ') };
}

/** ค่าเริ่มต้นของหน้า = run หลักล่าสุด (ids เรียงใหม่ → เก่า) · ไม่มี → run ล่าสุด */
export function defaultRun(runs: Pick<Run, 'id' | 'label' | 'config'>[]): number | undefined {
  return (runs.find(r => runKind(r).primary) ?? runs[0])?.id;
}
