import { test, expect } from "@playwright/test";
import { reset, login, hold } from "../lib/helpers";
test.beforeEach(async ({ request }) => {
  await reset(request);
});
test("W09 convert QT-0001 to an order (pickup 2026-10-26) → SO-0019 step 1, total 63,023.00", async ({
  page,
}) => {
  await login(page, "arun@saisai.test");
  const r = await page.request.post("/api/quotes", {
    data: {
      model: "B-250",
      color: "clear",
      quantity: 10000,
      logo: true,
      addressCode: "ADDR-01",
    },
  });
  expect(r.status()).toBe(201);
  const qt = await r.json();
  expect(qt.quoteNo).toBe("QT-0001");
  expect(qt.lines.total).toBe("63023.00");
  await page.goto("/quotes/QT-0001");
  await expect(page.getByTestId("quote-no")).toHaveText("QT-0001");
  await expect(page.getByTestId("line-total")).toHaveAttribute(
    "data-value",
    "63023.00",
  );
  await page.getByTestId("pickup-date-input").fill("2026-10-26");
  await expect(page.getByTestId("quote-convert")).toBeEnabled();
  await page.getByTestId("quote-convert").click();
  await page.waitForURL("**/orders/SO-0019");
  await expect(page.getByTestId("order-title")).toHaveText("SO-0019");
  await expect(page.getByTestId("status-steps")).toHaveAttribute(
    "data-value",
    "1",
  );
  await expect(page.getByTestId("order-pickup-date")).toHaveAttribute(
    "data-value",
    "2026-10-26",
  );
  await expect(page.getByTestId("line-total")).toHaveAttribute(
    "data-value",
    "63023.00",
  );
  await expect(page.getByTestId("line-total")).toHaveText("฿63,023.00");
  // QT ถูกผูกกับออเดอร์ · แปลงซ้ำไม่ได้
  await page.goto("/quotes/QT-0001");
  await expect(page.getByTestId("quote-converted")).toHaveAttribute(
    "data-value",
    "SO-0019",
  );
  await expect(page.getByTestId("quote-convert")).toBeDisabled();
  const again = await page.request.post("/api/quotes/QT-0001/convert", {
    data: { pickupDate: "2026-10-26" },
  });
  expect(again.status()).toBe(409);
  await hold(page);
});
