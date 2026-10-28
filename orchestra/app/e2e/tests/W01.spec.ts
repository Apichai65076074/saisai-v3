import { test, expect } from "@playwright/test";
import { reset, hold } from "../lib/helpers";
test.beforeEach(async ({ request }) => {
  await reset(request);
});
test("W01 catalogue has nine products and B-250 has three colors", async ({
  page,
}) => {
  await page.goto("/products");
  await expect(page.getByTestId("product-list")).toHaveAttribute(
    "data-count",
    "9",
  );
  await expect(page.getByTestId("product-card")).toHaveCount(9);
  await expect(page.getByTestId("product-price-b100-clear")).toHaveText(
    /฿3\.20/,
  );
  await expect(page.getByTestId("product-min-b100-clear")).toHaveText(
    "ขั้นต่ำ 2,400 ใบ",
  );
  await expect(
    page
      .getByTestId("product-card")
      .filter({ has: page.locator('[data-model="B-250"]') }),
  ).toHaveCount(3);
  await page.getByTestId("product-model-filter").selectOption("B-250");
  await expect(page.getByTestId("product-list")).toHaveAttribute(
    "data-count",
    "3",
  );
  await page.getByTestId("product-color-filter").selectOption("green");
  await expect(page.getByTestId("product-card")).toHaveAttribute(
    "data-slug",
    "b250-green",
  );
  await page.getByTestId("lang-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByTestId("product-min-b250-green")).toHaveText(
    "Minimum 1,200 bottles",
  );
  await hold(page);
});
