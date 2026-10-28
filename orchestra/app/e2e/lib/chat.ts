// helper แชท (T04) ตาม testid _shared ข้อ 5: chat-open chat-panel chat-input chat-send chat-msg-bot (data-done) chat-status chat-cite
import { expect, type Page } from '@playwright/test';
import { typeSlow } from './helpers';

export type Cite = { filename: string; page: number };
export type BotAnswer = {
  text: string; // ข้อความบอท (ไม่รวมป้ายอ้างอิง/ปุ่ม)
  cites: Cite[];
  ms: number; // กดส่ง → data-done
  statusSeen: string[]; // ข้อความ chat-status ที่เห็นระหว่างรอ
  index: number; // ลำดับ bubble บอท
};

/** เปิดหน้าต่างแชท (ถ้ายังไม่เปิด) */
export async function openChat(page: Page): Promise<void> {
  const panel = page.getByTestId('chat-panel');
  if (!(await panel.isVisible().catch(() => false))) await page.getByTestId('chat-open').click();
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('chat-input')).toBeEditable({ timeout: 30_000 });
}

/** ข้อความ + cite ของ bubble บอทลำดับ index (ตัดลิงก์/ปุ่มออก) */
export async function botBubble(page: Page, index: number): Promise<{ text: string; cites: Cite[] }> {
  return page.getByTestId('chat-msg-bot').nth(index).evaluate((el) => {
    const c = el.cloneNode(true) as HTMLElement;
    c.querySelectorAll('a,button,audio,[data-testid="chat-cite"]').forEach((n) => n.remove());
    const cites = Array.from(el.querySelectorAll('[data-testid="chat-cite"]')).map((a) => ({
      filename: a.getAttribute('data-filename') || '',
      page: Number(a.getAttribute('data-page')),
    }));
    return { text: (c.textContent || '').trim(), cites };
  });
}

/** พิมพ์คำถามทีละตัว → ส่ง → รอ bubble บอทใหม่ data-done="true" → คืนข้อความบอทล่าสุด */
export async function askChat(page: Page, text: string, opts: { timeout?: number; delay?: number } = {}): Promise<BotAnswer> {
  await openChat(page);
  const bots = page.getByTestId('chat-msg-bot');
  const n = await bots.count();
  await typeSlow(page.getByTestId('chat-input'), text, opts.delay ?? 60);
  const t0 = Date.now();
  await page.getByTestId('chat-send').click();
  const statusSeen: string[] = [];
  const status = page.getByTestId('chat-status');
  let done = false;
  const poll = (async () => {
    while (!done) {
      const s = await status.textContent({ timeout: 200 }).catch(() => null);
      if (s && !statusSeen.includes(s.trim())) statusSeen.push(s.trim());
      await page.waitForTimeout(150);
    }
  })();
  try {
    await expect(bots.nth(n)).toHaveAttribute('data-done', 'true', { timeout: opts.timeout ?? 100_000 });
  } finally {
    done = true;
    await poll.catch(() => undefined);
  }
  const ms = Date.now() - t0;
  return { ...(await botBubble(page, n)), ms, statusSeen, index: n };
}

/** หาเลขเงินในข้อความ (ตรวจยืดหยุ่นโหมด ai): '63,023.00' เจอใน '…รวม ฿63,023.00 ค่ะ' · รับทั้งมี/ไม่มี comma */
export function hasAmount(text: string, amount: string): boolean {
  const plain = amount.replace(/,/g, '');
  const norm = text.replace(/(\d),(?=\d{3})/g, '$1');
  return norm.includes(plain) || (plain.endsWith('.00') && new RegExp(`(^|[^\\d.])${plain.slice(0, -3)}(?![\\d.]|\\.\\d)`).test(norm));
}
