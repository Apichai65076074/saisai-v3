import { test, expect } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import { reset, login, hold, typeSlow, waitReady } from '../lib/helpers';
import { openChat } from '../lib/chat';
import { MQ_API, CHROME, MEDIA_ARGS, NO_WEBGL_ARGS } from '../lib/env';

// Q01 measures chat concurrency on the supported static fallback; D01–D03 cover 3D.
test.use({ launchOptions: { executablePath: CHROME, args: [...MEDIA_ARGS, ...NO_WEBGL_ARGS] } });

test.beforeEach(async ({ request }) => { await reset(request); });

test('Q01 20 concurrent chat windows finish without errors with two consumers', async ({ browser, request, baseURL }, testInfo) => {
  test.setTimeout(600_000);
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];
  const accounts = ['arun', 'theera', 'kenji', 'mali', 'napa'];
  const queueName = `${process.env.MQ_PREFIX || ''}chat.request`;
  const consumers = async () => {
    const r = await request.get(`${MQ_API}/api/queues`, {
      headers: { authorization: `Basic ${Buffer.from(`${process.env.MQ_USER || 'guest'}:${process.env.MQ_PASSWORD || 'guest'}`).toString('base64')}` },
    });
    expect(r.ok(), 'RabbitMQ management must be observable').toBe(true);
    const queues = await r.json();
    const q = queues.find((q: { name: string; vhost: string }) => q.name === queueName && q.vhost === (process.env.MQ_VHOST || '/'));
    expect(q, `${queueName} must exist`).toBeTruthy();
    expect(q.consumers).toBe(2);
  };
  await consumers();
  try {
    const pages = [];
    for (let i = 0; i < 20; i++) {
      const context = await browser.newContext({ baseURL, viewport: { width: 1000, height: 760 }, locale: 'th-TH', reducedMotion: 'reduce', timezoneId: 'Asia/Bangkok', recordVideo: { dir: testInfo.outputPath(`window-${i + 1}`), size: { width: 480, height: 360 } } });
      contexts.push(context);
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(`window ${i + 1}: ${e.message}`));
      page.on('response', response => {
        if (new URL(response.url()).pathname === '/api/chat' && response.status() >= 400) errors.push(`window ${i + 1}: HTTP ${response.status()}`);
      });
      await login(page, `${accounts[i % accounts.length]}@saisai.test`);
      await page.goto('/orders', { waitUntil: 'domcontentloaded' });
      await waitReady(page);
      await openChat(page);
      await typeSlow(page.getByTestId('chat-input'), 'B-500 ขั้นต่ำกี่ใบ');
      pages.push(page);
    }
    // All twenty independent sessions are ready before the concurrent send.
    const sessionIds = await Promise.all(contexts.map(async c => (await c.cookies()).find(x => x.name === 'ss_chat')?.value));
    expect(sessionIds.every(Boolean)).toBe(true);
    expect(new Set(sessionIds).size).toBe(20);
    const replies = await Promise.all(pages.map(async (page, i) => {
      const responsePromise = page.waitForResponse(r => new URL(r.url()).pathname === '/api/chat' && r.request().method() === 'POST');
      await page.getByTestId('chat-send').click();
      const response = await responsePromise;
      expect(response.status(), `window ${i + 1}`).toBe(200);
      const bodyPromise = response.text();
      const bot = page.getByTestId('chat-msg-bot').last();
      await expect(bot).toHaveAttribute('data-done', 'true', { timeout: 110_000 });
      await expect(bot).toContainText('800');
      await expect(page.getByTestId('chat-msg-user')).toHaveCount(1);
      const body = await bodyPromise;
      const events = body.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => JSON.parse(l.slice(5)));
      expect(events.filter(e => e.type === 'error'), `window ${i + 1} SSE errors`).toEqual([]);
      expect(events.filter(e => e.type === 'done'), `window ${i + 1} done count`).toHaveLength(1);
      return { window: i + 1, messageId: response.headers()['x-message-id'] };
    }));
    expect(replies).toHaveLength(20);
    expect(new Set(replies.map(r => r.messageId)).size).toBe(20);
    expect(replies.every(r => r.messageId)).toBe(true);
    expect(errors).toEqual([]);
    await consumers();
    await testInfo.attach('Q01-replies', { body: JSON.stringify(replies, null, 2), contentType: 'application/json' });
    await Promise.all(pages.map(page => hold(page)));
  } finally {
    await testInfo.attach('Q01-browser-errors', { body: JSON.stringify(errors), contentType: 'application/json' });
    await Promise.all(contexts.map(c => c.close()));
  }
});
