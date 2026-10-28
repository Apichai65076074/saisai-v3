// stt-worker: unit (ไม่ต้องใช้ infra) + integration กับ RabbitMQ dev (ข้ามเมื่อไม่มี AMQP_URL)
// AMQP_URL=amqp://guest:guest@127.0.0.1:56672 MQ_PREFIX=T15_ node --test workers/stt-worker/test
import test from 'node:test';
import assert from 'node:assert/strict';
import { extFor, INITIAL_PROMPT, normLang, start, transcribe, wavMs } from '../index.mjs';
import { AMQP_URL, fakeAibox, mqClient, silentWav, sleep } from './helpers.mjs';

const PREFIX = `${process.env.MQ_PREFIX || 'T15_'}stt${process.pid}_`;

test('wavMs · normLang · extFor', () => {
  assert.equal(wavMs(silentWav(1500)), 1500);
  assert.equal(wavMs(Buffer.from('not a wav')), 0);
  assert.equal(normLang('thai'), 'th');
  assert.equal(normLang('english'), 'en');
  assert.equal(normLang('', 'ขวด'), 'th');
  assert.equal(normLang(undefined, 'What is'), 'en');
  assert.equal(extFor('audio/webm;codecs=opus'), 'webm');
  assert.equal(extFor('audio/wav'), 'wav');
});

test('transcribe ส่ง multipart + Bearer + initial_prompt', async () => {
  const box = await fakeAibox({
    '/v1/audio/transcriptions': (_req, _body, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ text: ' ขวดสองร้อยห้าสิบมิล ', language: 'thai', duration: 2.5 })); },
  });
  process.env.STT_URL = box.url;
  process.env.AIBOX_API_KEY = 'k-test';
  try {
    const out = await transcribe({ audioB64: silentWav(800).toString('base64'), mime: 'audio/webm;codecs=opus', lang: 'th' });
    assert.deepEqual({ text: out.text, language: out.language, durationMs: out.durationMs }, { text: 'ขวดสองร้อยห้าสิบมิล', language: 'th', durationMs: 2500 });
    const call = box.state.calls.find((c) => c.path === '/v1/audio/transcriptions');
    assert.equal(call.headers.authorization, 'Bearer k-test');
    const body = call.body.toString('latin1');
    assert.match(body, /name="file"; filename="audio\.webm"/);
    assert.ok(call.body.includes(Buffer.from(INITIAL_PROMPT)));
    await assert.rejects(transcribe({ audioB64: '' }), /audio_required/);
    await assert.rejects(transcribe({ audioB64: silentWav(30_001).toString('base64'), mime: 'audio/wav' }), /audio_too_long/);
    await assert.rejects(transcribe({ audioB64: Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') }), /audio_too_large/);
  } finally {
    await box.close();
  }
});

test('healthGate: one failed probe keeps the consumer · two consecutive cancel · ok resets', async () => {
  const { healthGate } = await import('../index.mjs');
  const down = healthGate(2);
  assert.deepEqual([down(false), down(true), down(false), down(false), down(true)], [false, false, false, true, false]);
});

test('integration: consume เมื่อ /health ok · ตอบ stt · ล่ม → cancel consumer · กลับมา → consume ใหม่', { skip: !AMQP_URL && 'ไม่มี AMQP_URL' }, async () => {
  const box = await fakeAibox({
    '/v1/audio/transcriptions': (_req, _body, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ text: 'Can I get free samples?', language: 'en', duration: 1.2 })); },
  });
  process.env.STT_URL = box.url;
  const mq = await mqClient(PREFIX);
  const q = mq.n.sttRequest;
  const w = await start({ prefix: PREFIX, healthEveryMs: 300, heartbeat: false });
  try {
    assert.equal(await mq.consumers(q), 1);
    const r = await mq.rpc(q, { audioB64: silentWav(500).toString('base64'), mime: 'audio/wav' });
    assert.deepEqual({ type: r.type, text: r.text, language: r.language, durationMs: r.durationMs }, { type: 'stt', text: 'Can I get free samples?', language: 'en', durationMs: 1200 });
    const bad = await mq.rpc(q, { audioB64: '' });
    assert.equal(bad.type, 'stt');
    assert.equal(bad.error, 'audio_required');

    box.state.healthy = false;
    for (let i = 0; i < 30 && (await mq.consumers(q)) > 0; i++) await sleep(200);
    assert.equal(await mq.consumers(q), 0, 'STT ล่ม → ไม่มี consumer');
    box.state.healthy = true;
    for (let i = 0; i < 30 && (await mq.consumers(q)) === 0; i++) await sleep(200);
    assert.equal(await mq.consumers(q), 1, 'STT กลับมา → consume อีกครั้ง');
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
