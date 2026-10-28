# T05 pricing / rules

`web/lib/rules.ts` is an immutable byte-for-byte legacy copy. SHA-256:
`1f880cd34c63667d90b7fac8e0cdbd6dfaa0a80ef270cda007e4957dfbf3122c`.

`priceFromInput(db, input, {now, companyId?})` is framework-independent and accepts a pg Pool or transaction client. It loads product price, holidays, delivered-order count, monthly sample usage and a company-owned address. A supplied address overrides distance; an inaccessible address fails without falling back to distance. Without an address, explicit distance is supported for public previews. Pickup is optional for previews; supplied dates are validated. Order creation must require a pickup date separately using rules.ts.

The result retains quote() fields (including positive `discount`, `logoAmount`, `earliestPickupDate` and `credit`), serializes Decimal values with `toFixed(2)`, and adds `earliestPickup` and `sampleQuotaLeft`. Subtract the discount only when rendering the discount line; amounts are already calculated by quote().

`POST /api/quote` reads companyId exclusively from the signed session and time from the system clock. It returns 200 when valid, 422 for only FACTORY_CLOSED, otherwise 400 for validation errors. Errors contain legacy Thai/English messages selected by cookie/session language. Preview works without login when using explicit distance.

Run from repository root:

```sh
npm ci --prefix web
npm test --prefix web
npm run typecheck --prefix web
npm run build --prefix web
sha256sum web/lib/rules.ts
cmp legacy/web/lib/rules.ts web/lib/rules.ts
```

35 unit cases cover the required W02–W07 amounts and errors, October/November discounts, both upsells, M01/M02/M05, free sample quota, Bangkok date boundaries, database-price changes, company isolation, serialization and bilingual error messages. No external service is needed for unit tests.

HTTP smoke test (isolated T05 database; mock mode only):

```sh
DATABASE_URL=postgres://dev:dev@127.0.0.1:56432/t_t05 node db/apply.mjs --reset
cd web
MODE=mock MQ_PREFIX=T05_ ALLOW_TEST_RESET=1 DATABASE_URL=postgres://dev:dev@127.0.0.1:56432/t_t05 PORT=4600 npm run dev
# In a second terminal, from web/:
BASE_URL=http://localhost:4600 node tests/unit/quote-api.mjs
```

The HTTP smoke test resets business data in that database, logs in as seeded arun and checks 10 scenarios including W03 = `63023.00`, date errors, English messages, malformed JSON and company spoofing. It does not need workers or GPU services.

Changes to shared files: `.gitattributes` already specified `web/lib/rules.ts -text`; final content is unchanged from main. No package, tsconfig, schema, seed or legacy changes are required.

## Verification result (2026-10-25)

- `npm test`: 2 files / 35 cases passed.
- `npm run typecheck`: passed under TS strict.
- `npm run build`: passed; `/api/quote` included as a dynamic route.
- HTTP smoke: all 10 scenarios passed against isolated `t_t05` DB in mock mode.
- Actual `curl` login as arun + POST W03: total `63023.00`, with bottles `52000.00`, discount `2600.00`, logo `8000.00`, shipping `1500.00`, subtotal `58900.00`, VAT `4123.00`.
- SHA-256 matches the value above; `cmp` is silent. `git diff --stat main -- web/lib/rules.ts`: new file, 584 lines.
- Formula scan `grep -rnE "\* ?0\.07|1500|0\.8" web/app web/lib/server`: only pre-existing CSS `0.8rem` and `0.85rem` in globals.css; no pricing formulas in app/server files.
- `git diff --check main`: passed.
- Work started approximately 11:44 and completed 11:49 Asia/Bangkok (about 5 minutes, below 3 hours). No GPU or Docker Compose operations.
