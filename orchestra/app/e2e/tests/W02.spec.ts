import { test, expect } from "@playwright/test";
import { reset, loginUI, typeSlow, hold } from "../lib/helpers";
test.beforeEach(async ({ request }) => {
  await reset(request);
});
test("W02 B-500 minimum locks logo through pickup steps", async ({ page }) => {
  await loginUI(page, "arun@saisai.test");
  await page.goto("/order?model=B-500&color=clear");
  await typeSlow(page.getByTestId("quantity-input"), "700");
  await expect(page.getByTestId("error-quantity")).toHaveText(
    "B-500 สั่งขั้นต่ำ 800 ใบ",
  );
  for (const name of ["step-logo", "step-address", "step-pickup"])
    await expect(page.getByTestId(name)).toHaveAttribute("disabled", "");
  for (const name of [
    "logo-checkbox",
    "address-select",
    "distance-input",
    "pickup-date-input",
  ])
    await expect(page.getByTestId(name)).toBeDisabled();
  await expect(page.getByTestId("order-confirm")).toBeDisabled();
  await hold(page);
});
