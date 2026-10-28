import criteria from '../../../../../loadtest/criteria.json';
export { criteria };
export const modes = ['chat', 'stt', 'tts', 'voice', 'mix'] as const;
export type Mode = typeof modes[number];
export type Stage = {
  users: number; mode: Mode; n: number; ok: number; err: number; error_rate: number;
  p50_ms: number; p95_ms: number; ttft_p95_ms: number;
  queue_max: { chat: number; stt: number; tts: number }; pass: boolean;
};
export type Run = {
  id: number; label: string; created_at: string;
  config: Record<string, unknown> & { think_sec: number };
  stages: Stage[]; max_users_ok: Partial<Record<Mode, number>>;
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const count = (v: unknown): v is number => nonnegative(v) && Number.isSafeInteger(v);
export function capacities(stages: Stage[]): Run['max_users_ok'] {
  const result: Run['max_users_ok'] = {};
  for (const mode of modes) {
    const steps = stages.filter(s => s.mode === mode).sort((a, b) => a.users - b.users);
    if (!steps.length) continue;
    result[mode] = 0;
    for (const s of steps) {
      if (!s.pass) break;
      result[mode] = s.users;
    }
  }
  return result;
}
export function parseRun(value: unknown): Omit<Run, 'id' | 'created_at'> {
  if (!object(value) || typeof value.label !== 'string' || !value.label.trim() || value.label.length > 200)
    throw new Error('label must contain 1–200 characters');
  if (!object(value.config) || !nonnegative(value.config.think_sec)) throw new Error('config.think_sec must be nonnegative');
  if (!Array.isArray(value.stages) || value.stages.length < 1 || value.stages.length > 1000) throw new Error('stages must contain 1–1000 steps');
  const seen = new Set<string>();
  const stages = value.stages.map((s: unknown): Stage => {
    if (!object(s) || !modes.includes(s.mode as Mode) || !count(s.users) || s.users < 1 || !count(s.n) || s.n < 1 ||
      !count(s.ok) || !count(s.err) || s.ok + s.err !== s.n || !nonnegative(s.error_rate) || s.error_rate > 1 ||
      Math.abs(s.error_rate - s.err / s.n) > 0.000001 || !nonnegative(s.p50_ms) || !nonnegative(s.p95_ms) || s.p50_ms > s.p95_ms ||
      !nonnegative(s.ttft_p95_ms) || !object(s.queue_max) || !['chat', 'stt', 'tts'].every(k => count((s.queue_max as Record<string, unknown>)[k])))
      throw new Error('Invalid stage counts, mode, latency, error_rate or queue_max');
    const key = `${s.mode}:${s.users}`;
    if (seen.has(key)) throw new Error('Duplicate mode/users stage');
    seen.add(key);
    const pass = s.p95_ms <= criteria.p95_ms && s.error_rate <= criteria.error_rate;
    if (s.pass !== undefined && s.pass !== pass) throw new Error('stage.pass disagrees with criteria');
    return { ...s, pass } as Stage;
  });
  const max = capacities(stages);
  if (value.max_users_ok !== undefined) {
    const supplied = value.max_users_ok;
    if (typeof supplied === 'number') {
      if (Object.keys(max).length !== 1 || supplied !== Object.values(max)[0]) throw new Error('max_users_ok disagrees with stages');
    } else if (!object(supplied) || Object.keys(supplied).length !== Object.keys(max).length ||
      Object.entries(max).some(([mode, n]) => supplied[mode] !== n)) throw new Error('max_users_ok disagrees with stages');
  }
  return { label: value.label.trim(), config: value.config as Run['config'], stages, max_users_ok: max };
}
