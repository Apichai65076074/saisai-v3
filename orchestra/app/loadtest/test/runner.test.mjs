import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { options, percentile, readSSE, Session, transaction, queueSnapshot } from '../run_load.mjs';

test('validates modes, stages, shard and durations before work', () => {
  for (const mode of ['chat', 'stt', 'tts', 'voice', 'mix']) assert.equal(options(['--mode', mode]).mode, mode);
  for (const args of [['--mode', 'bad'], ['--users', '1,1'], ['--users', '10,1'], ['--stage-sec', 'NaN'], ['--think-sec', '-1'], ['--shard', '0/2'], ['--label', '../bad']]) assert.throws(() => options(args));
  assert.equal(options(['--users', '10,20', '--shard', '2/2']).shardIndex, 2);
  assert.equal(percentile([10, 1, 4, 7], .95), 10);
});
test('SSE handles split UTF8, multiple frames, comments and multiline data', async () => {
  const bytes = new TextEncoder().encode(': ping\n\ndata: {"type":"delta",\ndata: "text":"สวัสดี"}\n\ndata: {"type":"done"}\n\n');
  const stream = new ReadableStream({ start(c) { for (const b of bytes) c.enqueue(Uint8Array.of(b)); c.close(); } });
  const events = [];
  await readSSE(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }), e => events.push(e));
  assert.equal(events[0].text, 'สวัสดี'); assert.equal(events[1].type, 'done');
});

test('public API pipeline: session isolation, chat, STT, TTS, voice, 429, missing audio and SSE errors', async t => {
  let fail = '', published = 0;
  const server = createServer(async (req, res) => {
    for await (const _ of req) { /* drain */ }
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/auth/login') { res.setHeader('set-cookie', 'ss_session=signed; HttpOnly; Path=/'); res.end('{}'); }
    else if (req.url === '/api/voice') res.end(JSON.stringify({ text: 'ขั้นต่ำกี่ใบ', language: 'th' }));
    else if (req.url === '/api/tts') res.end(JSON.stringify({ audioId: 'wav1', durationMs: 1000 }));
    else if (req.url === '/api/tts/wav1') res.end(Buffer.from('RIFFtestWAV'));
    else if (req.url === '/api/queues') res.end(JSON.stringify(['chat', 'stt', 'tts'].map(k => ({ name: `test_${k}.request`, vhost: '/', consumers: 2, messages: 3, message_stats: { publish: published } }))));
    else if (req.url === '/api/chat') {
      if (fail === '429') { res.writeHead(429); res.end('{}'); return; }
      published++;
      res.setHeader('content-type', 'text/event-stream'); res.setHeader('x-message-id', 'msg1');
      const events = fail === 'sse' ? [{ type: 'error', text: 'failure' }] : [{ type: 'delta', text: '800 ใบ' }, { type: 'done' }];
      if (!fail) events.push({ type: 'tts', audioId: 'wav1' });
      if (fail === 'partial') events.push({ type: 'sentence', seq: 1 }, { type: 'sentence', seq: 2 }, { type: 'tts', seq: 1, audioId: 'wav1' });
      if (fail === 'duplicate') events.push({ type: 'done' });
      res.end(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''));
    } else { res.writeHead(404); res.end('{}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const a = new Session(base, {}), b = new Session(base, {});
  await a.login(); await b.login();
  assert.notEqual(a.cookies.get('ss_chat'), b.cookies.get('ss_chat')); assert.equal(a.cookies.get('ss_session'), 'signed');
  const qa = [{ question: 'test' }], voices = [{ bytes: Buffer.from('wav'), file: 'V01.wav', durationMs: 1000 }];
  const counts = { chat_attempted: 0, chat_accepted: 0, chat_done: 0 };
  for (const kind of ['chat', 'stt', 'tts', 'voice']) {
    const result = await transaction(a, kind, qa, voices, counts);
    assert.equal(result.ok, true, JSON.stringify(result)); assert.ok(result.delay_ms >= 0);
    if (kind === 'voice') assert.ok(result.first_audio_ms >= result.stt_ms);
  }
  assert.equal(counts.chat_done, 2);
  assert.equal((await queueSnapshot(base, 'test_')).chat.publish, 2);
  fail = '429'; assert.match((await transaction(a, 'chat', qa, voices, counts)).error, /HTTP_429/);
  fail = 'sse'; assert.match((await transaction(a, 'chat', qa, voices, counts)).error, /SSE_ERROR/);
  fail = 'missing'; assert.equal((await transaction(a, 'voice', qa, voices, counts)).error, 'MISSING_TTS');
  assert.equal(counts.chat_accepted, 4); assert.equal(counts.chat_done, 3);
  fail = 'partial'; assert.equal((await transaction(a, 'voice', qa, voices, counts)).error, 'MISSING_TTS_SENTENCE');
  fail = 'duplicate'; assert.match((await transaction(a, 'chat', qa, voices, counts)).error, /DUPLICATE_DONE/);
});
