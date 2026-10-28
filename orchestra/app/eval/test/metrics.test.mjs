// node --test eval/test/*.test.mjs  (ไม่ต้องใช้ DB/เว็บ)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cer, faithfulness, hasValue, numbers, privacyOk, ragCorrectness, retrievalMetrics, valueScore } from '../lib/metrics.mjs';
import { scoreRun, answerSha } from '../score.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));

test('normalize numbers: comma · Thai digits · decimals', () => {
  assert.deepEqual(numbers('รวม ฿63,023.00 และ ๑,๕๐๐ บาท'), [63023, 1500]);
  assert.ok(hasValue('ค่าส่ง 1500 บาท', '1,500.00'));
  assert.ok(hasValue('ลด 5%', '5%'));
  assert.ok(!hasValue('ลด 15%', '5%'));
  assert.ok(hasValue('วันรับของ 2026-10-25', '2026-10-25'));
  assert.ok(!hasValue('2026-10-25', '25')); // วันที่ ISO ไม่ถูกนับเป็นตัวเลขแยก
  assert.ok(hasValue('QTY_MIN', ['QTY_MIN', 'B-250 สั่งขั้นต่ำ 1,200 ใบ']));
});

test('valueScore partial/exact', () => {
  assert.deepEqual(valueScore('VAT 4,123.00 รวม 63,023.00', ['4,123.00', '63,023.00']).score, 1);
  assert.equal(valueScore('VAT 4,123.00', ['4,123.00', '63,023.00']).score, 0.5);
  assert.equal(valueScore('ไม่ทราบ', ['4,123.00']).score, 0);
  assert.equal(valueScore('x', []).score, null);
});

test('rag correctness: numbers + keyword recall · unanswerable', () => {
  const item = { type: 'direct', expected: 'โรงงานพื้นที่รวม 18 ไร่ ก่อตั้งปี 2558', answer: 'ก่อตั้งปี 2558 พื้นที่รวม 18 ไร่ ค่ะ' };
  assert.equal(ragCorrectness(item).score, 1);
  assert.equal(ragCorrectness({ ...item, answer: 'พื้นที่รวม 20 ไร่' }).score, 0);
  assert.equal(ragCorrectness({ type: 'unanswerable', expected: 'ไม่มีข้อมูล', answer: 'ไม่พบข้อมูลในเอกสารค่ะ' }).score, 1);
  assert.equal(ragCorrectness({ type: 'unanswerable', expected: 'ไม่มีข้อมูล', answer: 'ราคา 3.20 บาท' }).score, 0);
});

test('retrieval: hit@4 · mrr · citation', () => {
  const it = { doc: 'SS-POLICY.pdf', type: 'table', pages: [4], retrieved: [{ filename: 'SS-POLICY.pdf', page: 3 }, { filename: 'SS-POLICY.pdf', page: 4 }], cites: [{ filename: 'SS-POLICY.pdf', page: 4 }] };
  assert.deepEqual(retrievalMetrics(it), { hit_at_4: 1, mrr: 0.5, citation_acc: 1 });
  assert.deepEqual(retrievalMetrics({ ...it, type: 'unanswerable', pages: [] }), { hit_at_4: null, mrr: null, citation_acc: null });
});

test('faithfulness counts unsupported numbers', () => {
  assert.equal(faithfulness('กล่องละ 48 ใบ', 'B-250 บรรจุกล่องละ 48 ใบ'), 1);
  assert.equal(faithfulness('กล่องละ 48 ใบ ราคา 99 บาท', 'B-250 บรรจุกล่องละ 48 ใบ'), 0.5);
  assert.equal(faithfulness('ไม่พบข้อมูล', 'x'), 1);
  assert.equal(faithfulness('a 1', null), null);
});

test('privacy: other companies SO/total leak', () => {
  assert.deepEqual(privacyOk('ไม่พบออเดอร์นี้ค่ะ', ['SO-0001', '16,692.00']), { ok: 1, leaked: [] });
  assert.equal(privacyOk('ออเดอร์ SO-0001 ยอด 16692.00', ['SO-0001', '16,692.00']).ok, 0);
});

test('CER ignores spaces/punctuation', () => {
  assert.equal(cer('ขวดสองร้อยห้าสิบมิล', 'ขวด สองร้อย ห้าสิบ มิล'), 0);
  assert.ok(cer('abcd', 'abxd') > 0.2);
  assert.equal(cer('abc', ''), 1);
});

test('scoreRun output matches SCHEMA shape + judgments override (sha-guarded)', () => {
  const raw = { label: 't', config: { rerank: 'on', mode: 'mock' }, items: [
    { set: 'rag', id: 'R1', doc: 'SS-POLICY.pdf', type: 'direct', question: 'q', expected: 'ภายใน 7 วัน', answer: 'ภายใน 7 วัน', pages: [6], retrieved: [{ filename: 'SS-POLICY.pdf', page: 6, score: 1 }], cites: [{ filename: 'SS-POLICY.pdf', page: 6 }] },
    { set: 'rag', id: 'R2', doc: 'SS-POLICY.pdf', type: 'direct', question: 'q', expected: 'ภายใน 7 วัน', answer: 'ภายใน 9 วัน', pages: [6], retrieved: [], cites: [] },
    { set: 'qa', id: 'Q1', type: 'privacy', question: 'q', expected: 'x', answer: 'ไม่พบออเดอร์นี้ค่ะ', expected_values: [], forbidden: ['SO-0001'] },
    { set: 'qa', id: 'Q2', type: 'price', sql: true, question: 'q', expected: 'x', answer: 'ใบละ 5.80 บาท', expected_values: ['5.80'] },
    { set: 'conv', id: 'C1', type: 'voice', question: 't', turns: [
      { question: 'a', audio: 'V01.wav', reference: 'ab', stt: { text: 'ab' }, answer: '5.80', expected_values: ['5.80'] },
      { question: 'b', refers_back: true, answer: 'x', expected_values: ['1,200'] }] },
  ] };
  const out = scoreRun(raw, { judgments: { R2: { correctness: 1, reason: 'ok', answer_sha: answerSha('ภายใน 9 วัน') }, R1: { correctness: 0, answer_sha: 'deadbeef0000' } } });
  assert.equal(out.summary.rag.n, 2);
  assert.equal(out.summary.rag.correctness, 1); // R2 judged 1 · R1 judgment stale → auto 1
  assert.equal(out.config.stale_judgments, 1);
  assert.equal(out.summary.qa.privacy_ok, 1);
  assert.equal(out.summary.qa.sql_correct, 1);
  assert.equal(out.summary.conv.context_retention, 0);
  assert.equal(out.summary.conv.stt_cer, 0);
  assert.equal(out.items.find((i) => i.id === 'C1').pass, false);
  for (const i of out.items) for (const k of ['id', 'set', 'type', 'pass']) assert.ok(k in i);
  assert.ok(out.by_doc.every((d) => d.doc && d.n && typeof d.correctness === 'number'));
});

test('datasets: rag 770 · qa 70–80 · conv 10–12 × 4–6 · ≥3 voice · ≥2 en', () => {
  const rag = load('rag.json'), qa = load('qa.json'), conv = load('conv.json');
  assert.equal(rag.length, 770);
  assert.equal(new Set(rag.map((q) => q.id)).size, 770);
  for (const q of rag) for (const k of ['id', 'doc', 'question', 'expected', 'pages', 'type']) assert.ok(k in q, `${q.id} ${k}`);
  assert.ok(qa.length >= 70 && qa.length <= 80);
  for (const t of ['price', 'min_qty', 'discount', 'logo', 'shipping', 'pickup', 'credit', 'sample', 'total', 'privacy', 'offtopic']) assert.ok(qa.some((q) => q.type === t), t);
  assert.ok(conv.length >= 10 && conv.length <= 12);
  assert.ok(conv.every((c) => c.turns.length >= 4 && c.turns.length <= 6));
  assert.ok(conv.filter((c) => c.turns.some((t) => t.audio)).length >= 3);
  assert.ok(conv.filter((c) => c.lang === 'en').length >= 2);
});
