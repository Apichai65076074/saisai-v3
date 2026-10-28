// echo-chat stub (T10 · ใช้ทดสอบเท่านั้น · ไม่ใช่ chat-worker จริง)
// consume chat.request ตาม shared/mq-topology.mjs → ตอบ status → delta → sentence → (tts จำลอง) → done ทาง chat.reply
// ข้อความขึ้นต้น "FAIL" = ทำงานล้มทุกครั้ง → retry ผ่าน header x-retry (2 ครั้ง) → ครั้งที่ 3 nack → chat.dlq
// env: AMQP_URL · MQ_PREFIX · CHAT_PREFETCH · ECHO_DELAY_MS (หน่วงต่อ delta · ค่าเริ่มต้น 40) · ECHO_ID (ชื่อใน log)
//      ECHO_TTS=0 (ไม่ตอบ tts จำลอง · ทดสอบรอ tts 20 วิหลัง done)
import { createRequire } from 'node:module';
import { assertTopology, prefetch, reply, retryCount, retryOrDead } from '../../shared/mq-topology.mjs';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
let amqp;
try {
  amqp = (await import('amqplib')).default;
} catch {
  amqp = require('amqplib'); // ใช้ของ web/node_modules
}

const DELAY = Number(process.env.ECHO_DELAY_MS ?? 40);
const ID = process.env.ECHO_ID || `echo-${process.pid}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[${ID}]`, ...a);

const conn = await amqp.connect(process.env.AMQP_URL || 'amqp://guest:guest@rabbitmq:5672');
const ch = await conn.createChannel();
const n = await assertTopology(ch);
await ch.prefetch(prefetch('chat'));

async function handle(msg) {
  const req = JSON.parse(msg.content.toString('utf8'));
  const send = (p) => reply(ch, msg, { messageId: req.messageId, lang: req.lang || 'th', ...p });
  if (String(req.text || '').startsWith('FAIL')) throw new Error('echo: forced failure');
  send({ type: 'status', text: 'กำลังคิด…' });
  const sentences = [`รับคำถามแล้วค่ะ: ${req.text}`, `ส่งจาก ${ID} ค่ะ`];
  let full = '';
  for (let seq = 0; seq < sentences.length; seq++) {
    const s = sentences[seq];
    for (const w of s.split(/(\s+)/)) {
      if (!w) continue;
      full += w;
      send({ type: 'delta', text: w });
      if (DELAY) await sleep(DELAY);
    }
    full += seq < sentences.length - 1 ? ' ' : '';
    send({ type: 'sentence', seq, text: s });
    if (req.tts && process.env.ECHO_TTS !== '0') send({ type: 'tts', seq, audioId: `echo-${req.messageId}-${seq}`, durationMs: 1200, engine: 'echo' });
  }
  send({
    type: 'done', text: full, cites: [], retrieved: [], products: [],
    echo: { userId: req.userId ?? null, companyId: req.companyId ?? null, via: req.via, priority: msg.properties.priority ?? null, retry: retryCount(msg) },
  });
}

await ch.consume(n.chatRequest, async (msg) => {
  if (!msg) return;
  try {
    await handle(msg);
    ch.ack(msg); // ack หลังทำเสร็จเท่านั้น
  } catch (e) {
    const r = retryOrDead(ch, msg);
    log(`fail (x-retry=${retryCount(msg)}) → ${r}:`, e.message);
  }
});
log(`consuming ${n.chatRequest} prefetch=${prefetch('chat')}`);

const stop = async () => {
  await ch.close().catch(() => {});
  await conn.close().catch(() => {});
  process.exit(0);
};
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, stop);
