import type { RuleError } from '@/lib/rules';

const messages: Record<string, { th: string; en: string }> = {
  PRODUCT_NOT_FOUND: { th: 'สินค้านี้ไม่มีอยู่', en: 'This product does not exist' },
  QTY_INVALID: { th: 'กรุณากรอกจำนวนเป็นตัวเลขจำนวนเต็ม', en: 'Please enter a whole number of bottles' },
  QTY_MIN: { th: '{model} สั่งขั้นต่ำ {min} ใบ', en: '{model} minimum order is {min} bottles' },
  QTY_STEP: { th: 'กรุณาสั่งทีละ 100 ใบ', en: 'Please order in multiples of 100 bottles' },
  QTY_MAX: { th: 'สั่งได้สูงสุด 200,000 ใบ', en: 'Maximum order is 200,000 bottles' },
  LOGO_MIN: { th: 'พิมพ์โลโก้ขั้นต่ำ 5,000 ใบ', en: 'Logo printing requires a minimum of 5,000 bottles' },
  DISTANCE_INVALID: { th: 'กรุณากรอกเป็นจำนวนเต็มกิโลเมตร', en: 'Please enter the distance as a whole number of kilometers' },
  DISTANCE_TOO_FAR: { th: 'ระยะเกิน 300 กม. กรุณาติดต่อเซลส์', en: 'Distance exceeds 300 km. Please contact sales' },
  PICKUP_REQUIRED: { th: 'กรุณาเลือกวันรับของ', en: 'Please choose a pickup date' },
  PICKUP_INVALID: { th: 'วันที่ไม่ถูกต้อง', en: 'Invalid date' },
  PICKUP_TOO_SOON: { th: 'วันรับของต้องห่างจากวันนี้อย่างน้อย 14 วัน', en: 'Pickup date must be at least 14 days from today' },
  FACTORY_CLOSED: { th: 'โรงงานหยุดวันที่ {date} ({name}) กรุณาเลือกวันรับของอื่น', en: 'The factory is closed on {date} ({name}). Please choose another pickup date' },
  ADDRESS_NOT_FOUND: { th: 'ไม่พบที่อยู่จัดส่งนี้', en: 'Delivery address not found' },
};

export function pricingError(error: RuleError, lang: 'th' | 'en') {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(error.params ?? {})) {
    params[key] = typeof value === 'number' ? value.toLocaleString('en-US') : value;
  }
  if (error.code === 'FACTORY_CLOSED') {
    params.date = new Intl.DateTimeFormat(lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok',
    }).format(new Date(String(error.params?.date) + 'T00:00:00+07:00'));
    params.name = String(error.params?.[`name_${lang}`] ?? '');
  }
  const template = messages[error.code]?.[lang] ?? error.code;
  return { ...error, message: template.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? '') };
}
