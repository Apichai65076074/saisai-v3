// ตัวช่วย integration test (T10) · ต้องมี AMQP_URL + MQ_PREFIX (+ BASE_URL สำหรับ API · MQ_API สำหรับ HTTP API ของ RabbitMQ)
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(here, '../../../..');
export const PREFIX = process.env.MQ_PREFIX || '';
export const MQ_API = process.env.MQ_API || 'http://localhost:15672';
// ⚠️ vitest/vite ตั้ง process.env.BASE_URL='/' เอง → ใช้ WEB_URL
export const BASE_URL = process.env.WEB_URL || '';
/** integration รันเมื่อมี MQ_PREFIX (กันชนคิวจริงที่ไม่มี prefix) */
export const HAS_MQ = !!process.env.AMQP_URL && !!PREFIX;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** เปิด echo stub (workers/_stub/echo-chat.mjs) · รอจนพิมพ์ว่า consuming */
export async function startEcho(id = 'echo-test', env: Record<string, string> = {}): Promise<ChildProcess> {
  const p = spawn(process.execPath, [path.join(REPO, 'workers/_stub/echo-chat.mjs')], {
    env: { ...process.env, ECHO_ID: id, ECHO_DELAY_MS: '5', ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('echo stub ไม่เริ่ม')), 15_000);
    p.stdout!.on('data', (b: Buffer) => {
      if (b.toString().includes('consuming')) {
        clearTimeout(t);
        resolve();
      }
    });
    p.on('exit', (c) => reject(new Error(`echo exit ${c}`)));
  });
  return p;
}

export async function stopEcho(p: ChildProcess | null | undefined): Promise<void> {
  if (!p || p.exitCode !== null) return;
  const gone = new Promise((r) => p.once('exit', r));
  p.kill('SIGTERM');
  await gone;
}

/** GET HTTP API ของ RabbitMQ */
export async function mqApi<T = any>(p: string): Promise<T> {
  const r = await fetch(MQ_API + p, { headers: { authorization: 'Basic ' + Buffer.from('guest:guest').toString('base64') } });
  if (!r.ok) throw new Error(`MQ API ${p} → ${r.status}`);
  return r.json() as Promise<T>;
}

export async function queueInfo(name: string) {
  return mqApi(`/api/queues/%2F/${encodeURIComponent(PREFIX + name)}`);
}

/** อ่าน SSE จาก fetch Response → array ของ event (เรียก onEvent ระหว่างทาง) */
export async function readSse(res: Response, onEvent?: (e: any) => void): Promise<any[]> {
  const out: any[] = [];
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const e = JSON.parse(line.slice(6));
        out.push(e);
        onEvent?.(e);
      }
    }
  }
  return out;
}

/** cookie jar เล็ก ๆ */
export class Jar {
  private c = new Map<string, string>();
  header(): string {
    return [...this.c].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  take(res: Response) {
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [kv] = sc.split(';');
      const j = kv.indexOf('=');
      this.c.set(kv.slice(0, j).trim(), kv.slice(j + 1).trim());
    }
  }
  async fetch(p: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.c.size) headers.set('cookie', this.header());
    const res = await fetch(BASE_URL + p, { ...init, headers, redirect: 'manual' });
    this.take(res);
    return res;
  }
}

export function chatPost(jar: Jar, body: unknown, headers: Record<string, string> = {}) {
  return jar.fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
