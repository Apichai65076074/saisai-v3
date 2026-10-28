# Load results contract (T19 → T20)

`POST /api/admin/load` accepts a JSON result. Both GET and POST require an
owner session cookie or `x-eval-token: $EVAL_TOKEN` (default `ss-eval`).
The page always requires owner login. Responses have `Cache-Control: no-store`
through the dynamic route. Invalid JSON or inconsistent measurements return 400;
unauthorized requests return 401. POST appends a run and returns 201 `{ok:true,run}`.

```json
{
  "label": "mock-mix-2-workers",
  "config": {"mode":"mix", "environment":"mock", "think_sec":30, "stage_sec":120},
  "stages": [{
    "users": 1, "mode": "mix", "n":1000, "ok":1000, "err":0,
    "error_rate":0, "p50_ms":800, "p95_ms":1200, "ttft_p95_ms":400,
    "queue_max":{"chat":0,"stt":0,"tts":0}, "pass":true
  }],
  "max_users_ok":{"mix":1}
}
```

Modes: `chat|stt|tts|voice|mix`. All latency values are milliseconds. Error rate
is a fraction (0.01 = 1%), matching err/n within 0.000001. n must be positive;
ok+err=n. Users/counts/queue maxima are nonnegative integers, users >=1.
Latency must be finite and nonnegative, p50 <= p95. Steps must be unique by
(mode,users). config.think_sec is required (0 means stress); extra measurement
fields and config metadata are preserved. 1–1000 stages; label 1–200 characters.

Criteria are fixed in `loadtest/criteria.json`: p95 <=12000 AND error_rate <=0.01.
The server computes pass and capacity. Optional supplied pass/capacity must agree.
For each mode, sort by users, stop at the first failing step; N is the last passing
step before that failure, or 0. A later passing step cannot raise N.
max_users_ok is a map containing precisely the modes tested. A numeric
max_users_ok is also accepted for single-mode producers. Omission computes it.

Database keeps the agreed `load_runs.max_users_ok int` as the largest N among
modes for compatibility. No migration or column type change is needed; API derives
the per-mode map from stored stages on every read.

`GET /api/admin/load` → `{ok:true,runs:[...]}` newest first; `?id=123` filters one
run (missing id gives an empty list). Every run includes id, label, created_at,
config, stages and the per-mode max_users_ok map. The UI uses a multi-select of run
IDs to compare scale runs, and separate charts/tables per mode and run.

`e2e/fixtures/load-run-a.json` is synthetic dashboard data, not measured capacity.
