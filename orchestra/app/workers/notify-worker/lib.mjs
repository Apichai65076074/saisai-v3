// notify-worker (T09) · แปลง event จาก order.events → แถวใน notifications
export const TYPES = Object.freeze({
  'order.created': 'ออเดอร์ใหม่',
  'claim.created': 'เคลมใหม่',
  'quote.created': 'ใบเสนอราคาใหม่',
});

/** ตรวจรูปแบบ event · คืน {type, no} หรือ null (ข้อความเสีย → ทิ้ง) */
export function parseEvent(buf) {
  let ev;
  try {
    ev = JSON.parse(buf.toString());
  } catch {
    return null;
  }
  if (!ev || typeof ev !== 'object' || !(ev.type in TYPES)) return null;
  if (typeof ev.no !== 'string' || !/^[A-Z]{2}-\d{4,}$/.test(ev.no)) return null;
  return { type: ev.type, no: ev.no };
}

export function messageFor(ev) {
  return `${TYPES[ev.type]} ${ev.no}`;
}

/** บันทึก (idempotent ด้วย unique (type,no) จาก 530-T09) · คืน true ถ้าเพิ่มแถวใหม่ */
export async function saveNotification(db, ev) {
  const r = await db.query(
    `INSERT INTO notifications(type, no, message) VALUES ($1, $2, $3)
     ON CONFLICT (type, no) DO NOTHING`,
    [ev.type, ev.no, messageFor(ev)],
  );
  return r.rowCount > 0;
}
