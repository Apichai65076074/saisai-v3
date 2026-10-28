import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../web/package.json', import.meta.url));
require('tsx/cjs/api').register(); require('tsx/esm/api').register();
const { handleChat, executeTool } = await import('../lib/chat.mjs');
const { loadContext } = await import('../lib/context.mjs');
import test from 'node:test';
import assert from 'node:assert/strict';
const pg = require('pg'); pg.types.setTypeParser(1082, x => x);
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
test.after(() => db.end());
const request = { sessionId: 'T13-unit', messageId: 'T13-unit-message', text: 'SO-0001 ถึงไหนแล้ว', userId: 1, companyId: 1 };
test('SQL context contains only authenticated company and latest ten history messages', async () => {
  await db.query("INSERT INTO chat_sessions(id) VALUES('T13-unit') ON CONFLICT DO NOTHING");
  await db.query("DELETE FROM chat_messages WHERE session_id='T13-unit'");
  for (let i = 0; i < 12; i++) await db.query("INSERT INTO chat_messages(session_id,role,text) VALUES('T13-unit','user',$1)", [String(i)]);
  const { ctx, history } = await loadContext(db, request, []);
  assert.equal(ctx.company.code, 'C01'); assert.equal(ctx.company.addresses.length, 4); assert.equal(history.length, 10); assert.equal(history[0].text, '2');
  assert.ok(!ctx.company.recentOrders.some(o => o.no === 'SO-0001'));
  const invalid = await loadContext(db, { ...request, companyId: 2 }, []); assert.equal(invalid.ctx.company, null);
});
test('cross-company ORDER tool has no rows; anonymous QUOTE cannot write', async () => {
  const r = await executeTool(db, { type: 'ORDER_STATUS', input: { orderNo: 'SO-0001', companyId: 2 } }, request, new Date(), true);
  assert.deepEqual(r, { ok: false, error: 'NOT_FOUND' });
  assert.deepEqual(await executeTool(db, { type: 'QUOTE', input: {} }, request, new Date(), false), { ok: false, error: 'LOGIN_REQUIRED' });
});
test('privacy guard rejects before LLM and done includes retrieval/products', async () => {
  const events = [];
  await handleChat(db, request, { emit: e => events.push(e), tts() {}, retrieveImpl: async () => [], completionImpl: async function* () { throw Error('must not call'); } });
  assert.equal(events.at(-1).type, 'done'); assert.equal(events.at(-1).text, 'ไม่พบออเดอร์นี้ค่ะ');
  assert.ok(Array.isArray(events.at(-1).retrieved)); assert.equal(events.at(-1).products.length, 9);
});
test('sentence/tts arrive before stream finishes and hidden tags never leak', async () => {
  const events = [], audio = []; let ended = false;
  const r = { ...request, messageId: 'stream-test', text: 'hello', tts: true };
  await handleChat(db, r, { emit: e => events.push(e), tts: e => { assert.equal(ended, false); audio.push(e); }, retrieveImpl: async () => [{ filename: 'doc.pdf', page: 2, content: 'test', score: 1 }],
    completionImpl: async function* () { yield '<thi'; yield 'nk>secret</think>Hello!'; assert.equal(audio.length, 1); yield ' Bye! [1]'; ended = true; } });
  assert.equal(audio.length, 2); assert.deepEqual(events.at(-1).cites, [{ filename: 'doc.pdf', page: 2 }]);
  assert.ok(!events.filter(e => e.type === 'delta').map(e => e.text).join('').includes('secret'));
});
test('spoken answer is capped at TTS_MAX_CHARS while the text answer stays complete', async () => {
  const { TTS_MAX_CHARS } = await import('../lib/chat.mjs');
  const events = [], audio = [];
  const line = 'ขวดรุ่นนี้ราคาดีมากและส่งได้ทั่วประเทศค่ะ ';
  await handleChat(db, { ...request, messageId: 'tts-cap', text: 'hello', tts: true }, { emit: e => events.push(e), tts: e => audio.push(e), retrieveImpl: async () => [],
    completionImpl: async function* () { for (let i = 0; i < 40; i++) yield line; } });
  const spoken = audio.reduce((n, a) => n + a.text.length, 0);
  assert.ok(audio.length > 1 && spoken <= TTS_MAX_CHARS, `spoken ${spoken}`);
  assert.deepEqual(events.filter(e => e.type === 'sentence').map(e => e.seq), audio.map(a => a.seq));
  assert.ok(events.at(-1).text.length > TTS_MAX_CHARS);
});
test('LLM outage emits error without throwing out of consumer', async () => {
  const events = [];
  await handleChat(db, { ...request, messageId: 'outage', text: 'hello' }, { emit: e => events.push(e), tts() {}, retrieveImpl: async () => [], completionImpl: async function* () { throw Error('LLM unavailable'); } });
  assert.equal(events.at(-1).type, 'error');
});
test('RERANK=off and >3 second rerank still complete a real mock chat', async () => {
  const { retrieve } = await import('../lib/retrieve.mjs');
  for (const mode of ['off', 'slow']) {
    const events = [], start = Date.now();
    await handleChat(db, { ...request, messageId: `fallback-${mode}-${Date.now()}`, text: 'B-500 ขั้นต่ำกี่ใบ' }, {
      emit: e => events.push(e), tts() {},
      retrieveImpl: (db, text) => retrieve(db, text, { rerank: mode === 'off' ? 'off' : 'on', fetch: (url, options) => {
        if (!url.endsWith('/v1/rerank')) return fetch(url, options);
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve(new Response('{}')), 5000);
          options.signal.addEventListener('abort', () => { clearTimeout(timer); reject(options.signal.reason); });
        });
      } }),
    });
    assert.equal(events.at(-1).type, 'done', JSON.stringify(events));
    assert.match(events.at(-1).text, /800/); assert.equal(events.at(-1).retrieved.length, 4);
    if (mode === 'slow') assert.ok(Date.now() - start >= 3000);
  }
});
test('unpaid production guard follows shared prepay versus credit eligibility', async () => {
  for (const loggedIn of [false, true]) {
    const events = []; let generated = false;
    const r = { sessionId: 'T13-unit', messageId: `production-${loggedIn}-${Date.now()}`, text: 'ยังไม่โอนเริ่มผลิตได้ไหม', ...(loggedIn ? { companyId: 1, userId: 1 } : {}) };
    await handleChat(db, r, { emit: e => events.push(e), tts() {}, retrieveImpl: async () => [], completionImpl: async function* () { generated = true; yield 'เครดิต ผลิตได้ตามเงื่อนไขค่ะ'; } });
    assert.equal(events.at(-1).type, 'done');
    if (loggedIn) assert.equal(generated, true, 'C01 has earned credit; do not impose prepay');
    else { assert.equal(generated, false); assert.match(events.at(-1).text, /บันทึกรับเงิน/); }
  }
});
