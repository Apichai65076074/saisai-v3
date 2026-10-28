import { test, expect } from "@playwright/test";
import { reset, login, hold } from "../lib/helpers";
test.beforeEach(async ({ request }) => {
  await reset(request);
});
test("W12 old shipment cannot be claimed", async ({ page }) => {
  await login(page, "theera@saisai.test", { goto: "/orders/SO-0001" });
  await expect(page.getByTestId("claim-window-error")).toHaveText(
    "แจ้งเคลมได้ภายใน 7 วันนับจากวันจัดส่ง",
  );
  await expect(page.getByTestId("claim-form")).toHaveCount(0);
  await expect(page.getByTestId("claim-button")).toHaveCount(0);
  await page.goto("/orders/SO-0001/claim");
  await expect(page.getByTestId("claim-window-error")).toHaveText(
    "แจ้งเคลมได้ภายใน 7 วันนับจากวันจัดส่ง",
  );
  await expect(page.getByTestId("claim-form")).toHaveCount(0);
  await hold(page);
});
