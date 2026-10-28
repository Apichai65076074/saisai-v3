// ผลประเมิน RAG (T17) · รูปแบบตาม SCHEMA.md · ตรวจ/แปลง body ของ POST + โหลดจาก eval_runs (ใช้ร่วมกับหน้า /admin/eval)
import { query, queryOne } from '@/lib/db';

export const SETS = ['rag', 'qa', 'conv'] as const;
export type EvalSet = (typeof SETS)[number];
export const SET_METRICS: Record<EvalSet, string[]> = {
  rag: ['hit_at_4', 'mrr', 'citation_acc', 'faithfulness', 'correctness'],
  qa: ['correctness', 'exact_value', 'sql_correct', 'privacy_ok'],
  conv: ['context_retention', 'stt_cer'],
};
/** metric ที่ค่าต่ำ = ดี */
export const LOWER_IS_BETTER = new Set(['stt_cer']);
/** 7 เล่มใน docs/pdf (ลำดับแถวของ eval-by-doc) */
export const DOCS = [
  'SS-CAT-BOTTLES.pdf', 'SS-LOGO-PRINT.pdf', 'SS-LOGISTICS.pdf', 'SS-POLICY.pdf',
  'SS-QC-STANDARD.pdf', 'SS-USE-CARE.pdf', 'SS-FAQ-EN.pdf',
];

export type Scores = Record<string, number | null>;
export type DocRow = { doc: string; n: number } & Record<string, number | null | string>;
export type TypeRow = { type: string; n: number } & Record<string, number | null | string>;
export type Cite = { filename: string; page: number; score?: number };
export type EvalItem = {
  id: string; set: EvalSet; doc: string | null; type: string; pass: boolean;
  question?: string; expected?: string; answer?: string; reason?: string;
  cites?: Cite[]; retrieved?: Cite[]; pages?: number[]; metrics?: Scores; turns?: EvalItem[];
};
export type RunConfig = { rerank: 'on' | 'off'; mode: string } & Record<string, unknown>;
export type RunSummary = Record<EvalSet, Scores>;
export type RunMeta = { id: number; label: string; created_at: string; config: RunConfig; summary: RunSummary };
export type EvalRun = RunMeta & { by_doc: DocRow[]; by_type: TypeRow[]; items: EvalItem[] };
export type NewRun = Omit<EvalRun, 'id' | 'created_at'>;

export const docName = (d: string) => (/\.pdf$/i.test(d) ? d : `${d}.pdf`);

class Invalid extends Error {
  constructor(public field: string, message: string) { super(message); }
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isRatio = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1);
const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;

function scores(v: unknown, field: string, required: string[]): Scores {
  if (!isObj(v)) throw new Invalid(field, 'ต้องเป็น object');
  if (!isCount(v.n)) throw new Invalid(`${field}.n`, 'n ต้องเป็นจำนวนเต็ม ≥ 0');
  const out: Scores = { n: v.n as number };
  for (const m of required) if (!(m in v)) throw new Invalid(`${field}.${m}`, 'ไม่มี metric นี้');
  for (const [k, x] of Object.entries(v)) {
    if (k === 'n') continue;
    if (!isRatio(x)) throw new Invalid(`${field}.${k}`, 'ค่า metric ต้องอยู่ระหว่าง 0–1 หรือ null');
    out[k] = x as number | null;
  }
  return out;
}

/** by_doc/by_type: array [{<key>, n, ...}] หรือ object {"<key>": {n, ...}} (แบบ BuildMart) */
function groups(v: unknown, field: string, key: 'doc' | 'type'): Record<string, unknown>[] {
  if (v === undefined || v === null) return [];
  const rows = Array.isArray(v) ? v : isObj(v) ? Object.entries(v).map(([k, x]) => ({ ...(isObj(x) ? x : {}), [key]: k })) : null;
  if (!rows) throw new Invalid(field, 'ต้องเป็น array');
  return rows.map((r, i) => {
    if (!isObj(r) || typeof r[key] !== 'string' || !r[key]) throw new Invalid(`${field}[${i}].${key}`, `ต้องมี ${key}`);
    const rest: Record<string, unknown> = { ...r };
    delete rest[key];
    const s = scores(rest, `${field}[${i}]`, key === 'doc' ? ['correctness'] : []);
    return { [key]: key === 'doc' ? docName(r[key] as string) : r[key], ...s };
  });
}

function cites(v: unknown, field: string): Cite[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) throw new Invalid(field, 'ต้องเป็น array');
  return v.map((c, i) => {
    if (!isObj(c) || typeof c.filename !== 'string' || !Number.isInteger(c.page)) throw new Invalid(`${field}[${i}]`, 'ต้องเป็น {filename, page}');
    return { filename: c.filename, page: c.page as number, ...(typeof c.score === 'number' ? { score: c.score } : {}) };
  });
}

function item(v: unknown, field: string, nested = false): EvalItem {
  if (!isObj(v)) throw new Invalid(field, 'ต้องเป็น object');
  const str = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : v[k] == null ? undefined : JSON.stringify(v[k]));
  if (!nested && (typeof v.id !== 'string' || !v.id)) throw new Invalid(`${field}.id`, 'ต้องมี id');
  if (!nested && !SETS.includes(v.set as EvalSet)) throw new Invalid(`${field}.set`, 'set ต้องเป็น rag|qa|conv');
  if (typeof v.pass !== 'boolean' && !(nested && v.pass === undefined)) throw new Invalid(`${field}.pass`, 'pass ต้องเป็น boolean');
  if (!nested && (typeof v.type !== 'string' || !v.type)) throw new Invalid(`${field}.type`, 'ต้องมี type');
  if (v.doc != null && typeof v.doc !== 'string') throw new Invalid(`${field}.doc`, 'doc ต้องเป็นสตริงหรือ null');
  let metrics: Scores | undefined;
  if (isObj(v.metrics)) {
    metrics = {};
    for (const [k, x] of Object.entries(v.metrics)) if (typeof x === 'number' || x === null) metrics[k] = x;
  }
  return {
    id: typeof v.id === 'string' ? v.id : '', set: (v.set ?? 'conv') as EvalSet,
    doc: typeof v.doc === 'string' && v.doc ? docName(v.doc) : null,
    type: typeof v.type === 'string' ? v.type : '', pass: v.pass === true,
    question: str('question'), expected: str('expected'), answer: str('answer'), reason: str('reason'),
    cites: cites(v.cites, `${field}.cites`), retrieved: cites(v.retrieved, `${field}.retrieved`),
    pages: Array.isArray(v.pages) ? v.pages.filter((p): p is number => Number.isInteger(p)) : undefined,
    metrics,
    turns: Array.isArray(v.turns) ? v.turns.map((t, i) => item(t, `${field}.turns[${i}]`, true)) : undefined,
  };
}

/** ตรวจ body ของ POST → run ที่พร้อมบันทึก หรือ {field, message} */
export function parseRun(body: unknown): { ok: true; run: NewRun } | { ok: false; field: string; message: string } {
  try {
    if (!isObj(body)) throw new Invalid('', 'body ต้องเป็น JSON object');
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    if (!label || label.length > 200) throw new Invalid('label', 'label ต้องยาว 1–200 ตัวอักษร');
    const c = body.config;
    if (!isObj(c)) throw new Invalid('config', 'ต้องมี config');
    if (c.rerank === true || c.rerank === false) c.rerank = c.rerank ? 'on' : 'off';
    if (c.rerank !== 'on' && c.rerank !== 'off') throw new Invalid('config.rerank', 'rerank ต้องเป็น on|off');
    if (typeof c.mode !== 'string' || !c.mode) throw new Invalid('config.mode', 'ต้องมี mode (mock|ai)');
    const s = body.summary;
    if (!isObj(s)) throw new Invalid('summary', 'ต้องมี summary');
    const summary = Object.fromEntries(SETS.map((set) => [set, scores(s[set], `summary.${set}`, SET_METRICS[set])])) as RunSummary;
    const byDoc = groups(body.by_doc ?? s.by_doc, 'by_doc', 'doc') as DocRow[];
    const byType = groups(body.by_type ?? s.by_type, 'by_type', 'type') as TypeRow[];
    if (!Array.isArray(body.items)) throw new Invalid('items', 'items ต้องเป็น array');
    const ids = new Set<string>();
    const items = body.items.map((x, i) => {
      const it = item(x, `items[${i}]`);
      if (ids.has(it.id)) throw new Invalid(`items[${i}].id`, `id ซ้ำ: ${it.id}`);
      ids.add(it.id);
      return it;
    });
    return { ok: true, run: { label, config: c as RunConfig, summary, by_doc: byDoc, by_type: byType, items } };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, field: e.field, message: e.message };
    throw e;
  }
}

export async function insertRun(run: NewRun): Promise<number> {
  const r = await queryOne<{ id: number }>(
    'INSERT INTO eval_runs(label, config, summary, items) VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb) RETURNING id',
    [run.label, JSON.stringify(run.config), JSON.stringify({ ...run.summary, by_doc: run.by_doc, by_type: run.by_type }), JSON.stringify(run.items)],
  );
  return r!.id;
}

type Row = { id: number; label: string; created_at: Date | string; config: RunConfig; summary: Record<string, unknown>; items?: EvalItem[] };
const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : d);
function meta(r: Row): RunMeta {
  const s = r.summary ?? {};
  return {
    id: r.id, label: r.label, created_at: iso(r.created_at), config: r.config ?? { rerank: 'on', mode: '' },
    summary: Object.fromEntries(SETS.map((set) => [set, (s[set] as Scores) ?? {}])) as RunSummary,
  };
}

/** ทุก run (ใหม่ → เก่า) ไม่รวม items */
export async function listRuns(): Promise<RunMeta[]> {
  const rows = await query<Row>(
    `SELECT id, label, created_at, config, summary - 'by_doc' - 'by_type' AS summary FROM eval_runs ORDER BY created_at DESC, id DESC`,
  );
  return rows.map(meta);
}

export async function getRun(id: number): Promise<EvalRun | null> {
  const r = await queryOne<Row>('SELECT id, label, created_at, config, summary, items FROM eval_runs WHERE id = $1', [id]);
  if (!r) return null;
  const s = r.summary ?? {};
  return {
    ...meta(r),
    by_doc: Array.isArray(s.by_doc) ? (s.by_doc as DocRow[]) : [],
    by_type: Array.isArray(s.by_type) ? (s.by_type as TypeRow[]) : [],
    items: Array.isArray(r.items) ? r.items : [],
  };
}
