import { test, expect } from "@playwright/test";
import { reset, login, typeSlow, hold } from "../lib/helpers";
test.beforeEach(async ({ request }) => {
  await reset(request);
});
test("W03 B-250 logo and delivery show every exact pricing line", async ({
  page,
}) => {
  await login(page, "arun@saisai.test", {
    goto: "/order?model=B-250&color=clear",
  });
  await typeSlow(page.getByTestId("quantity-input"), "10000");
  await page.getByTestId("logo-checkbox").check();
  await page.getByTestId("address-select").selectOption("ADDR-01");
  const values = {
    bottles: "52000.00",
    discount: "2600.00",
    logo: "8000.00",
    shipping: "1500.00",
    subtotal: "58900.00",
    vat: "4123.00",
    total: "63023.00",
  };
  for (const [key, value] of Object.entries(values))
    await expect(page.getByTestId(`line-${key}`)).toHaveAttribute(
      "data-value",
      value,
    );
  await expect(page.getByTestId("line-discount")).toHaveText("−฿2,600.00");
  await expect(page.getByTestId("line-shipping")).toHaveAttribute(
    "data-trips",
    "1",
  );
  await expect(page.getByTestId("line-discount-label")).toHaveText("ส่วนลด 5%");
  await page.getByTestId("pickup-date-input").fill("2026-10-26");
  await expect(page.getByTestId("order-confirm")).toBeEnabled();
  await page.getByTestId("order-confirm").click();
  await expect(page.getByTestId("order-no")).toHaveText("SO-0019");
  await page.getByTestId("view-order-link").click();
  await expect(page.getByTestId("line-total")).toHaveAttribute(
    "data-value",
    "63023.00",
  );
  await expect(page.getByTestId("status-steps")).toHaveAttribute(
    "data-value",
    "1",
  );
  await hold(page);
});
