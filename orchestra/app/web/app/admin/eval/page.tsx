// /admin/eval (T17) · dashboard ผลประเมิน RAG · owner เท่านั้น (middleware กันหน้า + ตรวจซ้ำที่นี่)
// query: ?run=<id> (ค่าเริ่มต้น = ล่าสุด) · ?compare=<id>|none · ?doc=<ไฟล์> · ?only=fail
import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLang, getSession } from '@/lib/auth';
import { DOCS, LOWER_IS_BETTER, SETS, SET_METRICS, getRun, listRuns, type EvalItem, type EvalRun, type EvalSet, type RunMeta } from '@/app/api/admin/eval/runs';
import Bars, { type BarRow } from './Bars';
import RunSelect from './RunSelect';
import './eval.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'ประเมิน RAG · ใสใส กลาสแวร์' };

const ON_COLOR = '#0A86AE';
const OFF_COLOR = '#C2703D';

const T = {
  th: {
    title: 'ประเมิน RAG', run: 'ผลประเมิน', compare: 'เทียบกับ', noCompare: 'ไม่เทียบ', empty: 'ยังไม่มีผลประเมิน — ส่งผลด้วย POST /api/admin/eval',
    correct: 'ถูก', withRr: 'มี reranker', withoutRr: 'ไม่มี', noPair: 'ยังไม่มี run ฝั่ง rerank ตรงข้ามให้จับคู่',
    byDoc: '% ตอบถูกต่อเล่ม · rerank on / off', doc: 'เล่ม', n: 'จำนวนข้อ', diff: 'ผลต่าง', total: 'รวม',
    hitDoc: 'Hit@4 ต่อเอกสาร', byType: 'ความถูกต้องต่อประเภทคำถาม', cmpTitle: 'เทียบ 2 run', metric: 'ชุด / metric',
    items: 'รายละเอียดแต่ละข้อ', all: 'ทั้งหมด', onlyFail: 'เฉพาะข้อผิด', showAll: 'แสดงทุกข้อ', allDocs: 'ทุกเล่ม', shown: 'แสดง',
    q: 'คำถาม', exp: 'คำตอบที่คาด', ans: 'คำตอบจริง', cites: 'อ้างอิง', retrieved: 'หน้าที่ค้นได้', reason: 'เหตุผล', turn: 'รอบ',
    lowerBetter: 'ต่ำดีกว่า', items_: 'ข้อ',
  },
  en: {
    title: 'RAG evaluation', run: 'Run', compare: 'Compare with', noCompare: 'No comparison', empty: 'No eval runs yet — POST to /api/admin/eval',
    correct: 'Correct', withRr: 'with reranker', withoutRr: 'without', noPair: 'No run with the opposite rerank setting to pair with',
    byDoc: '% correct per document · rerank on / off', doc: 'Document', n: 'Questions', diff: 'Diff', total: 'Total',
    hitDoc: 'Hit@4 per document', byType: 'Correctness per question type', cmpTitle: 'Compare 2 runs', metric: 'Set / metric',
    items: 'Items', all: 'All', onlyFail: 'Failures only', showAll: 'Show all', allDocs: 'All documents', shown: 'Showing',
    q: 'Question', exp: 'Expected', ans: 'Answer', cites: 'Cites', retrieved: 'Retrieved', reason: 'Reason', turn: 'Turn',
    lowerBetter: 'lower is better', items_: 'items',
  },
};
const SET_NAME: Record<EvalSet, { th: string; en: string }> = {
  rag: { th: 'เอกสาร RAG', en: 'Document RAG' },
  qa: { th: 'คำถามร้าน', en: 'Shop Q&A' },
  conv: { th: 'บทสนทนา', en: 'Conversation' },
};
const METRIC_NAME: Record<string, { th: string; en: string }> = {
  hit_at_4: { th: 'Hit@4', en: 'Hit@4' },
  mrr: { th: 'MRR', en: 'MRR' },
  citation_acc: { th: 'อ้างอิงถูก', en: 'Citation accuracy' },
  faithfulness: { th: 'ยึดตามหลักฐาน', en: 'Faithfulness' },
  correctness: { th: 'ตอบถูก', en: 'Correctness' },
  exact_value: { th: 'ตัวเลขตรง', en: 'Exact value' },
  sql_correct: { th: 'ข้อมูลร้านถูก', en: 'SQL correct' },
  privacy_ok: { th: 'ไม่รั่วข้อมูล', en: 'Privacy OK' },
  context_retention: { th: 'จำบริบท', en: 'Context retention' },
  stt_cer: { th: 'ถอดเสียงผิด (CER)', en: 'STT CER' },
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pct = (v: number | null) => (v === null ? '–' : `${(v * 100).toFixed(1)}%`);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** ผลต่าง a − b (จุดเปอร์เซ็นต์) · tone ตามทิศที่ดีของ metric */
function Diff({ a, b, metric }: { a: number | null; b: number | null; metric: string }) {
  if (a === null || b === null) return <td className="eval-diff" data-diff="" data-tone="none">–</td>;
  const d = Math.round((a - b) * 10000) / 10000;
  const tone = d === 0 ? 'same' : (LOWER_IS_BETTER.has(metric) ? d < 0 : d > 0) ? 'good' : 'bad';
  const text = d === 0 ? '±0.0' : `${d > 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(1)}`;
  return (
    <td className={`eval-diff eval-${tone}`} data-diff={d} data-tone={tone}>
      {tone === 'good' ? '▲ ' : tone === 'bad' ? '▼ ' : ''}{text}
    </td>
  );
}

function metricKeys(run: Pick<RunMeta, 'summary'>, set: EvalSet): string[] {
  const keys = Object.keys(run.summary[set] ?? {}).filter((k) => k !== 'n');
  return [...SET_METRICS[set].filter((k) => keys.includes(k)), ...keys.filter((k) => !SET_METRICS[set].includes(k))];
}

function cellDoc(run: EvalRun | null, doc: string) {
  const r = run?.by_doc.find((x) => x.doc === doc);
  return { n: r ? r.n : null, correctness: r ? num(r.correctness) : null };
}

function Detail({ item, t }: { item: EvalItem; t: (typeof T)['th'] }) {
  return (
    <div className="eval-detail">
      {item.question && <p><b>{t.q}:</b> {item.question}</p>}
      {item.expected && <p><b>{t.exp}:</b> {item.expected}</p>}
      {item.answer && <p><b>{t.ans}:</b> {item.answer}</p>}
      {!!item.cites?.length && (
        <p><b>{t.cites}:</b>{' '}
          {item.cites.map((c, i) => (
            <a key={i} href={`/api/docs/${encodeURIComponent(c.filename)}#page=${c.page}`} target="_blank" rel="noreferrer">📄 {c.filename} · หน้า {c.page} </a>
          ))}
        </p>
      )}
      {!!item.retrieved?.length && (
        <p><b>{t.retrieved}:</b> {item.retrieved.map((c) => `${c.filename} p.${c.page}${c.score !== undefined ? ` (${c.score.toFixed(2)})` : ''}`).join(' · ')}</p>
      )}
      {item.reason && <p><b>{t.reason}:</b> {item.reason}</p>}
      {item.turns?.map((x, i) => (
        <section key={i} className="eval-turn" data-pass={String(x.pass)}>
          <h5>{t.turn} {i + 1} {x.pass ? '✓' : '✗'}</h5>
          <Detail item={x} t={t} />
        </section>
      ))}
    </div>
  );
}

export default async function EvalPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const s = await getSession();
  if (s?.role !== 'owner') redirect('/login?next=/admin/eval');
  const lang = await getLang();
  const t = T[lang];
  const runs = await listRuns();

  if (runs.length === 0) {
    return (
      <div className="eval-page">
        <h1>{t.title}</h1>
        <p className="card" data-testid="eval-empty">{t.empty}</p>
      </div>
    );
  }

  const byId = (v: string | undefined) => runs.find((r) => String(r.id) === v);
  const sel = byId(one(searchParams.run)) ?? runs[0];
  const cmpParam = one(searchParams.compare);
  const opposite = runs.find((r) => r.id !== sel.id && r.config.rerank !== sel.config.rerank);
  const cmpMeta = cmpParam === 'none' ? undefined : byId(cmpParam) ?? opposite ?? runs.find((r) => r.id !== sel.id);
  const pairMeta = cmpMeta && cmpMeta.config.rerank !== sel.config.rerank ? cmpMeta : opposite;

  const run = (await getRun(sel.id))!;
  const cmp = cmpMeta ? await getRun(cmpMeta.id) : null;
  const pair = pairMeta ? (pairMeta.id === cmp?.id ? cmp : await getRun(pairMeta.id)) : null;
  const onRun = run.config.rerank === 'on' ? run : pair;
  const offRun = run.config.rerank === 'off' ? run : pair;
  const ragC = (r: EvalRun | null) => (r ? num(r.summary.rag?.correctness) : null);

  const docF = one(searchParams.doc) || '';
  const onlyFail = one(searchParams.only) === 'fail';
  const href = (p: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const cur: Record<string, string | null> = { run: String(run.id), compare: cmpParam ?? null, doc: docF || null, only: onlyFail ? 'fail' : null, ...p };
    for (const [k, v] of Object.entries(cur)) if (v) q.set(k, v);
    return `/admin/eval?${q.toString()}#items`;
  };
  const items = run.items.filter((it) => (!docF || it.doc === docF) && (!onlyFail || !it.pass));

  // แถวของ eval-by-doc: 7 เล่มตามลำดับมาตรฐาน + เล่มอื่นที่มีในผล (ถ้ามี)
  const docs = [...DOCS, ...[...new Set([...(onRun?.by_doc ?? []), ...(offRun?.by_doc ?? [])].map((d) => d.doc))].filter((d) => !DOCS.includes(d))];
  const opts = runs.map((r) => ({ id: r.id, label: r.label, rerank: String(r.config.rerank) }));
  const pairSeries = [{ name: 'rerank on', color: ON_COLOR }, { name: 'rerank off', color: OFF_COLOR }];
  const docRows: BarRow[] = docs.map((d) => ({
    key: d, label: d.replace(/\.pdf$/i, ''), href: href({ doc: d, only: null }),
    values: [cellDoc(onRun, d).correctness, cellDoc(offRun, d).correctness],
  }));
  const hitRows: BarRow[] = docs.map((d) => ({ key: d, label: d.replace(/\.pdf$/i, ''), values: [num(run.by_doc.find((x) => x.doc === d)?.hit_at_4)] }));
  const types = [...new Set([...run.by_type, ...(cmp?.by_type ?? [])].map((x) => x.type))];
  const typeRows: BarRow[] = types.map((ty) => ({
    key: ty, label: ty,
    values: [num(run.by_type.find((x) => x.type === ty)?.correctness), ...(cmp ? [num(cmp.by_type.find((x) => x.type === ty)?.correctness)] : [])],
  }));
  const cfgText = Object.entries(run.config).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ');

  return (
    <div className="eval-page" data-run={run.id} data-compare={cmp?.id ?? ''}>
      <h1>{t.title}</h1>

      <div className="eval-controls">
        <Suspense>
          <RunSelect param="run" value={run.id} options={opts} testId="eval-run-select" label={t.run} />
          <RunSelect param="compare" value={cmp?.id ?? null} options={opts.filter((o) => o.id !== run.id)} testId="eval-compare-select" label={t.compare} none={t.noCompare} />
        </Suspense>
      </div>
      <p className="muted eval-config" data-testid="eval-config" data-rerank={run.config.rerank} data-mode={run.config.mode}>
        {new Date(run.created_at).toLocaleString(lang === 'en' ? 'en-GB' : 'th-TH', { timeZone: 'Asia/Bangkok' })} · {cfgText}
      </p>

      <section className="eval-hero card" data-testid="eval-headline" data-on={ragC(onRun) ?? ''} data-off={ragC(offRun) ?? ''}>
        <span className="eval-hero-big">
          {t.correct} <b style={{ color: ON_COLOR }}>{pct(ragC(onRun))}</b> <small>({t.withRr})</small>
          {' · '}
          <b style={{ color: OFF_COLOR }}>{pct(ragC(offRun))}</b> <small>({t.withoutRr})</small>
        </span>
        {(!onRun || !offRun) && <p className="muted">{t.noPair}</p>}
      </section>

      {SETS.map((set) => (
        <section key={set} className="eval-set">
          <h2>{SET_NAME[set][lang]} <small className="muted">· {run.summary[set]?.n ?? 0} {t.items_}</small></h2>
          <div className="eval-cards">
            {metricKeys(run, set).map((m) => {
              const v = num(run.summary[set][m]);
              return (
                <article key={m} className="card eval-card" data-testid="eval-metric" data-set={set} data-metric={m} data-value={v ?? ''}>
                  <h3>{METRIC_NAME[m]?.[lang] ?? m}</h3>
                  <strong>{pct(v)}</strong>
                  {LOWER_IS_BETTER.has(m) && <small className="muted">{t.lowerBetter}</small>}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <section className="eval-section">
        <h2>{t.byDoc}</h2>
        <div className="eval-two">
          <table className="eval-table" data-testid="eval-by-doc" data-on-run={onRun?.id ?? ''} data-off-run={offRun?.id ?? ''}>
            <thead>
              <tr><th>{t.doc}</th><th>{t.n}</th><th>rerank on</th><th>rerank off</th><th>{t.diff}</th></tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const a = cellDoc(onRun, d), b = cellDoc(offRun, d);
                return (
                  <tr key={d} data-doc={d} data-on={a.correctness ?? ''} data-off={b.correctness ?? ''} className={docF === d ? 'eval-active' : undefined}>
                    <th><Link href={href({ doc: d, only: null })} data-testid="eval-doc-link" data-doc={d}>{d}</Link></th>
                    <td>{a.n ?? b.n ?? '–'}</td>
                    <td>{pct(a.correctness)}</td>
                    <td>{pct(b.correctness)}</td>
                    <Diff a={a.correctness} b={b.correctness} metric="correctness" />
                  </tr>
                );
              })}
              <tr data-doc="total" className="eval-total" data-on={ragC(onRun) ?? ''} data-off={ragC(offRun) ?? ''}>
                <th>{t.total}</th>
                <td>{(onRun ?? offRun)?.summary.rag?.n ?? '–'}</td>
                <td>{pct(ragC(onRun))}</td>
                <td>{pct(ragC(offRun))}</td>
                <Diff a={ragC(onRun)} b={ragC(offRun)} metric="correctness" />
              </tr>
            </tbody>
          </table>
          <Bars title={t.byDoc} rows={docRows} series={pairSeries} testId="eval-by-doc-chart" />
        </div>
      </section>

      <section className="eval-section eval-two">
        <Bars title={`${t.hitDoc} · #${run.id}`} rows={hitRows} series={[{ name: `#${run.id}`, color: ON_COLOR }]} testId="eval-chart-doc" />
        <Bars title={t.byType} rows={typeRows}
          series={[{ name: `#${run.id} (rerank ${run.config.rerank})`, color: ON_COLOR }, ...(cmp ? [{ name: `#${cmp.id} (rerank ${cmp.config.rerank})`, color: OFF_COLOR }] : [])]}
          testId="eval-chart-type" />
      </section>

      {cmp && (
        <section className="eval-section">
          <h2>{t.cmpTitle}</h2>
          <table className="eval-table" data-testid="eval-compare" data-a={run.id} data-b={cmp.id}>
            <thead>
              <tr><th>{t.metric}</th><th>#{run.id} · {run.label}</th><th>#{cmp.id} · {cmp.label}</th><th>{t.diff}</th></tr>
            </thead>
            <tbody>
              {SETS.flatMap((set) => [...new Set([...metricKeys(run, set), ...metricKeys(cmp, set)])].map((m) => {
                const a = num(run.summary[set]?.[m]), b = num(cmp.summary[set]?.[m]);
                return (
                  <tr key={`${set}:${m}`} data-set={set} data-metric={m}>
                    <th>{SET_NAME[set][lang]} / {METRIC_NAME[m]?.[lang] ?? m}</th>
                    <td>{pct(a)}</td>
                    <td>{pct(b)}</td>
                    <Diff a={a} b={b} metric={m} />
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </section>
      )}

      <section className="eval-section" id="items">
        <h2>{t.items}</h2>
        <div className="eval-filters">
          <Link href={href({ doc: null })} className={!docF ? 'chip active' : 'chip'} data-testid="eval-filter-doc" data-doc="">{t.allDocs}</Link>
          {docs.map((d) => (
            <Link key={d} href={href({ doc: d })} className={docF === d ? 'chip active' : 'chip'} data-testid="eval-filter-doc" data-doc={d}>{d.replace(/\.pdf$/i, '')}</Link>
          ))}
          <Link href={href({ only: onlyFail ? null : 'fail' })} className={onlyFail ? 'chip active fail' : 'chip fail'} data-testid="eval-only-fail" data-active={String(onlyFail)}>
            {onlyFail ? t.showAll : t.onlyFail}
          </Link>
        </div>
        <p className="muted" data-testid="eval-item-count" data-value={items.length}>{t.shown} {items.length} / {run.items.length} {t.items_}</p>
        {items.map((it) => (
          <details key={it.id} className={`eval-item ${it.pass ? 'pass' : 'fail'}`} data-testid="eval-item" data-id={it.id} data-pass={String(it.pass)} data-set={it.set} data-doc={it.doc ?? ''}>
            <summary>
              <span className="eval-mark">{it.pass ? '✓' : '✗'}</span> <b>{it.id}</b> · {it.set}/{it.type}{it.doc ? ` · ${it.doc}` : ''} · {it.question || `${it.turns?.length ?? 0} ${t.turn}`}
            </summary>
            <Detail item={it} t={t} />
          </details>
        ))}
      </section>
    </div>
  );
}
