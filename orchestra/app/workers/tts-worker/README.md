# TTS worker (T15)

Consumes `tts.request` using shared topology and `TTS_PREFETCH` (default 2). Each completed request replies with `{type:'tts', messageId, seq, audioId, durationMs, engine, lang}` before acknowledgement. RabbitMQ reconnect restores consumption. Heartbeat updates every 10 seconds at `/tmp/healthy` (or `HEARTBEAT_FILE`). The Dockerfile builds from repository root and installs only production dependencies.

`text.mjs` removes emoji, tool/think/HTML tags, Markdown, URLs and citation labels. Thai characters select `th`, Latin selects `en`; hints apply only when neither is present. Thai money and model/document codes become spoken words: `฿5.80` → `ห้าบาทแปดสิบสตางค์`, `B-250` → `บี สองร้อยห้าสิบ`. Speech is capped at 600 characters; chat-worker sends sentences capped at 200 characters.

`audioId` is SHA256(normalized speech text + language). Cache lookup uses memory then `tts_audio` before calling `${TTS_URL}/v1/audio/speech` with voice `nongsai`, language and Bearer `AIBOX_API_KEY`. Inflight requests for the same hash share one synthesis. Memory cache hits restore deleted DB entries after a test reset. WAV duration is parsed from RIFF chunks, including streaming WAV lengths. Engine is `mock` when upstream health declares mock TTS, otherwise `voxcpm2`. Nine common greeting/suggestion sentences are warmed in the background on startup; use `TTS_WARM=0` to disable warming.

`POST /api/tts {text,lang?}` queues synthesis. `GET /api/tts/[audioId]` serves cached `audio/wav`, supports byte ranges and reports duration/language/engine headers. `GET /api/tts/status` reports whether a consumer is available. The existing T14 chat audio queue handles sequence ordering and the one shared audio element.

See [STT runbook](../stt-worker/README.md) for the complete mock setup, browser/export helper and verification commands. Unit and live DB/RabbitMQ integration checks:

```sh
source workers/stt-worker/tools/mock-env.sh
node --test workers/tts-worker/test workers/stt-worker/test
```

The tests exercise normalization, language selection, RIFF duration, multipart/auth/prompt, STT health cancellation/recovery, cache deduplication, DB restoration after reset, warmup and correlated MQ replies. They use isolated test queue prefixes and delete only their own queues/exchanges.

## T22 cold-TTS measurement

`TTS_CACHE=off` (set on web, tts-worker and mock/provider) disables text-keyed
memory reuse, DB reads/writes, singleflight and startup warming. Each request
gets a random UUID and a new upstream speech request. WAV bytes travel in the MQ
reply to the owning web instance; that instance holds a bounded (32 MiB) pending
delivery for at most 90 seconds. GET consumes it once with `Cache-Control:
no-store`; replay returns 404 and never reads `tts_audio`. This temporary delivery
buffer is not indexed by text and cannot answer a new synthesis request. With
multiple web instances this path requires routing affinity. The baseline uses one.

Counters are available as `createSynth(pool).stats` and are logged at worker stop.
Health/model-name metadata remains cached for 60s; weights and OS file pages are
not response caches. Provider-side prefix/result/audio caches need their own
verified off settings before an AI run qualifies as primary.

```sh
node --check workers/tts-worker/index.mjs
node --test workers/tts-worker/test/cold.test.mjs workers/tts-worker/test/text.test.mjs
npm test --prefix web -- --maxWorkers=2 --minWorkers=1 tests/unit/tts-delivery.test.ts
TTS_CACHE=off loadtest/compose_mock.sh up -d --build --scale chat-worker=2
TTS_CACHE=off MODE=mock MQ_API=http://localhost:15673 \
  node loadtest/run_load.mjs --base http://localhost:3600 --mode mix \
  --users 1,10,15,20,25 --stage-sec 120 --think-sec 30 --questions rag770 \
  --seed 20261026 --label T22-mock-cold-tts --post
```

Shared additions: compose forwards the switch, mock audio bypasses memory/disk
replay, web MQ strips WAV bytes into one-use delivery, GET serves that delivery,
load runner records `config.tts_cache`, and dashboard excludes retrieval-only
runs from primary cold-TTS selection. Existing golden assertions and rules are
unchanged. Old T24 artifacts retain their labels and values with a report caveat.
