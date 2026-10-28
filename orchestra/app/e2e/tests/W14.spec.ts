import { test, expect, type Page } from "@playwright/test";
import { reset, login, typeSlow, hold, waitReady } from "../lib/helpers";
test.beforeEach(async ({ request }) => {
  await reset(request);
});

/** รูปเคลม 1×1 PNG (ตรวจด้วย magic bytes ฝั่ง server) */
const PHOTO = {
  name: "crack.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ),
};

/** สั่ง B-250 ใส 10,000 ขวด (ตัวเลขเดียวกับ W03) แล้วรอให้บรรทัดเงินคำนวณเสร็จ */
async function fillW03(customer: Page) {
  await customer.goto("/order?model=B-250&color=clear");
  await waitReady(customer);
  await typeSlow(customer.getByTestId("quantity-input"), "10000");
  await customer.getByTestId("logo-checkbox").check();
  await customer.getByTestId("address-select").selectOption("ADDR-01");
  await expect(customer.getByTestId("line-total")).toHaveAttribute("data-value", "63023.00");
}

/** notify-item ชนิด/เลขนั้นต้องโผล่ในหน้า staff ภายใน 5 วิ นับจากเอกสารถูกสร้าง */
async function expectNotified(staff: Page, type: string, no: string, since: number) {
  const item = staff.locator(`[data-testid="notify-item"][data-type="${type}"]`, { hasText: no });
  await expect(item).toBeVisible({ timeout: Math.max(0, 5000 - (Date.now() - since)) });
  expect(Date.now() - since, `${type} ${no} ภายใน 5 วิ`).toBeLessThanOrEqual(5000);
}

test("W14 back office receives order, quote and claim notifications within 5 seconds", async ({
  page,
  browser,
}, testInfo) => {
  // หน้าจอหลัก (วิดีโอ) = พนักงานเปิด /staff/orders ค้างไว้ · notify-box poll ทุก 2 วิ
  await login(page, "somsri@saisai.test", { goto: "/staff/orders" });
  const box = page.getByTestId("notify-box");
  await expect(box).toBeVisible();
  await expect(box.getByTestId("notify-item")).toHaveCount(0);

  // ลูกค้าอีก browser context (มีวิดีโอของตัวเองใน output ของเคส)
  const ctx = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: testInfo.outputPath("customer-video"), size: { width: 1280, height: 800 } },
  });
  const customer = await ctx.newPage();
  await login(customer, "arun@saisai.test");

  // 1) สั่งออเดอร์ใหม่ → order.created
  await fillW03(customer);
  await customer.getByTestId("pickup-date-input").fill("2026-10-26");
  await expect(customer.getByTestId("order-confirm")).toBeEnabled();
  await customer.getByTestId("order-confirm").click();
  await expect(customer.getByTestId("order-no")).toHaveText("SO-0019");
  await expectNotified(page, "order.created", "SO-0019", Date.now());

  // 2) ออกใบเสนอราคา → quote.created
  await fillW03(customer);
  await customer.getByTestId("quote-request").click();
  await customer.waitForURL("**/quotes/QT-0001");
  await expect(customer.getByTestId("quote-no")).toHaveText("QT-0001");
  await expectNotified(page, "quote.created", "QT-0001", Date.now());

  // 3) แจ้งเคลม SO-0007 (ส่งของ 2026-10-05 · ยังอยู่ใน 7 วัน) → claim.created
  await customer.goto("/orders/SO-0007/claim");
  await waitReady(customer);
  await typeSlow(customer.getByTestId("lot-input"), "LOT-202610");
  await typeSlow(customer.getByTestId("claim-quantity-input"), "120");
  await typeSlow(customer.getByTestId("claim-description-input"), "ขวดร้าวบริเวณคอขวด");
  await customer.getByTestId("photo-input").setInputFiles(PHOTO);
  await expect(customer.getByTestId("photo-list")).toHaveAttribute("data-count", "1");
  await customer.getByTestId("submit-claim").click();
  await expect(customer.getByTestId("claim-no")).toHaveText("CL-0005");
  await expectNotified(page, "claim.created", "CL-0005", Date.now());

  await ctx.close();
  await expect(box.getByTestId("notify-item")).toHaveCount(3);
  // ลิงก์จากกล่องแจ้งเตือนพาไปหน้ารายละเอียดหลังร้าน
  await box.locator('[data-testid="notify-item"][data-type="order.created"] a').click();
  await page.waitForURL("**/staff/orders/SO-0019");
  await expect(page.getByTestId("staff-order-detail")).toBeVisible();
  await expect(page.getByTestId("notify-box")).toBeVisible();
  await hold(page);
});

test("W14 owner adds and removes a factory holiday and earliest pickup follows", async ({ page }) => {
  await login(page, "arun@saisai.test", { goto: "/order" });
  await expect(page.getByTestId("earliest-pickup")).toHaveAttribute("data-value", "2026-10-25");

  await login(page, "wichai@saisai.test", { goto: "/owner/holidays" });
  await waitReady(page);
  await expect(page.getByTestId("notify-box")).toBeVisible();
  await page.getByTestId("holiday-date").fill("2026-10-25");
  await typeSlow(page.getByTestId("holiday-name-th"), "วันหยุดพิเศษ");
  await typeSlow(page.getByTestId("holiday-name-en"), "Special holiday");
  await page.getByTestId("holiday-add").click();
  await expect(page.getByTestId("holiday-row-2026-10-25")).toBeVisible();
  await expect(page.getByTestId("holiday-error")).toHaveCount(0);

  await login(page, "arun@saisai.test", { goto: "/order" });
  await expect(page.getByTestId("earliest-pickup")).toHaveAttribute("data-value", "2026-10-26");

  await login(page, "wichai@saisai.test", { goto: "/owner/holidays" });
  await waitReady(page);
  await page.getByTestId("holiday-delete-2026-10-25").click();
  await expect(page.getByTestId("holiday-row-2026-10-25")).toHaveCount(0);

  await login(page, "arun@saisai.test", { goto: "/order" });
  await expect(page.getByTestId("earliest-pickup")).toHaveAttribute("data-value", "2026-10-25");
  await hold(page);
});
