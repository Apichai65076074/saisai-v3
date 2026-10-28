# Chat worker (T13)

Consumes `chat.request` with shared topology, configured prefetch and confirmed replies. Failures retry with `x-retry` twice, then dead-letter; model HTTP/stream failures send a polite error. Heartbeat updates every ten seconds while connected. Reconnect restores the consumer. `index.mjs` registers both tsx loaders, so plain `node` can import the shared TypeScript server modules.

SQL loads the nine catalog variants, store settings, factory holidays and application clock. Authenticated customer IDs are checked against users/companies; addresses, credit and five recent orders are restricted to that company. The last ten messages exclude the current request and remove tool/think/citation markup. Assistant history from another authenticated company is excluded. Unauthorized SO numbers are rejected before generating an answer; the ORDER tool also uses `getOrderForCompany`.

`lib/retrieve.mjs` exports `retrieve(db, query, options?)` (also default), `rrf(...lists)` and `rerank(query, candidates, options?)`. Retrieval embeds `query: ...` with multilingual E5 (384 dimensions), takes vector top20 plus trigram top20, merges by chunk ID using reciprocal ranks with constant 60, takes top20, optionally reranks and returns top4 `{id,filename,page,content,score}`. Thai word segmentation and section headings help lexical ranking; mixed price/document questions retrieve the document clause while SQL handles price. Embedding failure retains lexical results. Rerank off, malformed output, failure or a three-second timeout retains RRF order. Standalone embedding timeout is 600 seconds; chat has an 85-second deadline to fit the HTTP 90-second timeout. Options: `rerank`, `embedUrl`, `rerankUrl`, `fetch`, `signal`.

Short follow-up retrieval queries include the last two user questions so document searches keep the conversation topic. Unpaid production questions use `checkAdvance()` to enforce the shared prepay guard.

The final system line is one-line `CTX_JSON`. No PDF facts are embedded in code or prompts. PRICE uses `priceFromInput`; QUOTE uses `createQuote` and publishes quote events; ORDER uses `getOrderForCompany`. IDs inside model JSON cannot select another company. At most two tool actions are executed. General shipping/earliest-date PRICE inputs use SQL defaults for omitted product/quantity fields; explicit invalid input remains subject to shared validation. QUOTE does not invent missing required fields.

The incremental scanner hides split tool JSON, think blocks and citation markers, maps valid chunk numbers to deduplicated cites, and emits fresh deltas. Sentence events have ascending seq starting at 1, use Thai endings/newlines/punctuation and cap text at 200 characters while preserving decimals. Requested TTS jobs are published immediately with original reply/correlation properties. Assistant text, cites and metadata are saved before done; done always includes retrieval and product arrays. A completed saved message can be replayed on redelivery.

## Local mock run

From repository root, install shared dependencies with `npm ci --prefix web` and `npm ci --prefix e2e`. Export your allocated DB, MQ, embed and port settings (do not read `.env` files):

```sh
export MODE=mock MQ_PREFIX=T13_ PORT=4602 MOCK_LLM_PORT=5102
export DATABASE_URL=postgres://dev:dev@127.0.0.1:56432/t_t13
export AMQP_URL=amqp://guest:guest@127.0.0.1:56672
export EMBED_URL=http://127.0.0.1:56680
export LLM_BASE_URL=http://127.0.0.1:5102/v1 LLM_MODEL=mock LLM_API_KEY=mock
export RERANK_URL=http://127.0.0.1:5102 RERANK=on
export MQ_API=http://127.0.0.1:56673 ALLOW_TEST_RESET=1 MOCK_LATENCY_MS=0
# Fresh task database only:
node db/apply.mjs --reset
node workers/chat-worker/tools/dev-service.mjs start mock
node workers/chat-worker/tools/dev-service.mjs start rag
node workers/chat-worker/tools/dev-service.mjs start chat
node workers/chat-worker/tools/dev-service.mjs start web
```

The rag worker requires its dependencies/PyMuPDF; see its README. Wait for all seven PDFs to be ready. Local PID/log/heartbeat state is under ignored `workers/chat-worker/test-results/service`. The controller stops only its own PID, verifies the absolute entrypoint, and never kills by process name. Use `stop [chat|rag|mock|web]` to stop an owned service. For foreground chat: `node workers/chat-worker/index.mjs`. Docker builds from root and copies `web/lib` and `shared`.

## Verify

Run Node checks and browser tests sequentially: browser `beforeEach` resets the same task database, which would race live SQL history tests.

```sh
node --check workers/chat-worker/index.mjs
node --check workers/chat-worker/lib/chat.mjs
node --check workers/chat-worker/lib/context.mjs
node --check workers/chat-worker/lib/retrieve.mjs
node --check workers/chat-worker/lib/stream.mjs
node --test workers/chat-worker/test/*.test.mjs
export SVC_CHAT_WORKER_STOP='node workers/chat-worker/tools/dev-service.mjs stop'
export SVC_CHAT_WORKER_START='node workers/chat-worker/tools/dev-service.mjs start'
BASE_URL=http://localhost:4602 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  ./e2e/node_modules/.bin/playwright test -c e2e/playwright.config.ts \
  'e2e/tests/(C[0-9]+|R[0-9]+|M[0-9]+|Q02).spec.ts'
```

The 29 browser files cover fourteen chat cases, eight RAG cases, six five-turn conversations (30 rounds) and queue recovery. They retain shared reset/typeSlow/hold helpers and video configuration. R07 uploads the supplied promotion fixture via the owner UI and waits for ready. RAG assertions retain source filename/page/link requirements. Numeric and keyword assertions allow natural-language variation.

## Verification record

2026-10-26, mock only:

- All five runtime modules passed `node --check`; `git diff --check` passed.
- All 14 Node checks passed (4.4 s), including live SQL privacy/history, real mock chat with rerank off/timeout, prepay versus earned credit, streaming TTS timing and live MQ retry/DLQ. The DLQ test preserves unrelated queued messages while locating its unique marker.
- All 29 current browser scenarios passed: the last complete run passed 28 cases in 10.8 min; M05 still used its previously collected logged-in fixture. After aligning M05 with the specified public conversation, its isolated rerun passed in 32.4 s. This covers all 30 M rounds. The exact numeric/source/page criteria were retained. R07 uploaded the existing fixture through the owner UI. Q02 stopped/restarted only the owned worker and retained the queued question.
- Full-run videos/report: `e2e/test-results/`; corrected M05 video/report: `e2e/test-results/m05-rerun/` (ignored runtime artifacts).
- `docker build -f workers/chat-worker/Dockerfile -t saisai-t13-chat:mock .` passed.
- Owned chat/rag/mock/web processes were stopped after verification. Allocated DB documents remain available.

Only `workers/chat-worker/` and T13-owned browser files changed. No central dependencies/schema or other owners' files were edited. No source PDFs/facts/questions, voice fixtures or legacy files changed. No compose, GPU rental or push operations were used.

Recorded T13 commits began at 09:38 +07 on 2026-10-26; this continuation finished around 10:09 +07, with investigation before the first commit. Active time before the account handoff was not recorded; no claim is made about its duration.
