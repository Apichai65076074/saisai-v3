import { test, expect } from "@playwright/test";
import { reset, login, typeSlow, hold } from "../lib/helpers";
test.beforeEach(async ({ request }) => {
  await reset(request);
});
const W03 = {
  bottles: "52000.00",
  discount: "2600.00",
  logo: "8000.00",
  shipping: "1500.00",
  subtotal: "58900.00",
  vat: "4123.00",
  total: "63023.00",
};
test("W08 request quote from W03 order → QT-0001 with same money lines, valid 7 days", async ({
  page,
}) => {
  await login(page, "arun@saisai.test", {
    goto: "/order?model=B-250&color=clear",
  });
  await typeSlow(page.getByTestId("quantity-input"), "10000");
  await page.getByTestId("logo-checkbox").check();
  await page.getByTestId("address-select").selectOption("ADDR-01");
  await expect(page.getByTestId("line-total")).toHaveAttribute(
    "data-value",
    W03.total,
  );
  await expect(page.getByTestId("quote-request")).toBeEnabled();
  await page.getByTestId("quote-request").click();
  await page.waitForURL("**/quotes/QT-0001");
  await expect(page.getByTestId("quote-no")).toHaveText("QT-0001");
  for (const [key, value] of Object.entries(W03))
    await expect(page.getByTestId(`line-${key}`)).toHaveAttribute(
      "data-value",
      value,
    );
  await expect(page.getByTestId("line-shipping")).toHaveAttribute(
    "data-trips",
    "1",
  );
  await expect(page.getByTestId("line-total")).toHaveText("฿63,023.00");
  await expect(page.getByTestId("quote-valid-until")).toHaveAttribute(
    "data-value",
    "2026-10-18",
  );
  await expect(page.getByTestId("quote-expired")).toHaveCount(0);
  await expect(page.getByTestId("quote-convert")).toBeEnabled();
  await expect(page.getByTestId("quote-print")).toBeVisible();
  // พิมพ์: ซ่อน nav/แชท/ปุ่ม แต่หัวกระดาษ + บรรทัดเงินยังอยู่
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("header.nav")).toBeHidden();
  await expect(page.getByTestId("chat-open")).toBeHidden();
  await expect(page.getByTestId("quote-print")).toBeHidden();
  await expect(page.getByTestId("quote-bank")).toBeVisible();
  await expect(page.getByTestId("line-total")).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  // ปุ่มพิมพ์เรียก window.print()
  await page.evaluate(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => {
      (window as unknown as { __printed: number }).__printed++;
    };
  });
  await page.getByTestId("quote-print").click();
  expect(
    await page.evaluate(
      () => (window as unknown as { __printed: number }).__printed,
    ),
  ).toBe(1);
  // อยู่ในรายการ /quotes
  await page.goto("/quotes");
  await expect(page.getByTestId("quote-row")).toHaveCount(1);
  await expect(page.getByTestId("quote-row")).toHaveAttribute(
    "data-no",
    "QT-0001",
  );
  await page.goto("/quotes/QT-0001");
  await expect(page.getByTestId("quote-no")).toHaveText("QT-0001");
  await hold(page);
});
