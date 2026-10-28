// รัน: MQ_PREFIX=T09_ AMQP_URL=… DATABASE_URL=… node --test test/*.test.mjs (ต้องมี notify-worker ไม่รันค้างอยู่ก็ได้ · เทสต์เปิดเอง)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import amqp from 'amqplib';
import pg from 'pg';
import { assertTopology } from '../../../shared/mq-topology.mjs';
import { parseEvent, messageFor } from '../lib.mjs';

process.env.MQ_PREFIX ||= 'T09_';
const DB = process.env.DATABASE_URL;
const AMQP = process.env.AMQP_URL;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('parseEvent รับเฉพาะ 3 ชนิดและเลขเอกสารที่ถูกต้อง', () => {
  assert.deepEqual(parseEvent(Buffer.from('{"type":"order.created","no":"SO-0019"}')), { type: 'order.created', no: 'SO-0019' });
  assert.equal(parseEvent(Buffer.from('{"type":"order.deleted","no":"SO-0019"}')), null);
  assert.equal(parseEvent(Buffer.from('{"type":"claim.created","no":"x;drop"}')), null);
  assert.equal(parseEvent(Buffer.from('not json')), null);
  assert.equal(messageFor({ type: 'quote.created', no: 'QT-0001' }), 'ใบเสนอราคาใหม่ QT-0001');
});

let conn, ch, pool, worker, n;
const ready = DB && AMQP;
before(async () => {
  if (!ready) return;
  pool = new pg.Pool({ connectionString: DB });
  conn = await amqp.connect(AMQP);
  ch = await conn.createConfirmChannel();
  n = await assertTopology(ch);
  await ch.purgeQueue(n.notifyEvents);
  await pool.query(`DELETE FROM notifications WHERE no LIKE '%-99__'`);
  worker = spawn(process.execPath, [fileURLToPath(new URL('../index.mjs', import.meta.url))], { env: process.env, stdio: 'inherit' });
  for (let i = 0; i < 50; i++) {
    const q = await ch.checkQueue(n.notifyEvents);
    if (q.consumerCount > 0) break;
    await sleep(200);
  }
});
after(async () => {
  worker?.kill('SIGTERM');
  await pool?.query(`DELETE FROM notifications WHERE no LIKE '%-99__'`).catch(() => {});
  await conn?.close().catch(() => {});
  await pool?.end();
});

async function waitRows(sql, params, count) {
  for (let i = 0; i < 50; i++) {
    const r = await pool.query(sql, params);
    if (r.rows.length >= count) return r.rows;
    await sleep(100);
  }
  return (await pool.query(sql, params)).rows;
}

test('order.events (fanout) → notify.events → notifications ครบ 3 ชนิด · ส่งซ้ำไม่เกิดแถวซ้ำ', { skip: !ready && 'ต้องตั้ง DATABASE_URL + AMQP_URL' }, async () => {
  const evs = [
    { type: 'order.created', no: 'SO-9901' },
    { type: 'claim.created', no: 'CL-9901' },
    { type: 'quote.created', no: 'QT-9901' },
    { type: 'order.created', no: 'SO-9901' },
    { type: 'bogus', no: 'SO-9902' },
  ];
  for (const ev of evs) ch.publish(n.orderEvents, '', Buffer.from(JSON.stringify(ev)), { persistent: true });
  await ch.waitForConfirms();
  const t0 = Date.now();
  const rows = await waitRows(`SELECT type, no, message FROM notifications WHERE no LIKE '%-99__' ORDER BY id`, [], 3);
  assert.ok(Date.now() - t0 < 5000, 'ภายใน 5 วิ');
  await sleep(500);
  const all = (await pool.query(`SELECT type, no FROM notifications WHERE no LIKE '%-99__' ORDER BY type`)).rows;
  assert.deepEqual(all, [
    { type: 'claim.created', no: 'CL-9901' },
    { type: 'order.created', no: 'SO-9901' },
    { type: 'quote.created', no: 'QT-9901' },
  ]);
  assert.equal(rows.find((r) => r.no === 'SO-9901').message, 'ออเดอร์ใหม่ SO-9901');
  const q = await ch.checkQueue(n.notifyEvents);
  assert.equal(q.messageCount, 0, 'ack ครบ · ข้อความเสียถูกทิ้ง');
});
