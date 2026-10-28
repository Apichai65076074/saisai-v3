import { test, expect } from "@playwright/test";
import { reset, login, typeSlow, hold } from "../lib/helpers";
test.beforeEach(async ({ request }) => {
  await reset(request);
});
test("W04 discount table changes on November first", async ({
  page,
  request,
}) => {
  await login(page, "arun@saisai.test", {
    goto: "/order?model=B-100&color=clear",
  });
  await typeSlow(page.getByTestId("quantity-input"), "30000");
  await page.getByTestId("address-select").selectOption("ADDR-02");
  await expect(page.getByTestId("line-discount")).toHaveAttribute(
    "data-value",
    "4800.00",
  );
  await expect(page.getByTestId("line-shipping")).toHaveAttribute(
    "data-value",
    "0.00",
  );
  await expect(page.getByTestId("line-shipping")).toHaveAttribute(
    "data-trips",
    "2",
  );
  await expect(page.getByTestId("line-total")).toHaveAttribute(
    "data-value",
    "97584.00",
  );
  await hold(page, 3000);
  await reset(request, "2026-11-01T10:00:00+07:00");
  await page.reload();
  await typeSlow(page.getByTestId("quantity-input"), "30000");
  await page.getByTestId("address-select").selectOption("ADDR-02");
  await expect(page.getByTestId("line-discount")).toHaveAttribute(
    "data-value",
    "6720.00",
  );
  await expect(page.getByTestId("line-total")).toHaveAttribute(
    "data-value",
    "95529.60",
  );
  await hold(page);
});
