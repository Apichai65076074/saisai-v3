import { describe, expect, it } from 'vitest';
import { ChatAudioQueue } from '../audioQueue';
import { readChatStream, type ChatEvent } from '../sse';

describe('stream decoder', () => {
  it('decodes Thai UTF-8 split in every byte, CRLF, comments, and final frame', async () => {
    const bytes = new TextEncoder().encode(': ping\r\n\r\ndata: {"type":"delta","text":"สวัสดีค่ะ"}\r\n\r\ndata: {"type":"done"}');
    const stream = new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(new Uint8Array([byte])); c.close(); } });
    const events: ChatEvent[] = [];
    await readChatStream(new Response(stream), (event) => events.push(event));
    expect(events).toEqual([{ type: 'delta', text: 'สวัสดีค่ะ' }, { type: 'done' }]);
  });
});

describe('audio queue', () => {
  it('plays 1,2,3 despite delivery order 2,1,3, and ignores duplicate replies', () => {
    const played: number[] = [];
    const q = new ChatAudioQueue(async (clip) => { played.push(clip.seq); }, () => {});
    const add = (seq: number) => q.add({ seq, audioId: String(seq), lang: 'th' });
    add(2); expect(played).toEqual([]);
    add(1); expect(played).toEqual([1]);
    add(3); add(1); add(2); expect(played).toEqual([1]);
    q.ended(); expect(played).toEqual([1, 2]);
    q.ended(); expect(played).toEqual([1, 2, 3]);
  });
  it('supports zero-based sentence announcements', () => {
    const played: number[] = [];
    const q = new ChatAudioQueue(async (clip) => { played.push(clip.seq); }, () => {});
    q.announce(0);
    q.add({ seq: 1, audioId: 'second', lang: 'en' });
    expect(played).toEqual([]);
    q.add({ seq: 0, audioId: 'first', lang: 'en' });
    q.ended(); expect(played).toEqual([0, 1]);
  });
  it('retries the same blocked clip before its successor', async () => {
    const played: number[] = [];
    let fail = true;
    let blocked = false;
    const q = new ChatAudioQueue(async (clip) => { if (fail) throw new Error('NotAllowedError'); played.push(clip.seq); }, () => { blocked = true; });
    q.add({ seq: 1, audioId: '1', lang: 'th' });
    q.add({ seq: 2, audioId: '2', lang: 'th' });
    await Promise.resolve(); expect(blocked).toBe(true);
    fail = false; q.retry(); expect(played).toEqual([1]);
    q.ended(); expect(played).toEqual([1, 2]);
  });
  it('does not leak pending clips or stale rejection into another answer', async () => {
    let reject!: () => void;
    let failures = 0;
    const q = new ChatAudioQueue(() => new Promise((_, bad) => { reject = () => bad(new Error('old')); }), () => { failures++; });
    q.add({ seq: 1, audioId: 'old', lang: 'th' });
    q.add({ seq: 2, audioId: 'old2', lang: 'th' });
    q.reset(); reject(); await Promise.resolve();
    expect(failures).toBe(0);
  });
});
