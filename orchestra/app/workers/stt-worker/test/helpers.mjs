// helper ทดสอบ worker เสียง: เซิร์ฟเวอร์ ai-box ปลอม + ฟัง reply ทาง chat.reply (dev infra)
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { assertTopology } from '../../../shared/mq-topology.mjs';

const require = createRequire(import.meta.url);

export const AMQP_URL = process.env.AMQP_URL || '';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** เซิร์ฟเวอร์ ai-box ปลอม · handlers[path] = (req, body:Buffer, res) => void · state.healthy คุม /health */
export async function fakeAibox(handlers = {}) {
  const state = { healthy: true, calls: [] };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const path = new URL(req.url, 'http://x').pathname;
      state.calls.push({ path, headers: req.headers, body });
      if (path === '/health') {
        res.writeHead(state.healthy ? 200 : 503, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ status: state.healthy ? 'ok' : 'down', models: { llm: 'mock', stt: 'mock', tts: 'mock', rerank: 'mock' } }));
      }
      const h = handlers[path];
      if (!h) { res.writeHead(404); return res.end(); }
      h(req, body, res);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, state, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) };
}

/** WAV PCM mono 16-bit 16 kHz เงียบ ยาว ms */
export function silentWav(ms) {
  const frames = Math.round((ms / 1000) * 16000);
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
  return wav;
}

/** ต่อ RabbitMQ (amqplib ของ worker) · คิว reply exclusive ผูก chat.reply · rpc(queue, payload) → reply แรก */
export async function mqClient(prefix) {
  const amqp = require('amqplib');
  const conn = await amqp.connect(AMQP_URL);
  const ch = await conn.createChannel();
  const n = await assertTopology(ch, prefix);
  const key = `test-${randomUUID()}`;
  const { queue } = await ch.assertQueue('', { exclusive: true, autoDelete: true });
  await ch.bindQueue(queue, n.chatReply, key);
  const waiters = new Map();
  await ch.consume(queue, (m) => {
    const w = waiters.get(m.properties.correlationId);
    if (w) { waiters.delete(m.properties.correlationId); w(JSON.parse(m.content.toString())); }
  }, { noAck: true });
  return {
    n,
    ch,
    rpc(q, payload, timeoutMs = 15000) {
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => { waiters.delete(id); reject(new Error('rpc timeout')); }, timeoutMs);
        waiters.set(id, (v) => { clearTimeout(t); resolve(v); });
        ch.sendToQueue(q, Buffer.from(JSON.stringify(payload)), { replyTo: key, correlationId: id, contentType: 'application/json' });
      });
    },
    async consumers(q) { return (await ch.checkQueue(q)).consumerCount; },
    async cleanup(queues) { for (const q of queues) await ch.purgeQueue(q).catch(() => {}); await conn.close().catch(() => {}); },
  };
}
