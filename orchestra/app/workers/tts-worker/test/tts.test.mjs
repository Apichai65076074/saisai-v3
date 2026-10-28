// tts-worker: cache sha256 + reply ทาง MQ (dev infra · ข้ามเมื่อไม่มี DATABASE_URL/AMQP_URL)
// DATABASE_URL=postgres://dev:dev@127.0.0.1:56432/t_t15 AMQP_URL=amqp://guest:guest@127.0.0.1:56672 MQ_PREFIX=T15_ node --test workers/tts-worker/test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { audioIdFor, createSynth, start, VOICE, wavDurationMs } from '../index.mjs';
import { AMQP_URL, fakeAibox, mqClient, silentWav } from '../../stt-worker/test/helpers.mjs';

const require = createRequire(import.meta.url);
const DATABASE_URL = process.env.DATABASE_URL || '';
const PREFIX = `${process.env.MQ_PREFIX || 'T15_'}tts${process.pid}_`;

async function speechBox() {
  return fakeAibox({
    '/v1/audio/speech': (_req, body, res) => {
      const { input } = JSON.parse(body.toString());
      res.writeHead(200, { 'content-type': 'audio/wav' });
      res.end(silentWav(1000 + [...input].length * 10));
    },
  });
}

test('wavDurationMs · audioIdFor', () => {
  assert.equal(wavDurationMs(silentWav(1234)), 1234);
  assert.equal(wavDurationMs(Buffer.from('xx')), null);
  assert.match(audioIdFor('ห้าบาท', 'th'), /^[0-9a-f]{64}$/);
  assert.notEqual(audioIdFor('a', 'th'), audioIdFor('a', 'en'));
});

test('cache sha256(ข้อความ+ภาษา): เรียก service ครั้งเดียว · ส่ง voice nongsai + language', { skip: !DATABASE_URL && 'ไม่มี DATABASE_URL' }, async () => {
  const box = await speechBox();
  process.env.TTS_URL = box.url;
  const pg = require('pg');
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  const synth = createSynth(pool);
  const raw = `ขวด B-250 ใบละ ฿5.80 ค่ะ 😊 [1] #${process.pid}${Date.now()}`;
  try {
    const a = await synth(raw, 'th');
    assert.equal(a.cached, false);
    assert.equal(a.lang, 'th');
    assert.match(a.text, /บี สองร้อยห้าสิบ ใบละ ห้าบาทแปดสิบสตางค์/);
    assert.equal(a.audioId, audioIdFor(a.text, 'th'));
    assert.ok(a.durationMs > 1000);
    const row = (await pool.query('SELECT duration_ms, engine, lang, length(wav) AS n FROM tts_audio WHERE audio_id=$1', [a.audioId])).rows[0];
    assert.equal(row.duration_ms, a.durationMs);
    assert.equal(row.engine, 'mock');
    assert.equal(row.lang, 'th');
    assert.ok(row.n > 44);
    const speechCalls = () => box.state.calls.filter((c) => c.path === '/v1/audio/speech');
    const sent = JSON.parse(speechCalls()[0].body.toString());
    assert.equal(sent.voice, VOICE);
    assert.equal(sent.voice, 'nongsai');
    assert.equal(sent.language, 'th');
    assert.doesNotMatch(sent.input, /😊|\[1\]|฿|B-250/);

    const b = await synth(raw, 'th');
    assert.equal(b.cached, true);
    assert.equal(b.audioId, a.audioId);
    // ล้างตาราง (เหมือน /api/test/reset) → cache ในหน่วยความจำใส่กลับ
    await pool.query('DELETE FROM tts_audio WHERE audio_id=$1', [a.audioId]);
    const c = await synth(raw, 'th');
    assert.equal(c.cached, true);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM tts_audio WHERE audio_id=$1', [a.audioId])).rows[0].n, 1);
    assert.equal(speechCalls().length, 1);

    const en = await synth('The minimum for B-150 is 1,800 bottles.', 'th');
    assert.equal(en.lang, 'en');
    assert.equal(JSON.parse(speechCalls()[1].body.toString()).language, 'en');
    await pool.query('DELETE FROM tts_audio WHERE audio_id = ANY($1)', [[a.audioId, en.audioId]]);
  } finally {
    await pool.end();
    await box.close();
  }
});

test('integration: tts.request → reply {type:tts, messageId, seq, audioId, durationMs, engine, lang}', { skip: (!DATABASE_URL || !AMQP_URL) && 'ไม่มี DATABASE_URL/AMQP_URL' }, async () => {
  const box = await speechBox();
  process.env.TTS_URL = box.url;
  const mq = await mqClient(PREFIX);
  const w = await start({ prefix: PREFIX, databaseUrl: DATABASE_URL, warm: true, heartbeat: false });
  try {
    await w.warming;
    const r = await mq.rpc(mq.n.ttsRequest, { messageId: 'm-1', seq: 2, text: 'สั่งขั้นต่ำ 800 ใบค่ะ', lang: 'th' });
    assert.equal(r.type, 'tts');
    assert.equal(r.messageId, 'm-1');
    assert.equal(r.seq, 2);
    assert.match(r.audioId, /^[0-9a-f]{64}$/);
    assert.ok(r.durationMs > 1000);
    assert.equal(r.engine, 'mock');
    assert.equal(r.lang, 'th');
    // ประโยคทักทายอยู่ใน cache แล้ว (warm) → ไม่เรียก service เพิ่ม
    const before = box.state.calls.filter((c) => c.path === '/v1/audio/speech').length;
    const g = await mq.rpc(mq.n.ttsRequest, { messageId: 'm-2', seq: 1, text: 'สวัสดีค่ะ ถามเรื่องขวดแก้ว ราคา หรือการสั่งซื้อได้เลยค่ะ', lang: 'th' });
    assert.equal(g.type, 'tts');
    assert.equal(box.state.calls.filter((c) => c.path === '/v1/audio/speech').length, before);
    const e = await mq.rpc(mq.n.ttsRequest, { messageId: 'm-3', seq: 1, text: '😊 [1]', lang: 'th' });
    assert.deepEqual({ type: e.type, seq: e.seq, error: e.error }, { type: 'tts', seq: 1, error: 'empty_text' });
  } finally {
    await w.stop();
    for (const [key, name] of Object.entries(mq.n)) {
      if (key !== 'chatReply' && key !== 'orderEvents') await mq.ch.deleteQueue(name);
    }
    await mq.ch.deleteExchange(mq.n.chatReply).catch(() => {});
    await mq.ch.deleteExchange(mq.n.orderEvents).catch(() => {});
    await mq.cleanup([]);
    await box.close();
  }
});
