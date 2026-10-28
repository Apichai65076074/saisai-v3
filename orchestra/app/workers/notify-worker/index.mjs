// notify-worker (T09): consume `${MQ_PREFIX}notify.events` (ผูก fanout order.events) → ตาราง notifications
// heartbeat /tmp/healthy ทุก 10 วิ ขณะต่อ RabbitMQ อยู่ · ack หลังบันทึกเสร็จเท่านั้น
import { writeFileSync } from 'node:fs';
import amqp from 'amqplib';
import pg from 'pg';
import { assertTopology, retryOrDead } from '../../shared/mq-topology.mjs';
import { parseEvent, saveNotification } from './lib.mjs';

const AMQP_URL = process.env.AMQP_URL || 'amqp://guest:guest@rabbitmq:5672';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://ss:ss@db:5432/saisai', max: 4 });
pool.on('error', (e) => console.warn('[notify-worker] pg pool error:', e.message));

let conn = null;
let stopping = false;
const beat = () => conn && writeFileSync('/tmp/healthy', String(Date.now()));
setInterval(beat, 10_000);

async function start() {
  conn = await amqp.connect(AMQP_URL);
  conn.on('error', (e) => console.warn('[notify-worker] amqp error:', e.message));
  conn.on('close', () => {
    conn = null;
    if (!stopping) {
      console.warn('[notify-worker] amqp closed · reconnect in 3 s');
      setTimeout(loop, 3000);
    }
  });
  const ch = await conn.createChannel();
  const n = await assertTopology(ch);
  await ch.prefetch(4);
  await ch.consume(n.notifyEvents, async (msg) => {
    if (!msg) return;
    const ev = parseEvent(msg.content);
    if (!ev) {
      console.warn('[notify-worker] bad event · dropped');
      return ch.nack(msg, false, false);
    }
    try {
      const added = await saveNotification(pool, ev);
      ch.ack(msg);
      console.log(`[notify-worker] ${ev.type} ${ev.no}${added ? '' : ' (duplicate)'}`);
    } catch (e) {
      console.warn(`[notify-worker] ${ev.type} ${ev.no} failed: ${e.message} · ${retryOrDead(ch, msg)}`);
    }
  });
  beat();
  console.log(`[notify-worker] consuming ${n.notifyEvents}`);
}

function loop() {
  start().catch((e) => {
    conn = null;
    console.warn(`[notify-worker] start failed: ${e.message} · retry in 3 s`);
    setTimeout(loop, 3000);
  });
}
loop();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    stopping = true;
    await conn?.close().catch(() => {});
    await pool.end().catch(() => {});
    process.exit(0);
  });
}
