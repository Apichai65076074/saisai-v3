import { test, expect } from "@playwright/test";
import { reset, login, setNow, hold } from "../lib/helpers";
test.beforeEach(async ({ request }) => {
  await reset(request);
});
test("W10 QT-0001 opened on 2026-10-19 is expired and cannot be converted", async ({
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
  expect((await r.json()).validUntil).toBe("2026-10-18");
  // วันสุดท้ายยังแปลงได้
  await setNow(page.request, "2026-10-18T10:00:00+07:00");
  await page.goto("/quotes/QT-0001");
  await expect(page.getByTestId("quote-expired")).toHaveCount(0);
  await expect(page.getByTestId("quote-convert")).toBeEnabled();
  // เลยวันหมดอายุ
  await setNow(page.request, "2026-10-19T10:00:00+07:00");
  await page.goto("/quotes/QT-0001");
  await expect(page.getByTestId("quote-no")).toHaveText("QT-0001");
  await expect(page.getByTestId("quote-valid-until")).toHaveAttribute(
    "data-value",
    "2026-10-18",
  );
  await expect(page.getByTestId("quote-expired")).toBeVisible();
  await expect(page.getByTestId("quote-convert")).toBeDisabled();
  const api = await page.request.post("/api/quotes/QT-0001/convert", {
    data: { pickupDate: "2026-11-05" },
  });
  expect(api.status()).toBe(410);
  expect((await api.json()).errors[0].code).toBe("QUOTE_EXPIRED");
  await hold(page);
});
