import { test, expect } from "@playwright/test";
import { reset, login, hold } from "../lib/helpers";
test.beforeEach(async ({ request }) => {
  await reset(request);
});
test("W13 another company order is indistinguishable from a missing order", async ({
  page,
}) => {
  await login(page, "arun@saisai.test");
  const response = await page.goto("/orders/SO-0001");
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId("not-found-message")).toHaveText(
    "ไม่พบออเดอร์นี้",
  );
  await expect(page.getByTestId("order-detail")).toHaveCount(0);
  const denied = await page.request.get("/api/orders/SO-0001");
  expect(denied.status()).toBe(404);
  expect((await denied.json()).errors[0].message).toBe("ไม่พบออเดอร์นี้");
  const missing = await page.request.get("/api/orders/SO-9999");
  expect(await missing.json()).toEqual(await denied.json());
  await hold(page);
});
