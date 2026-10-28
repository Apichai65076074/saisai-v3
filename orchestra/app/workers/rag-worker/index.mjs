// rag-worker (T12) · consume rag.ingest {docId} (prefetch 1 · ack หลัง ready/failed เท่านั้น)
// ตอนเริ่ม: PDF ใน /app/docs (dev: docs/pdf) ที่ยังไม่มีใน docs → INSERT แล้ว publish rag.ingest ให้ทุกแถวที่ยังไม่ ready
// env: DATABASE_URL · AMQP_URL · EMBED_URL · MQ_PREFIX · DOCS_DIR · EMBED_BATCH (16) · EMBED_TIMEOUT_MS (600000)
//      PYTHON (python3) · HEARTBEAT_FILE (/tmp/healthy) · RAG_HOLD_MS (0 · จำลองงานยาวสำหรับ Q03)
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { assertTopology, prefetch, retryOrDead, retryCount, MAX_RETRY } from '../../shared/mq-topology.mjs';
import { docsDir, ingestDoc, markFailed, seedDocs } from './lib.mjs';

const require = createRequire(import.meta.url);
const requireWeb = createRequire(new URL('../../web/package.json', import.meta.url));
const load = (m) => {
  try {
    return require(m);
  } catch {
    return requireWeb(m); // dev: ใช้ของ web/node_modules
  }
};
const amqp = load('amqplib');
const pg = load('pg');

const log = (...a) => console.log(new Date().toISOString(), '[rag-worker]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HEARTBEAT = process.env.HEARTBEAT_FILE || '/tmp/healthy';
const beat = () => {
  try {
    writeFileSync(HEARTBEAT, String(Date.now()));
  } catch {
    /* ไม่มีสิทธิ์เขียน → ข้าม */
  }
};
beat();
setInterval(beat, 10_000).unref();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://ss:ss@db:5432/saisai',
  max: 4,
  options: '-c timezone=Asia/Bangkok',
});
pool.on('error', (e) => log('pg error', e.message));

let stopping = false;
let conn = null;

async function waitDb() {
  for (let i = 0; ; i++) {
    try {
      await pool.query('SELECT 1 FROM docs LIMIT 1');
      return;
    } catch (e) {
      if (i % 10 === 0) log('รอ DB …', e.message);
      await sleep(2000);
    }
  }
}

async function run() {
  conn = await amqp.connect(process.env.AMQP_URL || 'amqp://guest:guest@rabbitmq:5672');
  conn.on('error', (e) => log('amqp error', e.message));
  conn.on('close', () => {
    conn = null;
    if (!stopping) {
      log('amqp ปิด → ต่อใหม่ใน 3 วิ');
      setTimeout(start, 3000);
    }
  });
  const ch = await conn.createChannel();
  const n = await assertTopology(ch);
  await ch.prefetch(prefetch('rag'));

  // เอกสารตั้งต้น + งานค้าง (queued/processing ของรอบก่อน) → เข้าคิว (ซ้ำกับข้อความที่ค้างในคิวได้ · ตัวที่ ready แล้วจะถูกข้าม)
  const pending = await seedDocs(pool, docsDir(), log);
  for (const docId of pending) {
    ch.sendToQueue(n.ragIngest, Buffer.from(JSON.stringify({ docId })), { persistent: true, contentType: 'application/json' });
  }
  if (pending.length) log(`publish ${n.ragIngest} ×${pending.length} (ยังไม่ ready: ${pending.join(',')})`);

  await ch.consume(n.ragIngest, async (msg) => {
    if (!msg) return;
    let docId;
    try {
      docId = Number(JSON.parse(msg.content.toString('utf8')).docId);
    } catch {
      docId = NaN;
    }
    if (!Number.isInteger(docId) || docId <= 0) {
      log('ข้อความเสีย → ทิ้ง', msg.content.toString('utf8').slice(0, 100));
      ch.ack(msg);
      return;
    }
    try {
      const r = await ingestDoc(pool, docId, log);
      if (r.skipped) log(`skip #${docId} (${r.reason})`);
      if (!stopping) ch.ack(msg);
    } catch (e) {
      if (stopping) return; // กำลังหยุด → ไม่ ack ข้อความกลับเข้าคิว
      const permanent = e.permanent || retryCount(msg) >= MAX_RETRY;
      log(`ล้ม #${docId} (retry ${retryCount(msg)}${permanent ? ' · failed' : ''}):`, e.message);
      if (permanent) {
        await markFailed(pool, docId, e).catch((err) => log('markFailed', err.message));
        ch.ack(msg);
      } else {
        await sleep(2000);
        retryOrDead(ch, msg);
      }
    }
  });
  log(`consume ${n.ragIngest} (prefetch ${prefetch('rag')})`);
}

async function start() {
  if (stopping) return;
  try {
    await waitDb();
    await run();
  } catch (e) {
    log('เริ่มไม่สำเร็จ → ลองใหม่ใน 3 วิ:', e.message);
    try {
      await conn?.close();
    } catch {
      /* ignore */
    }
    conn = null;
    setTimeout(start, 3000);
  }
}

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    stopping = true;
    log(`${sig} → ปิด (ข้อความที่ยังไม่ ack กลับเข้าคิว)`);
    try {
      await conn?.close();
    } catch {
      /* ignore */
    }
    await pool.end().catch(() => {});
    process.exit(0);
  });
}

start();
