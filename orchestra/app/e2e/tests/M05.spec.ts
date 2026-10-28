import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('M05 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const a0 = await askChat(page, "ได้เครดิตเมื่อไร");
  expect(a0.text).toMatch(/3/i);
  expect(a0.text).toMatch(/ออเดอร์/i);
  const a1 = await askChat(page, "ครบกำหนดนับยังไง");
  expect(a1.text).toMatch(/วันจัดส่ง/i);
  expect(a1.text).toMatch(/30/i);
  const a2 = await askChat(page, "ถ้าส่ง 1 พ.ย. ครบกำหนดวันไหน");
  expect(a2.text).toMatch(/2026-12-01/i);
  const a3 = await askChat(page, "โอนเข้าบัญชีอะไร");
  expect(a3.text).toMatch(/ธนาคารทดสอบ/i);
  expect(a3.text).toMatch(/000-0-00000-0/i);
  const a4 = await askChat(page, "ยังไม่โอนเริ่มผลิตได้ไหม");
  expect(a4.text).toMatch(/ไม่ได้|ต้อง.*รับเงิน|บันทึกรับเงิน/i);
  expect(await page.getByTestId('chat-msg-user').count()).toBe(5);
  expect(await page.getByTestId('chat-msg-bot').count()).toBe(5);

  await hold(page);
});
