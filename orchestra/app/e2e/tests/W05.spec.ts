import { test, expect } from "@playwright/test";
import { reset, login, typeSlow, hold } from "../lib/helpers";
test.beforeEach(async ({ request }) => {
  await reset(request);
});
test("W05 upsell warns about lower subtotal at next discount tier", async ({
  page,
  request,
}) => {
  await login(page, "arun@saisai.test", {
    goto: "/order?model=B-100&color=clear",
  });
  await typeSlow(page.getByTestId("quantity-input"), "9600");
  await page.getByTestId("address-select").selectOption("ADDR-02");
  await expect(page.getByTestId("upsell-warning")).toHaveText(
    "ถ้าสั่ง 10,000 ใบ จะได้ลด 5% จ่ายน้อยลง ฿320.00 (ก่อน VAT)",
  );
  await hold(page, 3000);
  await reset(request, "2026-11-01T10:00:00+07:00");
  await page.goto("/order?model=B-250&color=clear");
  await typeSlow(page.getByTestId("quantity-input"), "4900");
  await page.getByTestId("address-select").selectOption("ADDR-02");
  await expect(page.getByTestId("upsell-warning")).toHaveText(
    "ถ้าสั่ง 5,000 ใบ จะได้ลด 3% จ่ายน้อยลง ฿260.00 (ก่อน VAT)",
  );
  await hold(page);
});
