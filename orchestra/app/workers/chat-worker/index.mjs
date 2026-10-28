// Entrypoint registers tsx itself: both `node index.mjs` and npm start support server TS imports.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { register } = require('tsx/esm/api');
register();
require('tsx/cjs/api').register();
const { handleChat } = await import('./lib/chat.mjs');
const { assertTopology, prefetch, reply, retryOrDead, retryCount, MAX_RETRY } = await import('../../shared/mq-topology.mjs');
const pg = require('pg'); const amqp = require('amqplib');
pg.types.setTypeParser(1082, v => v);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: Math.max(prefetch('chat') * 2, 4), options: '-c timezone=Asia/Bangkok' });
// Bound DB connections independently of MQ concurrency (two workers share the DB).
pool.options.max = Math.min(pool.options.max, Math.max(1, Math.floor(Number(process.env.PG_POOL_MAX) || 16)));
const log = (...args) => console.log('[chat-worker]', ...args);
pool.on('error', e => log('database connection:', e.message));
let connection, stopping = false;
const beat = () => writeFileSync(process.env.HEARTBEAT_FILE || '/tmp/healthy', String(Date.now()));
async function start() {
  while (!stopping) {
    try {
      await pool.query('SELECT 1');
      connection = await amqp.connect(process.env.AMQP_URL || 'amqp://guest:guest@rabbitmq:5672');
      connection.on('error', e => log('MQ:', e.message));
      const closed = new Promise(resolve => connection.once('close', resolve));
      const channel = await connection.createConfirmChannel();
      channel.on('error', e => log('channel:', e.message));
      const n = await assertTopology(channel);
      await channel.prefetch(prefetch('chat'));
      await channel.consume(n.chatRequest, async msg => {
        if (!msg) return;
        try {
          const request = JSON.parse(msg.content.toString());
          if (!request.messageId || !request.sessionId || typeof request.text !== 'string') throw new Error('Invalid chat request');
          await handleChat(pool, request, {
            emit: payload => reply(channel, msg, payload),
            tts: payload => channel.sendToQueue(n.ttsRequest, Buffer.from(JSON.stringify(payload)), { persistent: true, contentType: 'application/json', replyTo: msg.properties.replyTo, correlationId: msg.properties.correlationId }),
            publish: async (_exchange, payload) => { channel.publish(n.orderEvents, '', Buffer.from(JSON.stringify(payload)), { persistent: true }); await channel.waitForConfirms(); },
          });
          await channel.waitForConfirms();
          channel.ack(msg);
        } catch (e) {
          log('request failed:', e.message);
          try {
            if (retryCount(msg) >= MAX_RETRY) reply(channel, msg, { messageId: msg.properties.correlationId, type: 'error', text: 'ขออภัยค่ะ ระบบตอบช้า ลองใหม่อีกครั้งนะคะ', cites: [], retrieved: [], products: [], lang: 'th' });
            // Shared retry policy; acknowledge a republish only after broker confirmation.
            let acknowledge;
            retryOrDead({ sendToQueue: (...args) => channel.sendToQueue(...args), nack: (...args) => channel.nack(...args), ack: original => { acknowledge = original; } }, msg);
            await channel.waitForConfirms();
            if (acknowledge) channel.ack(acknowledge);
          } catch { /* closed channel: unacknowledged message is redelivered */ }
        }
      });
      beat();
      log(`consume ${n.chatRequest}, prefetch=${prefetch('chat')}`);
      await closed;
      connection = null;
    } catch (e) { log('reconnect:', e.message); try { await connection?.close(); } catch {} }
    if (!stopping) await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
const heartbeat = setInterval(() => { if (connection && !stopping) beat(); }, 10000);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
  stopping = true; clearInterval(heartbeat);
  try { await connection?.close(); } catch {}
  await pool.end(); process.exit(0);
});
start();
