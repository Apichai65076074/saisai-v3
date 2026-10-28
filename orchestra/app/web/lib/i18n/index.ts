import { fmtDate } from '../money';

export type Lang = 'th' | 'en';
export const LANGS: Lang[] = ['th', 'en'];
export function asLang(v: unknown): Lang {
  return v === 'en' ? 'en' : 'th';
}

type Entry = { th: string; en: string };

/** ข้อความ error / เตือน — ตรงตาม REQUIREMENTS / TEST-DATA ทุกตัวอักษร */
export const ERRORS: Record<string, Entry> = {
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
  PRICE_CHANGED: { th: 'ราคาเปลี่ยนแปลง กรุณาตรวจสอบยอดใหม่อีกครั้ง', en: 'The price has changed. Please review the new total' },
  FACTORY_CLOSED: { th: 'โรงงานหยุดวันที่ {date} ({name}) กรุณาเลือกวันรับของอื่น', en: 'The factory is closed on {date} ({name}). Please choose another pickup date' },
  DUPLICATE_ORDER: { th: 'มีออเดอร์เดียวกันนี้อยู่แล้ว (เลขที่ {code}) ถ้าต้องการสั่งเพิ่ม กรุณาเปลี่ยนจำนวนหรือวันรับของ', en: 'You already placed this same order ({code}). To order more, change the quantity or pickup date' },
  ADDRESS_NOT_FOUND: { th: 'ไม่พบที่อยู่จัดส่งนี้', en: 'Delivery address not found' },
  ORDER_NOT_FOUND: { th: 'ไม่พบออเดอร์นี้', en: 'Order not found' },
  // T08 ใบเสนอราคา
  QUOTE_NOT_FOUND: { th: 'ไม่พบใบเสนอราคานี้', en: 'Quote not found' },
  QUOTE_EXPIRED: { th: 'ใบเสนอราคานี้หมดอายุแล้ว (ใช้ได้ถึง {date}) กรุณาขอใบเสนอราคาใหม่', en: 'This quote has expired (valid until {date}). Please request a new quote' },
  QUOTE_CONVERTED: { th: 'ใบเสนอราคานี้แปลงเป็นออเดอร์ {code} แล้ว', en: 'This quote was already converted to order {code}' },
  LOGIN_REQUIRED: { th: 'กรุณาเข้าสู่ระบบลูกค้าก่อนขอใบเสนอราคา', en: 'Please log in as a customer to request a quote' },
  // CR-01 BR-33 ข้อความตามร้าน (CR-01-ANSWERS ②)
  RESCHEDULE_NOT_ALLOWED: { th: 'ออเดอร์นี้เริ่มผลิตแล้ว เลื่อนวันรับของเองไม่ได้ กรุณาโทร 02-000-0000', en: 'This order is already in production. Please call 02-000-0000 to change the pickup date' },
  RESCHEDULE_SAME: { th: 'วันรับของใหม่ต้องไม่ตรงกับวันเดิม', en: 'The new pickup date must differ from the current one' },
  CLAIM_NOT_FOUND: { th: 'ไม่พบเคลมนี้', en: 'Claim not found' },
  PHOTO_NOT_FOUND: { th: 'ไม่พบรูปนี้', en: 'Photo not found' },
  UNAUTHORIZED: { th: 'กรุณาเข้าสู่ระบบ', en: 'Please log in' },
  FORBIDDEN: { th: 'ไม่มีสิทธิ์เข้าถึง', en: 'Access denied' },
  LOGIN_FAILED: { th: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', en: 'Incorrect email or password' },
  ORDER_FINAL: { th: 'ออเดอร์นี้จัดส่งแล้ว ไม่มีขั้นถัดไป', en: 'This order has been shipped. There is no next step' },
  STEP_INVALID: { th: 'เลื่อนสถานะได้ทีละ 1 ขั้นถัดไปเท่านั้น', en: 'Status can only move forward one step at a time' },
  PAYMENT_REQUIRED: { th: 'ต้องบันทึกว่าได้รับเงินแล้วก่อนเริ่มผลิต', en: 'Payment must be recorded before production starts' },
  PAYMENT_EXISTS: { th: 'บันทึกรับเงินของออเดอร์นี้แล้ว', en: 'Payment has already been recorded for this order' },
  NOT_SHIPPED: { th: 'แจ้งเคลมได้เฉพาะออเดอร์ที่จัดส่งแล้ว', en: 'Claims can only be filed for shipped orders' },
  CLAIM_WINDOW: { th: 'แจ้งเคลมได้ภายใน 7 วันนับจากวันจัดส่ง', en: 'Claims must be filed within 7 days of shipment' },
  LOT_FORMAT: { th: 'เลขล็อตต้องเป็น LOT- ตามด้วยตัวเลข 6 หลัก', en: 'Lot number must be LOT- followed by 6 digits' },
  CLAIM_QTY_MIN: { th: 'จำนวนที่เคลมต้องอย่างน้อย 1 ใบ', en: 'Claimed quantity must be at least 1 bottle' },
  CLAIM_QTY_MAX: { th: 'จำนวนที่เคลมต้องไม่เกินจำนวนที่สั่ง', en: 'Claimed quantity must not exceed the ordered quantity' },
  PHOTO_COUNT: { th: 'ต้องแนบรูป 1–5 รูป', en: 'Please attach 1–5 photos' },
  PHOTO_TYPE: { th: 'ไม่รับชนิดไฟล์นี้', en: 'This file type is not accepted' },
  PHOTO_SIZE: { th: 'รูปต้องไม่เกิน 5 MB', en: 'Each photo must not exceed 5 MB' },
  CLAIM_TRANSITION: { th: 'เปลี่ยนสถานะเคลมแบบนี้ไม่ได้', en: 'This claim status change is not allowed' },
  REASON_REQUIRED: { th: 'กรุณาระบุเหตุผล', en: 'Please provide a reason' },
  REASON_TOO_LONG: { th: 'เหตุผลต้องไม่เกิน 1,000 ตัวอักษร', en: 'Reason must not exceed 1,000 characters' },
  SAMPLE_QTY_MIN: { th: 'ต้องขออย่างน้อย 1 ใบ', en: 'Please request at least 1 bottle' },
  SAMPLE_QUOTA: { th: 'ขอตัวอย่างได้รุ่นละไม่เกิน 3 ใบต่อเดือน', en: 'Free samples are limited to 3 bottles per model per month' },
  // CR-05 รายงานเจ้าของ (⚠️A4 รหัสและข้อความเสนอเอง ร้านกำหนดแค่ 422)
  DATE_INVALID: { th: 'กรุณาเลือกวันที่ให้ถูกต้อง (ปปปป-ดด-วว)', en: 'Please choose a valid date (YYYY-MM-DD)' },
  RANGE_ORDER: { th: 'วันเริ่มต้องไม่เกินวันสิ้นสุด', en: 'The start date must not be after the end date' },
  RANGE_TOO_LONG: { th: 'ดูรายงานได้ครั้งละไม่เกิน {max} วัน', en: 'The report can cover at most {max} days at a time' },
  // CR-04 ส่วน ข วันหยุดหลังร้าน ([D:CR-04b-B2 B3 B4] ผู้ใช้อนุมัติแทนร้าน รอร้านยืนยัน · รหัส HAS_ORDERS ตามร้าน ②)
  HAS_ORDERS: { th: 'ปิดวันที่ {date} ไม่ได้ มีออเดอร์ที่ยังไม่จัดส่งนัดรับวันนี้: {orders} กรุณาเลื่อนวันรับของก่อน', en: 'Cannot close {date}: undelivered orders are scheduled for pickup on this date: {orders}. Please reschedule them first' },
  HOLIDAY_PAST: { th: 'เพิ่มหรือลบวันหยุดได้เฉพาะวันหลังจากวันนี้', en: 'Holidays can only be added or removed for dates after today' },
  HOLIDAY_EXISTS: { th: 'วันที่ {date} เป็นวันหยุดอยู่แล้ว', en: '{date} is already a holiday' },
  HOLIDAY_NOT_FOUND: { th: 'ไม่พบวันหยุดวันที่ {date}', en: 'No holiday on {date}' },
  HOLIDAY_NAME_REQUIRED: { th: 'กรุณากรอกชื่อวันหยุดทั้งภาษาไทยและภาษาอังกฤษ', en: 'Please enter the holiday name in both Thai and English' },
  HOLIDAY_NAME_TOO_LONG: { th: 'ชื่อวันหยุดต้องไม่เกิน {max} ตัวอักษร', en: 'Holiday name must not exceed {max} characters' },
  BAD_REQUEST: { th: 'ข้อมูลไม่ถูกต้อง', en: 'Invalid request' },
  SERVER_ERROR: { th: 'เกิดข้อผิดพลาด กรุณาลองใหม่', en: 'Something went wrong. Please try again' },
};

export const UI = {
  brand: { th: 'ใสใส กลาสแวร์', en: 'SaiSai Glass' },
  brandSub: { th: 'โรงงานขวดแก้ว', en: 'Glass bottle factory' },
  navHome: { th: 'หน้าแรก', en: 'Home' },
  navProducts: { th: 'สินค้า', en: 'Products' },
  navOrder: { th: 'สั่งซื้อ', en: 'Order' },
  navOrders: { th: 'ออเดอร์ของฉัน', en: 'My orders' },
  navClaims: { th: 'เคลม', en: 'Claims' },
  navSamples: { th: 'ขอตัวอย่าง', en: 'Samples' },
  navStaffOrders: { th: 'ออเดอร์ทั้งหมด', en: 'All orders' },
  navStaffClaims: { th: 'ตัดสินเคลม', en: 'Claim review' },
  navPreview: { th: 'ตัวอย่างหน้าเว็บ', en: 'Design preview' },
  navOwnerReport: { th: 'รายงานยอด', en: 'Sales report' },
  navOwnerHolidays: { th: 'วันหยุดโรงงาน', en: 'Factory holidays' },
  login: { th: 'เข้าสู่ระบบ', en: 'Log in' },
  logout: { th: 'ออกจากระบบ', en: 'Log out' },
  email: { th: 'อีเมล', en: 'Email' },
  password: { th: 'รหัสผ่าน', en: 'Password' },
  loginTitle: { th: 'เข้าสู่ระบบ', en: 'Log in' },
  loginHint: { th: 'สำหรับลูกค้าองค์กรและพนักงานโรงงาน', en: 'For business customers and factory staff' },
  langLabel: { th: 'ภาษา', en: 'Language' },
  testMode: { th: 'โหมดทดสอบ: วันนี้ = {now}', en: 'Test mode: today = {now}' },
  roleCustomer: { th: 'ลูกค้า', en: 'Customer' },
  roleStaff: { th: 'พนักงาน', en: 'Staff' },
  roleOwner: { th: 'เจ้าของโรงงาน', en: 'Owner' },
  heroTitle: { th: 'ขวดแก้วคุณภาพ สำหรับแบรนด์ของคุณ', en: 'Quality glass bottles for your brand' },
  heroText: {
    th: 'ขวดแก้ว 4 ขนาด 3 สี สั่งผลิตได้ตั้งแต่หลักพันใบ เห็นราคาครบทุกบรรทัดก่อนยืนยัน พร้อมติดตามสถานะได้ทุกขั้น',
    en: 'Glass bottles in 4 sizes and 3 colors, from a few thousand pieces. See every price line before you confirm and track every production step.',
  },
  heroCtaOrder: { th: 'เริ่มสั่งซื้อ', en: 'Start an order' },
  heroCtaProducts: { th: 'ดูสินค้าทั้งหมด', en: 'View all products' },
  homeWhyTitle: { th: 'ทำไมต้องใสใส กลาสแวร์', en: 'Why SaiSai Glass' },
  homeWhy1: { th: 'ราคาชัดเจน: ส่วนลด ค่าโลโก้ ค่าขนส่ง และ VAT แยกบรรทัด', en: 'Clear pricing: discount, logo, shipping and VAT on separate lines' },
  homeWhy2: { th: 'ผลิตตามกำหนด: เลือกวันรับของล่วงหน้าอย่างน้อย 14 วัน', en: 'On schedule: choose a pickup date at least 14 days ahead' },
  homeWhy3: { th: 'ดูแลหลังการขาย: แจ้งเคลมพร้อมรูปภายใน 7 วันหลังจัดส่ง', en: 'After-sales care: file a claim with photos within 7 days of shipment' },
  factoryTitle: { th: 'โรงงานของเรา', en: 'Our factory' },
  factoryText: { th: 'สายการผลิตขวดแก้วที่ตรวจคุณภาพทุกล็อตก่อนจัดส่ง', en: 'A glass bottle line with quality checks on every lot before shipping' },
  productsTitle: { th: 'สินค้า 9 แบบ', en: '9 products' },
  productsIntro: { th: 'ราคาต่อใบยังไม่รวม VAT 7%', en: 'Prices per bottle exclude 7% VAT' },
  perBottle: { th: '/ ใบ', en: '/ bottle' },
  minimum: { th: 'ขั้นต่ำ {n} ใบ', en: 'Minimum {n} bottles' },
  orderThis: { th: 'สั่งแบบนี้', en: 'Order this' },
  bottleAlt: { th: 'ขวด {model} สี{color} ขนาด {size} ml', en: '{model} {color} glass bottle, {size} ml' },
  // หน้าสั่งซื้อ
  orderTitle: { th: 'สั่งซื้อขวดแก้ว', en: 'Order glass bottles' },
  stepModel: { th: '1. เลือกรุ่น', en: '1. Choose a model' },
  stepColor: { th: '2. เลือกสี', en: '2. Choose a color' },
  stepQty: { th: '3. จำนวน (ใบ)', en: '3. Quantity (bottles)' },
  stepLogo: { th: '4. พิมพ์โลโก้', en: '4. Logo printing' },
  stepAddress: { th: '5. ที่อยู่จัดส่งและระยะทาง', en: '5. Delivery address and distance' },
  stepPickup: { th: '6. วันรับของ', en: '6. Pickup date' },
  stepSummary: { th: '7. สรุปก่อนยืนยัน', en: '7. Summary before confirming' },
  model: { th: 'รุ่น', en: 'Model' },
  color: { th: 'สี', en: 'Color' },
  quantity: { th: 'จำนวน', en: 'Quantity' },
  logoOption: { th: 'พิมพ์โลโก้ (สกรีน 1 สี) ฿0.80 ต่อใบ', en: 'Logo printing (1-color screen) ฿0.80 per bottle' },
  address: { th: 'ที่อยู่จัดส่ง', en: 'Delivery address' },
  addressNone: { th: '— กรอกระยะเอง —', en: '— Enter distance manually —' },
  distance: { th: 'ระยะทางจากโรงงาน (กม.)', en: 'Distance from factory (km)' },
  pickupDate: { th: 'วันรับของ', en: 'Pickup date' },
  earliestPickup: { th: 'เลือกได้ตั้งแต่ {date}', en: 'Earliest: {date}' },
  note: { th: 'หมายเหตุ (ไม่บังคับ)', en: 'Note (optional)' },
  confirmOrder: { th: 'ยืนยันออเดอร์', en: 'Confirm order' },
  confirming: { th: 'กำลังบันทึก…', en: 'Saving…' },
  calculating: { th: 'กำลังคำนวณ…', en: 'Calculating…' },
  orderPlaced: { th: 'บันทึกออเดอร์แล้ว เลขออเดอร์', en: 'Order placed. Order number' },
  viewOrder: { th: 'ดูออเดอร์', en: 'View order' },
  reorderNote: { th: 'สั่งซ้ำจาก {no} · ราคาคิดตามวันนี้', en: 'Reorder of {no} · priced as of today' },
  // CR-01 หน้า /orders/[no] (ขั้น C) · ข้อความสำเร็จ th ตามร้าน · ที่เหลือ ⚠️ D5
  reschedule: { th: 'เลื่อนวันรับของ', en: 'Change pickup date' },
  rescheduleConfirm: { th: 'ยืนยันวันใหม่', en: 'Confirm new date' },
  rescheduleDone: { th: 'เลื่อนวันรับของ {code} เป็น {date} แล้ว', en: 'Pickup date for {code} changed to {date}' },
  pickupChanges: { th: 'ประวัติการเลื่อนวันรับของ', en: 'Pickup date changes' },
  pickupChangeRow: { th: 'เลื่อนวันรับของจาก {from} เป็น {to}', en: 'Pickup date changed from {from} to {to}' },
  salesContact: { th: 'ติดต่อเซลส์: โทร {phone} · LINE {line}', en: 'Contact sales: Tel {phone} · LINE {line}' },
  lineBottles: { th: 'ค่าขวด {qty} × {unit}', en: 'Bottles {qty} × {unit}' },
  lineDiscount: { th: 'ส่วนลด {rate}%', en: 'Discount {rate}%' },
  lineLogo: { th: 'พิมพ์โลโก้ {qty} × {unit} = {amount}', en: 'Logo printing {qty} × {unit} = {amount}' },
  lineLogoShort: { th: 'พิมพ์โลโก้', en: 'Logo printing' },
  lineShipping: { th: 'ค่าขนส่ง ({trips} เที่ยว)', en: 'Shipping (trips: {trips})' },
  lineSubtotal: { th: 'ยอดก่อน VAT', en: 'Subtotal before VAT' },
  lineVat: { th: 'VAT 7%', en: 'VAT 7%' },
  lineTotal: { th: 'ยอดรวม', en: 'Total' },
  trips: { th: 'จำนวนเที่ยวรถ', en: 'Truck trips' },
  freeShipping: { th: 'ระยะ 0–50 กม. ส่งฟรี', en: 'Free delivery within 0–50 km' },
  paymentTerms: { th: 'เงื่อนไขชำระเงิน', en: 'Payment terms' },
  termsPrepay: { th: 'ต้องโอนเงินเต็มจำนวนก่อนเริ่มผลิต', en: 'Full payment by bank transfer is required before production starts' },
  termsCredit: { th: 'ได้เครดิต 30 วัน', en: '30-day credit' },
  bankAccount: { th: 'โอนเข้าบัญชี {name} · {bank} · เลขที่ {acc}', en: 'Transfer to {name} · {bank} · Account {acc}' },
  creditStatus: { th: 'สถานะเครดิตของบริษัท', en: 'Company credit status' },
  creditPrepay: { th: 'ยังต้องโอนก่อนผลิต · อีก {n} ออเดอร์จะได้เครดิต 30 วัน', en: 'Prepayment required · {n} more orders to get 30-day credit' },
  creditPrepayOne: { th: 'ยังต้องโอนก่อนผลิต · อีก {n} ออเดอร์จะได้เครดิต 30 วัน', en: 'Prepayment required · {n} more order to get 30-day credit' },
  creditShipped: { th: 'ออเดอร์ที่จัดส่งแล้ว {n} ครั้ง', en: 'Shipped orders: {n}' },
  // ออเดอร์
  ordersTitle: { th: 'ออเดอร์ของบริษัท', en: 'Company orders' },
  ordersEmpty: { th: 'ยังไม่มีออเดอร์', en: 'No orders yet' },
  orderNo: { th: 'เลขออเดอร์', en: 'Order no.' },
  product: { th: 'สินค้า', en: 'Product' },
  status: { th: 'สถานะ', en: 'Status' },
  total: { th: 'ยอดรวม', en: 'Total' },
  company: { th: 'บริษัท', en: 'Company' },
  orderDetail: { th: 'ออเดอร์ {no}', en: 'Order {no}' },
  orderedBy: { th: 'สั่งโดย', en: 'Ordered by' },
  createdAt: { th: 'สั่งเมื่อ', en: 'Ordered at' },
  dueDate: { th: 'วันครบกำหนดจ่าย', en: 'Payment due date' },
  duePending: { th: '30 วันหลังจัดส่ง', en: '30 days after shipment' },
  dueNone: { th: '– (โอนก่อนผลิต)', en: '– (prepaid)' },
  paymentRecorded: { th: 'บันทึกรับเงินแล้ว {amount} เมื่อ {at}', en: 'Payment recorded {amount} at {at}' },
  paymentNotRecorded: { th: 'ยังไม่บันทึกรับเงิน', en: 'Payment not recorded yet' },
  shippedAt: { th: 'จัดส่งเมื่อ', en: 'Shipped at' },
  progress: { th: 'ความคืบหน้า 6 ขั้น', en: 'Progress (6 steps)' },
  history: { th: 'ประวัติการเปลี่ยนสถานะ', en: 'Status history' },
  histWhen: { th: 'วันเวลา', en: 'When' },
  histFrom: { th: 'จาก', en: 'From' },
  histTo: { th: 'เป็น', en: 'To' },
  histWho: { th: 'ผู้เปลี่ยน', en: 'Changed by' },
  histReason: { th: 'เหตุผล', en: 'Reason' },
  reorder: { th: 'สั่งซ้ำ', en: 'Reorder' },
  fileClaim: { th: 'แจ้งเคลม', en: 'File a claim' },
  claimUntil: { th: 'แจ้งเคลมได้ถึง {date} 23:59 น.', en: 'Claims accepted until {date} 23:59' },
  claimsOfOrder: { th: 'เคลมของออเดอร์นี้', en: 'Claims for this order' },
  backToOrders: { th: 'กลับไปหน้ารายการออเดอร์', en: 'Back to orders' },
  // เคลม
  claimTitle: { th: 'แจ้งเคลมออเดอร์ {no}', en: 'File a claim for order {no}' },
  lotNo: { th: 'เลขล็อต (เช่น LOT-261002)', en: 'Lot number (e.g. LOT-261002)' },
  claimQty: { th: 'จำนวนขวดที่เคลม', en: 'Number of bottles claimed' },
  claimRemaining: { th: 'เคลมได้อีกไม่เกิน {n} ใบ (สั่ง {ordered} ใบ)', en: 'Up to {n} more bottles can be claimed (ordered {ordered})' },
  description: { th: 'รายละเอียดปัญหา', en: 'Problem description' },
  photos: { th: 'รูปถ่าย (JPG / PNG 1–5 รูป รูปละไม่เกิน 5 MB)', en: 'Photos (JPG / PNG, 1–5 photos, max 5 MB each)' },
  removePhoto: { th: 'เอาออก', en: 'Remove' },
  submitClaim: { th: 'ส่งเคลม', en: 'Submit claim' },
  claimPlaced: { th: 'ส่งเคลมแล้ว เลขเคลม', en: 'Claim submitted. Claim number' },
  viewClaim: { th: 'ดูเคลม', en: 'View claim' },
  claimsTitle: { th: 'เคลมของบริษัท', en: 'Company claims' },
  claimsEmpty: { th: 'ยังไม่มีเคลม', en: 'No claims yet' },
  claimNo: { th: 'เลขเคลม', en: 'Claim no.' },
  reportedBy: { th: 'ผู้แจ้ง', en: 'Reported by' },
  reportedAt: { th: 'แจ้งเมื่อ', en: 'Reported at' },
  claimDetail: { th: 'เคลม {no}', en: 'Claim {no}' },
  rejectReason: { th: 'เหตุผลที่ปฏิเสธ', en: 'Rejection reason' },
  photoAlt: { th: 'รูปเคลม {no} รูปที่ {n}', en: 'Claim {no} photo {n}' },
  claimIllustrationAlt: { th: 'ภาพประกอบการตรวจขวดที่เสียหาย', en: 'Illustration of inspecting a damaged bottle' },
  // ตัวอย่าง
  samplesTitle: { th: 'ขอขวดตัวอย่างฟรี', en: 'Request free samples' },
  samplesIntro: { th: 'ขอได้รุ่นละไม่เกิน 3 ใบต่อเดือน (ทุกสีของรุ่นรวมกัน) ไม่คิดเงิน', en: 'Up to 3 bottles per model per month (all colors combined), free of charge' },
  quotaLeft: { th: 'โควตาเดือนนี้ที่เหลือ', en: 'Quota left this month' },
  addItem: { th: 'เพิ่มรายการ', en: 'Add item' },
  removeItem: { th: 'ลบรายการ', en: 'Remove item' },
  submitSample: { th: 'ส่งคำขอตัวอย่าง', en: 'Submit sample request' },
  samplePlaced: { th: 'ส่งคำขอแล้ว เลขคำขอ', en: 'Request submitted. Request number' },
  sampleHistory: { th: 'คำขอตัวอย่างของบริษัท', en: 'Company sample requests' },
  requestNo: { th: 'เลขคำขอ', en: 'Request no.' },
  requestDate: { th: 'วันที่ขอ', en: 'Request date' },
  items: { th: 'รายการ', en: 'Items' },
  // พนักงาน
  staffOrdersTitle: { th: 'ออเดอร์ทุกบริษัท', en: 'Orders from all companies' },
  filterStatus: { th: 'กรองตามสถานะ', en: 'Filter by status' },
  filterAll: { th: 'ทุกสถานะ', en: 'All statuses' },
  recordPayment: { th: 'บันทึกว่าได้รับเงินแล้ว', en: 'Record payment received' },
  paid: { th: 'รับเงินแล้ว', en: 'Paid' },
  unpaid: { th: 'ยังไม่รับเงิน', en: 'Unpaid' },
  advanceTo: { th: '{status}', en: '{status}' },
  advanceHint: { th: 'เลื่อนไปขั้นถัดไป', en: 'Move to next step' },
  noNextStep: { th: 'ขั้นสุดท้ายแล้ว', en: 'Final step' },
  actions: { th: 'ดำเนินการ', en: 'Actions' },
  open: { th: 'เปิด', en: 'Open' },
  staffClaimsTitle: { th: 'เคลมทั้งหมด', en: 'All claims' },
  startReview: { th: 'เริ่มตรวจสอบ', en: 'Start review' },
  approve: { th: 'อนุมัติ', en: 'Approve' },
  reject: { th: 'ปฏิเสธ', en: 'Reject' },
  reasonLabel: { th: 'เหตุผลที่ปฏิเสธ (1–1,000 ตัวอักษร)', en: 'Rejection reason (1–1,000 characters)' },
  noClaimActions: { th: 'เคลมนี้ตัดสินแล้ว ไม่มีการเปลี่ยนสถานะต่อ', en: 'This claim is closed. No further status changes' },
  viewFull: { th: 'กดเพื่อดูขนาดเต็ม', en: 'Click to view full size' },
  // พรีวิว
  previewTitle: { th: 'ตัวอย่างหน้าเว็บสำหรับเจ้าของโรงงาน', en: 'Design preview for the owner' },
  previewPalette: { th: 'ชุดสีกลาง', en: 'Color palette' },
  previewFonts: { th: 'ตัวอักษร', en: 'Typography' },
  previewButtons: { th: 'ปุ่ม', en: 'Buttons' },
  previewCards: { th: 'การ์ด', en: 'Cards' },
  previewBottles: { th: 'รูปขวดทั้ง 9 แบบ', en: 'All 9 bottle images' },
  previewSample: { th: 'ตัวอย่างข้อความ: ขวดแก้วใส สะอาด ปลอดภัยสำหรับอาหารและเครื่องดื่ม', en: 'Sample text: clear, clean glass bottles safe for food and drinks' },
  primary: { th: 'ฟ้าเข้ม (หลัก)', en: 'Deep blue (primary)' },
  cream: { th: 'ครีม (พื้น)', en: 'Cream (background)' },
  amber: { th: 'อำพัน (เน้น)', en: 'Amber (accent)' },
  buttonPrimary: { th: 'ปุ่มหลัก', en: 'Primary button' },
  buttonSecondary: { th: 'ปุ่มรอง', en: 'Secondary button' },
  buttonAccent: { th: 'ปุ่มเน้น', en: 'Accent button' },
  cardTitle: { th: 'หัวข้อการ์ด', en: 'Card title' },
  cardText: { th: 'การ์ดมีเงาและมุมมน ใช้ทุกหน้า', en: 'Cards have a soft shadow and rounded corners on every page' },
  // CR-05 รายงานเจ้าของ
  reportTitle: { th: 'รายงานยอด', en: 'Sales report' },
  reportIntro: { th: 'นับตามวันที่สั่ง (เวลาไทย) รวมวันแรกและวันสุดท้าย ดูได้ครั้งละไม่เกิน 92 วัน', en: 'Counted by order date (Thai time), first and last days included, up to 92 days at a time' },
  reportFrom: { th: 'ตั้งแต่วันที่', en: 'From' },
  reportTo: { th: 'ถึงวันที่', en: 'To' },
  reportRun: { th: 'ดูรายงาน', en: 'Show report' },
  reportCsv: { th: 'ดาวน์โหลดไฟล์ Excel (CSV)', en: 'Download Excel file (CSV)' },
  reportRange: { th: 'ช่วง {from} – {to}', en: 'Period {from} – {to}' },
  reportCounts: { th: 'จำนวนออเดอร์แยกสถานะ', en: 'Orders by status' },
  reportShipped: { th: 'ยอดขาย (ออเดอร์ที่จัดส่งแล้ว)', en: 'Sales (shipped orders)' },
  reportBottles: { th: 'ค่าขวด', en: 'Bottles' },
  reportDiscount: { th: 'ส่วนลด', en: 'Discount' },
  reportLogo: { th: 'ค่าพิมพ์โลโก้', en: 'Logo printing' },
  reportShipping: { th: 'ค่าขนส่ง', en: 'Shipping' },
  reportPending: { th: 'ยอดของออเดอร์ที่ยังไม่จัดส่ง (ขั้น 1–5)', en: 'Total of orders not yet shipped (steps 1–5)' },
  reportByModel: { th: 'จำนวนขวดแยกตามรุ่น', en: 'Bottles by model' },
  reportByCompany: { th: 'จำนวนออเดอร์ของแต่ละบริษัท', en: 'Orders by company' },
  reportOrders: { th: 'ออเดอร์', en: 'Orders' },
  // CR-04 ส่วน ข หน้า /owner/holidays
  holidaysTitle: { th: 'วันหยุดโรงงาน', en: 'Factory holidays' },
  holidaysIntro: { th: 'วันหยุดเลือกเป็นวันรับของไม่ได้ · เพิ่มหรือลบได้เฉพาะวันหลังจากวันนี้ · ปิดวันที่มีออเดอร์ยังไม่จัดส่งนัดรับไว้ไม่ได้ (โทรเลื่อนลูกค้าก่อน)', en: 'Holidays cannot be chosen as pickup dates · Only dates after today can be added or removed · A date with undelivered orders scheduled for pickup cannot be closed (call the customer to reschedule first)' },
  holidayDate: { th: 'วันที่', en: 'Date' },
  holidayNameTh: { th: 'ชื่อวันหยุด (ไทย)', en: 'Holiday name (Thai)' },
  holidayNameEn: { th: 'ชื่อวันหยุด (อังกฤษ)', en: 'Holiday name (English)' },
  holidayAdd: { th: 'เพิ่มวันหยุด', en: 'Add holiday' },
  holidayDelete: { th: 'ลบ', en: 'Delete' },
  holidayNone: { th: 'ยังไม่มีวันหยุด', en: 'No holidays yet' },
  notFoundTitle: { th: 'ไม่พบหน้านี้', en: 'Page not found' },
  forbiddenTitle: { th: 'ไม่มีสิทธิ์เข้าถึงหน้านี้', en: 'You do not have access to this page' },
  footer: { th: '© 2026 บจก. ใสใส กลาสแวร์ · ข้อมูลทดสอบ', en: '© 2026 SaiSai Glassware Co., Ltd. · Test data' },
  yes: { th: 'มี', en: 'Yes' },
  no: { th: 'ไม่มี', en: 'No' },
  km: { th: '{n} กม.', en: '{n} km' },
  bottles: { th: '{n} ใบ', en: '{n} bottles' },
  none: { th: '–', en: '–' },
} satisfies Record<string, Entry>;

export type UiKey = keyof typeof UI;

export const ORDER_STATUS: Record<number, Entry> = {
  1: { th: 'รับออเดอร์', en: 'Order received' },
  2: { th: 'ยืนยันสเปก', en: 'Spec confirmed' },
  3: { th: 'กำลังผลิต', en: 'In production' },
  4: { th: 'ตรวจคุณภาพ', en: 'Quality check' },
  5: { th: 'พร้อมจัดส่ง', en: 'Ready to ship' },
  6: { th: 'จัดส่งแล้ว', en: 'Shipped' },
};

export const CLAIM_STATUS: Record<string, Entry> = {
  received: { th: 'รับเรื่อง', en: 'Received' },
  reviewing: { th: 'กำลังตรวจสอบ', en: 'Under review' },
  approved: { th: 'อนุมัติ', en: 'Approved' },
  rejected: { th: 'ปฏิเสธ', en: 'Rejected' },
};

export const COLOR_NAME: Record<string, Entry> = {
  clear: { th: 'ใส', en: 'Clear' },
  amber: { th: 'ชา', en: 'Amber' },
  green: { th: 'เขียว', en: 'Green' },
};

function fill(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function t(lang: Lang, key: UiKey, vars?: Record<string, string | number>): string {
  return fill(UI[key][lang], vars);
}

const fmtInt = (n: number) => n.toLocaleString('en-US');

/** CR-04 ส่วน ข: error ที่มี {date} เป็นวันหยุด (ISO) → แสดงแบบ fmtDate */
const HOLIDAY_DATE_CODES = new Set(['HAS_ORDERS', 'HOLIDAY_EXISTS', 'HOLIDAY_NOT_FOUND', 'QUOTE_EXPIRED']);

export function errorMessage(lang: Lang, code: string, params?: Record<string, string | number>): string {
  const e = ERRORS[code] ?? ERRORS.BAD_REQUEST;
  const p: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params ?? {})) p[k] = typeof v === 'number' ? fmtInt(v) : v;
  // CR-04 FACTORY_CLOSED: {date} ISO → "5 ธ.ค. 2026" / "5 Dec 2026" (⚠️ Q-D) · {name} เลือกตามภาษาจาก name_th / name_en
  if (code === 'FACTORY_CLOSED') {
    p.date = fmtDate(String(params?.date ?? ''), lang);
    p.name = String(params?.[`name_${lang}`] ?? '');
  }
  // CR-04 ส่วน ข: {date} ISO → รูปเดียวกับ FACTORY_CLOSED
  if (HOLIDAY_DATE_CODES.has(code) && params?.date !== undefined) p.date = fmtDate(String(params.date), lang);
  return fill(e[lang], p);
}

export function orderStatusName(lang: Lang, s: number): string {
  return ORDER_STATUS[s]?.[lang] ?? String(s);
}

export function claimStatusName(lang: Lang, s: string): string {
  return CLAIM_STATUS[s]?.[lang] ?? s;
}

export function colorName(lang: Lang, c: string): string {
  return COLOR_NAME[c]?.[lang] ?? c;
}
