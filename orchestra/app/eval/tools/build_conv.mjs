// สร้าง eval/conv.json — 12 บท × 4–6 รอบ (ผสม PDF + DB + ใบเสนอราคา · 4 บทเสียง V01–V10 · 3 บทอังกฤษ)
// ตัวเลขราคาคำนวณจาก priceFromInput() · ข้อมูลเอกสารตรวจว่าอยู่ใน data/facts จริง · รอบเสียงใช้ข้อความจาก voice-fixtures/questions.json
//   DATABASE_URL=... node --import ./web/node_modules/tsx/dist/loader.mjs eval/tools/build_conv.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from '../../web/node_modules/pg/lib/index.js';
import { priceFromInput } from '../../web/lib/server/pricing.ts';
import { QUOTE_VALID_DAYS } from '../../web/lib/server/quotes.ts';
import { addDays, bangkokDate, CREDIT_DAYS, CREDIT_MIN_SHIPPED, SAMPLE_MAX_PER_MODEL } from '../../web/lib/rules.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const NOW = '2026-10-11T10:00:00+07:00';
const money = (s) => Number(s).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const count = (n) => Number(n).toLocaleString('en-US');
const pct = (rate) => `${Number((Number(rate) * 100).toFixed(4))}%`;

const facts = new Map();
for (const f of readdirSync(path.join(root, 'data/facts'))) {
  const d = JSON.parse(readFileSync(path.join(root, 'data/facts', f), 'utf8'));
  for (const x of d.facts) facts.set(x.id, { ...x, file: d.file });
}
const voices = Object.fromEntries(JSON.parse(readFileSync(path.join(root, 'e2e/voice-fixtures/questions.json'), 'utf8')).map((v) => [v.id, v]));

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const products = (await db.query(`SELECT p.code, p.model_code, p.color, p.unit_price, m.min_qty, m.size_ml FROM products p JOIN product_models m ON m.code = p.model_code ORDER BY p.code`)).rows;
const companies = (await db.query(`SELECT id, code FROM companies`)).rows;
const shop = (await db.query(`SELECT * FROM shop_settings LIMIT 1`)).rows[0];
const cid = (code) => companies.find((c) => c.code === code)?.id ?? null;
const prod = (code) => products.find((p) => p.code === code);
const today = bangkokDate(NOW);

// ---- ชนิดรอบ
// price: input (สะสมตามบท) → ค่าจาก lines · doc: fact ids + คำที่ต้องเจอ (ตรวจว่าอยู่ใน fact) · fixed: ค่าจาก SQL/rules
async function price(input, want, account) {
  const full = { ...input };
  if (full.distanceKm == null && full.addressCode == null) full.distanceKm = 0; // ค่าเริ่มต้นของ chat-worker
  if (full.model == null) { const p = products[0]; Object.assign(full, { model: p.model_code, color: p.color, quantity: p.min_qty }, input); }
  const r = await priceFromInput(db, full, { now: NOW, companyId: cid(account) });
  const L = r.lines || {};
  const vals = [];
  for (const w of want) {
    if (w === 'errors') r.errors.forEach((e) => vals.push(e.code === 'DISTANCE_TOO_FAR' ? [e.code, 'ติดต่อ', 'contact', shop.sales_phone] : [e.code]));
    else if (w === 'rate') vals.push(pct(L.discountRate));
    else if (w === 'trips') vals.push(String(L.trips));
    else if (w === 'earliest') vals.push(r.earliestPickup);
    else if (w === 'upsell') vals.push(money(r.upsell.saving));
    else vals.push(money(L[{ logo: 'logoAmount' }[w] || w]));
  }
  return vals;
}
function doc(ids, values) {
  for (const v of values.flat()) {
    if (!ids.some((id) => facts.get(id)?.statement.includes(v))) throw new Error(`"${v}" not in facts ${ids}`);
  }
  return { values, facts: ids, files: [...new Set(ids.map((id) => facts.get(id).file))] };
}
const voice = (id) => ({ audio: voices[id].file, reference: voices[id].text, voice_id: id });

const C = [];
const conv = (o) => C.push(o);

// 1 · แคตตาล็อก + ราคา (ไทย · ไม่ล็อกอิน)
conv({ title: 'B-250 สี/ราคา/ขั้นต่ำ/ส่วนลด/โลโก้', type: 'catalog_price', lang: 'th', turns: [
  { text: 'ขวด B-250 มีสีอะไรบ้าง', expected: 'ใส ชา เขียว', values: [['ใส', 'clear'], ['ชา', 'amber'], ['เขียว', 'green']] },
  { text: 'สีเขียวใบละเท่าไร', refers_back: true, expected: `${money(prod('P07').unit_price)} บาท`, values: [money(prod('P07').unit_price)] },
  { text: 'ขั้นต่ำเท่าไร', refers_back: true, expected: `${count(prod('P07').min_qty)} ใบ`, values: [count(prod('P07').min_qty)] },
  { text: 'ถ้าหมื่นใบค่าขวดเท่าไร', refers_back: true, p: [{ model: 'B-250', color: 'green', quantity: 10000 }, ['bottles', 'discount']] },
  { text: 'ใส่โลโก้ด้วยเพิ่มเท่าไร', refers_back: true, p: [{ model: 'B-250', color: 'green', quantity: 10000, logo: true }, ['logo']] },
] });
// 2 · ราคา + ใบเสนอราคา (C01)
conv({ title: 'B-100 ส่งคลังบางนา → หมื่นใบ → วันรับของ → ใบเสนอราคา', type: 'quote', lang: 'th', account: 'C01', turns: [
  { text: 'ราคา B-100 สีใส 9,600 ใบ ส่งคลังบางนา', p: [{ model: 'B-100', color: 'clear', quantity: 9600, addressCode: 'ADDR-02' }, ['subtotal', 'vat', 'total', 'upsell']] },
  { text: 'แล้วถ้าหมื่นใบล่ะ', refers_back: true, p: [{ model: 'B-100', color: 'clear', quantity: 10000, addressCode: 'ADDR-02' }, ['subtotal', 'total']] },
  { text: 'รับของเร็วสุดวันไหน', p: [{}, ['earliest']] },
  { text: 'ขอใบเสนอราคาเลย', refers_back: true, expected: 'ออกใบเสนอราคา QT-NNNN', values: ['QT-'] },
  { text: 'ใบนี้หมดอายุเมื่อไร', refers_back: true, expected: `หมดอายุ ${addDays(today, QUOTE_VALID_DAYS)}`, values: [addDays(today, QUOTE_VALID_DAYS)] },
] });
// 3 · ค่าส่งหลายระยะ (ไม่ล็อกอิน)
conv({ title: 'B-500 25,000 ใบ ค่าส่ง 160/50/51/>300 กม.', type: 'shipping', lang: 'th', turns: [
  { text: 'B-500 สีใส 25,000 ใบ ส่ง 160 กม. ค่าส่งเท่าไร', p: [{ model: 'B-500', color: 'clear', quantity: 25000, distanceKm: 160 }, ['shipping', 'trips']] },
  { text: 'ถ้าส่ง 50 กม. แทนล่ะ', refers_back: true, p: [{ model: 'B-500', color: 'clear', quantity: 25000, distanceKm: 50 }, ['shipping']] },
  { text: '51 กม. ล่ะ', refers_back: true, p: [{ model: 'B-500', color: 'clear', quantity: 25000, distanceKm: 51 }, ['shipping']] },
  { text: 'ถ้าไกลเกิน 300 กม. ล่ะ', refers_back: true, p: [{ model: 'B-500', color: 'clear', quantity: 25000, distanceKm: 301 }, ['errors']] },
  { text: 'ขอเบอร์ติดต่อฝ่ายขาย', expected: shop.sales_phone, values: [shop.sales_phone] },
] });
// 4 · เคลม (PDF)
conv({ title: 'ขั้นตอนเคลม: วัน/รูป/ไฟล์/ล็อต', type: 'doc_claim', lang: 'th', turns: [
  { text: 'เคลมขวดแตกได้ภายในกี่วัน', d: doc(['POL-107', 'LOG-110'], ['7']) },
  { text: 'ต้องแนบรูปกี่รูป', refers_back: true, d: doc(['POL-119', 'LOG-111'], ['1', '5']) },
  { text: 'ไฟล์แบบไหนได้บ้าง', refers_back: true, d: doc(['POL-120', 'LOG-111'], ['JPG', 'PNG']) },
  { text: 'เลขล็อตเขียนยังไง', refers_back: true, d: doc(['POL-112', 'QC-032'], ['LOT-', '6']) },
] });
// 5 · เครดิต/การชำระ (C01 · DB + PDF)
conv({ title: 'เครดิต · ครบกำหนด · บัญชีโอน · ออเดอร์ตัวเอง', type: 'credit', lang: 'th', account: 'C01', turns: [
  { text: 'ได้เครดิตเมื่อไร', expected: `ส่งแล้ว ${CREDIT_MIN_SHIPPED} ออเดอร์ ได้เครดิต ${CREDIT_DAYS} วัน`, values: [String(CREDIT_MIN_SHIPPED), String(CREDIT_DAYS)] },
  { text: 'ถ้าส่ง 1 พ.ย. ครบกำหนดวันไหน', refers_back: true, expected: addDays('2026-11-01', CREDIT_DAYS), values: [addDays('2026-11-01', CREDIT_DAYS)] },
  { text: 'โอนเข้าบัญชีอะไร', expected: `${shop.bank_name_th} ${shop.bank_account_no}`, values: [shop.bank_account_no] },
  { text: 'ยังไม่โอนเริ่มผลิตได้ไหม', refers_back: true, d: doc(['POL-018'], [['บันทึกรับเงิน', 'รับเงิน']]) },
  { text: 'ออเดอร์ SO-0012 ถึงไหนแล้ว', expected: 'SO-0012 ของ C01 (สถานะ 5 พร้อมจัดส่ง)', values: ['SO-0012'] },
] });
// 6 · อังกฤษ (C03 kenji)
conv({ title: 'EN: sizes → B-150 amber → minimum → samples → pickup', type: 'catalog_en', lang: 'en', account: 'C03', turns: [
  { text: 'What sizes do you have?', expected: [...new Set(products.map((p) => p.size_ml))].join('/') + ' ml', values: [...new Set(products.map((p) => String(p.size_ml)))] },
  { text: 'What is the price of B-150 amber?', expected: money(prod('P04').unit_price), values: [money(prod('P04').unit_price)] },
  { text: 'What is the minimum order?', refers_back: true, expected: count(prod('P04').min_qty), values: [count(prod('P04').min_qty)] },
  { text: 'Can I get free samples?', expected: `${SAMPLE_MAX_PER_MODEL} per model per month`, values: [String(SAMPLE_MAX_PER_MODEL)] },
  { text: 'What is the earliest pickup date?', p: [{}, ['earliest']] },
] });
// 7 · อังกฤษ (PDF FAQ-EN + ราคา)
conv({ title: 'EN: lead time → price with/without logo → claim window', type: 'doc_price_en', lang: 'en', turns: [
  { text: 'What is the lead time?', d: doc(['FAQ-070', 'FAQ-122'], ['14']) },
  { text: 'How much is the total for 10,000 B-250 clear bottles with logo, pick up at the factory?', p: [{ model: 'B-250', color: 'clear', quantity: 10000, logo: true, distanceKm: 0 }, ['logo', 'total']] },
  { text: 'And the total without logo?', refers_back: true, p: [{ model: 'B-250', color: 'clear', quantity: 10000, logo: false, distanceKm: 0 }, ['total']] },
  { text: 'How many days do I have to report a claim?', d: doc(['FAQ-100'], ['7']) },
] });
// 8 · เสียงไทย (ไม่ล็อกอิน)
conv({ title: 'เสียง: B-250 เขียว → หมื่นใบ → โลโก้ → วันรับของ', type: 'voice', lang: 'th', turns: [
  { ...voice('V01'), expected: money(prod('P07').unit_price), values: [money(prod('P07').unit_price)] },
  { ...voice('V02'), refers_back: true, p: [{ model: 'B-250', color: 'green', quantity: 10000 }, ['rate']] },
  { ...voice('V03'), refers_back: true, p: [{ model: 'B-250', color: 'green', quantity: 10000, logo: true }, ['logo']] },
  { ...voice('V09'), p: [{}, ['earliest']] },
] });
// 9 · เสียง + ใบเสนอราคา (C01)
conv({ title: 'เสียง: ค่าส่งนครสวรรค์ → 30,000 ใบ → ขอใบเสนอราคา → หมดอายุ', type: 'voice', lang: 'th', account: 'C01', turns: [
  { ...voice('V04'), p: [{ addressCode: 'ADDR-01' }, ['shipping']] },
  { text: 'ถ้าสั่ง B-250 สีใส 30,000 ใบล่ะ', refers_back: true, p: [{ model: 'B-250', color: 'clear', quantity: 30000, addressCode: 'ADDR-01' }, ['shipping', 'trips', 'total']] },
  { ...voice('V05'), refers_back: true, expected: 'QT-NNNN', values: ['QT-'] },
  { text: 'ใบนี้หมดอายุเมื่อไร', refers_back: true, expected: addDays(today, QUOTE_VALID_DAYS), values: [addDays(today, QUOTE_VALID_DAYS)] },
] });
// 10 · เสียงผสมไทย/อังกฤษ (ไม่ล็อกอิน)
conv({ title: 'เสียง: เคลม → B-500 ขั้นต่ำ → samples → เบอร์ฝ่ายขาย', type: 'voice', lang: 'th', turns: [
  { ...voice('V06'), d: doc(['POL-107', 'LOG-110'], ['7']) },
  { ...voice('V07'), expected: count(prod('P08').min_qty), values: [count(prod('P08').min_qty)] },
  { ...voice('V10'), expected: String(SAMPLE_MAX_PER_MODEL), values: [String(SAMPLE_MAX_PER_MODEL)] },
  { text: 'ขอเบอร์ติดต่อฝ่ายขายหน่อย', expected: shop.sales_phone, values: [shop.sales_phone] },
] });
// 11 · เสียงอังกฤษ + ใบเสนอราคา (C03)
conv({ title: 'EN voice: 150 ml minimum → amber price → 6,000 with logo → quotation → expiry', type: 'voice_en', lang: 'en', account: 'C03', turns: [
  { ...voice('V08'), expected: count(prod('P03').min_qty), values: [count(prod('P03').min_qty)] },
  { text: 'What is the unit price of the amber one?', refers_back: true, expected: money(prod('P04').unit_price), values: [money(prod('P04').unit_price)] },
  { text: 'What is the price for 6,000 bottles with logo, pick up at the factory?', refers_back: true, p: [{ model: 'B-150', color: 'amber', quantity: 6000, logo: true, distanceKm: 0 }, ['logo', 'total']] },
  { text: 'Please request a quotation.', refers_back: true, expected: 'QT-NNNN', values: ['QT-'] },
  { text: 'When does it expire? valid until?', refers_back: true, expected: addDays(today, QUOTE_VALID_DAYS), values: [addDays(today, QUOTE_VALID_DAYS)] },
] });
// 12 · ขนส่ง (PDF + ราคา)
conv({ title: 'กล่อง/เที่ยวรถ (PDF) → ค่าส่ง 45,000 ใบ → สีเขียว', type: 'doc_shipping', lang: 'th', turns: [
  { text: 'ขวด B-250 บรรจุกล่องละกี่ใบ', d: doc(['LOG-022'], ['48']) },
  { text: 'รถหนึ่งเที่ยวขนขวดได้กี่ใบ', d: doc(['LOG-001', 'LOG-059'], ['20,000']) },
  { text: 'ถ้าสั่ง B-100 สีใส 45,000 ใบ ส่ง 120 กม. ค่าส่งเท่าไร', p: [{ model: 'B-100', color: 'clear', quantity: 45000, distanceKm: 120 }, ['shipping', 'trips']] },
  { text: 'สีเขียวมีรุ่นอะไรบ้าง', expected: 'B-250', values: ['B-250'] },
] });

const out = [];
for (const [i, c] of C.entries()) {
  const turns = [];
  for (const t of c.turns) {
    const turn = { ...t };
    delete turn.p; delete turn.d; delete turn.values;
    if (t.p) {
      turn.expected_values = await price(t.p[0], t.p[1], c.account);
      turn.expected = turn.expected || `${t.p[1].join(' · ')}: ${turn.expected_values.map((v) => [].concat(v).join('|')).join(' · ')}`;
      turn.kind = 'price';
    } else if (t.d) {
      turn.expected_values = t.d.values; turn.facts = t.d.facts; turn.doc_files = t.d.files;
      turn.expected = t.d.facts.map((id) => facts.get(id).statement).join(' / ');
      turn.kind = 'doc';
    } else { turn.expected_values = t.values; turn.kind = 'fixed'; }
    turns.push(turn);
  }
  out.push({ id: `CONV-${String(i + 1).padStart(2, '0')}`, title: c.title, type: c.type, lang: c.lang, account: c.account || null, now: null, turns });
}
await db.end();
writeFileSync(path.join(root, 'eval/conv.json'), JSON.stringify(out, null, 1) + '\n');
const voiceN = out.filter((c) => c.turns.some((t) => t.audio)).length;
console.log(`eval/conv.json: ${out.length} บท · รอบ ${out.reduce((n, c) => n + c.turns.length, 0)} · เสียง ${voiceN} บท · อังกฤษ ${out.filter((c) => c.lang === 'en').length} บท`);
for (const c of out) if (c.turns.length < 4 || c.turns.length > 6) throw new Error(`${c.id} turns ${c.turns.length}`);
