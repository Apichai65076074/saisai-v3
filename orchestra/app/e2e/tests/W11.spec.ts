import { test, expect } from "@playwright/test";
import { reset, login, typeSlow, hold } from "../lib/helpers";
test.beforeEach(async ({ request }) => {
  await reset(request);
});
test("W11 free sample quota rejects four and accepts three", async ({
  page,
}) => {
  await login(page, "arun@saisai.test", { goto: "/samples" });
  await page.getByTestId("sample-model-1").selectOption("B-250");
  await page.getByTestId("sample-color-1").selectOption("green");
  await typeSlow(page.getByTestId("sample-quantity-1"), "4");
  await page.getByTestId("submit-sample").click();
  await expect(page.getByTestId("error-sample")).toHaveAttribute(
    "data-code",
    "SAMPLE_QUOTA",
  );
  await typeSlow(page.getByTestId("sample-quantity-1"), "3");
  await page.getByTestId("submit-sample").click();
  await expect(page.getByTestId("sample-no")).toHaveText("SR-0004");
  await expect(page.getByTestId("sample-total")).toHaveAttribute(
    "data-value",
    "0.00",
  );
  await expect(page.getByTestId("sample-total")).toContainText("฿0.00");
  await expect(page.getByTestId("quota-B-250")).toHaveAttribute(
    "data-value",
    "0",
  );
  await hold(page);
});
