/**
 * กฎของร้าน ใสใส กลาสแวร์ (BR-01 – BR-28) — ฟังก์ชันบริสุทธิ์ทั้งหมด
 * - ไม่อ่านนาฬิกาเครื่อง: "วันนี้" รับเป็นพารามิเตอร์ (สตริง YYYY-MM-DD เวลาไทย หรือ Date)
 * - เงินใช้ decimal.js ปัดครึ่งขึ้น 2 ตำแหน่ง ไม่ใช้ number กับเงิน
 * - ไม่สุ่ม ไม่เรียก API ภายนอก
 */
import Decimal from 'decimal.js';

export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = Decimal;
export type Rounding = Decimal.Rounding;
export const HALF_UP: Rounding = Decimal.ROUND_HALF_UP;

// ------------------------------------------------------------------ ค่าคงที่ของร้าน
export type ModelCode = 'B-100' | 'B-150' | 'B-250' | 'B-500';
export type Color = 'clear' | 'amber' | 'green';

export const MODELS: Record<ModelCode, { sizeMl: number; minQty: number; colors: Color[] }> = {
  'B-100': { sizeMl: 100, minQty: 2400, colors: ['clear', 'amber'] },
  'B-150': { sizeMl: 150, minQty: 1800, colors: ['clear', 'amber'] },
  'B-250': { sizeMl: 250, minQty: 1200, colors: ['clear', 'amber', 'green'] },
  'B-500': { sizeMl: 500, minQty: 800, colors: ['clear', 'amber'] },
};
export const MODEL_CODES = Object.keys(MODELS) as ModelCode[];

export const QTY_STEP = 100;
export const QTY_MAX = 200_000;
export const DISCOUNT_TIERS: { minQty: number; rate: string }[] = [
  { minQty: 50_000, rate: '0.10' },
  { minQty: 10_000, rate: '0.05' },
];
/** CR-02: ส่วนลดขั้นบันได ใช้กับออเดอร์ที่ยืนยันตั้งแต่ DISCOUNT_FROM (วันที่เวลาไทย) */
export const DISCOUNT_FROM = '2026-11-01';
export const DISCOUNT_TIERS_FROM_2026_11_01: { minQty: number; rate: string }[] = [
  { minQty: 50_000, rate: '0.10' },
  { minQty: 30_000, rate: '0.07' },
  { minQty: 10_000, rate: '0.05' },
  { minQty: 5_000, rate: '0.03' },
];
export const LOGO_UNIT_PRICE = '0.80';
export const LOGO_MIN_QTY = 5_000;
export const TRIP_CAPACITY = 20_000;
export const FREE_SHIPPING_MAX_KM = 50;
export const MAX_DISTANCE_KM = 300;
export const SHIPPING_PER_TRIP = '1500';
export const VAT_RATE = '0.07';
export const PICKUP_LEAD_DAYS = 14;
export const CREDIT_MIN_SHIPPED = 3;
export const CREDIT_DAYS = 30;
export const SAMPLE_MAX_PER_MODEL = 3;
export const CLAIM_WINDOW_DAYS = 7;
export const PHOTO_MIN = 1;
export const PHOTO_MAX = 5;
export const PHOTO_MAX_BYTES = 5_242_880;
export const REASON_MAX_CHARS = 1000;
/** CR-03 BR-31: บริษัทเดียวกันสั่งชุดเดิม (ขั้น 1) ภายในกี่นาที = ซ้ำ */
export const DUPLICATE_WINDOW_MINUTES = 10;
/** CR-05: รายงานเจ้าของ ดูได้ครั้งละไม่เกินกี่วัน (รวมวันแรกและวันสุดท้าย) */
export const REPORT_MAX_DAYS = 92;
export const ORDER_STEPS = [1, 2, 3, 4, 5, 6] as const;
export const STATUS_PRODUCTION = 3;
export const STATUS_SHIPPED = 6;

export type ClaimStatus = 'received' | 'reviewing' | 'approved' | 'rejected';
export const CLAIM_STATUSES: ClaimStatus[] = ['received', 'reviewing', 'approved', 'rejected'];
export const CLAIM_OPEN_STATUSES: ClaimStatus[] = ['received', 'reviewing', 'approved'];

export type RuleError = { code: string; field?: string; params?: Record<string, string | number> };
type Check = RuleError | null;

// ------------------------------------------------------------------ เงิน
export function money(x: Decimal.Value): Decimal {
  return new Dec(x);
}

/** BR-10 · A-26: ปัด 2 ตำแหน่งแบบปัดครึ่งขึ้น (ทศนิยมแม่นยำ) */
export function roundMoney(x: Decimal.Value, mode: Rounding = HALF_UP): Decimal {
  return new Dec(x).toDecimalPlaces(2, mode);
}

// ------------------------------------------------------------------ วันที่ (Asia/Bangkok, UTC+7 ไม่มี DST)
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** วันที่ตามเวลาไทยของจุดเวลา → 'YYYY-MM-DD' */
export function bangkokDate(at: Date | string): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  return new Date(d.getTime() + BKK_OFFSET_MS).toISOString().slice(0, 10);
}

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** CR-05: ช่วงวันของรายงาน (YYYY-MM-DD เวลาไทย รวมหัวท้าย) · ตรวจตามลำดับ รูปแบบ → from > to → เกิน REPORT_MAX_DAYS */
export function checkReportRange(from: unknown, to: unknown): RuleError | null {
  if (!isIsoDate(from)) return { code: 'DATE_INVALID', field: 'from' };
  if (!isIsoDate(to)) return { code: 'DATE_INVALID', field: 'to' };
  if (from > to) return { code: 'RANGE_ORDER', field: 'from' };
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (days > REPORT_MAX_DAYS) return { code: 'RANGE_TOO_LONG', field: 'to', params: { max: REPORT_MAX_DAYS, days } };
  return null;
}

export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** จำนวนวันปฏิทินจาก a ถึง b (b − a) */
export function diffDays(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / DAY_MS);
}

/** เดือนปฏิทินของวันนี้ → [วันแรก, วันแรกของเดือนถัดไป) */
export function monthRange(today: string): { from: string; to: string } {
  const from = today.slice(0, 8) + '01';
  return { from, to: addMonths(from, 1) };
}

// ------------------------------------------------------------------ BR-01 สินค้า 9 แบบ
export function isModel(m: unknown): m is ModelCode {
  return typeof m === 'string' && m in MODELS;
}

export function productExists(model: unknown, color: unknown): boolean {
  return isModel(model) && MODELS[model].colors.includes(color as Color);
}

export function colorsOf(model: ModelCode): Color[] {
  return MODELS[model].colors;
}

// ------------------------------------------------------------------ BR-02 – BR-07 จำนวน
export function parseQuantity(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) return Number(v.trim());
  return null;
}

/** BR-02 – BR-05 */
export function checkMinimum(model: ModelCode, qty: number): Check {
  const min = MODELS[model].minQty;
  return qty >= min ? null : { code: 'QTY_MIN', field: 'quantity', params: { model, min } };
}

/** BR-06 */
export function checkStep(qty: number): Check {
  return qty % QTY_STEP === 0 ? null : { code: 'QTY_STEP', field: 'quantity' };
}

/** BR-07 */
export function checkMaximum(qty: number): Check {
  return qty <= QTY_MAX ? null : { code: 'QTY_MAX', field: 'quantity', params: { max: QTY_MAX } };
}

export function checkQuantity(model: ModelCode, raw: unknown): { qty: number | null; error: Check } {
  const qty = parseQuantity(raw);
  if (qty === null || qty < 1) return { qty: null, error: { code: 'QTY_INVALID', field: 'quantity' } };
  return { qty, error: checkMinimum(model, qty) ?? checkStep(qty) ?? checkMaximum(qty) };
}

// ------------------------------------------------------------------ BR-08 / BR-09 ส่วนลด
export type DiscountTier = { minQty: number; rate: string };

/** CR-02: ตารางขั้นส่วนลดตาม "วันนี้" ของระบบ (วันที่กดยืนยันออเดอร์ · YYYY-MM-DD เวลาไทย) */
export function discountTiersOn(today: string): DiscountTier[] {
  return today >= DISCOUNT_FROM ? DISCOUNT_TIERS_FROM_2026_11_01 : DISCOUNT_TIERS;
}

export function discountRate(qty: number, tiers: DiscountTier[] = DISCOUNT_TIERS): Decimal {
  for (const t of tiers) if (qty >= t.minQty) return new Dec(t.rate);
  return new Dec(0);
}

// ------------------------------------------------------------------ BR-12 โลโก้
export function checkLogo(qty: number, logo: boolean): Check {
  return !logo || qty >= LOGO_MIN_QTY ? null : { code: 'LOGO_MIN', field: 'logo', params: { min: LOGO_MIN_QTY } };
}

// ------------------------------------------------------------------ BR-13 – BR-15 ระยะ / เที่ยว / ค่าขนส่ง
export function parseDistance(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 ? v : null;
  if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) return Number(v.trim());
  return null;
}

export function checkDistance(raw: unknown): { km: number | null; error: Check } {
  const km = parseDistance(raw);
  if (km === null) return { km: null, error: { code: 'DISTANCE_INVALID', field: 'distance' } };
  if (km > MAX_DISTANCE_KM) return { km, error: { code: 'DISTANCE_TOO_FAR', field: 'distance', params: { max: MAX_DISTANCE_KM } } };
  return { km, error: null };
}

/** BR-14 */
export function trips(qty: number): number {
  return Math.ceil(qty / TRIP_CAPACITY);
}

/** BR-13 · BR-14 · A-09 */
export function shippingAmount(km: number, tripCount: number): Decimal {
  return km <= FREE_SHIPPING_MAX_KM ? new Dec(0) : new Dec(SHIPPING_PER_TRIP).mul(tripCount);
}

// ------------------------------------------------------------------ ราคา (BR-08 – BR-14)
export type PriceLines = {
  unitPrice: Decimal;
  quantity: number;
  bottles: Decimal;
  discountRate: Decimal;
  discount: Decimal;
  logo: boolean;
  logoUnitPrice: Decimal;
  logoAmount: Decimal;
  distanceKm: number;
  trips: number;
  shipping: Decimal;
  subtotal: Decimal;
  vat: Decimal;
  total: Decimal;
};

export function priceLines(
  unitPrice: Decimal.Value,
  qty: number,
  logo: boolean,
  km: number,
  rounding: Rounding = HALF_UP,
  tiers: DiscountTier[] = DISCOUNT_TIERS,
): PriceLines {
  const unit = new Dec(unitPrice);
  const bottles = roundMoney(unit.mul(qty));
  const rate = discountRate(qty, tiers);
  const discount = roundMoney(bottles.mul(rate));
  const logoUnit = new Dec(LOGO_UNIT_PRICE);
  const logoAmount = logo ? roundMoney(logoUnit.mul(qty)) : new Dec(0);
  const t = trips(qty);
  const shipping = shippingAmount(km, t);
  const subtotal = bottles.minus(discount).plus(logoAmount).plus(shipping);
  const vat = roundMoney(subtotal.mul(VAT_RATE), rounding);
  return {
    unitPrice: unit, quantity: qty, bottles, discountRate: rate, discount, logo,
    logoUnitPrice: logoUnit, logoAmount, distanceKm: km, trips: t, shipping,
    subtotal, vat, total: subtotal.plus(vat),
  };
}

/** BR-11 · A-05 · A-30: เตือนเมื่อขั้นส่วนลดถัดไปทำให้ยอดก่อน VAT ทั้งออเดอร์ "น้อยกว่า" ยอดปัจจุบัน */
export function upsellHint(
  unitPrice: Decimal.Value,
  qty: number,
  logo: boolean,
  km: number,
  tiers: DiscountTier[] = DISCOUNT_TIERS,
): { targetQty: number; ratePercent: number; saving: Decimal } | null {
  const next = [...tiers].reverse().find((t) => t.minQty > qty);
  if (!next) return null;
  const current = priceLines(unitPrice, qty, logo, km, HALF_UP, tiers).subtotal;
  const atNext = priceLines(unitPrice, next.minQty, logo, km, HALF_UP, tiers).subtotal;
  if (!atNext.lt(current)) return null;
  return { targetQty: next.minQty, ratePercent: new Dec(next.rate).mul(100).toNumber(), saving: current.minus(atNext) };
}

// ------------------------------------------------------------------ BR-16 วันรับของ
/** วันหยุดโรงงาน (ตาราง factory_holiday · CR-04) */
export type FactoryHoliday = { date: string; nameTh: string; nameEn: string };

/** BR-16 + BR-32: วันนี้ + 14 แล้วเลื่อนข้ามวันหยุดโรงงาน (ไม่ส่งวันหยุด = +14 เหมือนเดิม) */
export function earliestPickupDate(today: string, holidays: FactoryHoliday[] = []): string {
  const closed = new Set(holidays.map((h) => h.date));
  let d = addDays(today, PICKUP_LEAD_DAYS);
  while (closed.has(d)) d = addDays(d, 1);
  return d;
}

export function checkPickupDate(pickup: unknown, today: string, required = true): Check {
  if (pickup === undefined || pickup === null || pickup === '') {
    return required ? { code: 'PICKUP_REQUIRED', field: 'pickupDate' } : null;
  }
  if (!isIsoDate(pickup)) return { code: 'PICKUP_INVALID', field: 'pickupDate' };
  // เทียบ +14 ดิบเสมอ (ไม่ข้ามวันหยุด) — วันหยุดตรวจแยกใน checkFactoryClosed หลังผ่านข้อนี้ (CR-04 ①)
  return pickup >= earliestPickupDate(today)
    ? null
    : { code: 'PICKUP_TOO_SOON', field: 'pickupDate', params: { days: PICKUP_LEAD_DAYS } };
}

/** BR-32 (CR-04): วันหยุดโรงงานเลือกเป็นวันรับของไม่ได้ · ชื่อวันหยุดส่งทั้ง 2 ภาษา ให้ errorMessage เลือก */
export function checkFactoryClosed(pickup: unknown, holidays: FactoryHoliday[]): Check {
  const h = holidays.find((x) => x.date === pickup);
  return h ? { code: 'FACTORY_CLOSED', field: 'pickupDate', params: { date: h.date, name_th: h.nameTh, name_en: h.nameEn } } : null;
}

/** รูปแบบวันรับของ (ต้องมี · YYYY-MM-DD) — แยกให้ data.ts ตรวจก่อนค้นออเดอร์ (CR-01 ⚠️ D4) */
export function checkPickupFormat(pickup: unknown): Check {
  if (pickup === undefined || pickup === null || pickup === '') return { code: 'PICKUP_REQUIRED', field: 'pickupDate' };
  return isIsoDate(pickup) ? null : { code: 'PICKUP_INVALID', field: 'pickupDate' };
}

/** BR-33 (CR-01): ลูกค้าเลื่อนวันรับของเองได้ถึงขั้นนี้ (1 รับออเดอร์ · 2 ยืนยันสเปก) */
export const RESCHEDULE_MAX_STATUS = 2;

/**
 * BR-33 (CR-01): เลื่อนวันรับของ · ลำดับ (⚠️ D4 docs/impact/CR-01.md): รูปแบบวันที่ → ขั้น ≥ 3 → วันเดิม → 14 วัน → วันหยุด
 * ไม่ตรวจราคา/กฎกันซ้ำ (ราคาเดิมทุกบรรทัด · ⚠️ D3)
 */
export function checkReschedule(status: number, current: string, next: unknown, today: string, holidays: FactoryHoliday[]): Check {
  const formatErr = checkPickupFormat(next);
  if (formatErr || !isIsoDate(next)) return formatErr;
  if (status > RESCHEDULE_MAX_STATUS) return { code: 'RESCHEDULE_NOT_ALLOWED' };
  if (next === current) return { code: 'RESCHEDULE_SAME', field: 'pickupDate' };
  return checkPickupDate(next, today) ?? checkFactoryClosed(next, holidays);
}

/** ผิดแค่วันหยุดโรงงาน → API ตอบ 422 · ผิดกฎอื่นด้วย → status เดิม (⚠️ Q-S docs/impact/CR-04.md) */
export function onlyFactoryClosed(errors: RuleError[]): boolean {
  return errors.length > 0 && errors.every((e) => e.code === 'FACTORY_CLOSED');
}

/** CR-04 ส่วน ข: ชื่อวันหยุดยาวสุด (code point) = CHECK char_length ≤ 100 ของตาราง (migration 003) [D:CR-04b-B3] */
export const HOLIDAY_NAME_MAX = 100;

/**
 * CR-04 ส่วน ข: วันที่ที่เจ้าของเพิ่ม/ลบวันหยุดได้ · รูปแบบผิด 400 DATE_INVALID [D:CR-04b-B8]
 * วันนี้/อดีต → HOLIDAY_PAST (422) ทั้งเพิ่มและลบ ([D:CR-04] ① ② · [D:CR-04b-B1])
 */
export function checkHolidayDate(date: unknown, today: string): Check {
  if (!isIsoDate(date)) return { code: 'DATE_INVALID', field: 'date' };
  return date > today ? null : { code: 'HOLIDAY_PAST', field: 'date', params: { date } };
}

export type HolidayInput = { date: string; nameTh: string; nameEn: string };

/**
 * CR-04 ส่วน ข: ตรวจ body ของ POST /api/admin/holidays · ลำดับ [D:CR-04b-B8]: รูปวันที่ → ชื่อ th/en → วันนี้/อดีต
 * ชื่อ: ตัดช่องว่างหัวท้าย · ต้องมีทั้ง 2 ภาษา · ≤ HOLIDAY_NAME_MAX code point (เกิน = แจ้ง ไม่ตัดเงียบ) [D:CR-04b-B3]
 */
export function checkHolidayInput(body: Record<string, unknown>, today: string): { error: RuleError } | { value: HolidayInput } {
  if (!isIsoDate(body.date)) return { error: { code: 'DATE_INVALID', field: 'date' } };
  const names: Record<'name_th' | 'name_en', string> = { name_th: '', name_en: '' };
  for (const field of ['name_th', 'name_en'] as const) {
    const v = typeof body[field] === 'string' ? (body[field] as string).trim() : '';
    if (v === '') return { error: { code: 'HOLIDAY_NAME_REQUIRED', field } };
    if (charCount(v) > HOLIDAY_NAME_MAX) return { error: { code: 'HOLIDAY_NAME_TOO_LONG', field, params: { max: HOLIDAY_NAME_MAX } } };
    names[field] = v;
  }
  const past = checkHolidayDate(body.date, today);
  if (past) return { error: past };
  return { value: { date: body.date, nameTh: names.name_th, nameEn: names.name_en } };
}

// ------------------------------------------------------------------ BR-17 / BR-18 เครดิต
export type PaymentTerms = 'prepay' | 'credit30';

export function paymentTerms(shippedCount: number): PaymentTerms {
  return shippedCount >= CREDIT_MIN_SHIPPED ? 'credit30' : 'prepay';
}

export function creditStatus(shippedCount: number): { terms: PaymentTerms; shipped: number; remaining: number } {
  return {
    terms: paymentTerms(shippedCount),
    shipped: shippedCount,
    remaining: Math.max(0, CREDIT_MIN_SHIPPED - shippedCount),
  };
}

export type Span = { days?: number; months?: number };

/** BR-18: ครบกำหนด = วันจัดส่ง (เวลาไทย) + 30 วันปฏิทิน */
export function creditDueDate(shipDate: string, span: Span = { days: CREDIT_DAYS }): string {
  let d = shipDate;
  if (span.months) d = addMonths(d, span.months);
  if (span.days) d = addDays(d, span.days);
  return d;
}

// ------------------------------------------------------------------ BR-19 ขวดตัวอย่าง
export type SampleItem = { model: unknown; color: unknown; quantity: unknown };

export function checkSampleRequest(
  items: SampleItem[],
  usedByModel: Partial<Record<ModelCode, number>>,
): { errors: RuleError[]; perModel: Record<ModelCode, number> } {
  const errors: RuleError[] = [];
  const perModel = { 'B-100': 0, 'B-150': 0, 'B-250': 0, 'B-500': 0 } as Record<ModelCode, number>;
  if (!Array.isArray(items) || items.length === 0) {
    return { errors: [{ code: 'SAMPLE_QTY_MIN', field: 'quantity' }], perModel };
  }
  items.forEach((it, i) => {
    if (!productExists(it.model, it.color)) {
      errors.push({ code: 'PRODUCT_NOT_FOUND', field: `items.${i}` });
      return;
    }
    const q = parseQuantity(it.quantity);
    if (q === null || q < 1) {
      errors.push({ code: 'SAMPLE_QTY_MIN', field: `items.${i}` });
      return;
    }
    perModel[it.model as ModelCode] += q;
  });
  for (const m of MODEL_CODES) {
    if (perModel[m] > 0 && (usedByModel[m] ?? 0) + perModel[m] > SAMPLE_MAX_PER_MODEL) {
      errors.push({ code: 'SAMPLE_QUOTA', field: `model.${m}`, params: { model: m, max: SAMPLE_MAX_PER_MODEL } });
    }
  }
  return { errors, perModel };
}

export function sampleQuotaLeft(usedByModel: Partial<Record<ModelCode, number>>): Record<ModelCode, number> {
  const left = {} as Record<ModelCode, number>;
  for (const m of MODEL_CODES) left[m] = Math.max(0, SAMPLE_MAX_PER_MODEL - (usedByModel[m] ?? 0));
  return left;
}

/** BR-10: ตัวอย่างฟรี ราคา ฿0 → VAT ฿0.00 · ยอดรวม ฿0.00 */
export function sampleTotals(rounding: Rounding = HALF_UP) {
  const subtotal = new Dec(0);
  const vat = roundMoney(subtotal.mul(VAT_RATE), rounding);
  return { subtotal, vat, total: subtotal.plus(vat) };
}

// ------------------------------------------------------------------ BR-20 สถานะออเดอร์ 6 ขั้น
export function checkAdvance(
  current: number,
  requestedTo: number | undefined | null,
  terms: PaymentTerms,
  hasPayment: boolean,
): { to: number | null; error: Check } {
  if (current >= STATUS_SHIPPED) return { to: null, error: { code: 'ORDER_FINAL' } };
  const to = requestedTo ?? current + 1;
  if (to !== current + 1) return { to: null, error: { code: 'STEP_INVALID', params: { from: current, to } } };
  if (to === STATUS_PRODUCTION && terms === 'prepay' && !hasPayment) {
    return { to: null, error: { code: 'PAYMENT_REQUIRED' } };
  }
  return { to, error: null };
}

// ------------------------------------------------------------------ BR-21 หน้าต่างเคลม 7 วัน
export function claimWindow(
  status: number,
  shippedAt: Date | string | null,
  now: Date | string,
): { open: boolean; error: Check; lastDay: string | null } {
  if (status !== STATUS_SHIPPED || !shippedAt) {
    return { open: false, error: { code: 'NOT_SHIPPED' }, lastDay: null };
  }
  const shipDay = bangkokDate(shippedAt);
  const lastDay = addDays(shipDay, CLAIM_WINDOW_DAYS);
  const open = diffDays(shipDay, bangkokDate(now)) <= CLAIM_WINDOW_DAYS;
  return { open, error: open ? null : { code: 'CLAIM_WINDOW', params: { days: CLAIM_WINDOW_DAYS } }, lastDay };
}

// ------------------------------------------------------------------ BR-22 เลขล็อต
export const LOT_PATTERN = /^LOT-[0-9]{6}$/;

export function checkLot(lot: unknown): Check {
  return typeof lot === 'string' && LOT_PATTERN.test(lot) ? null : { code: 'LOT_FORMAT', field: 'lotNo' };
}

// ------------------------------------------------------------------ BR-23 จำนวนเคลม
export function claimedSoFar(
  claims: { quantity: number; status: ClaimStatus }[],
  counted: ClaimStatus[] = CLAIM_OPEN_STATUSES,
): number {
  return claims.filter((c) => counted.includes(c.status)).reduce((s, c) => s + c.quantity, 0);
}

export function checkClaimQuantity(raw: unknown, ordered: number, alreadyClaimed: number): Check {
  const q = parseQuantity(raw);
  if (q === null || q < 1) return { code: 'CLAIM_QTY_MIN', field: 'quantity' };
  return q <= ordered - alreadyClaimed ? null : { code: 'CLAIM_QTY_MAX', field: 'quantity', params: { ordered } };
}

// ------------------------------------------------------------------ BR-24 / BR-25 รูป
export function checkPhotoCount(n: number): Check {
  return n >= PHOTO_MIN && n <= PHOTO_MAX
    ? null
    : { code: 'PHOTO_COUNT', field: 'photos', params: { min: PHOTO_MIN, max: PHOTO_MAX } };
}

/** ตรวจชนิดจากเนื้อไฟล์ (magic bytes) */
export function detectImageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return 'image/png';
  return null;
}

export function checkPhoto(bytes: Uint8Array, size: number): { mime: 'image/jpeg' | 'image/png' | null; error: Check } {
  const mime = detectImageType(bytes);
  if (!mime) return { mime, error: { code: 'PHOTO_TYPE', field: 'photos' } };
  if (size > PHOTO_MAX_BYTES) return { mime, error: { code: 'PHOTO_SIZE', field: 'photos', params: { maxMb: 5 } } };
  return { mime, error: null };
}

// ------------------------------------------------------------------ BR-26 / BR-27 สถานะเคลม และเหตุผล
export function canTransitionClaim(from: ClaimStatus, to: unknown): boolean {
  return (from === 'received' && to === 'reviewing') || (from === 'reviewing' && (to === 'approved' || to === 'rejected'));
}

export function nextClaimActions(from: ClaimStatus): ClaimStatus[] {
  return CLAIM_STATUSES.filter((to) => canTransitionClaim(from, to));
}

export function charCount(s: string): number {
  return [...s].length;
}

export function checkRejectReason(reason: unknown): Check {
  if (typeof reason !== 'string' || reason.trim().length === 0) return { code: 'REASON_REQUIRED', field: 'reason' };
  if (charCount(reason) > REASON_MAX_CHARS) return { code: 'REASON_TOO_LONG', field: 'reason', params: { max: REASON_MAX_CHARS } };
  return null;
}

// ------------------------------------------------------------------ BR-28 ประวัติ (เพิ่มได้อย่างเดียว)
export type HistoryEntry<S> = { from: S | null; to: S; by: number; at: string; reason: string | null };

export function historyEntry<S>(from: S | null, to: S, by: number, at: Date | string, reason: string | null = null): HistoryEntry<S> {
  return { from, to, by, at: typeof at === 'string' ? at : at.toISOString(), reason };
}

// ------------------------------------------------------------------ ใบเสนอราคา (รวมทุกกฎของหน้าสั่งซื้อ)
export type QuoteInput = {
  model: unknown;
  color: unknown;
  quantity: unknown;
  logo: unknown;
  distanceKm: unknown;
  pickupDate?: unknown;
};

export type QuoteResult = {
  ok: boolean;
  errors: RuleError[];
  upsell: ReturnType<typeof upsellHint>;
  lines: PriceLines | null;
  earliestPickupDate: string;
  credit: ReturnType<typeof creditStatus>;
};

export function quote(
  input: QuoteInput,
  ctx: { unitPrice: Decimal.Value | null; today: string; shippedCount: number; requirePickup: boolean; rounding?: Rounding; holidays?: FactoryHoliday[] },
): QuoteResult {
  const errors: RuleError[] = [];
  const credit = creditStatus(ctx.shippedCount);
  const holidays = ctx.holidays ?? [];
  const earliest = earliestPickupDate(ctx.today, holidays);
  const base = { upsell: null, lines: null, earliestPickupDate: earliest, credit };

  if (!productExists(input.model, input.color) || ctx.unitPrice === null) {
    return { ok: false, errors: [{ code: 'PRODUCT_NOT_FOUND', field: 'product' }], ...base };
  }
  const model = input.model as ModelCode;
  const logo = input.logo === true || input.logo === 'true';

  const { qty, error: qtyErr } = checkQuantity(model, input.quantity);
  if (qtyErr) errors.push(qtyErr);
  if (qty !== null && !qtyErr) {
    const logoErr = checkLogo(qty, logo);
    if (logoErr) errors.push(logoErr);
  }
  const { km, error: kmErr } = checkDistance(input.distanceKm);
  if (kmErr) errors.push(kmErr);
  const pickupErr = checkPickupDate(input.pickupDate, ctx.today, ctx.requirePickup);
  if (pickupErr) errors.push(pickupErr);
  const closedErr = pickupErr ? null : checkFactoryClosed(input.pickupDate, holidays);
  if (closedErr) errors.push(closedErr);

  const priceable = qty !== null && km !== null && !errors.some((e) => e.field === 'quantity' || e.field === 'logo' || e.field === 'distance');
  const tiers = discountTiersOn(ctx.today);
  const lines = priceable ? priceLines(ctx.unitPrice, qty!, logo, km!, ctx.rounding, tiers) : null;
  const upsell = priceable ? upsellHint(ctx.unitPrice, qty!, logo, km!, tiers) : null;
  return { ok: errors.length === 0 && lines !== null, errors, upsell, lines, earliestPickupDate: earliest, credit };
}
