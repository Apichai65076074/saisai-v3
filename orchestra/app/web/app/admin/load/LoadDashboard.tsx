'use client';
// dashboard load test (T19) · การ์ด N ต่อโหมด → กราฟ delay ต่อโหมด (เทียบหลาย run ได้) → ตารางต่อขั้น
import React, { useState } from 'react';
import { modes, type Mode, type Run, type Stage } from '../../api/admin/load/model';
import { runKind } from './kind';
import { scaleNames, scaleRuns, strictMixCapacity } from './scale';

type Criteria = { p95_ms: number; error_rate: number; target_users: number };
const MODE_NAMES: Record<Mode, string> = { chat: 'แชท', stt: 'ถอดเสียง (STT)', tts: 'สังเคราะห์เสียง (TTS)', voice: 'เสียงครบวง', mix: 'ผสม (แชท + เสียง)' };
const RUN_COLORS = ['#0E7C9B', '#A0522D', '#6B4FBB', '#2E8B57'];
const QUEUE_COLORS = { chat: '#0E7C9B', stt: '#7FB7C9', tts: '#A0522D' } as const;
const FAIL = '#C62828';
const sec = (ms: number) => (ms / 1000).toFixed(2);
const pct = (v: number) => `${(v * 100).toFixed(v > 0 && v < 0.01 ? 2 : 1)}%`;
const date = (v: string) => new Date(v).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
const color = (i: number) => RUN_COLORS[i % RUN_COLORS.length];

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)), m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
const byMode = (run: Run, mode: Mode) => run.stages.filter(s => s.mode === mode).sort((a, b) => a.users - b.users);
const runModes = (run: Run) => modes.filter(m => run.stages.some(s => s.mode === m));

const W = 900, L = 64, R = 130, T = 26, H1 = 270, GAP = 56, H2 = 90;
const SERIES = [
  { key: 'p50_ms', label: 'p50', width: 2, dash: undefined },
  { key: 'p95_ms', label: 'p95', width: 3, dash: undefined },
  { key: 'ttft_p95_ms', label: 'TTFT p95', width: 1.5, dash: '3 4' },
] as const;

function Chart({ mode, runs, criteria, p95Only = false }: { mode: Mode; runs: Run[]; criteria: Criteria; p95Only?: boolean }) {
  const series = p95Only ? SERIES.filter(s => s.key === 'p95_ms') : SERIES;
  const lines = runs.map((run, i) => ({ run, color: color(i), stages: byMode(run, mode) })).filter(l => l.stages.length);
  const xs = Array.from(new Set(lines.flatMap(l => l.stages.map(s => s.users)))).sort((a, b) => a - b);
  const points = lines.reduce((n, l) => n + l.stages.length, 0);
  const pw = W - L - R, step = pw / xs.length;
  const xi = (i: number) => L + step * (i + 0.5);
  // ตำแหน่งของค่าผู้ใช้ใด ๆ บนแกนแบบขั้น (เป้า 200 / N) · อยู่ระหว่างขั้นใช้เทียบเส้นตรง · เกินขั้นสุดท้าย → ขอบขวา
  const xAt = (u: number) => {
    const k = xs.indexOf(u);
    if (k >= 0) return { x: xi(k), beyond: false };
    if (u < xs[0]) return { x: L, beyond: false };
    if (u > xs[xs.length - 1]) return { x: L + pw, beyond: true };
    const j = xs.findIndex(v => v > u);
    return { x: xi(j - 1) + step * (u - xs[j - 1]) / (xs[j] - xs[j - 1]), beyond: false };
  };
  const yMax = niceMax(Math.max(criteria.p95_ms, ...lines.flatMap(l => l.stages.map(s => Math.max(s.p95_ms, s.ttft_p95_ms)))) * 1.08);
  const y = (ms: number) => T + H1 - (ms / yMax) * H1;
  const primary = lines[0];
  const qMax = niceMax(Math.max(1, ...primary.stages.flatMap(s => [s.queue_max.chat, s.queue_max.stt, s.queue_max.tts])));
  const q0 = T + H1 + GAP, qy = (v: number) => q0 + H2 - (v / qMax) * H2;
  const target = xAt(criteria.target_users);
  const fails = new Set(lines.flatMap(l => l.stages.filter(s => !s.pass).map(s => s.users)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * yMax);
  return <figure className="load-chart-wrap">
    <figcaption>{MODE_NAMES[mode]} · เวลาตอบ (วินาที) ตามจำนวนผู้ใช้พร้อมกัน · ด้านล่าง = คิวยาวสุด{lines.length > 1 ? ` (${primary.run.label})` : ''}</figcaption>
    <div className="load-legend">
      {lines.map(l => <span key={l.run.id}><i style={{ background: l.color }} />{l.run.label}</span>)}
      {series.map(s => <span key={s.key}><svg width="26" height="10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke="#0B2E3F" strokeWidth={s.width} strokeDasharray={s.dash} /></svg>{s.label}</span>)}
      {(['chat', 'stt', 'tts'] as const).map(q => <span key={q}><i style={{ background: QUEUE_COLORS[q] }} />คิว {q}</span>)}
    </div>
    <svg data-testid="load-chart" data-mode={mode} data-points={points} viewBox={`0 0 ${W} ${q0 + H2 + 40}`} role="img"
      aria-label={`กราฟเวลาตอบโหมด ${mode} ${points} จุด`}>
      {xs.map((u, i) => fails.has(u) && <rect key={`f${u}`} data-testid="load-fail-band" data-users={u} x={xi(i) - step / 2 + 1} width={step - 2} y={T} height={q0 + H2 - T} fill={FAIL} opacity="0.09" />)}
      {ticks.map(t => <g key={t}><line x1={L} x2={L + pw} y1={y(t)} y2={y(t)} stroke="#E3E8EA" /><text x={L - 8} y={y(t) + 4} textAnchor="end" className="load-axis">{(t / 1000).toFixed(yMax < 4000 ? 1 : 0)}</text></g>)}
      <text x={14} y={T + H1 / 2} className="load-axis" transform={`rotate(-90 14 ${T + H1 / 2})`} textAnchor="middle">วินาที</text>
      <g data-testid="load-criteria-line" data-value={criteria.p95_ms}>
        <line x1={L} x2={L + pw} y1={y(criteria.p95_ms)} y2={y(criteria.p95_ms)} stroke={FAIL} strokeWidth="1.5" strokeDasharray="8 5" />
        <text x={L + pw + 6} y={y(criteria.p95_ms) + 4} className="load-direct load-fail-text">เกณฑ์ p95 {criteria.p95_ms / 1000} วิ</text>
      </g>
      <g data-testid="load-target-line" data-value={criteria.target_users}>
        <line x1={target.x} x2={target.x} y1={T - 8} y2={q0 + H2} stroke="#0B2E3F" strokeWidth="2" strokeDasharray="2 4" />
        <text x={target.x} y={T - 12} textAnchor="middle" className="load-direct load-strong">{target.beyond ? `เป้า ${criteria.target_users} คน →` : `เป้า ${criteria.target_users} คน`}</text>
      </g>
      {lines.map(l => {
        const n = l.run.max_users_ok[mode] ?? 0;
        if (!n) return null;
        const at = xAt(n);
        return <g key={`n${l.run.id}`} data-testid="load-n-line" data-run-id={l.run.id} data-value={n}>
          <line x1={at.x} x2={at.x} y1={T} y2={T + H1} stroke={l.color} strokeWidth="1.5" strokeDasharray="10 4" />
          <text x={at.x - 4} y={T + 14} textAnchor="end" className="load-direct" fill={l.color}>N = {n}</text>
        </g>;
      })}
      {lines.map(l => series.map(se => {
        const pts = l.stages.map(s => ({ s, x: xi(xs.indexOf(s.users)), v: s[se.key] }));
        const last = pts[pts.length - 1];
        return <g key={`${l.run.id}-${se.key}`} data-series={se.key} data-run-id={l.run.id}>
          <polyline fill="none" stroke={l.color} strokeWidth={se.width} strokeDasharray={se.dash} strokeLinejoin="round" points={pts.map(p => `${p.x},${y(p.v)}`).join(' ')} />
          {se.key !== 'ttft_p95_ms' && pts.map(p => <circle key={p.s.users} data-users={p.s.users} data-value={p.v} data-pass={String(p.s.pass)}
            cx={p.x} cy={y(p.v)} r={p.s.pass ? 4 : 5.5} fill={p.s.pass ? l.color : FAIL} stroke="#fff" strokeWidth="2">
            <title>{`${l.run.label} · ${p.s.users} คน · ${se.label} ${sec(p.v)} วิ · error ${pct(p.s.error_rate)} · ${p.s.pass ? 'ผ่าน' : 'ไม่ผ่าน'}`}</title>
          </circle>)}
          {lines.length === 1 && <text x={last.x + 10} y={y(last.v) + 4} className="load-direct">{se.label}</text>}
        </g>;
      }))}
      <line x1={L} x2={L + pw} y1={q0 + H2} y2={q0 + H2} stroke="#B8C2C6" />
      <text x={L - 8} y={q0 + 8} textAnchor="end" className="load-axis">{qMax}</text>
      <text x={L - 8} y={q0 + H2} textAnchor="end" className="load-axis">0</text>
      <text x={L + pw + 6} y={q0 + H2 / 2} className="load-direct">คิวยาวสุด</text>
      {primary.stages.map(s => {
        const cx = xi(xs.indexOf(s.users)), bw = Math.min(12, step / 5);
        return <g key={`q${s.users}`} data-queue-users={s.users}>
          {(['chat', 'stt', 'tts'] as const).map((q, k) => s.queue_max[q] > 0 &&
            <rect key={q} x={cx + (k - 1.5) * bw} y={qy(s.queue_max[q])} width={bw - 1} height={q0 + H2 - qy(s.queue_max[q])} fill={QUEUE_COLORS[q]}>
              <title>{`${s.users} คน · คิว ${q} ยาวสุด ${s.queue_max[q]}`}</title>
            </rect>)}
        </g>;
      })}
      {xs.map((u, i) => <text key={`x${u}`} x={xi(i)} y={q0 + H2 + 18} textAnchor="middle" className={fails.has(u) ? 'load-axis load-fail-text load-strong' : 'load-axis'}>{u}{fails.has(u) ? ' ✗' : ''}</text>)}
      <text x={L + pw / 2} y={q0 + H2 + 36} textAnchor="middle" className="load-axis">ผู้ใช้พร้อมกัน (คน)</text>
    </svg>
  </figure>;
}

function StageTable({ run, mode, criteria }: { run: Run; mode: Mode; criteria: Criteria }) {
  return <div className="load-table"><table data-testid="load-stage-table" data-run-id={run.id} data-mode={mode}>
    <caption>{run.label} · {MODE_NAMES[mode]} · ผลต่อขั้น</caption>
    <thead><tr><th>ผู้ใช้</th><th>n</th><th>ok</th><th>error</th><th>error rate</th><th>p50 (วิ)</th><th>p95 (วิ)</th><th>TTFT p95 (วิ)</th><th>คิว chat</th><th>คิว stt</th><th>คิว tts</th><th>ผล</th></tr></thead>
    <tbody>{byMode(run, mode).map((s: Stage) => <tr key={s.users} data-testid="load-stage-row" data-users={s.users} data-pass={String(s.pass)} className={s.pass ? '' : 'load-fail'}>
      <td>{s.users}</td><td>{s.n}</td><td>{s.ok}</td><td>{s.err}</td>
      <td className={s.error_rate > criteria.error_rate ? 'load-bad' : ''}>{pct(s.error_rate)}</td>
      <td>{sec(s.p50_ms)}</td><td className={s.p95_ms > criteria.p95_ms ? 'load-bad' : ''}>{sec(s.p95_ms)}</td><td>{sec(s.ttft_p95_ms)}</td>
      <td>{s.queue_max.chat}</td><td>{s.queue_max.stt}</td><td>{s.queue_max.tts}</td>
      <td>{s.pass ? '✓ ผ่าน' : '✗ ไม่ผ่าน'}</td>
    </tr>)}</tbody>
  </table></div>;
}

const configText = (c: Run['config']) => Object.entries(c)
  .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))
  .map(([k, v]) => `${k}=${v}`).join(' · ');

export function ScaleComparison({ runs, criteria }: { runs: Run[]; criteria: Criteria }) {
  const [mode, setMode] = useState<Mode>('mix');
  const sets = scaleRuns(runs, mode);
  const base = sets['scale-base'];
  const baseN = base ? strictMixCapacity(base, mode) : 0;
  const measured = scaleNames.flatMap(name => {
    const run = sets[name];
    return run ? [{ ...run, max_users_ok: { ...run.max_users_ok, [mode]: strictMixCapacity(run, mode) } }] : [];
  });
  return <section data-testid="load-scale-comparison" data-mode={mode} aria-label="GPU scale comparison">
    <h2>GPU baseline · ×2 · ×4 (AI)</h2>
    <label>โหมดเปรียบเทียบ <select data-testid="load-scale-mode" value={mode} onChange={e => setMode(e.target.value as Mode)}>{modes.map(m => <option key={m} value={m}>{MODE_NAMES[m]}</option>)}</select></label>
    <div className="load-cards">{scaleNames.map((name, i) => {
      const run = sets[name];
      const n = run ? strictMixCapacity(run, mode) : undefined;
      const target = [1, 2, 4][i];
      return <article className="load-card" key={name} data-testid="load-scale-card" data-scale={name} data-run-id={run?.id ?? ''} data-value={n ?? ''}>
        <h3>{name}</h3>
        <p className="load-big">{n === undefined ? 'ยังไม่ได้วัด' : `รองรับพร้อมกันได้ ${n} คน`}</p>
        <p>{run?.label ?? 'ไม่มีผล AI ที่ตรงเงื่อนไข'}</p>
        <p>{n === undefined || baseN === 0 ? 'อัตราขยาย: ยังประเมินไม่ได้' : `อัตราขยาย ${(n / baseN).toFixed(2)}× · ${n >= target * baseN ? 'ผ่าน' : 'ไม่ผ่าน'}`}</p>
      </article>;
    })}</div>
    <p>{mode} · think 30 วิ · stage 120 วิ · cache off รวม TTS · prefetch 4/4/2 · p95 ≤ 12 วิ · error &lt; 1%</p>
    {base && baseN === 0 && <p role="status">Baseline N=0: ยังประเมินอัตราขยายไม่ได้</p>}
    {measured.length > 0 && <Chart mode={mode} runs={measured} criteria={criteria} p95Only />}
    {measured.length < 3 && <p>กราฟแสดงเฉพาะชุดที่วัดแล้ว ชุดที่ยังไม่ได้วัดไม่มีเส้น</p>}
  </section>;
}

export default function LoadDashboard({ runs, initial, criteria }: { runs: Run[]; initial: number[]; criteria: Criteria }) {
  const [ids, setIds] = useState<number[]>(initial);
  const selected = runs.filter(r => ids.includes(r.id));
  const shownModes = modes.filter(m => selected.some(r => runModes(r).includes(m)));
  function choose(options: HTMLCollectionOf<HTMLOptionElement>) {
    const next = Array.from(options).map(o => Number(o.value));
    if (!next.length) return;
    setIds(next);
    window.history.replaceState(null, '', `?runs=${next.join(',')}`);
  }
  const headline = runs.find(r => runKind(r).primary);
  if (!runs.length) return <><ScaleComparison runs={runs} criteria={criteria} /><p data-testid="load-empty">ยังไม่มีผล load test · รัน <code>node loadtest/run_load.mjs</code> แล้ว POST ผลไปที่ <code>/api/admin/load</code></p></>;
  return <>
    <ScaleComparison runs={runs} criteria={criteria} />
    <p className={headline ? 'load-headline' : 'load-headline none'} data-testid="load-headline" data-run-id={headline?.id ?? ''}>
      {headline
        ? <>ตัวเลขหลัก (ปิด cache · คำถามไม่ซ้ำสุ่มจาก 770 ข้อ · prefetch 4/4/2): รองรับพร้อมกัน {runModes(headline).map(m => `${MODE_NAMES[m]} ${headline.max_users_ok[m] ?? 0} คน`).join(' · ')} — run #{headline.id} {headline.label} · run ที่เปิด cache/คำถามซ้ำ = ข้อมูลเสริม</>
        : <>ยังไม่มี run หลัก (ปิด cache · คำถามไม่ซ้ำ rag770 · prefetch 4/4/2) · ผลที่แสดงเป็นข้อมูลเสริม</>}
    </p>
    {selected.map((run, i) => { const k = runKind(run); return <section key={run.id} className="load-run" style={{ borderColor: color(i) }} data-run-id={run.id}>
      <h2><i style={{ background: color(i) }} />{run.label} <small>{date(run.created_at)}</small>
        <span className={k.primary ? 'load-kind primary' : 'load-kind'} data-testid="load-run-kind" data-kind={k.primary ? 'primary' : 'supplementary'} data-cache={k.cache} data-questions={k.questions}>{k.badge}</span></h2>
      <div className="load-cards">
        {runModes(run).map(mode => {
          const n = run.max_users_ok[mode] ?? 0;
          return <article key={mode} className={n >= criteria.target_users ? 'load-card ok' : 'load-card'}>
            <h3>{MODE_NAMES[mode]}</h3>
            <p className="load-big">รองรับพร้อมกันได้ <strong data-testid="load-max-users" data-mode={mode} data-run-id={run.id} data-value={n}>{n}</strong> คน</p>
          </article>;
        })}
      </div>
      <p className="load-meta">{configText(run.config)}</p>
    </section>; })}
    <p className="load-criteria" data-testid="load-criteria">เกณฑ์ผ่านต่อขั้น: p95 ≤ {criteria.p95_ms / 1000} วิ · error ≤ {criteria.error_rate * 100}% · เป้า {criteria.target_users} คน · N = ขั้นสูงสุดที่ผ่านโดยทุกขั้นก่อนหน้าผ่าน</p>
    <div className="load-controls">
      <label htmlFor="load-run-select">เลือก run (กด Ctrl/⌘ เพื่อเลือกหลาย run มาเทียบกัน)</label>
      <select id="load-run-select" data-testid="load-run-select" multiple size={Math.min(6, Math.max(2, runs.length))}
        value={ids.map(String)} onChange={e => choose(e.target.selectedOptions)}>
        {runs.map(r => <option key={r.id} value={r.id}>{runKind(r).primary ? '[หลัก] ' : '[เสริม] '}#{r.id} {r.label} · {runModes(r).join('/')} · {date(r.created_at)}</option>)}
      </select>
    </div>
    {shownModes.map(mode => <Chart key={mode} mode={mode} runs={selected} criteria={criteria} />)}
    {shownModes.map(mode => selected.filter(r => runModes(r).includes(mode)).map(run => <StageTable key={`${mode}-${run.id}`} run={run} mode={mode} criteria={criteria} />))}
  </>;
}
