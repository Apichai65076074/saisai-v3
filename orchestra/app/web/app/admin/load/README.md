# /admin/load (T19)

Owner-only dashboard for load-test results. The data format is in `web/app/api/admin/load/SCHEMA.md` (T20's `loadtest/run_load.mjs` posts to it). The pass criteria live in `loadtest/criteria.json`.

- Top: "รองรับพร้อมกันได้ N คน" cards, one per tested mode, for each selected run (`load-max-users` `data-mode` `data-run-id` `data-value`), followed by the criteria line (p95 ≤ 12 s · error ≤ 1%).
- `load-run-select` = `<select multiple>`. Selecting several runs compares them (for example scale-base/x2/x4). The URL keeps `?runs=3,2`; with no parameter, the newest run is shown.
- `load-chart` (SVG, one per mode): X = users (step axis) · p50/p95/TTFT p95 lines (colour = run) · grouped bars for queue_max chat/stt/tts of the first selected run · `load-criteria-line` at 12 s · `load-target-line` at 200 users (beyond the last step → drawn at the right edge with →) · `load-n-line` at N of each run · failed steps get a red point, a red band and a red ✗ label. `data-points` = total number of stages plotted in that chart (one run = number of steps).
- Per-step table, one per run per mode (`load-stage-row` `data-pass`); failed rows are red.

## Test (mock)
```bash
export DATABASE_URL=postgres://dev:dev@127.0.0.1:56432/t_t19
node db/apply.mjs --reset
cd web && PORT=4602 ALLOW_TEST_RESET=1 npm run dev &
cd e2e && PLAYWRIGHT_BROWSERS_PATH=/ms-playwright BASE_URL=http://localhost:4602 npx playwright test tests/L01.spec.ts tests/L02.spec.ts
```
POST a result: `curl -X POST -H 'content-type: application/json' -H 'x-eval-token: ss-eval' --data @e2e/fixtures/load-run-a.json localhost:4602/api/admin/load`

T23 adds an AI scale comparison above the existing run selector. It selects the
latest measured baseline/×2/×4 from all API runs, independently of that selector,
requires cold retrieval + TTS cache, rag770, prefetch 4/4/2, think30/stage120, and
shows one p95 curve per measured set. Original T22 `gpu-mix-scale-base-*` labels
are accepted without rewriting historical runs. Missing sets remain unmeasured;
N=0 suppresses ratios. Scale uses strict error <1% (the original API schema and
legacy charts retain their <=1% contract). No API schema migration is needed.

Targeted verification: `cd web && npm test -- app/admin/load/scale.test.tsx` then
`npm run build`. Tests round-trip samples through the existing API parser and
server-render the comparison, including three curves, missing sets, latest failed
baseline, mock/cache exclusions and the 1% boundary. These samples are unit-test
inputs, not measured scale results. `scale-x2.json` / `scale-x4.json` are BLOCKED
status artifacts with no stages; do not POST them as measured runs.

Final T23 round adds `load-scale-mode`: the same three cards compare only one selected mode at a time (mix default). Original T22 `gpu-chat/stt/tts/voice-nocache*` results are eligible mode-specific baselines. A chat-only x4 result never fills the mix comparison. Decode/concurrency changes are disclosed in loadtest/STT-504.md and REPORT.md; ratios are measured outcomes, not proof of linear hardware scaling.
