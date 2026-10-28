# ชั้น RabbitMQ (T10)

| ไฟล์ | หน้าที่ |
|---|---|
| `shared/mq-topology.mjs` (+ `.d.mts`) | ชื่อ + option ทุกคิว/exchange · `assertTopology(ch, prefix)` · `PRIORITY` · `MAX_RETRY` · `retryOrDead()` · `reply()` · `prefetch()` — ESM ไม่มี dependency ใช้ได้ทั้ง web และ worker |
| `web/lib/mq/index.ts` | web: connection เดียวต่อ process + reconnect · `instanceId` · คิว reply exclusive ผูก `chat.reply` (routing key = instanceId) · `rpc` `send` `publish` `consumerCount` `queueDepth` `queueStats` |
| `web/lib/mq/chat.ts` | ตรรกะ `/api/chat` ที่ไม่พึ่ง Next: `parseChatBody` · `chatPriority` · `backpressure` · `buildChatRequest` · `replyTracker` |
| `web/app/api/chat/route.ts` · `history/route.ts` | `POST /api/chat` (SSE) · `GET /api/chat/history` |
| `workers/_stub/echo-chat.mjs` | stub ทดสอบเท่านั้น (ตอบ status/delta/sentence/tts?/done · ข้อความขึ้นต้น `FAIL` → retry → DLQ) |

ชื่อจริง = `${MQ_PREFIX}` + ชื่อ (compose `''` · dev `T10_`) · ฟังก์ชันใน `lib/mq` รับชื่อเชิงตรรกะ (`'chat.request'`) แล้วเติม prefix ให้

## topology
| ชื่อ | ชนิด / option |
|---|---|
| `chat.request` | queue durable · `x-max-priority 5` · `x-dead-letter-exchange ''` · `x-dead-letter-routing-key <prefix>chat.dlq` |
| `chat.dlq` `tts.request` `stt.request` `rag.ingest` `notify.events` | queue durable (`notify.events` ผูก `order.events`) |
| `chat.reply` | exchange direct durable · routing key = `reply_to` |
| `order.events` | exchange fanout durable |

priority: voice 3 · text 1 · eval/load (header `x-eval-token` = `EVAL_TOKEN`) 0

## ใช้ใน worker (Node)
worker ต้องมี `amqplib` ใน package.json ของตัวเอง (Docker: `COPY shared/ /app/shared/` แล้ว import `../../shared/mq-topology.mjs`)
```js
import amqp from 'amqplib';
import { assertTopology, prefetch, reply, retryOrDead } from '../../shared/mq-topology.mjs';
const conn = await amqp.connect(process.env.AMQP_URL);
const ch = await conn.createChannel();
const n = await assertTopology(ch);          // ประกาศด้วย option เดียวกันทุกฝั่ง (ห้ามประกาศเอง)
await ch.prefetch(prefetch('chat'));         // CHAT_PREFETCH · 'stt' 'tts' 'rag'
await ch.consume(n.chatRequest, async (msg) => {
  const req = JSON.parse(msg.content.toString());
  try {
    reply(ch, msg, { messageId: req.messageId, type: 'delta', text: '…' }); // → chat.reply (reply_to · correlation_id เดิม)
    reply(ch, msg, { messageId: req.messageId, type: 'done', text, cites, retrieved, products, lang });
    ch.ack(msg);                               // ack หลังเสร็จเท่านั้น
  } catch (e) {
    retryOrDead(ch, msg);                      // x-retry < 2 → ส่งซ้ำ (x-retry+1) · ครบ → nack ไม่ requeue → chat.dlq
  }
});
```
- tts-worker ตอบทาง `reply(ch, msg, {type:'tts', messageId, seq, audioId, durationMs, engine, lang})` (chat-worker ส่ง `tts.request` ด้วย `replyTo`/`correlationId` ของคำขอแชทเดิม → web ได้รับเอง)
- chat-worker เป็นคนบันทึกข้อความ `assistant` ลง `chat_messages` (web บันทึกเฉพาะ `user` · `meta.messageId`)

## ใช้ใน web
```ts
import { rpc, send, publish, consumerCount, queueDepth } from '@/lib/mq';
await publish('order.events', { type: 'order.created', no });            // T07/T08
await send('rag.ingest', { docId });                                     // T12
const r = await rpc('stt.request', { audioB64, mime }, { timeoutMs: 30_000 }); // T15 · resolve เมื่อ type ไม่ใช่ status/delta/sentence/tts
const enabled = (await consumerCount('stt.request')) > 0;
```

## POST /api/chat `{text, lang?, via?, tts?}` → SSE `data: <json>\n\n`
1. ตรวจ body (ว่าง → 400 `TEXT_REQUIRED` · > 2000 → 413) · userId/companyId/lang จาก session ฝั่ง server เท่านั้น (body ที่มี companyId/userId ถูกละ)
2. backpressure: ความจุ = max(consumer,1) × `CHAT_PREFETCH` · depth > 2× → status `รอคิว ลำดับที่ n` · > 4× → `tts:false` · > 8× → **429** `{ok:false, errors:[{code:'BUSY', message:'ระบบหนาแน่น ลองใหม่ใน 30 วิ'}]}` + `Retry-After: 30`
3. `tts` = body.tts && ไม่เกิน 4× && มี consumer ที่ `tts.request`
4. บันทึก `chat_sessions` (upsert) + `chat_messages` role user → publish `chat.request` (priority · reply_to · correlation_id = messageId)
5. SSE แรก `{type:'status', text:'รอคิว…'|'กำลังคิด…'|'รอคิว ลำดับที่ n', position, tts, messageId}` · ระหว่างรอคิวอัปเดตทุก 2 วิ · `: ping` ทุก 15 วิ
6. ส่งต่อทุก reply ของ messageId จน `done`/`error` **และ** `tts` ของทุก `sentence` (seq) ที่ประกาศ (หรือ 20 วิหลัง done)
7. 90 วิไม่จบ → `{type:'error', text:'ขออภัยค่ะ ระบบตอบช้า ลองใหม่อีกครั้งนะคะ'}` · MQ ล่มตอนเริ่ม → 503 `MQ_DOWN`
- `GET /api/chat/history` → `{messages:[{id, role, text, cites, via, meta, createdAt}]}` (100 ล่าสุด · เก่า → ใหม่)

## ทดสอบ
```bash
cd web && npx vitest run lib/mq/test          # unit (integration ข้ามเองเมื่อไม่มี env)
# integration (dev infra · dev server เปิดด้วย MQ_PREFIX=T10_ ALLOW_TEST_RESET=1)
DATABASE_URL=postgres://dev:dev@127.0.0.1:56432/t_t10 AMQP_URL=amqp://guest:guest@127.0.0.1:56672 MQ_PREFIX=T10_ \
  ALLOW_TEST_RESET=1 PORT=4601 npm run dev &
AMQP_URL=amqp://guest:guest@127.0.0.1:56672 MQ_PREFIX=T10_ MQ_API=http://127.0.0.1:56673 WEB_URL=http://localhost:4601 \
  npx vitest run lib/mq/test
# echo stub ด้วยมือ
AMQP_URL=… MQ_PREFIX=T10_ node workers/_stub/echo-chat.mjs
```
⚠️ ใช้ `WEB_URL` ไม่ใช่ `BASE_URL` (vitest ตั้ง `process.env.BASE_URL='/'` เอง)

integration ครอบ: topology ผ่าน HTTP API (args/durable/ชนิด exchange/binding) · priority 3 > 1 > 0 · consumerCount/queueDepth · rpc ค้างในคิวตอนไม่มี consumer → เปิด echo → done · rpc timeout · ล้ม 3 ครั้ง → `chat.dlq` (x-retry 2 · x-death rejected) · fanout order.events → notify.events · **Q02 แบบ dev** (status "รอคิว…" → เปิด echo → done · history มีข้อความ user) · "กำลังคิด…" · companyId จาก session (body ปลอมถูกละ) · priority จาก API/eval-token · tts ส่งต่อครบ / ไม่มี consumer → tts:false / tts ค้าง → จบ 20 วิหลัง done · backpressure "รอคิว ลำดับที่ 10" + 429 · 400
