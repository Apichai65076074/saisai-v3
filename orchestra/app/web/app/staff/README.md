# T09 หลังร้าน + การแจ้งเตือน

- `/staff/orders` `/staff/orders/[no]`: บันทึกรับเงิน (ยอดเต็มครั้งเดียว · 409 PAYMENT_EXISTS) · เลื่อนขั้นทีละ 1 ผ่าน `checkAdvance()` (prepay ไปขั้น 3 ไม่ได้ถ้ายังไม่รับเงิน → PAYMENT_REQUIRED) · ขั้น 6 credit30 ตั้ง due_date ผ่าน `creditDueDate()` · ประวัติ append-only
- `/staff/claims` `/staff/claims/[no]`: received → reviewing → approved/rejected (เหตุผล 1–1,000 ตัว ผ่าน rules.ts)
- `/owner/holidays`: เพิ่ม/ลบวันหยุดในอนาคต (owner เท่านั้น) · ล็อกวันที่ร่วมกับ T07 (advisory 4244)
- API `/api/staff/*` (staff/owner) · `/api/owner/holidays*` (owner) ตรวจ role ทุกเส้น · หน้าหลังร้านไม่มีสิทธิ์ → redirect `/login`
- `NotifyBox` (`notify-box` / `notify-item[data-type]`) อยู่ใน `web/app/staff/layout.tsx` และ `web/app/owner/holidays/layout.tsx` · poll `GET /api/staff/notifications` ทุก 2 วิ
- `workers/notify-worker/`: consume `${MQ_PREFIX}notify.events` (ผูก fanout `order.events` ผ่าน `shared/mq-topology.mjs`) → `notifications` · idempotent ด้วย unique (type,no) จาก `db/init/530-T09-notifications.sql` · ข้อความเสียถูกทิ้ง · DB ล้ม → `retryOrDead`

## รัน/ทดสอบ (env: DATABASE_URL=t_t09 · AMQP_URL dev infra · MQ_PREFIX=T09_ · MODE=mock · ALLOW_TEST_RESET=1 · SESSION_SECRET)

```
node db/apply.mjs --reset
(cd workers/notify-worker && npm install && node --test test/*.test.mjs)   # 2/2 ผ่าน
node workers/notify-worker/index.mjs &
cd web && npm run build && node node_modules/next/dist/bin/next start -p 4600 &   # หรือ PORT=4600 npm run dev
cd e2e && BASE_URL=http://localhost:4600 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright npx playwright test tests/W14.spec.ts
```

W14 มี 2 test: (1) พนักงานเปิด /staff/orders ค้าง · ลูกค้า (context ที่สองมีวิดีโอใน `customer-video/`) สั่ง SO-0019 / ขอ QT-0001 / เคลม CL-0005 → notify-item แต่ละชนิดโผล่ภายใน 5 วิ (2) owner เพิ่มวันหยุด 2026-10-25 → earliest-pickup 2026-10-26 · ลบ → กลับเป็น 2026-10-25

ไม่ได้แก้ไฟล์ส่วนกลาง (root layout ใช้ตาม main) · ไม่เพิ่ม dependency ของ web
