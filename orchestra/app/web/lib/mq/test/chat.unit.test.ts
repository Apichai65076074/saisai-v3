// unit (T10): ตรรกะ /api/chat ไม่ต้องมี infra · cd web && npx vitest run lib/mq/test
import { describe, expect, it } from 'vitest';
import { backpressure, buildChatRequest, chatPriority, parseChatBody, replyTracker, TEXT } from '../chat';
import { MAX_PRIORITY, MAX_RETRY, names, queueOptions, retryCount } from '../../../../shared/mq-topology.mjs';

describe('T10 chat logic', () => {
  it('companyId/userId จาก session เท่านั้น · body ปลอมถูกละ', () => {
    const body = parseChatBody({ text: ' ราคา B-250 ', companyId: 99, userId: 99, sessionId: 'evil', via: 'voice', tts: true });
    if ('error' in body) throw new Error('parse');
    expect(body).toEqual({ text: 'ราคา B-250', via: 'voice', tts: true });
    const anon = buildChatRequest({ sessionId: 's1', messageId: 'm1', body, session: null, lang: 'th', tts: true });
    expect(anon).not.toHaveProperty('companyId');
    expect(anon).not.toHaveProperty('userId');
    const cust = buildChatRequest({ sessionId: 's1', messageId: 'm1', body, session: { userId: 1, companyId: 1 }, tts: false });
    expect(cust).toMatchObject({ userId: 1, companyId: 1, sessionId: 's1', messageId: 'm1', via: 'voice', tts: false });
    const staff = buildChatRequest({ sessionId: 's', messageId: 'm', body, session: { userId: 7, companyId: null }, tts: false });
    expect(staff.userId).toBe(7);
    expect(staff).not.toHaveProperty('companyId');
  });

  it('ตรวจ body', () => {
    expect(parseChatBody({})).toEqual({ error: 'TEXT_REQUIRED' });
    expect(parseChatBody({ text: '   ' })).toEqual({ error: 'TEXT_REQUIRED' });
    expect(parseChatBody({ text: 'x'.repeat(2001) })).toEqual({ error: 'TEXT_TOO_LONG' });
    expect(parseChatBody({ text: 'hi', lang: 'en', tts: 'yes' })).toEqual({ text: 'hi', lang: 'en', via: 'text', tts: false });
  });

  it('priority: voice 3 · text 1 · eval 0', () => {
    expect(chatPriority('voice', false)).toBe(3);
    expect(chatPriority('text', false)).toBe(1);
    expect(chatPriority('voice', true)).toBe(0);
  });

  it('backpressure 2× / 4× / 8× ความจุ', () => {
    // 2 consumer × prefetch 4 = 8
    expect(backpressure(0, 2, 4)).toMatchObject({ level: 'ok', status: TEXT.thinking, capacity: 8 });
    expect(backpressure(16, 2, 4).level).toBe('ok');
    expect(backpressure(17, 2, 4)).toMatchObject({ level: 'queue', status: 'รอคิว ลำดับที่ 18', position: 18 });
    expect(backpressure(33, 2, 4).level).toBe('no-tts');
    expect(backpressure(64, 2, 4).level).toBe('no-tts');
    expect(backpressure(65, 2, 4).level).toBe('busy');
    // ไม่มี consumer → รอคิว… (ยังรับเข้าคิว · Q02)
    expect(backpressure(0, 0, 4)).toMatchObject({ level: 'ok', status: 'รอคิว…' });
    expect(backpressure(null, 0, 4).level).toBe('ok');
  });

  it('replyTracker: จบเมื่อ done + tts ครบทุก sentence', () => {
    const t = replyTracker(true);
    expect(t.isFinal({ type: 'sentence', seq: 0 })).toBe(false);
    expect(t.isFinal({ type: 'sentence', seq: 1 })).toBe(false);
    expect(t.isFinal({ type: 'tts', seq: 0 })).toBe(false);
    expect(t.isFinal({ type: 'done' })).toBe(false);
    expect(t.pendingTts()).toEqual([1]);
    expect(t.isFinal({ type: 'tts', seq: 1 })).toBe(true);
    const plain = replyTracker(false);
    plain.isFinal({ type: 'sentence', seq: 0 });
    expect(plain.isFinal({ type: 'done' })).toBe(true);
    expect(replyTracker(true).isFinal({ type: 'error' })).toBe(true);
  });

  it('topology: chat.request priority 5 + DLX → chat.dlq · retry 2', () => {
    const n = names('T10_');
    expect(n.chatRequest).toBe('T10_chat.request');
    expect(queueOptions('T10_')[n.chatRequest].arguments).toEqual({
      'x-max-priority': MAX_PRIORITY, 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': 'T10_chat.dlq',
    });
    expect(MAX_RETRY).toBe(2);
    expect(retryCount({ content: Buffer.from(''), fields: { routingKey: '' }, properties: { headers: { 'x-retry': 2 } } })).toBe(2);
    expect(retryCount({ content: Buffer.from(''), fields: { routingKey: '' }, properties: {} })).toBe(0);
  });
});
