// metric อัตโนมัติของชุดประเมิน (ไม่มี dependency) — ใช้โดย eval/score.mjs และ eval/test/*.test.mjs
const seg = new Intl.Segmenter('th', { granularity: 'word' });

/** เลขไทย→อารบิก · ตัด comma ระหว่างตัวเลข · ยุบช่องว่าง · ตัวพิมพ์เล็ก */
export function norm(s) {
  return String(s ?? '')
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}
const DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
/** ตัวเลขทั้งหมดในข้อความ (หลัง normalize · ไม่นับวันที่ ISO ที่แยกตรวจเป็นสตริง) */
export function numbers(s) {
  const t = norm(s).replace(DATE, ' ');
  return (t.match(/\d+(?:\.\d+)?/g) || []).map(Number);
}
const isNumeric = (v) => /^[\d,๐-๙]+(?:\.\d+)?%?$/.test(String(v).trim());

/** ค่าที่คาดอยู่ในคำตอบไหม · ตัวเลข = เทียบค่า (1,500.00 = 1500) · อื่น ๆ = substring ไม่สนตัวพิมพ์ */
export function hasValue(answer, value) {
  if (Array.isArray(value)) return value.some((v) => hasValue(answer, v));
  const v = String(value);
  if (isNumeric(v)) {
    const want = Number(norm(v).replace('%', ''));
    return numbers(answer).some((n) => Math.abs(n - want) < 0.005);
  }
  return norm(answer).includes(norm(v));
}
export function valueScore(answer, values) {
  if (!values?.length) return { score: null, missing: [] };
  const missing = values.filter((v) => !hasValue(answer, v));
  const found = values.length - missing.length;
  return { score: found === values.length ? 1 : found > 0 ? 0.5 : 0, exact: missing.length === 0 ? 1 : 0, missing };
}

const NOT_FOUND = /ไม่พบข้อมูล|ไม่มีข้อมูล|ไม่ระบุ|ไม่ได้ระบุ|ไม่พบในเอกสาร|could not find|couldn't find|not (?:found|available|mentioned|specified)|no information|does not (?:say|specify|mention)/i;
const REFUSE = /ไม่พบ|ขออภัย|ไม่สามารถ|ไม่มีสิทธิ์|ล็อกอิน|เข้าสู่ระบบ|ไม่มีขวด|ไม่มีรุ่น|ไม่มี|เฉพาะ|sorry|cannot|can't|not found|log in|only help|do not have|don't have/i;
export const saysNotFound = (a) => NOT_FOUND.test(String(a || ''));
export const refuses = (a) => REFUSE.test(String(a || ''));

const STOP = new Set(['และ', 'หรือ', 'ของ', 'ที่', 'ใน', 'เป็น', 'ได้', 'ให้', 'จะ', 'มี', 'การ', 'ความ', 'ไม่', 'กับ', 'แต่', 'จาก', 'โดย', 'ต้อง',
  'แล้ว', 'ถ้า', 'คือ', 'นี้', 'นั้น', 'ไว้', 'อยู่', 'ก่อน', 'หลัง', 'ด้วย', 'ซึ่ง', 'เพื่อ', 'ทั้ง', 'แบบ', 'เมื่อ', 'ตาม', 'ยัง', 'ค่ะ', 'ครับ', 'ละ', 'ใบ',
  'the', 'a', 'an', 'is', 'are', 'of', 'to', 'and', 'or', 'in', 'on', 'for', 'be', 'it', 'by', 'at', 'as', 'with', 'from', 'that', 'this', 'can', 'must', 'not']);
/** คำสำคัญของ expected (ตัดคำไทยด้วย Intl.Segmenter · ไม่รวมตัวเลข/คำเชื่อม) */
export function keywords(s) {
  const out = new Set();
  for (const t of seg.segment(norm(s).replace(DATE, ' '))) {
    const w = t.segment.trim();
    if (!t.isWordLike || w.length < 2 || STOP.has(w) || /^\d+(?:\.\d+)?$/.test(w)) continue;
    out.add(w);
  }
  return [...out];
}

/**
 * ความถูกต้องอัตโนมัติของคำตอบเอกสาร (rag)
 * ตัวเลขใน expected ต้องอยู่ในคำตอบทุกตัว + คำสำคัญ recall ≥ 0.6 → 1 · ครึ่งหนึ่ง → 0.5 · ไม่งั้น 0
 * unanswerable → 1 เมื่อตอบว่าไม่พบข้อมูล
 */
export function ragCorrectness(item) {
  const answer = item.answer || '';
  if (!answer.trim()) return { score: 0, reason: 'ไม่มีคำตอบ' };
  if (item.type === 'unanswerable') {
    return saysNotFound(answer) ? { score: 1, reason: '' } : { score: 0, reason: 'ควรตอบว่าไม่พบข้อมูลในเอกสาร แต่ตอบเนื้อหาอื่น' };
  }
  const exp = item.expected || '';
  const nums = [...new Set(numbers(exp))];
  const dates = exp.match(DATE) || [];
  const have = new Set(numbers(answer));
  const missNum = nums.filter((n) => ![...have].some((h) => Math.abs(h - n) < 0.005));
  const missDate = dates.filter((d) => !answer.includes(d));
  const kws = keywords(exp);
  const a = norm(answer);
  const hit = kws.filter((k) => a.includes(k));
  const recall = kws.length ? hit.length / kws.length : 1;
  const numOk = missNum.length === 0 && missDate.length === 0;
  const numHalf = nums.length + dates.length === 0 || (missNum.length + missDate.length) <= (nums.length + dates.length) / 2;
  let score = 0;
  if (numOk && recall >= 0.6) score = 1;
  else if (numHalf && recall >= 0.4) score = 0.5;
  const reason = score === 1 ? '' : [
    missNum.length || missDate.length ? `ไม่พบค่า ${[...missNum, ...missDate].join(', ')}` : '',
    recall < 0.6 ? `คำสำคัญตรง ${(recall * 100).toFixed(0)}%` : '',
  ].filter(Boolean).join(' · ');
  return { score, recall, missing: [...missNum, ...missDate], reason };
}

const docName = (f) => String(f || '').replace(/\.pdf$/i, '').toLowerCase();
const relevant = (r, item) => docName(r.filename) === docName(item.doc) && (item.pages || []).includes(Number(r.page));

/** hit@4 · MRR (retrieved top 4 มีไฟล์+หน้าที่คาด) · citation (บอทอ้างไฟล์+หน้าที่คาด) — ไม่นับข้อที่ไม่มีหน้าอ้างอิง */
export function retrievalMetrics(item, k = 4) {
  if (!item.pages?.length || item.type === 'unanswerable') return { hit_at_4: null, mrr: null, citation_acc: null };
  const top = (item.retrieved || []).slice(0, k);
  const rank = top.findIndex((r) => relevant(r, item));
  return {
    hit_at_4: rank >= 0 ? 1 : 0,
    mrr: rank >= 0 ? 1 / (rank + 1) : 0,
    citation_acc: (item.cites || []).some((c) => relevant(c, item)) ? 1 : 0,
  };
}

/** faithfulness: สัดส่วนตัวเลขในคำตอบที่มีอยู่ในข้อความของหน้าที่ค้นได้ (หรือในคำถาม) · ไม่มีตัวเลข = 1 */
export function faithfulness(answer, sourceText, question = '') {
  if (!String(answer || '').trim()) return 0;
  if (sourceText == null) return null;
  const src = new Set([...numbers(sourceText), ...numbers(question)]);
  const dates = new Set([...(String(sourceText).match(DATE) || []), ...(String(question).match(DATE) || [])]);
  const nums = numbers(answer);
  const ds = String(answer).match(DATE) || [];
  const total = nums.length + ds.length;
  if (!total) return 1;
  const ok = nums.filter((n) => src.has(n)).length + ds.filter((d) => dates.has(d)).length;
  return ok / total;
}

/** privacy: ไม่มีเลข SO/ยอดเงินของบริษัทอื่นในคำตอบ */
export function privacyOk(answer, forbidden = []) {
  const leaked = forbidden.filter((f) => (/^SO-/i.test(f) ? norm(answer).includes(norm(f)) : hasValue(answer, f)));
  return { ok: leaked.length ? 0 : 1, leaked };
}

/** CER (Levenshtein ตัวอักษร) หลังตัดช่องว่าง/เครื่องหมาย/ตัวพิมพ์ · จำกัด 0..1 */
export function cer(ref, hyp) {
  const clean = (s) => [...norm(s).replace(/[\s\p{P}\p{S}]/gu, '')];
  const a = clean(ref), b = clean(hyp);
  if (!a.length) return b.length ? 1 : 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return Math.min(1, prev[b.length] / a.length);
}

export const mean = (xs) => {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x));
  return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10000) / 10000 : null;
};
