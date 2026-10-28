// integration (T10) · ไฟล์เดียวให้รันต่อกัน (ใช้คิวเดียวกัน ห้ามขนาน)
// ① RabbitMQ: topology · rpc stream · priority · retry → DLQ (ต้องมี AMQP_URL + MQ_PREFIX)
// ② POST /api/chat SSE กับ dev server จริง (เพิ่ม WEB_URL · dev server รันด้วย MQ_PREFIX เดียวกัน + ALLOW_TEST_RESET=1)
// cd web && AMQP_URL=amqp://guest:guest@127.0.0.1:56672 MQ_PREFIX=T10_ MQ_API=http://127.0.0.1:56673 WEB_URL=http://localhost:4601 npx vitest run lib/mq/test
import amqp, { type Channel, type ChannelModel } from 'amqplib';
import { randomUUID } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { close, getChannel, queueDepth, consumerCount, rpc, send, publish, type ReplyMessage } from '../index';
import { BASE_URL, HAS_MQ, Jar, PREFIX, chatPost, mqApi, queueInfo, readSse, sleep, startEcho, stopEcho } from './helpers';

describe.skipIf(!HAS_MQ)('T10 RabbitMQ (integration)', () => {
  let conn: ChannelModel;
  let ch: Channel;
  let echo: ChildProcess | null = null;

  beforeAll(async () => {
    await getChannel(); // ประกาศ topology
    conn = await amqp.connect(process.env.AMQP_URL!);
    ch = await conn.createChannel();
  });
  afterAll(async () => {
    await stopEcho(echo);
    await ch?.close().catch(() => {});
    await conn?.close().catch(() => {});
    await close();
  });
  beforeEach(async () => {
    await stopEcho(echo);
    echo = null;
    await ch.purgeQueue(PREFIX + 'chat.request');
    await ch.purgeQueue(PREFIX + 'chat.dlq');
  });

  it('คิว/exchange ครบตามสัญญา (HTTP API)', async () => {
    const req = await queueInfo('chat.request');
    expect(req.durable).toBe(true);
    expect(req.arguments).toMatchObject({
      'x-max-priority': 5, 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': PREFIX + 'chat.dlq',
    });
    for (const q of ['chat.dlq', 'stt.request', 'tts.request', 'rag.ingest', 'notify.events']) {
      expect((await queueInfo(q)).durable, q).toBe(true);
    }
    const ex = await mqApi<any[]>('/api/exchanges/%2F');
    const byName = Object.fromEntries(ex.map((e) => [e.name, e]));
    expect(byName[PREFIX + 'chat.reply']).toMatchObject({ type: 'direct', durable: true });
    expect(byName[PREFIX + 'order.events']).toMatchObject({ type: 'fanout', durable: true });
    const binds = await mqApi<any[]>(`/api/exchanges/%2F/${encodeURIComponent(PREFIX + 'order.events')}/bindings/source`);
    expect(binds.map((b) => b.destination)).toContain(PREFIX + 'notify.events');
  });

  it('priority: voice 3 ออกก่อน text 1 ก่อน eval 0', async () => {
    for (const [p, tag] of [[0, 'eval'], [1, 'text'], [3, 'voice'], [1, 'text2']] as const) {
      await send('chat.request', { tag }, { priority: p });
    }
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      const m = await ch.get(PREFIX + 'chat.request', { noAck: true });
      if (m) order.push(JSON.parse(m.content.toString()).tag);
    }
    expect(order).toEqual(['voice', 'text', 'text2', 'eval']);
  });

  it('consumerCount / queueDepth', async () => {
    expect(await consumerCount('chat.request')).toBe(0);
    await send('chat.request', { x: 1 });
    await send('chat.request', { x: 2 });
    await sleep(600); // cache 0.5 วิ
    expect(await queueDepth('chat.request')).toBe(2);
    await ch.purgeQueue(PREFIX + 'chat.request');
    echo = await startEcho('echo-cc');
    await sleep(600);
    expect(await consumerCount('chat.request')).toBe(1);
  });

  it('rpc: คำขอค้างในคิวตอนไม่มี consumer → เปิด echo → stream จน done (ข้อความไม่หาย)', async () => {
    const messageId = randomUUID();
    const seen: ReplyMessage[] = [];
    const p = rpc('chat.request', { sessionId: 's', messageId, text: 'B-500 ขั้นต่ำกี่ใบ', via: 'text', tts: false }, {
      correlationId: messageId, timeoutMs: 30_000, priority: 1, onMessage: (m) => seen.push(m),
      isFinal: (m) => m.type === 'done' || m.type === 'error',
    });
    await sleep(1500);
    expect((await ch.checkQueue(PREFIX + 'chat.request')).messageCount).toBe(1);
    echo = await startEcho('echo-rpc');
    const done = await p;
    expect(done.type).toBe('done');
    expect(String(done.text)).toContain('B-500 ขั้นต่ำกี่ใบ');
    expect(seen.map((m) => m.type)).toEqual(expect.arrayContaining(['status', 'delta', 'sentence', 'done']));
    expect(seen.filter((m) => m.type === 'sentence').map((m) => m.seq)).toEqual([0, 1]);
  });

  it('rpc timeout', async () => {
    await expect(rpc('chat.request', { text: 'x' }, { timeoutMs: 300 })).rejects.toThrow('rpc_timeout');
  });

  it('ล้ม 3 ครั้ง (x-retry 0,1,2) → อยู่ใน chat.dlq', async () => {
    echo = await startEcho('echo-dlq');
    const messageId = randomUUID();
    await send('chat.request', { sessionId: 's', messageId, text: 'FAIL please', via: 'text', tts: false }, { correlationId: messageId, replyTo: 'nobody' });
    let dead = null;
    for (let i = 0; i < 50 && !dead; i++) {
      await sleep(200);
      dead = await ch.get(PREFIX + 'chat.dlq', { noAck: true });
    }
    expect(dead).toBeTruthy();
    const m = dead as amqp.GetMessage;
    expect(JSON.parse(m.content.toString()).messageId).toBe(messageId);
    expect(m.properties.headers?.['x-retry']).toBe(2);
    expect(m.properties.correlationId).toBe(messageId);
    const death = (m.properties.headers?.['x-death'] as any[])?.[0];
    expect(death?.reason).toBe('rejected');
    expect((await ch.checkQueue(PREFIX + 'chat.request')).messageCount).toBe(0);
  });

  it('publish order.events → notify.events (fanout)', async () => {
    await ch.purgeQueue(PREFIX + 'notify.events');
    await publish('order.events', { type: 'order.created', no: 'SO-T10' });
    let got = null;
    for (let i = 0; i < 20 && !got; i++) {
      got = await ch.get(PREFIX + 'notify.events', { noAck: true });
      if (!got) await sleep(100);
    }
    expect(got && JSON.parse(got.content.toString())).toEqual({ type: 'order.created', no: 'SO-T10' });
  });
});

const until = async (fn: () => boolean, ms = 15_000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await sleep(100);
  }
};

describe.skipIf(!HAS_MQ || !BASE_URL)('T10 /api/chat (integration)', () => {
  let conn: ChannelModel;
  let ch: Channel;
  let echo: ChildProcess | null = null;

  beforeAll(async () => {
    conn = await amqp.connect(process.env.AMQP_URL!);
    ch = await conn.createChannel();
    const r = await fetch(BASE_URL + '/api/test/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(r.ok).toBe(true);
  });
  afterAll(async () => {
    await stopEcho(echo);
    await ch?.close().catch(() => {});
    await conn?.close().catch(() => {});
  });
  beforeEach(async () => {
    await stopEcho(echo);
    echo = null;
    await ch.purgeQueue(PREFIX + 'chat.request');
  });

  it('Q02 (dev): ไม่มี consumer → status "รอคิว…" → เปิด echo → done (ข้อความไม่หาย) + history', async () => {
    const jar = new Jar();
    const res = await chatPost(jar, { text: 'B-500 ขั้นต่ำกี่ใบ' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const events: any[] = [];
    const all = readSse(res, (e) => events.push(e));
    await until(() => events.length > 0);
    expect(events[0]).toMatchObject({ type: 'status', text: 'รอคิว…' });
    await sleep(3000); // คิวค้างจริง
    expect((await ch.checkQueue(PREFIX + 'chat.request')).messageCount).toBe(1);
    echo = await startEcho('echo-q02');
    await all;
    const done = events.find((e) => e.type === 'done');
    expect(done.text).toContain('B-500 ขั้นต่ำกี่ใบ');
    expect(events.at(-1).type).toBe('done');
    expect(new Set(events.map((e) => e.messageId)).size).toBe(1);
    const h = await (await jar.fetch('/api/chat/history')).json();
    expect(h.messages.map((m: any) => [m.role, m.text])).toContainEqual(['user', 'B-500 ขั้นต่ำกี่ใบ']);
  });

  it('มี consumer → status แรก "กำลังคิด…"', async () => {
    echo = await startEcho('echo-think');
    await sleep(700);
    const events = await readSse(await chatPost(new Jar(), { text: 'สวัสดี' }));
    expect(events[0]).toMatchObject({ type: 'status', text: 'กำลังคิด…' });
    expect(events.at(-1).type).toBe('done');
  });

  it('companyId/userId จาก session เท่านั้น · body ปลอมถูกละ', async () => {
    echo = await startEcho('echo-auth');
    const anon = await readSse(await chatPost(new Jar(), { text: 'ออเดอร์ของฉัน', companyId: 3, userId: 4 }));
    expect(anon.find((e) => e.type === 'done').echo).toMatchObject({ companyId: null, userId: null });

    const jar = new Jar();
    const login = await jar.fetch('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'arun@saisai.test', password: 'Arun#Test2026' }),
    });
    expect(login.status).toBe(200);
    const me = await (await jar.fetch('/api/auth/me')).json();
    const companyId = me.user?.companyId ?? me.companyId;
    const userId = me.user?.userId ?? me.userId;
    expect(typeof companyId).toBe('number');
    const ev = await readSse(await chatPost(jar, { text: 'ออเดอร์ของฉัน', companyId: companyId + 1, userId: 999 }));
    expect(ev.find((e) => e.type === 'done').echo).toMatchObject({ companyId, userId });
  });

  it('priority: voice 3 · text 1 · x-eval-token ถูก → 0 · ผิด → 1', async () => {
    echo = await startEcho('echo-prio');
    const prio = async (body: object, headers: Record<string, string> = {}) =>
      (await readSse(await chatPost(new Jar(), body, headers))).find((e) => e.type === 'done').echo.priority;
    expect(await prio({ text: 'a', via: 'voice' })).toBe(3);
    expect(await prio({ text: 'a' })).toBe(1);
    expect(await prio({ text: 'a', via: 'voice' }, { 'x-eval-token': 'ss-eval' })).toBe(0);
    expect(await prio({ text: 'a' }, { 'x-eval-token': 'wrong' })).toBe(1);
  });

  it('tts:true + มี consumer tts.request → ส่งต่อ tts ทุก sentence ก่อนจบ', async () => {
    echo = await startEcho('echo-tts');
    const dummy = await ch.consume(PREFIX + 'tts.request', () => {}, { noAck: true }); // ให้ web เห็นว่ามีเสียง
    try {
      await sleep(700);
      const ev = await readSse(await chatPost(new Jar(), { text: 'ราคา', tts: true }));
      expect(ev[0]).toMatchObject({ type: 'status', tts: true });
      expect(ev.filter((e) => e.type === 'tts').map((e) => e.seq)).toEqual([0, 1]);
      // ไม่มี consumer → ไม่ขอเสียง
    } finally {
      await ch.cancel(dummy.consumerTag);
    }
    await sleep(700);
    const ev2 = await readSse(await chatPost(new Jar(), { text: 'ราคา', tts: true }));
    expect(ev2[0].tts).toBe(false);
    expect(ev2.some((e) => e.type === 'tts')).toBe(false);
  });

  it('tts ค้าง: หลัง done รอ tts อีก 20 วิแล้วจบเอง (ไม่ error)', async () => {
    echo = await startEcho('echo-notts', { ECHO_TTS: '0' });
    const dummy = await ch.consume(PREFIX + 'tts.request', () => {}, { noAck: true });
    try {
      await sleep(700);
      const t: Record<string, number> = {};
      const ev = await readSse(await chatPost(new Jar(), { text: 'ราคา', tts: true }), (e) => {
        if (e.type === 'done') t.done = Date.now();
      });
      const gap = Date.now() - t.done;
      expect(ev.at(-1).type).toBe('done');
      expect(ev.some((e) => e.type === 'error')).toBe(false);
      expect(gap).toBeGreaterThan(19_000);
      expect(gap).toBeLessThan(23_000);
    } finally {
      await ch.cancel(dummy.consumerTag);
    }
  }, 40_000);

  it('backpressure: > 2× ความจุ "รอคิว ลำดับที่ n" · > 8× → 429', async () => {
    // ไม่มี consumer → ความจุ = 1 × CHAT_PREFETCH(4) · ใส่ 9 ข้อความ (> 8)
    for (let i = 0; i < 9; i++) ch.sendToQueue(PREFIX + 'chat.request', Buffer.from('{}'), { priority: 0 });
    await sleep(700);
    const ctl = new AbortController();
    const res = await new Jar().fetch('/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'คิวยาว' }), signal: ctl.signal,
    });
    const events: any[] = [];
    readSse(res, (e) => events.push(e)).catch(() => {});
    await until(() => events.length > 0);
    expect(events[0]).toMatchObject({ type: 'status', text: 'รอคิว ลำดับที่ 10' });
    ctl.abort();
    for (let i = 0; i < 30; i++) ch.sendToQueue(PREFIX + 'chat.request', Buffer.from('{}'), { priority: 0 });
    await sleep(700);
    const busy = await chatPost(new Jar(), { text: 'คิวยาวมาก' });
    expect(busy.status).toBe(429);
    expect(busy.headers.get('retry-after')).toBe('30');
    expect((await busy.json()).errors[0]).toMatchObject({ code: 'BUSY', message: 'ระบบหนาแน่น ลองใหม่ใน 30 วิ' });
  });

  it('body ผิด → 400 รูปแบบ error เดิม', async () => {
    const r = await chatPost(new Jar(), { text: '  ' });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ ok: false, errors: [{ code: 'TEXT_REQUIRED', field: 'text' }] });
  });
});
