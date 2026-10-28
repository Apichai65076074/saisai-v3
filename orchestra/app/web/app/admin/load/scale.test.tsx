import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseRun, type Run } from '../../api/admin/load/model';
import { ScaleComparison } from './LoadDashboard';
import { scaleRuns, strictMixCapacity } from './scale';
const criteria = { p95_ms: 12000, error_rate: 0.01, target_users: 200 };
function run(id: number, label: string, error = 0): Run {
  const parsed = parseRun({ label, config: { environment: 'ai', think_sec: 30, stage_sec: 120, cache: 'off', tts_cache: 'off', questions: 'rag770', repeats: 0, prefetch: { chat: 4, stt: 4, tts: 2 } },
    stages: [{ mode: 'mix', users: 1, n: 100, ok: 100 - error, err: error, error_rate: error / 100, p50_ms: 1000, p95_ms: 2000, ttft_p95_ms: 500, queue_max: { chat: 0, stt: 0, tts: 0 } }] });
  return { ...parsed, id, created_at: '2026-10-27T07:00:00Z' };
}
describe('T23 scale display', () => {
  it('selects latest cold AI baseline including a failed rerun, excluding mock and cache-on', () => {
    const first = run(1, 'gpu-mix-scale-base-nocache');
    const latest = run(2, 'gpu-mix-scale-base-nocache-r2', 25);
    const mock = run(3, 'scale-base'); mock.config.environment = 'mock';
    const warm = run(4, 'scale-base'); warm.config.tts_cache = 'on';
    expect(scaleRuns([first, latest, mock, warm])['scale-base']?.id).toBe(2);
    expect(strictMixCapacity(latest)).toBe(0);
  });
  it('excludes repeated-question runs from the three primary scale series', () => {
    const repeated = run(2, 'scale-x2'); repeated.config.repeats = 1;
    const missing = run(3, 'scale-x4'); delete missing.config.repeats;
    expect(scaleRuns([run(1, 'scale-base'), repeated, missing])['scale-x2']).toBeUndefined();
    expect(scaleRuns([missing])['scale-x4']).toBeUndefined();
  });
  it('compares only the selected mode and accepts its original T22 baseline', () => {
    const base = run(1, 'gpu-chat-nocache'); base.stages[0].mode = 'chat';
    const doubled = run(2, 'scale-x2-chat'); doubled.stages[0].mode = 'chat';
    const mix = run(3, 'scale-x4');
    const sets = scaleRuns([base, doubled, mix], 'chat');
    expect(sets['scale-base']?.id).toBe(1);
    expect(sets['scale-x2']?.id).toBe(2);
    expect(sets['scale-x4']).toBeUndefined();
    expect(strictMixCapacity(doubled, 'chat')).toBe(1);
    expect(strictMixCapacity(doubled)).toBe(0);
  });
  it('excludes a runner-censored measurement from primary scaling claims', () => {
    const censored = run(1, 'scale-x4'); censored.config.capacity_censored = true;
    expect(scaleRuns([censored])['scale-x4']).toBeUndefined();
  });
  it('rejects unmeasured blocked artifacts at the API parser boundary', () => {
    expect(() => parseRun({ label: 'scale-x2', config: { think_sec: 30 }, stages: [], max_users_ok: null })).toThrow('stages');
  });
  it('stops capacity at the first failing stage even if a later stage passes', () => {
    const measured = run(1, 'scale-x2');
    measured.stages.push({ ...measured.stages[0], users: 2, p95_ms: 13000, pass: false }, { ...measured.stages[0], users: 4 });
    expect(strictMixCapacity(measured)).toBe(1);
  });
  it('uses strict error <1% even though the legacy API accepts equality', () => {
    const boundary = run(1, 'scale-base', 1);
    expect(boundary.max_users_ok.mix).toBe(1);
    expect(strictMixCapacity(boundary)).toBe(0);
  });
  it('shows three cards and three p95 curves when all sets have measured data', () => {
    const html = renderToStaticMarkup(<ScaleComparison runs={['scale-base', 'scale-x2', 'scale-x4'].map((s, i) => run(i + 1, s))} criteria={criteria} />);
    expect(html.match(/data-testid="load-scale-card"/g)).toHaveLength(3);
    expect(html.match(/data-series="p95_ms"/g)).toHaveLength(3);
  });
  it('shows missing measurements honestly and blocks ratios at N=0', () => {
    const html = renderToStaticMarkup(<ScaleComparison runs={[run(1, 'scale-base', 25)]} criteria={criteria} />);
    expect(html.match(/ยังไม่ได้วัด<\/p>/g)).toHaveLength(2);
    expect(html).toContain('Baseline N=0');
    expect(html.match(/data-series="p95_ms"/g)).toHaveLength(1);
    expect(html).not.toContain('อัตราขยาย 0.00');
  });
});
