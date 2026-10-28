// ชั้น RabbitMQ ฝั่ง web (T10 · server เท่านั้น) — ไม่พึ่ง Next
// connection เดียวต่อ process + reconnect · instanceId สุ่ม · คิวชั่วคราว exclusive ผูก chat.reply ด้วย routing key = instanceId
// ชื่อคิว/exchange รับเป็นชื่อเชิงตรรกะ ('chat.request') แล้วเติม MQ_PREFIX ให้เอง · ประกาศผ่าน shared/mq-topology.mjs เท่านั้น
import { randomUUID } from 'node:crypto';
import { acceptAudioDelivery } from '../tts-delivery';
import amqp, { type ChannelModel, type ConfirmChannel, type ConsumeMessage, type Options } from 'amqplib';
import { assertTopology, mqPrefix, names as topologyNames, realName as topologyRealName, type Names } from '../../../shared/mq-topology.mjs';

export type ReplyMessage = { type?: string; messageId?: string; seq?: number; text?: string; [k: string]: unknown };

type Pending = {
  onMessage?: (msg: ReplyMessage) => void;
  isFinal: (msg: ReplyMessage) => boolean;
  resolve: (msg: ReplyMessage) => void;
  timer: NodeJS.Timeout;
};

type State = {
  instanceId: string;
  conn: ChannelModel | null;
  ch: ConfirmChannel | null;
  connecting: Promise<ConfirmChannel> | null;
  pending: Map<string, Pending>;
  stats: Map<string, { at: number; v: Promise<QueueStats | null> }>;
};

const g = globalThis as unknown as { __ssMq?: State };
const state: State =
  g.__ssMq ??
  (g.__ssMq = {
    instanceId: `web-${randomUUID()}`,
    conn: null,
    ch: null,
    connecting: null,
    pending: new Map(),
    stats: new Map(),
  });

/** id สุ่มของ web process นี้ = reply_to / routing key ของ reply */
export const instanceId = state.instanceId;

/** ชื่อจริง (มี MQ_PREFIX) ของทุกคิว/exchange */
export function names(): Names {
  return topologyNames(mqPrefix());
}

/** 'chat.request' → `${MQ_PREFIX}chat.request` */
export function realName(name: string): string {
  return topologyRealName(name, mqPrefix());
}

function reset() {
  state.ch = null;
  state.conn = null;
  scheduleReconnect();
}

// มี RPC รออยู่ → ต่อใหม่ทันทีเพื่อสร้างคิว reply ใหม่ (reply ที่ส่งมาระหว่างหลุดจะหาย · ส่วนคำขอยังอยู่ในคิว durable)
function scheduleReconnect() {
  const t = setTimeout(() => {
    if (state.ch || state.pending.size === 0) return;
    getChannel().catch(() => scheduleReconnect());
  }, 1000);
  t.unref?.();
}

function dispatch(m: ConsumeMessage | null) {
  if (!m) return; // server ยกเลิก consumer → channel ถูกสร้างใหม่ตอนใช้ครั้งถัดไป
  const id = m.properties.correlationId as string | undefined;
  if (!id) return;
  const p = state.pending.get(id);
  if (!p) return; // ไม่มีใครรอแล้ว (timeout / ผู้ใช้ปิด)
  let msg: ReplyMessage;
  try {
    msg = acceptAudioDelivery(JSON.parse(m.content.toString('utf8')));
  } catch {
    return;
  }
  try {
    p.onMessage?.(msg);
  } catch {
    /* error ของผู้ฟังต้องไม่ทำ consumer พัง */
  }
  if (p.isFinal(msg)) settle(id, msg);
}

function settle(id: string, msg: ReplyMessage) {
  const p = state.pending.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  state.pending.delete(id);
  p.resolve(msg);
}

async function connect(): Promise<ConfirmChannel> {
  const url = process.env.AMQP_URL || 'amqp://guest:guest@rabbitmq:5672';
  const conn = await amqp.connect(url, { clientProperties: { connection_name: state.instanceId } });
  conn.on('error', () => {
    /* ตามด้วย 'close' */
  });
  conn.on('close', () => {
    if (state.conn === conn) reset();
  });
  try {
    const ch = await conn.createConfirmChannel();
    ch.on('error', () => {});
    ch.on('close', () => {
      if (state.ch === ch) {
        reset();
        conn.close().catch(() => {});
      }
    });
    const n = await assertTopology(ch, mqPrefix());
    const { queue } = await ch.assertQueue('', { exclusive: true, autoDelete: true, durable: false });
    await ch.bindQueue(queue, n.chatReply, state.instanceId);
    await ch.consume(queue, dispatch, { noAck: true });
    state.conn = conn;
    state.ch = ch;
    return ch;
  } catch (e) {
    conn.close().catch(() => {});
    throw e;
  }
}

/** confirm channel กลาง (ต่อ/ต่อใหม่เมื่อใช้ · ลอง 3 ครั้ง backoff) */
export async function getChannel(): Promise<ConfirmChannel> {
  if (state.ch) return state.ch;
  if (!state.connecting) {
    state.connecting = (async () => {
      let last: unknown;
      for (let i = 0; i < 3; i++) {
        try {
          return await connect();
        } catch (e) {
          last = e;
          await new Promise((r) => setTimeout(r, 300 * 2 ** i));
        }
      }
      throw last instanceof Error ? last : new Error('amqp connect failed');
    })().finally(() => {
      state.connecting = null;
    });
  }
  return state.connecting;
}

async function confirmed(fn: (ch: ConfirmChannel, cb: (err: unknown) => void) => void): Promise<void> {
  const ch = await getChannel();
  await new Promise<void>((resolve, reject) => fn(ch, (err) => (err ? reject(err) : resolve())));
}

const JSON_PROPS = { persistent: true, contentType: 'application/json' } as const;

/** ส่ง JSON เข้าคิว (persistent · รอ confirm) เช่น send('rag.ingest', {docId}) */
export async function send(queue: string, payload: unknown, props: Options.Publish = {}): Promise<void> {
  await confirmed((ch, cb) => ch.sendToQueue(realName(queue), Buffer.from(JSON.stringify(payload)), { ...JSON_PROPS, ...props }, cb));
}

/** publish JSON ไป exchange (persistent · รอ confirm) เช่น publish('order.events', {type:'order.created', no}) */
export async function publish(exchange: string, payload: unknown, routingKey = '', props: Options.Publish = {}): Promise<void> {
  await confirmed((ch, cb) => ch.publish(realName(exchange), routingKey, Buffer.from(JSON.stringify(payload)), { ...JSON_PROPS, ...props }, cb));
}

export type QueueStats = { messageCount: number; consumerCount: number };

const STATS_TTL_MS = 500; // แชทพร้อมกันหลายร้อยคนไม่ต้องถาม broker ทุกครั้ง

async function checkQueue(queue: string): Promise<QueueStats | null> {
  try {
    await getChannel();
    // checkQueue คิวที่ไม่มีจะปิด channel → ใช้ channel ชั่วคราว ไม่ใช้ตัวกลาง
    const tmp = await state.conn!.createChannel();
    tmp.on('error', () => {});
    try {
      const r = await tmp.checkQueue(realName(queue));
      return { messageCount: r.messageCount, consumerCount: r.consumerCount };
    } finally {
      tmp.close().catch(() => {});
    }
  } catch {
    return null;
  }
}

/** สถิติคิว (cache 0.5 วิ) · null = ไม่รู้ (MQ ล่ม / ไม่มีคิว) */
export function queueStats(queue: string, fresh = false): Promise<QueueStats | null> {
  const key = realName(queue);
  const hit = state.stats.get(key);
  if (!fresh && hit && Date.now() - hit.at < STATS_TTL_MS) return hit.v;
  const v = checkQueue(queue);
  state.stats.set(key, { at: Date.now(), v });
  return v;
}

/** จำนวน consumer ของคิว (0 เมื่อไม่มีคิว / MQ ล่ม) */
export async function consumerCount(queue: string): Promise<number> {
  return (await queueStats(queue))?.consumerCount ?? 0;
}

/** จำนวนข้อความที่รออยู่ในคิว (ready · ไม่รวมที่ worker ถืออยู่) · null = ไม่รู้ */
export async function queueDepth(queue: string): Promise<number | null> {
  return (await queueStats(queue))?.messageCount ?? null;
}

export class RpcTimeoutError extends Error {
  constructor(public correlationId: string) {
    super('rpc_timeout');
  }
}
export class RpcAbortError extends Error {
  constructor() {
    super('aborted');
  }
}

export type RpcOptions = {
  /** ค่าเริ่มต้น 60 วิ */
  timeoutMs?: number;
  /** 0–5 (x-max-priority 5) */
  priority?: number;
  /** เรียกทุก reply ที่ correlation_id ตรง (status/delta/sentence/tts/done/…) */
  onMessage?: (msg: ReplyMessage) => void;
  /** reply ไหนจบการเรียก · ค่าเริ่มต้น: type ไม่ใช่ status/delta/sentence/tts */
  isFinal?: (msg: ReplyMessage) => boolean;
  /** ค่าเริ่มต้น uuid สุ่ม (แชทใช้ messageId) */
  correlationId?: string;
  /** ยกเลิก (เช่นผู้ใช้ปิด SSE) → reject RpcAbortError และเลิกฟัง (คำขอยังอยู่ในคิว) */
  signal?: AbortSignal;
  /** header เพิ่ม (เช่น x-retry) */
  headers?: Record<string, unknown>;
};

const STREAM_TYPES = new Set(['status', 'delta', 'sentence', 'tts']);
const defaultFinal = (m: ReplyMessage) => !STREAM_TYPES.has(String(m.type));

/**
 * RPC ผ่าน RabbitMQ: ส่ง payload เข้า queue (reply_to = instanceId · correlation_id = id · priority)
 * ส่งทุก reply ให้ onMessage แล้ว resolve ด้วย reply สุดท้าย
 * คำขอ persistent ค้างในคิวได้ขณะไม่มี consumer (จนกว่า timeout ฝั่ง web — ข้อความในคิวไม่หาย)
 */
export async function rpc(queue: string, payload: unknown, opts: RpcOptions = {}): Promise<ReplyMessage> {
  const id = opts.correlationId || randomUUID();
  const timeoutMs = opts.timeoutMs ?? 60_000;
  if (opts.signal?.aborted) throw new RpcAbortError();
  if (state.pending.has(id)) throw new Error(`rpc: correlationId ${id} ซ้ำ`);
  let fail: (e: Error) => void = () => {};
  const done = new Promise<ReplyMessage>((resolve, reject) => {
    fail = (e) => {
      const p = state.pending.get(id);
      if (p) clearTimeout(p.timer);
      state.pending.delete(id);
      reject(e);
    };
    const timer = setTimeout(() => fail(new RpcTimeoutError(id)), timeoutMs);
    state.pending.set(id, { onMessage: opts.onMessage, isFinal: opts.isFinal ?? defaultFinal, resolve, timer });
    opts.signal?.addEventListener('abort', () => fail(new RpcAbortError()), { once: true });
  });
  done.catch(() => {});
  try {
    await send(queue, payload, {
      replyTo: state.instanceId,
      correlationId: id,
      ...(opts.priority !== undefined ? { priority: opts.priority } : {}),
      ...(opts.headers ? { headers: opts.headers } : {}),
    });
  } catch (e) {
    fail(e instanceof Error ? e : new Error(String(e)));
  }
  return done;
}

/** ปิด connection (ใช้ใน test/สคริปต์) */
export async function close(): Promise<void> {
  const c = state.conn;
  state.ch = null;
  state.conn = null;
  state.pending.forEach((p) => clearTimeout(p.timer));
  state.pending.clear();
  state.stats.clear();
  if (c) await c.close().catch(() => {});
}
