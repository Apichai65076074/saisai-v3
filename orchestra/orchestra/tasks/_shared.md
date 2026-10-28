# สัญญากลาง SaiSai v3 (ทุก worker ต้องยึด · ห้ามเปลี่ยนชื่อ/รูปแบบที่กำหนดไว้ที่นี่)

requirement เต็ม: `/root/runs/saisai/PROBLEM.md` (= SAISAI.md · อ่านเฉพาะหัวข้อที่เกี่ยวกับงานคุณ · **ข้ามส่วน Vast.ai/GPU** · ทุกงานสร้าง/ทดสอบในโหมด **mock** เท่านั้น ห้ามเช่า GPU) · ห้ามเปิดโฟลเดอร์ `_solution/` ใด ๆ

**ข้อยกเว้นเฉพาะ T22/T23 ตามบันทึกอนุมัติผู้ใช้ 27/10/2026 09:20:** ทำ MODE=ai และเช่า GPU ตาม PROBLEM 4.6/9/9.x ได้หลัง T24 จบ ตาม prompt งานนั้นเท่านั้น; งบรวมสองงานไม่เกิน $15 และเมื่อถึง $12 ต้องหยุดรอผู้ใช้ (destroy เครื่องของงานก่อนรอ ไม่ปล่อยคิดเงิน); baseline→×2→×4 เพิ่มจากชุดเดิม ห้ามเช่าชุดใหม่ซ้ำ; verified=true reliability>0.98 และถูกสุดที่เข้าข้อกำหนด/เพดานต่อใบ; SSH ใช้ VAST_SSH_KEY_FILE เท่านั้น ห้าม key อื่น; ห้ามเปิด/พิมพ์ credential ใช้ toolkit อ่าน credential ภายใน process ได้ ห้าม source/cat .env หรือส่ง key เข้า prompt/log; หลังจบ/ล้มเหลวต้อง destroy เครื่องของงานทั้งหมดและยืนยัน show_instances ว่าง (ถ้ามีเครื่องผู้อื่น ห้ามแตะ ให้รายงานแยก)

## 0) สภาพแวดล้อม
- repo = `/root/runs/saisai/app` (คุณทำงานใน worktree ของ repo นี้) · root ของ repo = root ของแอป (ไม่มีโฟลเดอร์ `app/` ซ้อน · path ใน PROBLEM ที่ขึ้นต้น `web/` `workers/` ฯลฯ = path จาก root นี้)
- **ห้าม `pkill`/`killall` ตามชื่อ process** (worker หลายตัวรันพร้อมกัน) — หยุดเฉพาะ PID ที่คุณเปิดเอง (เก็บ `$!` ไว้) หรือ `fuser -k $PORT/tcp` ของพอร์ตตัวเอง
- **รายงานเวลา**: ถ้าเวลารวมเกินเป้า 3 ชม. ให้บันทึกตามจริง (ห้ามลดเคส/ลดเกณฑ์เพื่อให้ทันเวลา)
- **ข้อมูลที่ให้มาแล้ว — ห้ามสร้างใหม่/ห้ามแก้** (commit อยู่ใน main แล้ว):
  - `docs/pdf/*.pdf` 7 เล่ม 122 หน้า · `data/facts/*.json` (ต้นฉบับความจริงของ PDF) · `tools/verify_pdfs.py`
  - `gemini/rag-questions/*.jsonl` คำถาม RAG 770 ข้อ (`{qid, book, question, answer, fact_ids, pages, type, difficulty}`) · `gemini/check_questions.py` (รันจาก root: `python3 gemini/check_questions.py`)
  - `e2e/voice-fixtures/V01–V10.wav` + `questions.json` `index.json` (key = sha256 ของไฟล์ wav) `sentences.json`
  - `legacy/` = สำเนาอ่านอย่างเดียวของระบบเดิม `saisai-legacy-change-request` (`legacy/web/SPEC.md` · `legacy/web/lib/rules.ts` · `legacy/db/init/02-seed.sql` …) — ตัวเลขธุรกิจ/ข้อความ error/testid เดิม/seed มาจากที่นี่ **ห้ามแก้ไฟล์ใน `legacy/`**
- Node 22 · python3 (มี/ติดตั้ง `pymupdf` ได้) · docker (**ห้าม `docker compose up/down/run` เว้นงาน exclusive** · `docker compose config` และ `docker build` ทำได้) · Playwright Chromium `/ms-playwright/chromium-1247` (`PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` · **ห้าม `npx playwright install`**) → ล็อก `@playwright/test` = **`1.64.0-alpha-1790635538000`** (ตรงกับ chromium 1247)
- ffmpeg ของระบบไม่มี → e2e ใช้ devDependency `ffmpeg-static` · image ของ mock-llm `apt-get install -y ffmpeg espeak-ng`
- ⚠️ ดึงข้อความ PDF ไทยด้วย **PyMuPDF (`fitz`)** — `pypdf` ทำสระ/วรรณยุกต์หาย (บทเรียนจาก BuildMart)
- **ตัวอย่างโค้ดอ้างอิง (อ่านอย่างเดียว · ห้ามแก้ · ห้าม copy ตรรกะธุรกิจ):** `/root/runs/buildmart/app` = ระบบ BuildMart ที่ทำเสร็จแล้วด้วยสถาปัตยกรรมเดียวกัน (mock-llm · fake-mic · lib/mq · worker · e2e วิดีโอ→GIF/MP4 · eval · loadtest) ใช้ดูรูปแบบได้ ประหยัดเวลา แต่ชื่อ/ตัวเลข/ข้อความต้องตามสัญญานี้
- dev infra กลาง (ค่าอยู่ท้าย prompt): Postgres+pgvector (`DATABASE_URL` = ฐานของงานคุณคนเดียว) · RabbitMQ (`AMQP_URL` · UI/HTTP API ที่พอร์ต 56673 guest/guest) · embedder TEI (`EMBED_URL`) · **ตอนทดสอบตั้ง `MQ_PREFIX=<id งาน>_`** (เช่น `T10_`) ทุกชื่อคิว/exchange ขึ้นต้นด้วย prefix นี้ (ค่าเริ่มต้น `''` ใน compose)
- ตั้ง dev db ของงานคุณ: `node db/apply.mjs --reset` (ใช้ `$DATABASE_URL`) แล้วเปิดเว็บ `cd web && PORT=$PORT npm run dev` · mock-llm `PORT=$MOCK_LLM_PORT node mock-llm/server.mjs` · worker `node workers/<x>/index.mjs` · e2e `cd e2e && BASE_URL=http://localhost:$PORT npx playwright test tests/<CASE>.spec.ts`
- พอร์ต/ของที่ห้ามแตะ: 3400 3500 4100 4200 · container `saisai06-*` `saisai05-*` `app-*` `paintpod-*` `buildmart-*` `bm-*` · ห้าม `docker compose down -v` · ห้ามลบ volume · ใช้ `PORT` ที่ได้รับสำหรับ dev server เท่านั้น
- ห้าม commit `.env*` (ยกเว้น `.env.example`) · ห้ามอ่าน/พิมพ์ค่าใน `.env` ใด ๆ · ห้าม git push

## 1) โครงโฟลเดอร์ + เจ้าของ (แก้ไฟล์ของคนอื่นได้เฉพาะ "เพิ่มบรรทัดที่จำเป็น" และต้องบอกในรายงาน)
```
docker-compose.yml .env.example .dockerignore README.md db/ (Dockerfile · init/001_schema.sql · 002_seed.sql · apply.mjs · README.md)   T04
web/ โครง Next.js 14: package.json (ติดตั้ง dependency ทั้งทีมไว้ครบ ข้อ 4) tsconfig · next.config.mjs · Dockerfile · app/layout.tsx · app/globals.css
     · middleware.ts · lib/db.ts · lib/clock.ts · lib/auth.ts · lib/money.ts · app/api/health/ · app/api/auth/ · app/api/test/ · components/Nav.tsx   T04
e2e/package.json · e2e/playwright.config.ts · e2e/lib/ (helpers: reset · login · typeSlow · hold · chat helpers)                          T04
web/lib/rules.ts (สำเนา byte ต่อ byte จาก legacy) · web/lib/server/pricing.ts · web/app/api/quote/ · web/tests/unit/                   T05
web/public/img/ · web/public/assets/                                                                                               T06 (cyolo)
web/app/(shop)/ (login products order orders orders/[no] claims samples) · web/app/api/{orders,claims,samples,products,addresses}/
     · web/lib/server/{orders,products,claims,samples}.ts · web/lib/i18n/                                                          T07
web/app/quotes/ · web/app/api/quotes/ · web/lib/server/quotes.ts                                                                 T08
web/app/staff/ · web/app/owner/holidays/ · web/app/api/staff/ · web/app/api/owner/ · web/components/notify/ · workers/notify-worker/ T09
web/lib/mq/ · shared/mq-topology.mjs · web/app/api/chat/                                                                          T10
mock-llm/ · e2e/voice-fixtures/tts-cache/ (ถ้าจำเป็น · ห้ามแก้ไฟล์ V*.wav/json เดิม)                                                T11
workers/rag-worker/ · web/app/admin/docs/ · web/app/api/admin/docs/ · web/app/api/docs/ · e2e/fixtures/SS-PROMO-NOV.pdf             T12
workers/chat-worker/                                                                                                             T13
web/components/chat/ (รวมช่องวาง mascot ที่หัวหน้าต่าง)                                                                            T14
workers/stt-worker/ · workers/tts-worker/ · web/app/api/voice/ · web/app/api/tts/ · web/components/voice/ · e2e/lib/fake-mic.ts       T15
web/components/three/ (ฉาก 3D + Mascot) · web/app/page.tsx                                                                         T16
web/app/admin/eval/ · web/app/api/admin/eval/ · e2e/fixtures/eval-run-{a,b}.json                                                  T17
eval/                                                                                                                            T18
web/app/admin/load/ · web/app/api/admin/load/ · e2e/fixtures/load-run-a.json · loadtest/criteria.json                             T19
loadtest/run_load.mjs · loadtest/results/ · loadtest/REPORT.md                                                                    T20
e2e/scripts/ (GIF/MP4/รายงาน) · test-gifs/ · test-videos/ · TEST_REPORT.md · SALE_RUN.md · แก้ e2e/playwright.config.ts ได้          T21
db/init/5NN-<TID>-*.sql (ไฟล์ migration ของงานตัวเอง · เลขไม่ซ้ำ: T07=510 T08=520 T09=530 T10=540 T12=550 T13=560 T15=570 T17=580 T19=590)   แต่ละงาน
```
- **Playwright 1 เคส = 1 ไฟล์** `e2e/tests/<CASE>.spec.ts` (เช่น `W03.spec.ts`) · ชื่อ test ขึ้นต้นด้วยรหัสเคส (`test('W03 …')`) · เจ้าของไฟล์ = งานที่รับเคสนั้นในตารางข้อ 10 · ห้ามแก้ไฟล์เคสของงานอื่น

## 2) docker compose (`docker-compose.yml` · บรรทัดแรก `name: saisai3` **บังคับ** · ห้ามได้ชื่อ project `app`/`saisai05`/`saisai06`)
- build context ของ service ที่สร้างเองทุกตัว = `.` (root) + `dockerfile: <dir>/Dockerfile` → COPY `web/lib/` `shared/` `docs/pdf/` `e2e/voice-fixtures/` ได้ตรง ๆ · **ห้าม bind mount** ยกเว้น `./docs/pdf:/app/docs:ro` ของ rag-worker
- ทุก service มี healthcheck · `depends_on: {x: {condition: service_healthy}}` · volume ชื่อ `pgdata` `hfcache` (ห้ามลบ)

| service | รายละเอียด | healthcheck |
|---|---|---|
| `db` | build `db/Dockerfile` (FROM `pgvector/pgvector:pg16` + COPY `db/init/*.sql`) · user/pass/db `ss/ss/saisai` · ไม่เปิดพอร์ต | `pg_isready -U ss` |
| `rabbitmq` | `rabbitmq:4-management` · `127.0.0.1:${MQ_UI_PORT:-15672}:15672` (guest/guest) · 5672 ไม่เปิดออก | `rabbitmq-diagnostics -q ping` |
| `embedder` | `ghcr.io/huggingface/text-embeddings-inference:cpu-1.9` `--model-id intfloat/multilingual-e5-small` (dim **384**) · volume `hfcache:/data` | `/health` |
| `web` | `${WEB_PORT:-3600}:3000` · Next standalone | `GET /api/health` → `{ok:true}` |
| `chat-worker` `rag-worker` `stt-worker` `tts-worker` `notify-worker` | `node:22-bookworm-slim` (rag-worker Python ได้) | ไฟล์ heartbeat `/tmp/healthy` อัปเดตทุก 10 วิ |
| `mock-llm` | `profiles: ["mock"]` · port 8000 ใน network | `GET /health` |

- ⚠️ เครื่องนี้มี container อื่นถือพอร์ต 15672 อยู่ → ตอนรันจริง (งาน exclusive) ใส่ `MQ_UI_PORT=15673` ใน `.env` ถ้า 15672 ไม่ว่าง · สคริปต์ที่อ่าน RabbitMQ API ใช้ env `MQ_API` (ค่าเริ่มต้น `http://localhost:15672`)
- env (ทั้ง 16 ตัวใน `.env.example` ตาม PROBLEM ข้อ 6 + ค่าเริ่มต้นใน compose `${VAR:-default}`): `MODE=mock` · `DATABASE_URL=postgres://ss:ss@db:5432/saisai` · `AMQP_URL=amqp://guest:guest@rabbitmq:5672` · `EMBED_URL=http://embedder:80` · `LLM_BASE_URL=http://mock-llm:8000/v1` · `LLM_MODEL=mock` · `LLM_API_KEY=mock` · `STT_URL` `TTS_URL` `RERANK_URL` = `http://mock-llm:8000` · `AIBOX_API_KEY=mock` · `RERANK=on` · `CHAT_PREFETCH=4` `STT_PREFETCH=4` `TTS_PREFETCH=2` · `EVAL_TOKEN=ss-eval` · `ALLOW_TEST_RESET=1` · เพิ่มได้: `MQ_PREFIX=` `MOCK_LATENCY_MS=800` `SESSION_SECRET` `MQ_UI_PORT` `WEB_PORT` · `env_file: [{path: .env.vast, required: false}, {path: .env.aibox, required: false}]`
- คำสั่งที่ต้องใช้ได้: `docker compose --profile mock up -d --build` · `--scale chat-worker=2 --scale stt-worker=2 --scale tts-worker=2`

## 3) Database (`db/init/001_schema.sql` ขึ้นต้น `CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm;`)
- **ตารางธุรกิจเดิม** (companies · users · addresses · products · orders · order_lines/งวดสถานะ · payments · claims · claim_images · sample_requests · holidays ฯลฯ) = **โครง + ข้อมูลตาม `legacy/db/init/02-seed.sql` ทุกแถว** (T04 เลือกชื่อคอลัมน์ให้ตรง legacy มากที่สุด แล้วเขียนสรุปทุกตาราง/คอลัมน์ใน `db/README.md` — **งานอื่นอ่าน `db/README.md` เป็นสัญญา**) · ต้องได้: products 9 แถว (P01–P09 ตาม PROBLEM ข้อ 2) · บริษัท C01–C05 · ผู้ใช้ U01–U08 · ที่อยู่ ADDR-01..04 ของ C01 (160/49/50/51 กม.) · SO ถึง SO-0018 · CL ถึง CL-0004 · SR ถึง SR-0003 · วันหยุด 2026-10-23 · 2026-12-05 · 2026-12-31
- **ตารางใหม่ v3:**
```sql
app_settings(key text pk, value text)                -- 'now' = ISO เวลา "วันนี้" ของระบบทดสอบ (ไม่มีแถว = เวลาจริง)
doc_counters(prefix text pk, n int)                   -- SO CL SR QT · next_doc_no('QT') → 'QT-0001' (atomic · ต่อจาก seed)
quotes(id serial pk, quote_no text unique, company_id int, created_by int, input jsonb, lines jsonb, valid_until date, converted_order_no text, created_at timestamptz default now())
docs(id serial pk, filename text unique, bytes bytea, pages int, chunks int default 0, status text default 'queued', error text, created_at timestamptz default now(), updated_at timestamptz default now())  -- queued|processing|ready|failed
doc_chunks(id serial pk, doc_id int references docs on delete cascade, filename text, page int, chunk_index int, content text, embedding vector(384), tsv tsvector)
   -- index: gin (content gin_trgm_ops) · hnsw (embedding vector_cosine_ops)
chat_sessions(id text pk, user_id int null, company_id int null, lang text default 'th', created_at timestamptz default now())
chat_messages(id serial pk, session_id text, role text, text text, cites jsonb default '[]', via text default 'text', meta jsonb default '{}', created_at timestamptz default now())  -- role user|assistant · via text|voice
notifications(id serial pk, type text, no text, message text, read boolean default false, created_at timestamptz default now())  -- order.created|claim.created|quote.created
tts_audio(audio_id text pk, wav bytea, duration_ms int, engine text, lang text, created_at timestamptz default now())
eval_runs(id serial pk, label text, created_at timestamptz default now(), config jsonb, summary jsonb, items jsonb)
load_runs(id serial pk, label text, created_at timestamptz default now(), config jsonb, stages jsonb, max_users_ok int)
```
- `db/apply.mjs [--reset]` = รัน `db/init/*.sql` ตามลำดับชื่อไฟล์กับ `$DATABASE_URL` (`--reset` = `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` ก่อน) · migration ของงานอื่น = ไฟล์ `db/init/5NN-<TID>-*.sql` (idempotent `IF NOT EXISTS`)
- `POST /api/test/reset {now?}` (T04 · ใช้ได้เมื่อ `ALLOW_TEST_RESET=1`) = ลบข้อมูลธุรกิจ + ใส่ seed ใหม่ + ล้าง quotes/notifications/chat/tts_audio (**ไม่ลบ docs/doc_chunks/eval_runs/load_runs**) + ตั้ง `app_settings.now` = `now ?? '2026-10-11T10:00:00+07:00'` → `{ok:true, now}`
- **ห้ามใส่ข้อมูลจาก PDF ลง DB/seed/system prompt** (ข้อมูลเอกสารมาจาก RAG เท่านั้น)

## 4) Web (Next.js 14.2.x App Router + TS strict · `output:'standalone'` · port 3000 ใน container)
- dependency (T04 ใส่ครบใน `web/package.json` ทีเดียว · งานอื่นเพิ่มได้เฉพาะที่จำเป็นและบอกในรายงาน): `next@14.2.35 react@18 react-dom@18 pg amqplib decimal.js three @react-three/fiber@8.18.0 @react-three/drei@9.122.0 @react-three/postprocessing@2.19.1 tsx` · dev: `typescript @types/* vitest`
- `lib/rules.ts` = สำเนา **byte ต่อ byte** ของ `legacy/web/lib/rules.ts` (sha256 `1f880cd34c63667d90b7fac8e0cdbd6dfaa0a80ef270cda007e4957dfbf3122c` · ห้ามแก้ · ห้าม format · ห้ามเปลี่ยน line ending · ตั้ง `.gitattributes`: `web/lib/rules.ts -text`) · **ตัวเลขเงิน/กฎทุกตัวต้องมาจาก `quote()` ใน rules.ts** — ห้ามเขียนสูตรเงินที่อื่น (grep ตรวจ)
- `lib/server/*.ts` = โค้ดฝั่ง server ที่ไม่พึ่ง Next (import ได้แค่ `pg` `decimal.js` `../rules` ไฟล์อื่นใน lib/server) → **chat-worker import ตรงด้วย `tsx`** (เช่น `import { priceFromInput } from '../../web/lib/server/pricing.ts'`) · ใน Docker ให้ COPY `web/lib/` ไปที่เดิม
  - `pricing.ts` (T05): `priceFromInput(db, input, ctx:{now, companyId?}) → {ok, lines?, errors?, upsell?, earliestPickup?, ...}` = โหลดสินค้า/ที่อยู่/วันหยุด/ประวัติจาก DB แล้วเรียก `quote()` · input `{model, color, quantity, logo?, addressCode?|distanceKm?, pickupDate?}`
  - `orders.ts` (T07): `createOrder(db, {companyId,userId,input,now})` (ตรวจกฎทุกข้อ · กันซ้ำ 10 นาที · publish `order.events`) · `getOrderForCompany(db, no, companyId)` (บริษัทอื่น = null → "ไม่พบออเดอร์นี้") · `listOrders(db, companyId, limit)`
  - `quotes.ts` (T08): `createQuote(db, {companyId,userId,input,now}) → {quoteNo, lines, validUntil}` · `getQuoteForCompany` · `convertQuote`
- `lib/db.ts` pool `pg` · `lib/clock.ts` `now(db)` = `app_settings.now` หรือเวลาจริง (worker ใช้ SQL เดียวกัน) · `lib/money.ts` แสดงเงิน `฿63,023.00` (`th-TH` 2 ตำแหน่ง) · `data-value` = ตัวเลขดิบไม่มี comma (`"63023.00"`) · API ส่งเงินเป็นสตริง 2 ตำแหน่ง · error เดิม `{"ok":false,"errors":[{code,message,field?}]}` (code/message ตาม `legacy/web/SPEC.md` ข้อ 4)
- auth (T04): `POST /api/auth/login {email,password}` → cookie `ss_session` (HMAC ด้วย `SESSION_SECRET` · httpOnly) · `POST /api/auth/logout` · `GET /api/auth/me` · `lib/auth.ts getSession()` → `{userId, companyId, role:'customer'|'staff'|'owner', lang, email}|null` · รหัสผ่านทดสอบตาม `legacy/web/SPEC.md` ข้อ 6 · cookie `lang` (th|en · ปุ่ม `lang-toggle`) · cookie `ss_chat` = chat session id (uuid)
- หน้า: `/` (T16) · `/login` `/products` `/order` `/orders` `/orders/[no]` `/claims` `/samples` (T07) · `/quotes` `/quotes/[no]` (T08) · `/staff/orders` `/staff/claims` `/owner/holidays` (T09) · `/admin/docs` (T12) · `/admin/eval` (T17) · `/admin/load` (T19) · หลังร้านไม่ล็อกอิน/สิทธิ์ไม่พอ → redirect `/login`
- รูป (T06): `/img/mascot/nongsai-{concept,idle,listening,thinking,talking}.webp` · `/img/banner-factory-3d.webp` · `/assets/bottle-<slug>.png` (slug ตาม PROBLEM ข้อ 2 เช่น `bottle-b250-green.png`) — ถ้ายังไม่มีไฟล์ `<img>` ต้องมี alt และ onError ซ่อน
- UI: CSS เอง (ไม่ใช้ UI library) · สีแบรนด์ฟ้าแก้ว `#0E7C9B` · น้ำเงินเข้ม `#0B2E3F` · ชา `#A0522D` · ไทย/อังกฤษ ผ่าน `lib/i18n`

## 5) data-testid (ห้ามเปลี่ยนชื่อ · e2e ใช้ตามนี้)
- หน้าหลักเดิม: ตาม `legacy/web/SPEC.md` ข้อ 3 (T07 คัดลอกรายการ testid ทั้งหมดที่ใช้จริงลง `web/lib/i18n/TESTIDS.md`) · ที่ e2e ใช้แน่: `product-list` (`data-count`) · `product-card` (`data-slug`) · `error-quantity` · `upsell-warning` · `earliest-pickup` (`data-value` YYYY-MM-DD) · `line-bottles` `line-discount` `line-logo` `line-shipping` `line-subtotal` `line-vat` `line-total` (ทุกตัวมี `data-value` · `line-shipping` มี `data-trips`) · `sales-contact` · `quote-request` · `order-confirm` · `order-no` · `claim-window-error` · `sample-*` · `login-email` `login-password` `login-submit` · `lang-toggle`
- v3 ตาม PROBLEM ข้อ 3 ตาราง testid: `chat-open` `chat-panel` `chat-close` `chat-input` `chat-send` `chat-msg-user` `chat-msg-bot` (`data-done="true"` เมื่อจบ) `chat-status` `chat-suggest-1..3` · `voice-mic` `chat-msg-voice` `voice-mode` `tts-play` `tts-auto` `chat-audio` (`<audio>` เดียวในหน้าต่างแชท · `data-seq` ที่กำลังเล่น · `data-lang`) `chat-cite` (`data-filename` `data-page` · ข้อความ `📄 <ไฟล์> · หน้า N` · ลิงก์ `/api/docs/<ไฟล์>#page=N` แท็บใหม่) · `mascot` (`data-state` idle|listening|thinking|talking · `data-mouth` 0.00–1.00) · `quote-no` `quote-valid-until` (`data-value`) `quote-convert` `quote-expired` `quote-print` · `notify-box` `notify-item` (`data-type`) · `doc-row` (`data-filename` `data-status`) `doc-upload-input` `doc-upload-submit` · `eval-run-select` `eval-metric` (`data-set` `data-metric` `data-value`) `eval-item` (`data-id` `data-pass`) `eval-compare` `eval-by-doc` · `load-run-select` `load-chart` (`data-points`) `load-max-users` (`data-mode` `data-value`) · `hero-3d` `hero-image` · `bottle-3d` (`data-model` `data-color` ใน DOM overlay สำหรับคลิก/ตรวจ)

## 6) RabbitMQ (ชื่อจริง = `${MQ_PREFIX}` + ชื่อ · amqplib · ack หลังทำเสร็จเท่านั้น · ประกาศด้วย option จาก `shared/mq-topology.mjs` (T10) เท่านั้น)
| ชื่อ | ชนิด | ข้อความ |
|---|---|---|
| `chat.request` | queue durable · `x-max-priority: 5` · `x-dead-letter-exchange: ''` + `x-dead-letter-routing-key: <prefix>chat.dlq` | `{sessionId, messageId, text, lang?, via:'text'|'voice', userId?, companyId?, tts:boolean}` + `reply_to` (=instanceId ของ web) + `correlation_id` (=messageId) · priority voice 3 · text 1 · eval/load 0 · **companyId/userId ใส่โดย web จาก session ฝั่ง server เท่านั้น** |
| `chat.reply` | exchange **direct** durable | routing key = `reply_to` · แชท `{messageId, type:'status'|'delta'|'sentence'|'done'|'error', text, seq?, cites:[{filename,page}], quoteNo?, retrieved:[{filename,page,score}], products:[code], lang}` · tts `{type:'tts', messageId, seq, audioId, durationMs, engine, lang}` · stt `{type:'stt', text, language, durationMs}` / `{type:'stt', error}` |
| `chat.dlq` | queue durable | ล้มเกิน 2 ครั้ง (header `x-retry` นับ · ครบ → nack ไม่ requeue) |
| `tts.request` | queue durable · prefetch `TTS_PREFETCH` | `{messageId, seq, text, lang:'th'|'en'}` + reply_to + correlation_id · chat-worker ส่ง **ทีละประโยคทันทีที่จบประโยค** เมื่อ `tts:true` |
| `stt.request` | queue durable · prefetch `STT_PREFETCH` | `{audioB64, mime, lang?}` + reply_to + correlation_id (≤ 30 วิ / 2 MB) |
| `rag.ingest` | queue durable · prefetch 1 | `{docId}` |
| `order.events` | exchange **fanout** durable | `{type:'order.created'|'claim.created'|'quote.created', no}` → คิว `notify.events` (notify-worker) |
- web `lib/mq/` (T10): connection เดียวต่อ process + reconnect · `instanceId` สุ่ม · คิวชั่วคราว exclusive ผูก `chat.reply` ด้วย routing key = instanceId · `rpc(queue, payload, {timeoutMs, priority, onMessage})` · `publish(exchange, payload)` · `consumerCount(queue)` · `queueDepth(queue)`
- `POST /api/chat {text, lang?, via?, tts?}` (T10) → บันทึกข้อความ user → SSE (`data: <json>\n\n`) ส่ง `{type:'status', text: consumer=0 ? 'รอคิว…' : 'กำลังคิด…'}` ทันที · backpressure ตาม PROBLEM 4.2 (> 2× ความจุ "รอคิว ลำดับที่ n" · > 4× tts:false · > 8× HTTP 429) · ส่งต่อทุก reply ของ messageId (รวม type tts) จน `done`/`error` **และ** tts ของทุก sentence ที่ประกาศไว้ (หรือ timeout 20 วิหลัง done) · timeout 90 วิ → `{type:'error', text:'ขออภัยค่ะ ระบบตอบช้า ลองใหม่อีกครั้งนะคะ'}` · `GET /api/chat/history`
- `POST /api/voice` multipart `audio` (> 2 MB → 413) → `stt.request` → `{text, language, durationMs}` · ว่าง → 422 `{error:'ไม่ได้ยินเสียง ลองพูดอีกครั้งค่ะ'}` · `GET /api/voice/status` → `{enabled: consumerCount('stt.request')>0}` · `POST /api/tts {text, lang?}` → `{audioId, durationMs, engine}` · `GET /api/tts/[audioId]` → `audio/wav` · `GET /api/tts/status` → `{enabled}` (T15)

## 7) chat-worker ↔ LLM / ai-box (OpenAI-compatible) — สัญญากับ mock-llm
- `POST ${LLM_BASE_URL}/chat/completions` `{model, messages, stream:true, temperature:0.2}` · `Authorization: Bearer ${LLM_API_KEY}`
- messages: `[{role:'system', content:<คำสั่ง + ข้อมูล>}, ...ประวัติ 10 ข้อความล่าสุด (ตัด tag แล้ว), {role:'user', content:คำถาม}]`
- **บรรทัดสุดท้ายของ system message** = `CTX_JSON: {...}` (JSON บรรทัดเดียว) = `{shop:{name, phone:'02-000-0000', line:'@saisai-test', bank:{name:'ธนาคารทดสอบ', account:'000-0-00000-0', holder}}, today:'2026-10-11', lang, loggedIn, company:{code,name,addresses:[{code,label,distanceKm}], credit:{deliveredCount, terms:'prepay'|'credit30'}, recentOrders:[{no,status,step,pickupDate,dueDate}]}|null, products:[{code,slug,model,sizeMl,color,colorTh,price,minQty}], rules:{orderStep:100, maxQty:200000, logoPerUnit:'0.80', logoMinQty:5000, freeKm:50, tripFee:'1500.00', tripSize:20000, salesKm:300, leadDays:14, holidays:[…], creditAfter:3, creditDays:30, sampleQuota:3, claimDays:7}, chunks:[{n, filename, page, text}] (top 4 หลัง rerank)}` — ค่าใน `rules` อ่านจาก `rules.ts`/DB (ห้ามพิมพ์ตัวเลขซ้ำในโค้ด worker)
- tag ในคำตอบ LLM: `[PRICE]{json}` → worker เรียก `priceFromInput` แล้วเรียก LLM อีกรอบด้วย message `{role:'user', content:'PRICE_RESULT: <json>'}` (วน ≤ 2) · `[QUOTE]{json}` → ต้องล็อกอินลูกค้า (ไม่ล็อกอิน → `QUOTE_RESULT: {"ok":false,"error":"LOGIN_REQUIRED"}`) → `createQuote` → `QUOTE_RESULT: {ok, quoteNo, validUntil, lines}` · `[ORDER_STATUS]{"orderNo"}` → `getOrderForCompany` → `ORDER_RESULT: {...}|{"ok":false,"error":"NOT_FOUND"}` · ตัด tag + `<think>…</think>` ก่อนส่ง delta/บันทึก
- cite: LLM อ้าง `[n]` (เลข chunk) → worker แปลงเป็น `cites` ไม่ซ้ำ แล้วตัด `[n]` ออก
- mock-llm (T11) `GET /health` → `{status:'ok', models:{llm:'mock',stt:'mock',tts:'mock',rerank:'mock'}}` · `POST /v1/rerank {query, documents[]}` → ลำดับเดิม score ลดหลั่น · `POST /v1/audio/transcriptions` (multipart `file` · sha256 ตรง `index.json` → ข้อความนั้น · ไม่ตรง → ถอด PCM ด้วย ffmpeg แล้วเทียบ envelope/ความยาวกับ V01–V10 · ไม่ใกล้ตัวไหน → `{text:''}`) → `{text, language, duration}` · `POST /v1/audio/speech {input, voice, language}` → WAV (`tts-cache/<sha256(text+lang)>.wav` ถ้ามี · ไม่งั้น espeak-ng ภาษา th/en สังเคราะห์ในหน่วยความจำ · ล้มอีก → โทน envelope ยาว clamp(ตัวอักษร×60 ms, 1.2–8 วิ)) · ทุก endpoint หน่วง `MOCK_LATENCY_MS` (ค่าเริ่มต้น 800 · ตั้ง 0 ได้ตอน unit test)
- tts-worker ตัด emoji/tag/markdown/ป้ายอ้างอิง · อ่านเงิน/รหัสเป็นคำ (`฿5.80` → "ห้าบาทแปดสิบสตางค์" · `B-250` → "บี สองร้อยห้าสิบ") · language ตามตัวอักษร (มีอักษรไทย → th)

## 8) RAG
- embed `POST ${EMBED_URL}/embed {"inputs":[...]}` → `[[384 floats]]` · prefix e5: เอกสาร `passage: ` · คำถาม `query: ` · TEI บน CPU ช้า → batch ≤ 16 และ timeout ยาว (600 วิ)
- chunk ~500 ตัวอักษร ซ้อน 80 · เก็บ filename/page · แถวตารางมีชื่อตาราง + หัวคอลัมน์ทุกชั้น/หัวแถว · เชิงอรรถติดกับตาราง · ตรวจสระ/วรรณยุกต์ไทยไม่เพี้ยน
- ค้น: vector (cosine `<=>`) top 20 + trigram (`word_similarity`/`%` จับรหัส `B-250` `LOT-` `P07`) top 20 → RRF `Σ 1/(60+rank)` → top 20 → rerank (`RERANK=on` · timeout 3 วิ · ล่ม/ช้า → ใช้ RRF) → top 4 · ฟังก์ชันค้นอยู่ที่ `workers/chat-worker/lib/retrieve.mjs` (T13) และ export ให้ eval ใช้ได้

## 9) ตัวเลขทดสอบหลัก (ต้องได้ตรง · ทั้งหมดผ่าน `quote()`)
W03 52,000.00 / −2,600.00 / 8,000.00 / 1,500.00 / 58,900.00 / VAT 4,123.00 / 63,023.00 · W04 ต.ค. −4,800.00 ค่าส่ง 0 (2 เที่ยว) 97,584.00 → พ.ย. −6,720.00 95,529.60 · W05 upsell ฿320.00 · upsell ฿260.00 (SPEC ข้อ 4) · W06 0.00 / 3,000.00 / `DISTANCE_TOO_FAR` · W07 `PICKUP_TOO_SOON` / `FACTORY_CLOSED` / earliest 2026-10-25 · W08 QT-0001 valid 2026-10-18 · W09 SO-0019 · W11 `SAMPLE_QUOTA` → SR-0004 · M02 30,720.00 / VAT 2,150.40 / 32,870.40 → 30,400.00 / 32,528.00 · M01 58,000.00 ลด 2,900.00 · M05 ครบกำหนด 2026-12-01

## 10) เจ้าของเคส Playwright (62 เคส · ไฟล์ `e2e/tests/<CASE>.spec.ts`)
| งาน | เคส |
|---|---|
| T07 | W01 W02 W03 W04 W05 W06 W07 W11 W12 W13 |
| T08 | W08 W09 W10 |
| T09 | W14 |
| T12 | Q03 |
| T13 | C01–C14 · R01–R08 · M01–M06 · Q02 |
| T15 | T01 T02 T03 · V01–V06 |
| T16 | D01 D02 D03 |
| T17 | E01 E02 E03 |
| T19 | L01 L02 |
| T20 | Q01 |
- ทุกเคส: `beforeEach` → `POST /api/test/reset` (เคสที่ระบุวันอื่นส่ง `now`) · ใช้ helper จาก `e2e/lib/` · พิมพ์ทีละตัว ~60 ms (`typeSlow`) · ค้างภาพ 3–5 วิ ก่อนจบ (`hold`) · `video: 'on'` (config ของ T04) · assert ตามคอลัมน์ "ผ่านเมื่อ" ของ PROBLEM ข้อ 7 **ห้ามลดเกณฑ์** · โหมด ai ต้องตรวจยืดหยุ่นได้ (หาตัวเลข/คำสำคัญในข้อความ ไม่เทียบทั้งประโยค)
- เคสที่ต้องหยุด/เปิด worker (Q02 Q03 V06) ใช้ helper `e2e/lib/services.ts` `stopService(name)` / `startService(name)` (T04 เขียน: ถ้ามี env `COMPOSE_PROJECT=saisai3` → `docker compose stop/start <name>` · ไม่งั้น → อ่านคำสั่งจาก env `SVC_<NAME>_STOP/START` สำหรับ dev process ของงานคุณ)

## 11) เกณฑ์ทั่วไปของทุกงาน
- `cd web && npm run build` ผ่าน (งานที่แตะ web) · TS strict ไม่ error · ไม่มี `console.error` ค้าง
- worker Node: `node --check` ผ่าน + สคริปต์ทดสอบ `<dir>/test/*.test.mjs` (`node --test`) ที่รันกับ dev infra ได้ (`MQ_PREFIX=<id>_`)
- เคส Playwright ของงานคุณต้องผ่านกับ dev server + worker/mock ที่คุณเปิดเอง (รายงานคำสั่งที่ใช้ใน README ของงาน) · ระบบรวมทดสอบซ้ำทั้งหมดในงาน T21
- เขียน README สั้น ๆ ในโฟลเดอร์ของงาน (วิธีรัน/ทดสอบ)
