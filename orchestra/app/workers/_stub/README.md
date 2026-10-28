# workers/_stub (T10 · ทดสอบเท่านั้น · ไม่อยู่ใน compose)
`echo-chat.mjs` = consumer ของ `chat.request` ตาม `shared/mq-topology.mjs` ตอบ status → delta → sentence (seq 0,1) → tts จำลอง (ถ้า `tts:true` · ปิดด้วย `ECHO_TTS=0`) → done (`echo:{userId, companyId, via, priority, retry}`)
ข้อความขึ้นต้น `FAIL` → ล้มทุกครั้ง → `retryOrDead` (x-retry 0→1→2 → nack → `chat.dlq`)
```bash
AMQP_URL=amqp://guest:guest@127.0.0.1:56672 MQ_PREFIX=T10_ node workers/_stub/echo-chat.mjs
```
amqplib: ใช้ของ `web/node_modules` (createRequire) ถ้าไม่มีในเส้นทางปกติ · ดูรายละเอียด `web/lib/mq/README.md`
