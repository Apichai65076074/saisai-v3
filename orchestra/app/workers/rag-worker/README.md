# RAG documents (T12)

Node handles RabbitMQ/Postgres; Python with PyMuPDF reads PDF text and table geometry. Never use pypdf for these Thai PDFs. Startup inserts missing PDF filenames from `DOCS_DIR` (`/app/docs`, otherwise `docs/pdf`) and queues all `queued`/`processing` rows. The consumer uses the shared topology, prefetch 1, persistent messages, and acknowledges after committing the result. Interrupted work is redelivered; ready documents are skipped. Invalid PDFs become `failed`; transient errors retry twice before `failed`.

Text chunks target 500 characters with 80 overlap and preserve Thai combining marks. Table chunks repeat the title, all header levels and row labels, and footnotes. Each chunk retains filename/page. E5 passage embeddings are requested in batches of at most 16, with a 600-second timeout; vectors must contain 384 finite numbers. Chunk replacement and `ready` status commit atomically. A byte comparison prevents stale work overwriting a replacement upload. The schema provided by T04 already includes pgvector HNSW, pg_trgm GIN, and tsv indexes; no additional migration is needed. Retrieval belongs to T13.

`/admin/docs` and GET/POST `/api/admin/docs` require owner access. Upload multipart field `file` (PDF signature, safe ASCII filename, up to 20 MB). Same filenames replace the stored document and queue ingestion. Documents remain queued if publishing fails and are recovered on worker startup. The page polls statuses every second. `/api/docs/[filename]` serves the stored bytes as an inline PDF for citations.

## Run locally (mock only)

From repository root, export the task's provided `DATABASE_URL`, `AMQP_URL`, `EMBED_URL` and `MQ_PREFIX=T12_`. No `.env` file is needed.

```sh
npm ci --prefix workers/rag-worker
python3 -m pip install --no-deps -r workers/rag-worker/requirements.txt
# Only on a fresh task database (reset removes existing data):
node db/apply.mjs --reset
MODE=mock HEARTBEAT_FILE="$PWD/workers/rag-worker/test-results/service/healthy" \
  node workers/rag-worker/tools/dev-service.mjs start
```

`dev-service.mjs stop` controls only its own stored PID, verified against the absolute entrypoint in `/proc`. Runtime files are under ignored `workers/rag-worker/test-results/service/` so Playwright's output cleanup does not remove the PID file. Set `RAG_STOP_SIGNAL=SIGKILL` to exercise an abrupt crash. The container uses `/tmp/healthy`, updated every 10 seconds. Start web separately with `cd web && MODE=mock ALLOW_TEST_RESET=1 PORT=4600 npm run dev` using the same DB and MQ settings.

## Checks

```sh
node --check workers/rag-worker/index.mjs
node --check workers/rag-worker/lib.mjs
node --test workers/rag-worker/test/*.test.mjs
cd web && npm run build
```

The eight integration checks require the seven source PDFs to be ready. They compare extracted text against all supplied page facts, check 122 pages, all chunk metadata/vectors/Thai characters, LOG-026's two header levels and footnote, CAT-038's footnote, trigram codes, multilingual vector retrieval and invalid PDF rejection.

Generate the single permitted new PDF fixture with `python3 workers/rag-worker/tools/make_promo_pdf.py` (embedded Waree/Garuda Thai font; optional font path as second argument). The supplied fixture is already committed.

For Q03, stop the local worker and start it with `RAG_HOLD_MS=15000` (test-only delay after the processing transition). Keep the exported DB/MQ/embed settings in the Playwright environment:

```sh
export RAG_HOLD_MS=15000 RAG_STOP_SIGNAL=SIGKILL
export HEARTBEAT_FILE="$PWD/workers/rag-worker/test-results/service/healthy"
node workers/rag-worker/tools/dev-service.mjs stop
node workers/rag-worker/tools/dev-service.mjs start
export SVC_RAG_WORKER_STOP='node workers/rag-worker/tools/dev-service.mjs stop'
export SVC_RAG_WORKER_START='node workers/rag-worker/tools/dev-service.mjs start'
cd e2e
BASE_URL=http://localhost:4600 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  npx playwright test tests/Q03.spec.ts
```

Q03 resets business data, uploads through the owner UI, observes `processing`, kills the owned worker, reloads to check persisted state, restarts the worker, and verifies one ready row, page/chunk counts, and a valid inline PDF response. It records video and holds the final frame. For integrated service control use the shared `SVC_RAG_WORKER_*` commands or the authorized compose environment; ensure the test worker has the hold delay so a small one-page PDF does not finish before interruption.

## Verification record

- 2026-10-26: all 8 integration tests passed (168.5 s), seven source PDFs ready, 122 pages and 334 chunks; vector/trigram and table checks passed.
- `cd web && npm run build`: passed, including strict TypeScript checking.
- Q03: passed on the dev server with `RAG_HOLD_MS=15000`, owned PID killed with SIGKILL and restarted (50.7 s test, 57.9 s runner). The service PID state is outside Playwright's cleaned output directory. Final DB verification found exactly one promo document/chunk with the original Thai promotion text. Playwright video is under `e2e/test-results/`.
- HTTP checks passed: unauthenticated list 401, customer list 403, missing/invalid upload 400, missing document 404, stored PDF 200 with inline disposition.
- No central files, source PDFs, facts, questions, or legacy files were changed. No GPU was rented and no compose commands were run.
- Work was continued after account handovers. The earliest T12 commit is 2026-10-25 12:08 +07; completion is 2026-10-26 09:22 +07 (~21 h 14 min since that commit), so elapsed wall time exceeds the three-hour target (includes handover/offline gaps; earlier active working time was not recorded).
