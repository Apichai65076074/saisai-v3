// SaiSai v3 · RabbitMQ topology (T10) — แหล่งเดียวของชื่อ + option ทุกคิว/exchange
// ทุกฝั่ง (web + ทุก worker) ต้องประกาศผ่าน assertTopology() เท่านั้น เพื่อให้ argument ตรงกันเป๊ะ
// (RabbitMQ ปฏิเสธการประกาศซ้ำที่ argument ต่างกัน → PRECONDITION_FAILED ปิด channel)
// ชื่อจริง = `${MQ_PREFIX}` + ชื่อ (compose: '' · dev test: 'T10_' ฯลฯ) · ESM ไม่มี dependency (ใช้ได้ทั้ง Next และ node ตรง)

/** prefix จาก env MQ_PREFIX ('' ถ้าไม่ตั้ง) */
export function mqPrefix() {
  return (typeof process !== 'undefined' && process.env && process.env.MQ_PREFIX) || '';
}

/** ชื่อเชิงตรรกะ (ไม่มี prefix) */
export const Q = Object.freeze({
  chatRequest: 'chat.request', // queue · priority 5 · DLX → chat.dlq
  chatDlq: 'chat.dlq', // queue
  ttsRequest: 'tts.request', // queue · {messageId, seq, text, lang}
  sttRequest: 'stt.request', // queue · {audioB64, mime, lang?}
  ragIngest: 'rag.ingest', // queue · {docId}
  notifyEvents: 'notify.events', // queue ผูก order.events (notify-worker)
});
export const X = Object.freeze({
  chatReply: 'chat.reply', // exchange direct · routing key = reply_to (instanceId ของ web)
  orderEvents: 'order.events', // exchange fanout · {type:'order.created'|'claim.created'|'quote.created', no}
});

/** ชื่อจริง (มี prefix) ของทุกคิว/exchange */
export function names(prefix = mqPrefix()) {
  return {
    chatRequest: prefix + Q.chatRequest,
    chatDlq: prefix + Q.chatDlq,
    ttsRequest: prefix + Q.ttsRequest,
    sttRequest: prefix + Q.sttRequest,
    ragIngest: prefix + Q.ragIngest,
    notifyEvents: prefix + Q.notifyEvents,
    chatReply: prefix + X.chatReply,
    orderEvents: prefix + X.orderEvents,
  };
}

/** ชื่อเชิงตรรกะ → ชื่อจริง (ชื่อที่มี prefix อยู่แล้วผ่านไปเลย) */
export function realName(name, prefix = mqPrefix()) {
  return !prefix || name.startsWith(prefix) ? name : prefix + name;
}

/** x-max-priority ของ chat.request */
export const MAX_PRIORITY = 5;
/** priority ของ chat.request: รอบเสียง 3 · ข้อความ 1 · eval/load 0 */
export const PRIORITY = Object.freeze({ voice: 3, text: 1, eval: 0 });
/** ล้มได้กี่ครั้งก่อนลง chat.dlq (นับใน header x-retry) · ครั้งที่ MAX_RETRY+1 ล้ม → nack ไม่ requeue → DLQ */
export const MAX_RETRY = 2;
export const RETRY_HEADER = 'x-retry';

/** prefetch ต่อ worker (env หรือค่าเริ่มต้นตาม PROBLEM 4.2) */
export function prefetch(kind) {
  const env = (typeof process !== 'undefined' && process.env) || {};
  const pick = (v, d) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : d;
  };
  switch (kind) {
    case 'chat': return pick(env.CHAT_PREFETCH, 4);
    case 'stt': return pick(env.STT_PREFETCH, 4);
    case 'tts': return pick(env.TTS_PREFETCH, 2);
    case 'rag': return 1;
    default: return 1;
  }
}

/** option ของทุกคิว (ตรงกับที่ assertTopology ใช้) · key = ชื่อจริง */
export function queueOptions(prefix = mqPrefix()) {
  const n = names(prefix);
  return {
    [n.chatRequest]: {
      durable: true,
      arguments: {
        'x-max-priority': MAX_PRIORITY,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': n.chatDlq,
      },
    },
    [n.chatDlq]: { durable: true },
    [n.ttsRequest]: { durable: true },
    [n.sttRequest]: { durable: true },
    [n.ragIngest]: { durable: true },
    [n.notifyEvents]: { durable: true },
  };
}

/** exchange ทั้งหมด · key = ชื่อจริง */
export function exchangeOptions(prefix = mqPrefix()) {
  const n = names(prefix);
  return {
    [n.chatReply]: { type: 'direct', options: { durable: true } },
    [n.orderEvents]: { type: 'fanout', options: { durable: true } },
  };
}

/**
 * ประกาศ exchange + คิว + binding ทั้งหมด (idempotent) · ใช้กับ Channel หรือ ConfirmChannel ของ amqplib
 * @returns ชื่อจริงทั้งหมด (names(prefix))
 */
export async function assertTopology(channel, prefix = mqPrefix()) {
  const n = names(prefix);
  for (const [x, { type, options }] of Object.entries(exchangeOptions(prefix))) {
    await channel.assertExchange(x, type, options);
  }
  for (const [q, opts] of Object.entries(queueOptions(prefix))) {
    await channel.assertQueue(q, opts);
  }
  await channel.bindQueue(n.notifyEvents, n.orderEvents, '');
  return n;
}

/** จำนวนครั้งที่ล้มมาแล้วของข้อความ (header x-retry) */
export function retryCount(msg) {
  const v = Number(msg && msg.properties && msg.properties.headers && msg.properties.headers[RETRY_HEADER]);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * ทำงานล้ม: ยังไม่ครบ MAX_RETRY → ส่งข้อความเดิมกลับเข้าคิวเดิม (header x-retry+1 · property เดิม) แล้ว ack
 * ครบแล้ว → nack ไม่ requeue → DLX ส่งไป chat.dlq (คิวอื่นที่ไม่มี DLX = ทิ้ง)
 * @returns {'retry'|'dead'}
 */
export function retryOrDead(channel, msg, maxRetry = MAX_RETRY) {
  const n = retryCount(msg);
  if (n >= maxRetry) {
    channel.nack(msg, false, false);
    return 'dead';
  }
  const p = msg.properties || {};
  const props = {
    persistent: true,
    contentType: p.contentType,
    replyTo: p.replyTo,
    correlationId: p.correlationId,
    priority: p.priority,
    messageId: p.messageId,
    headers: { ...(p.headers || {}), [RETRY_HEADER]: n + 1 },
  };
  for (const k of Object.keys(props)) if (props[k] === undefined) delete props[k];
  channel.sendToQueue(msg.fields.routingKey, msg.content, props);
  channel.ack(msg);
  return 'retry';
}

/** ส่ง reply (JSON) ไปที่ chat.reply ด้วย routing key = reply_to ของคำขอ · correlation_id เดิม */
export function reply(channel, msg, payload, prefix = mqPrefix()) {
  const p = (msg && msg.properties) || {};
  if (!p.replyTo) return false;
  return channel.publish(names(prefix).chatReply, p.replyTo, Buffer.from(JSON.stringify(payload)), {
    correlationId: p.correlationId,
    contentType: 'application/json',
  });
}
