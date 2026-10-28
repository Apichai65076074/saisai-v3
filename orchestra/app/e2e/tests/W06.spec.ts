import { test, expect } from "@playwright/test";
import { reset, login, typeSlow, hold } from "../lib/helpers";
test.beforeEach(async ({ request }) => {
  await reset(request);
});
test("W06 shipping boundary and sales-only distance", async ({ page }) => {
  await login(page, "arun@saisai.test", {
    goto: "/order?model=B-500&color=clear",
  });
  await typeSlow(page.getByTestId("quantity-input"), "25000");
  await page.getByTestId("address-select").selectOption("");
  for (const [distance, amount] of [
    ["50", "0.00"],
    ["51", "3000.00"],
  ]) {
    await typeSlow(page.getByTestId("distance-input"), distance);
    await expect(page.getByTestId("line-shipping")).toHaveAttribute(
      "data-value",
      amount,
    );
    await expect(page.getByTestId("line-shipping")).toHaveAttribute(
      "data-trips",
      "2",
    );
  }
  await typeSlow(page.getByTestId("distance-input"), "301");
  await expect(page.getByTestId("error-distance")).toHaveAttribute(
    "data-code",
    "DISTANCE_TOO_FAR",
  );
  await expect(page.getByTestId("sales-contact")).toContainText("02-000-0000");
  await expect(page.getByTestId("sales-contact")).toContainText("@saisai-test");
  await expect(page.getByTestId("quote-request")).toBeDisabled();
  await expect(page.getByTestId("order-confirm")).toBeDisabled();
  await hold(page);
});
