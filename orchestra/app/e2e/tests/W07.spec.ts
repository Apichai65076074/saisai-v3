import { test, expect } from "@playwright/test";
import { reset, login, hold } from "../lib/helpers";
test.beforeEach(async ({ request }) => {
  await reset(request);
});
test("W07 pickup lead time and factory holiday are validated", async ({
  page,
}) => {
  await login(page, "arun@saisai.test", { goto: "/order" });
  await expect(page.getByTestId("earliest-pickup")).toHaveAttribute(
    "data-value",
    "2026-10-25",
  );
  await page.getByTestId("pickup-date-input").fill("2026-10-24");
  await expect(page.getByTestId("error-pickup")).toHaveAttribute(
    "data-code",
    "PICKUP_TOO_SOON",
  );
  await expect(page.getByTestId("order-confirm")).toBeDisabled();
  await page.getByTestId("pickup-date-input").fill("2026-12-05");
  await expect(page.getByTestId("error-pickup")).toHaveAttribute(
    "data-code",
    "FACTORY_CLOSED",
  );
  await expect(page.getByTestId("error-pickup")).toContainText(
    "วันพ่อแห่งชาติ",
  );
  await expect(page.getByTestId("order-confirm")).toBeDisabled();
  await hold(page);
});
