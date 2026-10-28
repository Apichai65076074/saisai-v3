// แสดงเงิน (T04) · ไม่ผ่าน float · ตัวเลขเงินทุกตัวต้องมาจาก quote() ใน lib/rules.ts — ไฟล์นี้แค่จัดรูปแบบ
import Decimal from 'decimal.js';

const MINUS = '−';

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** '63023' → '฿63,023.00' · ติดลบ (หรือ {negative:true}) → '−฿2,600.00' */
export function fmtMoney(v: Decimal.Value, opts: { negative?: boolean } = {}): string {
  const d = new Decimal(v);
  const neg = opts.negative ? !d.isZero() : d.isNegative();
  const [i, f] = d.abs().toFixed(2, Decimal.ROUND_HALF_UP).split('.');
  return `${neg ? MINUS : ''}฿${group(i)}.${f}`;
}

/** ค่าเงินดิบ 2 ตำแหน่ง ไม่มี comma สำหรับ data-value / API ('63023.00') */
export function rawMoney(v: Decimal.Value): string {
  return new Decimal(v).toFixed(2, Decimal.ROUND_HALF_UP);
}

/** จำนวนเต็มใส่ comma: 10000 → '10,000' */
export function fmtInt(n: number | string): string {
  const s = String(n);
  return /^-?\d+$/.test(s) ? (s.startsWith('-') ? '-' + group(s.slice(1)) : group(s)) : s;
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' → '18 ต.ค. 2026' / '18 Oct 2026' (ปี ค.ศ. ตาม legacy) */
export function fmtDate(iso: string | null | undefined, lang: 'th' | 'en' = 'th'): string {
  if (!iso) return '–';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${(lang === 'en' ? EN_MONTHS : TH_MONTHS)[m - 1]} ${y}`;
}
