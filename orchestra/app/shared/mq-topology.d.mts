// ชนิดของ shared/mq-topology.mjs (T10) สำหรับ web (TS strict)
export type Names = {
  chatRequest: string; chatDlq: string; ttsRequest: string; sttRequest: string; ragIngest: string;
  notifyEvents: string; chatReply: string; orderEvents: string;
};
type AnyChannel = {
  assertExchange(name: string, type: string, opts?: object): Promise<unknown>;
  assertQueue(name: string, opts?: object): Promise<unknown>;
  bindQueue(q: string, x: string, key: string): Promise<unknown>;
};
type AnyMsg = { content: Buffer; fields: { routingKey: string }; properties: { headers?: Record<string, unknown>; replyTo?: string; correlationId?: string; [k: string]: unknown } };
export function mqPrefix(): string;
export const Q: Readonly<{ chatRequest: 'chat.request'; chatDlq: 'chat.dlq'; ttsRequest: 'tts.request'; sttRequest: 'stt.request'; ragIngest: 'rag.ingest'; notifyEvents: 'notify.events' }>;
export const X: Readonly<{ chatReply: 'chat.reply'; orderEvents: 'order.events' }>;
export function names(prefix?: string): Names;
export function realName(name: string, prefix?: string): string;
export const MAX_PRIORITY: 5;
export const PRIORITY: Readonly<{ voice: 3; text: 1; eval: 0 }>;
export const MAX_RETRY: 2;
export const RETRY_HEADER: 'x-retry';
export function prefetch(kind: 'chat' | 'stt' | 'tts' | 'rag'): number;
export function queueOptions(prefix?: string): Record<string, { durable: boolean; arguments?: Record<string, unknown> }>;
export function exchangeOptions(prefix?: string): Record<string, { type: 'direct' | 'fanout'; options: { durable: boolean } }>;
export function assertTopology(channel: AnyChannel, prefix?: string): Promise<Names>;
export function retryCount(msg: AnyMsg): number;
export function retryOrDead(channel: unknown, msg: AnyMsg, maxRetry?: number): 'retry' | 'dead';
export function reply(channel: unknown, msg: AnyMsg, payload: unknown, prefix?: string): boolean;
