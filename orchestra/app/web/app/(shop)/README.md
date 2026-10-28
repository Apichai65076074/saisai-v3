# T07 — customer shop (mock)

Customer pages: `/login`, `/products`, `/order`, `/orders`, `/orders/[no]`,
`/orders/[no]/claim`, `/claims`, `/claims/[no]`, `/samples`. Root shell/Nav are T04;
root hero and bottle spin slot content are T16. The product card reserves
`<div data-slot="bottle-spin" data-slug="…">`.

Pricing previews debounce 120 ms and cancel obsolete requests. All monetary
values come from `/api/quote` → T05 `priceFromInput` → the unchanged `quote()`;
confirmation revalidates on the server and saves a snapshot. Order creation,
claim quantities, and sample quotas use transactions and locks. Company IDs
always come from the signed session, never from request JSON.

Run from repository root (use the dedicated T07 infrastructure):

```bash
npm --prefix web ci
npm --prefix e2e ci
export DATABASE_URL=postgres://dev:dev@127.0.0.1:56432/t_t07
export MODE=mock ALLOW_TEST_RESET=1 MQ_PREFIX=T07_
export AMQP_URL=amqp://guest:guest@127.0.0.1:56672
node db/apply.mjs --reset
cd web
PORT=4600 npm run dev
```

In another terminal, from repository root:

```bash
cd e2e
BASE_URL=http://localhost:4600 MODE=mock MQ_PREFIX=T07_ \
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright npx playwright test \
  tests/W01.spec.ts tests/W02.spec.ts tests/W03.spec.ts tests/W04.spec.ts \
  tests/W05.spec.ts tests/W06.spec.ts tests/W07.spec.ts tests/W11.spec.ts \
  tests/W12.spec.ts tests/W13.spec.ts
```

Additional HTTP checks, sequentially after Playwright (both reset this database):

```bash
BASE_URL=http://localhost:4600 node 'web/app/(shop)/test/api.mjs'
DATABASE_URL=postgres://dev:dev@127.0.0.1:56432/t_t07 \
web/node_modules/.bin/tsx 'web/app/(shop)/test/services.ts'
AMQP_URL=amqp://guest:guest@127.0.0.1:56672 MQ_PREFIX=T07_ \
BASE_URL=http://localhost:4600 node 'web/app/(shop)/test/events.mjs'
npm --prefix web run typecheck
# Stop the dev server before building: both use web/.next.
npm --prefix web run build
grep -rnE '0\.07|\* ?1500|0\.80' web/app  # expected: no matches
```

HTTP checks include concurrent duplicate submissions across two users in C02,
the exact ten-minute boundary, counter continuity after rejected requests,
rescheduling without changing price/status, sample quotas across colors,
claim window/image validation, and private photo retrieval.

## Integration seams

- `orders.ts`, `products.ts`, `claims.ts`, `samples.ts` have no Next imports.
  A `Pool` owns its transaction; a supplied `PoolClient` must already be in the
  caller's transaction. Both new orders and claims accept an optional `publish`
  callback so server functions remain independent of Next/MQ transport.
- APIs pass `publishOrderEvent` from `lib/i18n/order-events.ts`, which now
  delegates to T10's `lib/mq` publisher when `AMQP_URL` is set. The shared
  connection uses publisher confirms and the canonical shared topology.
  Non-HTTP callers passing a Pool can supply their MQ publisher as `publish`.
  With a caller-owned PoolClient transaction, leave this callback unset and
  publish the returned document number after the caller commits.
- Round 2 merge resolution keeps T10's complete `shared/mq-topology.mjs`;
  T07's temporary exchange constants and temporary connection were removed.
- Pickup/holiday locks use the legacy coordination key `4244` + days since
  `2000-01-01`; creation locks company key `4243`, samples `4242`.
- The `quote-request` button posts the current input to T08 `/api/quotes` and
  navigates to `/quotes/<quoteNo>`. It is disabled for unpriceable/error inputs.
- Language is supplied from server `getLang()` (cookie `lang`); business errors
  and labels use `lib/i18n/index.ts`, retaining legacy wording. Test IDs are
  documented in `lib/i18n/TESTIDS.md`.
- T07 cases do not use LLM/voice/RAG, so no mock-LLM or background worker is needed
  for these cases. RabbitMQ event publishing is exercised by order/claim API calls.

## Verification

- Playwright: **10/10 passed** (W01–W07, W11–W13), final run 2.5 minutes,
  Chromium 1247, mock mode, video enabled and hold at the end of every case.
- HTTP integration checks: passed (including concurrent duplicate and quota races).
- Existing unit suite: **35/35 passed** (26 rules + 9 pricing).
- TypeScript strict: passed.
- Monetary-formula grep: no matches in `web/app`.
- `rules.ts` SHA256 remains
  `1f880cd34c63667d90b7fac8e0cdbd6dfaa0a80ef270cda007e4957dfbf3122c`.
- RabbitMQ integration: received both `order.created` and `claim.created` from
  the API on `T07_order.events`, using a temporary exclusive test queue.
- Caller-owned PoolClient transaction: creation and sample request both work
  inside the outer transaction; rollback also restores document counters.
- Production build: **passed** on the final source, including standalone tracing.
- Initial browser attempt was interrupted by the dev server exiting with 143.
  A subsequent run passed 9/10; W02's fieldset matcher was corrected to assert
  the native attribute and every contained control. No acceptance criterion was removed.

Tracked interval: 2026-10-25 11:49:47 to 12:06:49 Asia/Bangkok (17 min 2 sec). All work/testing used mock mode; no Docker Compose or GPU rental was used.

## Round 2 merge verification

Merged main through `70b1354` (T10 topology and T14 chat widget). Resolved the
add/add topology conflict by retaining T10's module in full; the T07 adapter
now delegates to T10 `publish`. The event test reads canonical exchange options.
No other team's implementation was edited during this resolution.

After integration: the HTTP business checks and RabbitMQ order/claim event
checks passed; unit tests passed 46/46 (15 T10-specific integration tests were
skipped by their environment guard). Final production build passed. The final browser run passed all 10 cases
(W01–W07, W11–W13) in 3.7 minutes, with video enabled. Formula grep has no
matches and the rules SHA256 remains unchanged. All runs use mock mode and the
dedicated T07 database.

Round 2 tracked interval: 2026-10-25 12:07 Asia/Bangkok to 2026-10-25T12:17:59+07:00 (about 11 minutes).
No Docker Compose, GPU rental, or push was performed.
