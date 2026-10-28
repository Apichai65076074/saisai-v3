# Load test runner

## Headline capacity (T24 rule · mock และ GPU/T22 ใช้ runner เดียวกัน)

ตัวเลข "ระบบรองรับกี่คน" ที่เป็นค่าหลักต้องมาจากรันที่ **ปิด cache** (`RAG_CANDIDATE_CACHE=off`
ค่าเริ่มต้น) · **prefetch 4/4/2** (ค่าเริ่มต้น) · **คำถามไม่ซ้ำ** `--questions rag770` (ค่าเริ่มต้น ·
770 ข้อจาก `gemini/rag-questions/*.jsonl` สับด้วย `--seed` แล้วแจกแบบไม่คืนข้ามทุก session ·
หมดสำรับ → สับรอบใหม่และนับ `repeats`) · เกณฑ์ error < 1% และ p95 ≤ 12 วิ ห้ามลด

```sh
# จาก root ของ repo · compose project saisai3 · web :3600 · MQ UI :15673
loadtest/compose_mock.sh up -d --build --scale chat-worker=2      # cache off · 4/4/2 (ค่าเริ่มต้นใน wrapper)
MQ_API=http://localhost:15673 MQ_PREFIX= MODE=mock EVAL_TOKEN=ss-eval \
  node loadtest/run_load.mjs --base http://localhost:3600 --mode mix \
  --users 1,10,25,50,100,150,200,250 --stage-sec 120 --think-sec 30 \
  --questions rag770 --seed 20261026 --label mock-mix-nocache --post
loadtest/sample_cpu.sh results/<label>-cpu.jsonl &   # (ทางเลือก) docker stats ทุก 5 วิ หา คอขวด
```

GPU (T22): ใช้คำสั่งเดียวกัน เปลี่ยนแค่ env ของ stack (`MODE=ai` + ปลายทาง LLM/STT/TTS) และ label
เช่น `gpu-mix-nocache` · ห้ามเปิด `RAG_CANDIDATE_CACHE=on` หรือเพิ่ม prefetch ในรันหลัก ·
ผล JSON ต้องมี `config.cache="off"`, `config.prefetch={chat:4,stt:4,tts:2}`, `config.questions="rag770"`,
`config.unique_questions`, `config.repeats` (dashboard `/admin/load` เลือก run แบบนี้เป็น "ค่าหลัก" อัตโนมัติ)
รันเสริม (ต้องติดป้ายเสริม): `--questions qa` = ชุดคำถามซ้ำแบบ T20 · `RAG_CANDIDATE_CACHE=on` · prefetch อื่น
`RAG_KEYWORD=fullscan` = ค้น trigram แบบเดิม (สำหรับเทียบ) · ค่าเริ่มต้น `pruned` (ผลเท่ากันทุกข้อ ดู REPORT.md)

## T20 notes

Run from the repository root with Node 22 (no runner dependencies). The exclusive
compose wrapper pins internal mock endpoints so inherited dev URLs cannot point
containers at their own localhost:

```sh
loadtest/compose_mock.sh up -d --build --scale chat-worker=2
# At completion (retains volumes):
loadtest/compose_mock.sh stop
```

```sh
MQ_API=http://localhost:15673 MQ_PREFIX=T20_ MODE=mock \
node loadtest/run_load.mjs --base http://localhost:4600 --mode mix \
  --users 1,10,25,50,100,150,200,250 --stage-sec 120 --think-sec 30 \
  --label mock-mix --post
node --test loadtest/test/*.test.mjs
cd e2e
BASE_URL=http://localhost:4600 MQ_API=http://localhost:15673 MQ_PREFIX=T20_ \
  PLAYWRIGHT_BROWSERS_PATH=/ms-playwright npx playwright test tests/Q01.spec.ts
```

Modes: `chat`, `stt`, `tts`, `voice`, `mix` (70% text / 30% voice probability).
Each simulated user logs in with C01–C05 and owns a cookie jar and UUID chat
session. Closed-loop users wait think-sec ±50% after completion. Stage duration
controls new arrivals; already running requests drain before moving on. HTTP 429,
SSE errors, incomplete streams and missing voice audio count as errors. Voice
latency starts before STT submission and ends at the first downloaded audio byte.
Errors retain their elapsed times in the percentile distribution. Successful chat
latency ends at SSE done, independently of stream close.

Queue samples every 2s retain ready, unacked, total, consumers and cumulative
publish. A 6s quiet period lets RabbitMQ management counters refresh. Per-stage
`counts.broker_chat_publish` must equal `counts.chat_done` for message conservation.
Accepted SSE requests are a separate count, not a claim of broker publication.
Use an isolated MQ_PREFIX and do not send other traffic during a measurement.
The management endpoint must be available; telemetry errors remain in results.
MQ_API defaults to http://localhost:15672; MQ_USER/MQ_PASSWORD default guest/guest.
EVAL_TOKEN defaults to the documented test token. No credentials are written to
result files. Results follow T19's SCHEMA; --post imports into /admin/load.

`--shard i/n` (1 based) assigns global user indices modulo n, emits separate
`<label>.shard-i-of-n.json` files, and records local_users. Synchronize shard starts
externally; combine raw samples and recompute percentiles before using as global
capacity. Broker counters are shared across shards and must not be added together.
Posting shard-local capacity is rejected. This mock-only runner reports characters
per second, not fabricated token counts (the SSE API has no tokenizer usage).
No GPU measurements are performed in mock mode. Tests use an in-process HTTP
fixture and do not represent measured application capacity.

Measured T20 tuning (mock only; worker counts remain chat ×2, STT/TTS ×1):

```sh
CHAT_PREFETCH=48 STT_PREFETCH=16 TTS_PREFETCH=32 \
  loadtest/compose_mock.sh up -d --build --scale chat-worker=2
MQ_API=http://localhost:15673 MQ_PREFIX=T20_ MODE=mock EVAL_TOKEN=ss-eval \
CHAT_PREFETCH=48 STT_PREFETCH=16 TTS_PREFETCH=32 \
  node loadtest/run_load.mjs --base http://localhost:4600 --mode mix \
  --users 1,10,25,50,100,150,200,250 --stage-sec 120 --think-sec 30 \
  --label mock-mix --post
```

Central changes are additions only: two lines in workers/chat-worker/index.mjs
cap its DB pool at 16 independently of AMQP concurrency (PG_POOL_MAX can override
when forwarded to the service). At prefetch 48 the two workers would otherwise
allow up to 192 DB connections. Another 29 lines in lib/retrieve.mjs cache only
RRF candidates, bounded to 256 keys per DB and a sliding five-minute TTL. Every
lookup checks the ready-document ID/update-time version; uploads, reingestion and
deletes invalidate candidates. Concurrent identical queries share the search.
Reranking and LLM calls still happen on every request with the configured mock
latency. Failed vector retrieval is not cached. New tests cover sharing,
reranking, document changes, DB isolation, expiry and outage recovery.
Q01 records twenty separate videos at 480×360, uses reduced motion and the app's
supported no-WebGL fallback, and prepares independent authenticated pages before
one concurrent send barrier. Its chat and error assertions remain unchanged.

Voice transactions also require audio for every declared sentence; duplicate done
frames are errors. tokens_per_sec is null unless every completed chat supplies an
actual completion_tokens usage field; output_chars_per_sec is always measured.

## T22 correction (27 October)

A primary cold-TTS result also requires `config.tts_cache="off"` and an explicit
provider cache audit. `config.cache="off"` alone only describes retrieval.
The mock wrapper now forwards TTS_CACHE=off to web, worker and mock provider.
T24's 25-user result has TTS reuse active and remains retrieval-only evidence.
The corrected T22 run #15 has contiguous max_users_ok=15 (20 failed even though
25 subsequently passed); see REPORT.md and results/T22-mock-cold-tts.json.

## T23 fresh scale set (approval 27 October 21:35)

The current handoff in `RUN/state/vast-handoff.md` supersedes the old prohibition
on replacement rentals and designates T23 exclusive. Use central watchdog state
at `/root/runs/saisai/state`; do not reset the ended baseline ledger. Renew its
lease at least every four minutes. Run `python3 tools/vast-budget-test.py` before
starting a new detached watchdog, then confirm its live PID and fresh billing.

Authorized ×2: `llm-1`, `llm-2` (5090), `stt`, `tts`, `rerank` (4090).
Authorized ×4 adds only `llm-3`, `llm-4` and `tts-2`; eight GPUs total. Use
`python3 tools/vast-create.py ROLE` and then `python3 tools/vast-provision.py ROLE`.
The create guard budgets remaining GPUs, network allowance, setup/load time and
cleanup, uses cheapest verified/reliable eligible offers, and reconciles labels.
An unsuccessful create must be reconciled before any subsequent create.

Once all roles are ready, `python3 tools/vast-connect.py` starts authorized SSH
listeners, one authenticated streaming gateway per LLM and 10-second GPU
telemetry. `python3 tools/vast-scale-stack.py config` validates Compose without
printing resolved credentials. `python3 tools/vast-scale-stack.py x2` switches
the exclusive `saisai3` stack to two competing chat consumers, one STT worker,
and two TTS workers. `x4` uses four chat, two STT, four TTS workers. Each chat
worker has its own LLM endpoint; TTS workers share the relevant GPU. The adapter
serializes VoxCPM2 execution per GPU to one while admission/prefetch stays two;
verify actual health/model/runtime counters before claiming primary results.

Use `tools/vast-workload.py --log RUN/state/<label>.log -- node loadtest/run_load.mjs ...`
for paid loads (MODE=ai, MQ_PREFIX=T23_ai_, MQ_API=:15672, caches off). Primary mix:
`--mode mix --think-sec 30 --stage-sec 120 --questions rag770 --seed 20261027 --stop-on-fail --post`.
Keep the historical Nbase=0 result; a scale ratio cannot be computed from it.
Do not invent positive capacity. Record separate chat/voice diagnostics as well.
Skip ×4 at cumulative conservative/actual $10 or earlier if projected stage plus
cleanup cannot fit below $12; ×4 load only has a 30-minute limit.

Finally run `python3 tools/vast-budget.py cleanup`, verify live `show_instances`
twice and only then stop the watchdog PID opened by this session. Stop only local
PIDs opened by this session. `python3 tools/vast-scale-stack.py mock` restores
`MODE=mock` at :3600 with existing volumes. Never remove volumes or use down -v.

The watchdog now executes each SDK inventory/billing check in a separate process
with a hard wall-clock bound (normally 40s, shortened to preserve the 60s freshness
window). An alive PID is insufficient: the controller aborts owned subprocesses
when `last_checked` is over 60s old. Cleanup runs in another bounded process and
retries until absence is verified, so hung billing cannot block the destroy path.
`python3 tools/vast-budget-test.py` includes a deliberately hung-billing test that
forces termination and verifies independent cleanup, plus strict inventory checks
(`None` is never accepted as zero). Vanished offers retry only after reconciliation
proves no instance exists; host failures are saved in the central failed-host list.
All rental and load commands remain bounded by the controller deadline and $12.

### Restart 28 October 10:25

Before paid work, run `python3 tools/vast-scale-controller.py --dry-run`.
This exercises PID fingerprints, owner exit, lease/deadline expiry and the
hard SDK timeout/independent cleanup tests without contacting Vast or renting.
The controller recognizes Codex/Claude ancestors, or accepts `T23_WORKER_PID`;
both worker and controller start ticks are checked by the independent guard.
Each attempt is finite (55 minutes), with cleanup starting no later than
28 October 14:25 +07 for the user's absolute 14:30 stop. Only verified offers
with reliability >=0.99 qualify; vanished/offline roles may retry at most three
times, with offline instance deletion verified before the next attempt.

Run with `T23_RUN_TAG=20261028-rN python3 tools/vast-scale-controller.py`.
The x2 run repeats C05 C08 C13 M01–M06 Q01 R01 T01 T02 V01–V03 sequentially
before load, because Playwright resets shared business data. Their original
assertions are preserved; JSON output is retained in the run's ai16 log.
x4 remains load-only, at most 30 minutes including deployment, and only when
fresh cumulative estimate <10 and projected complete-stage cost <12 dollars.

T23 final 28/10 13:00 policy: `python3 tools/vast-scale-controller.py --dry-run` validates owner PID/start ticks, finite lease/deadline and billing guard without renting. Controller final cutoff starts cleanup 16:25 Bangkok; actual billing stop $14.5 / cap $15, x4 entry <=$12.5. Separate x2 chat/stt/tts/voice runs use cache off and unchanged p95<=12s/error<1%. x4 chat load <=20min.

STT mitigation (shared adapter change): serialize per-model execution with prefetch4 unchanged; greedy single-temperature decode, VAD and no previous-text conditioning; cpu_threads4. Record queue/decode timings without audio/text. CPU fake-engine test: `.vast-private/test-venv/bin/python -m unittest vast_aibox/test_adapter.py`. Prior evidence establishes 30s web timeouts, not a proven GPU root cause. Upstream options: https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/transcribe.py .
