# T08 quotations

`POST /api/quotes` accepts the order pricing input and snapshots the successful
`priceFromInput` result. The session supplies company/user IDs; prices always come
from the unchanged `rules.ts`. `GET /api/quotes` lists the customer's quotes and
`GET /api/quotes/[no]` returns a company-scoped quote. The server module
`web/lib/server/quotes.ts` has no Next imports and can also be called by chat-worker.

`POST /api/quotes/[no]/convert` accepts `{pickupDate, acceptTotal?, note?}`.
Conversion locks the quote, checks expiry using the Bangkok test clock, reprices
for the conversion date and calls T07 `createOrder` within the same transaction.
A changed total returns HTTP 409 `PRICE_CHANGED` with `params.total` and
`params.quoted`; the customer can explicitly accept the new total. Failed
conversions leave the quote and document counter unchanged. Successful conversion
stores `converted_order_no`; subsequent attempts return 409 `QUOTE_CONVERTED`.
The original money snapshot is preserved.

Validity includes the `validUntil` day (issue date + 7 calendar days). Expired
quotes return HTTP 410 `QUOTE_EXPIRED`. Missing/foreign quotes return HTTP 404.
Both API mutations supply the shared T10 publisher to emit `quote.created` or
`order.created` after commit. Direct server callers supply the optional `publish`
callback, just as for `createOrder`; no callback means no event publication.

`/quotes` lists quotes. `/quotes/[no]` shows all price lines, company and bank
details, a pickup date and conversion/print actions. `print.css` hides navigation,
chat and actions when printing. The existing T07 `/order` handler already posts
to the quote API, so no changes to the order page were necessary.

## Run and verify (mock only)

Use the task's isolated `DATABASE_URL` (database `t_t08`) and `AMQP_URL`, supplied
externally. No LLM, GPU or worker is needed for these quotation checks.

```sh
export MODE=mock MQ_PREFIX=T08_ ALLOW_TEST_RESET=1
node db/apply.mjs --reset
cd web
PORT=4601 npm run dev
```

From a separate shell at the repository root:

```sh
cd e2e
MODE=mock BASE_URL=http://localhost:4601 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  npx playwright test tests/W08.spec.ts tests/W09.spec.ts tests/W10.spec.ts tests/W06.spec.ts
```

After browser tests finish, run from the repository root (same `AMQP_URL` and
`MQ_PREFIX=T08_` as the web). Both suites reset the isolated DB, so run sequentially:

```sh
BASE_URL=http://localhost:4601 node --test web/app/quotes/test/api.test.mjs
```

The API suite checks customer/company isolation, server-owned identity, rejection
of sales-only quantities/distances, pickup revalidation and rollback, concurrent
conversion, November repricing and explicit acceptance, and RabbitMQ events on a
temporary exclusive queue with the task prefix.

Stop the dev server before building so it does not share `.next` with the build:

```sh
cd web
npm run build
```

No extra dependencies or migration are needed; T04's schema already defines
`quotes` and the QT document counter. The only shared file changed in the earlier
T08 commits was `web/lib/i18n/index.ts`, adding quotation error translations.

## Verification results (2026-10-26, mock)

- Playwright W06/W08/W09/W10: **4 passed**, 2.0 minutes, Chromium 1247,
  video enabled. W08 checks all seven money lines, 2026-10-18 validity,
  print visibility and `window.print()`. W09 checks SO-0019/status 1 and duplicate
  conversion rejection. W10 checks the inclusive expiry boundary and HTTP 410.
- HTTP integration: **5 passed**, 19.4 seconds, including RabbitMQ delivery.
- `rules.ts` SHA-256 remains
  `1f880cd34c63667d90b7fac8e0cdbd6dfaa0a80ef270cda007e4957dfbf3122c`.
- Production `npm run build`: **passed**, including strict TypeScript checks.

ช่วงเวลาที่ตรวจสอบได้จาก commit T08 แรก 2026-10-26T00:48:02+07:00 ถึงส่งมอบ 2026-10-26T09:20:00+07:00 = 8 ชั่วโมง 31 นาที (เกินเป้า 3 ชม.; รวมช่วงหยุด/ส่งต่อบัญชี ไม่ทราบเวลา active ของรอบก่อน จึงไม่อ้างว่าเป็นชั่วโมงทำงานสุทธิ)
