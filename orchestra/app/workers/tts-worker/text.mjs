// ข้อความ → สิ่งที่ TTS ต้องพูด (T15 · PROBLEM 4.5)
// ตัด emoji/tag/markdown/ป้ายอ้างอิง · อ่านเงิน/รหัส/ตัวเลขเป็นคำ (ไทย) · ภาษาตามตัวอักษร (มีอักษรไทย → th)
// ประโยคละ ≤ 200 ตัวอักษร (ตัดที่ chat-worker) · ข้อความรวม ≤ 600

export const MAX_CHARS = 600;
const THAI_RE = /[\u0E01-\u0E3A\u0E40-\u0E4E]/; // Thai letters/marks, excluding the baht currency sign and digits

/** 'th' ถ้ามีอักษรไทย · 'en' ถ้ามีอักษรละติน · ไม่มีทั้งคู่ → hint (ค่าเริ่มต้น th) */
export function detectLang(text, hint) {
  const s = String(text ?? '');
  if (THAI_RE.test(s)) return 'th';
  if (/[a-z]/i.test(s)) return 'en';
  return hint === 'en' ? 'en' : 'th';
}

const DIGIT = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACE = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
const LETTER = {
  A: 'เอ', B: 'บี', C: 'ซี', D: 'ดี', E: 'อี', F: 'เอฟ', G: 'จี', H: 'เอช', I: 'ไอ', J: 'เจ', K: 'เค', L: 'แอล', M: 'เอ็ม',
  N: 'เอ็น', O: 'โอ', P: 'พี', Q: 'คิว', R: 'อาร์', S: 'เอส', T: 'ที', U: 'ยู', V: 'วี', W: 'ดับเบิลยู', X: 'เอ็กซ์', Y: 'วาย', Z: 'แซด',
};
const MONTH = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

// 1..999999
function under1M(n) {
  const ds = String(n).split('').map(Number);
  const len = ds.length;
  let out = '';
  ds.forEach((d, i) => {
    const pos = len - 1 - i;
    if (d === 0) return;
    if (pos === 1) out += d === 1 ? 'สิบ' : d === 2 ? 'ยี่สิบ' : DIGIT[d] + 'สิบ';
    else if (pos === 0) out += d === 1 && len > 1 ? 'เอ็ด' : DIGIT[d];
    else out += DIGIT[d] + PLACE[pos];
  });
  return out;
}

/** จำนวนเต็ม → คำไทย · 21 → ยี่สิบเอ็ด · 250 → สองร้อยห้าสิบ · 1500000 → หนึ่งล้านห้าแสน */
export function thaiInt(value) {
  let s = String(value).replace(/,/g, '').replace(/^0+(?=\d)/, '');
  if (!/^\d+$/.test(s)) return String(value);
  if (/^0+$/.test(s)) return DIGIT[0];
  if (s.length > 18) return digitsOneByOne(s);
  const groups = [];
  while (s.length > 6) {
    groups.unshift(s.slice(-6));
    s = s.slice(0, -6);
  }
  groups.unshift(s);
  let out = '';
  groups.forEach((g, i) => {
    const n = Number(g);
    if (n) out += n === 1 && i > 0 && out ? 'เอ็ด' : n === 1 ? 'หนึ่ง' : under1M(n);
    if (i < groups.length - 1 && out) out += 'ล้าน';
  });
  return out;
}

export const digitsOneByOne = (s) => String(s).split('').filter((d) => /\d/.test(d)).map((d) => DIGIT[+d]).join('');

/** ตัวเลขทั่วไป "137.75" → หนึ่งร้อยสามสิบเจ็ดจุดเจ็ดห้า */
export function thaiNumber(str) {
  const [int, dec] = String(str).replace(/,/g, '').split('.');
  let out = thaiInt(int || '0');
  if (dec) out += 'จุด' + digitsOneByOne(dec);
  return out;
}

/** เงิน "5.80" → ห้าบาทแปดสิบสตางค์ · "63,023.00" → หกหมื่นสามพันยี่สิบสามบาทถ้วน · "0.80" → แปดสิบสตางค์ */
export function thaiBaht(str) {
  const [int, dec = ''] = String(str).replace(/,/g, '').split('.');
  const baht = Number(int || 0);
  const satang = dec ? Math.round(Number(`0.${dec}`) * 100) : 0;
  if (satang === 0) return `${thaiInt(int || '0')}บาท${dec ? 'ถ้วน' : ''}`;
  return `${baht ? `${thaiInt(int)}บาท` : ''}${thaiInt(String(satang))}สตางค์`;
}

/** รหัส → คำ · B-250 → "บี สองร้อยห้าสิบ" · SO-0019 → "เอส โอ ศูนย์ศูนย์หนึ่งเก้า" · P07 → "พี ศูนย์เจ็ด" */
export function readCode(code) {
  const m = String(code).match(/^([A-Z]+)-?(\d+(?:-\d+)*)$/);
  if (!m) return code;
  const letters = m[1].split('').map((c) => LETTER[c] || c).join(' ');
  // รุ่นขวด (ตัวอักษรเดียว + ตัวเลขไม่ขึ้นต้นด้วย 0) อ่านเป็นจำนวน · รหัสเอกสาร/สินค้าอ่านทีละหลัก
  const num = m[1].length === 1 && /^[1-9]\d*$/.test(m[2]) ? thaiInt(m[2]) : m[2].split('-').map(digitsOneByOne).join(' ');
  return `${letters} ${num}`;
}

const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}︎️‍⃣]/gu;

/** ตัดสิ่งที่ไม่ต้องพูด (ยังไม่แปลงตัวเลข) */
export function stripForSpeech(raw) {
  let s = String(raw ?? '');
  s = s.replace(/<think>[\s\S]*?(<\/think>|$)/gi, ' ');
  s = s.replace(/\[(PRICE|QUOTE|ORDER_STATUS)\]\s*(\{[^{}]*\})?/gi, ' ');
  s = s.replace(/\b(PRICE|QUOTE|ORDER)_RESULT:\s*\{[^{}]*\}/g, ' ');
  s = s.replace(/<\/?[a-z][^>]*>/gi, ' ');
  s = s.replace(/📄[^\n]*?·\s*(หน้า|page)\s*\d+/gi, ' '); // ป้าย "📄 SS-CATALOG.pdf · หน้า 3"
  s = s.replace(/\(?\b[\w.-]+\.pdf\b(\s*[·,]?\s*(หน้า|p\.?|page)\s*\d+)?\)?/gi, ' ');
  s = s.replace(/\[\d+(?:\s*[,–-]\s*\d+)*\]/g, ' '); // [1] [1,2]
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  s = s.replace(/https?:\/\/\S+/g, ' ');
  s = s.replace(/```[\s\S]*?```/g, ' ');
  s = s.replace(/`([^`]*)`/g, '$1');
  s = s.replace(/^\s{0,3}#{1,6}\s*/gm, '');
  s = s.replace(/^\s*>\s?/gm, '');
  s = s.replace(/^\s*(?:[-*+•]|\d+[.)])\s+/gm, '');
  s = s.replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/gm, ' ');
  s = s.replace(/\s*\|\s*/g, ' ');
  s = s.replace(/(\*\*|__|~~)(.+?)\1/g, '$2');
  s = s.replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, '$1$2');
  s = s.replace(/[*_~#]{2,}/g, ' ');
  s = s.replace(EMOJI_RE, ' ');
  s = s.replace(/\s*\n+\s*/g, ' ');
  s = s.replace(/[ \t ]+/g, ' ').trim();
  return s;
}

/** ตัดให้ ≤ max โดยไม่ผ่ากลางตัวเลข/คำละติน · ชอบตัดที่ช่องว่าง/จบประโยค */
export function truncate(s, max = MAX_CHARS) {
  if (s.length <= max) return s;
  let cut = max;
  while (cut > 0 && /[\w.,]/.test(s[cut]) && /[\w.,]/.test(s[cut - 1])) cut--;
  if (cut < max * 0.8) cut = max;
  const win = s.slice(0, cut);
  const b = Math.max(win.lastIndexOf(' '), win.lastIndexOf('.'), win.lastIndexOf('ค่ะ') >= 0 ? win.lastIndexOf('ค่ะ') + 3 : -1);
  if (b > max * 0.8) cut = b;
  return s.slice(0, cut).trim();
}

const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;

/** ตัวเลข/เงิน/รหัส → คำไทย */
export function readThai(s) {
  let t = s;
  // เงิน: ฿5.80 · 5.80 บาท · ฿63,023.00
  t = t.replace(new RegExp(String.raw`฿\s*(${NUM})(\s*บาท)?`, 'g'), (_, n) => ` ${thaiBaht(n)} `);
  t = t.replace(new RegExp(String.raw`(?<![\w.,])(${NUM})\s*บาท`, 'g'), (_, n) => ` ${thaiBaht(n)} `);
  // วันที่ 2026-10-25 → วันที่ ยี่สิบห้า ตุลาคม สองพันยี่สิบหก
  t = t.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m, y, mo, d) => (Number(mo) >= 1 && Number(mo) <= 12 ? ` ${thaiInt(d)} ${MONTH[Number(mo)]} ${thaiInt(y)} ` : m));
  // เวลา 10:00 น.
  t = t.replace(/\b(\d{1,2}):(\d{2})(\s*น\.)?/g, (_, h, m) => ` ${thaiInt(h)}นาฬิกา${Number(m) ? thaiInt(m) + 'นาที' : ''} `);
  // โทรศัพท์ 02-000-0000 → ทีละหลัก
  t = t.replace(/(?<![\w-])0\d{1,2}(?:-\d{3,4}){1,2}\b/g, (m) => ` ${m.split('-').map(digitsOneByOne).join(' ')} `);
  // รหัส: B-250 · SO-0019 · QT-0001 · ADDR-01 · P07 · LOT-2026-001
  t = t.replace(/(?<![A-Za-z])[A-Z]{1,5}-\d+(?:-\d+)*(?![\w.])/g, (m) => ` ${readCode(m)} `);
  t = t.replace(/(?<![A-Za-z])[A-Z]{1,3}\d{2,}(?![\w.])/g, (m) => ` ${readCode(m)} `);
  // @saisai-test → แอด saisai test
  t = t.replace(/@([\w-]+)/g, (_, h) => ` แอด ${h.replace(/-/g, ' ')} `);
  // หน่วย
  t = t.replace(/(\d)\s*(?:ml|มล\.)/gi, '$1 มิลลิลิตร').replace(/(\d)\s*กม\./g, '$1 กิโลเมตร').replace(/(\d)\s*km\b/gi, '$1 กิโลเมตร');
  t = t.replace(/(\d)\s*[–—]\s*(?=\d)/g, '$1 ถึง ');
  t = t.replace(/(\d)\s*%/g, '$1 เปอร์เซ็นต์');
  t = t.replace(/(\d)\s*[x×]\s*(?=\d)/g, '$1 คูณ ');
  t = t.replace(/−/g, 'ลบ ');
  // ตัวเลขทั่วไป
  t = t.replace(new RegExp(NUM, 'g'), (m) => ` ${thaiNumber(m)} `);
  t = t.replace(/\s*\+\s*/g, ' บวก ').replace(/\s*=\s*/g, ' เท่ากับ ');
  return t.replace(/\s+/g, ' ').replace(/\s+([,.!?)])/g, '$1').trim();
}

/** อังกฤษ: ฿5.80 → 5.80 baht · B-250 → B 250 */
export function readEnglish(s) {
  return s
    .replace(new RegExp(String.raw`฿\s*(${NUM})`, 'g'), '$1 baht')
    .replace(/\b([A-Z])-(\d+)\b/g, '$1 $2')
    .replace(/(\d)\s*%/g, '$1 percent')
    .replace(/@([\w-]+)/g, (_, h) => `at ${h.replace(/-/g, ' ')}`)
    .replace(/[*_~#|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ทั้งสาย → {text, lang} · lang hint ใช้เมื่อข้อความไม่มีตัวอักษรบอกภาษา */
export function prepareSpeech(raw, langHint) {
  const stripped = truncate(stripForSpeech(raw), MAX_CHARS);
  const lang = detectLang(stripped, langHint);
  const text = lang === 'th' ? readThai(stripped) : readEnglish(stripped);
  return { text: truncate(text, MAX_CHARS), lang };
}
