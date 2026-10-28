# ใสใส กลาสแวร์ · SaiSai Glass v3

เว็บ B2B ขวดแก้ว + แชทบอท "น้องใส" (RabbitMQ · Hybrid RAG + reranker · STT/TTS · เว็บ 3D) — requirement เต็มอยู่ที่ `PROBLEM.md` ของโปรเจกต์
ตัวเลขเงิน/กฎทุกตัวมาจาก `quote()` ใน `web/lib/rules.ts` (สำเนา byte ต่อ byte ของ `legacy/web/lib/rules.ts`)

## รันทั้งระบบ (docker compose · project `saisai3`)
```bash
docker compose --profile mock up -d --build          # โหมด mock (ฟรี) → http://localhost:3600
docker compose --profile mock up -d --scale chat-worker=2 --scale stt-worker=2 --scale tts-worker=2
# AI จริง: วาง .env.vast (LLM_*) + .env.aibox (STT_URL TTS_URL RERANK_URL AIBOX_API_KEY) แล้ว
docker compose up -d --build
```
- พอร์ตที่เปิดออก: เว็บ `${WEB_PORT:-3600}` · RabbitMQ UI `127.0.0.1:${MQ_UI_PORT:-15672}` (guest/guest · ถ้า 15672 ไม่ว่างใส่ `MQ_UI_PORT=15673` ใน `.env`) · นอกนั้นอยู่ในเครือข่าย compose
- service: `db` (pgvector pg16) · `rabbitmq` · `embedder` (TEI multilingual-e5-small · 384 มิติ) · `web` · `chat-worker` `rag-worker` `stt-worker` `tts-worker` `notify-worker` · `mock-llm` (profile `mock`)
- ทุก service มี healthcheck · worker แตะไฟล์ `/tmp/healthy` ทุก 10 วิ · bind mount มีแค่ `./docs/pdf:/app/docs:ro` (rag-worker)
- env ทั้งหมดดู `.env.example` (16 ตัวตาม PROBLEM ข้อ 6 + `EMBED_URL MQ_PREFIX MOCK_LATENCY_MS SESSION_SECRET WEB_PORT MQ_UI_PORT MQ_API`)
  - worker ที่คุย AI (chat/stt/tts) อ่านค่า AI จาก `env_file` ตามลำดับ `.env.example` → `.env.vast` → `.env.aibox` (ไฟล์หลังทับไฟล์ก่อน)
- volume `pgdata` `hfcache` — **ห้ามลบ** (`docker compose down -v` ห้ามใช้)

## dev (ต่องานละ DB/พอร์ตของตัวเอง)
```bash
cd web && npm install && cd ..
export DATABASE_URL=postgres://dev:dev@127.0.0.1:56432/t_<งาน> ALLOW_TEST_RESET=1
node db/apply.mjs --reset                 # schema + seed + migration 5NN ทั้งหมด
cd web && PORT=$PORT npm run dev          # เว็บ
PORT=$MOCK_LLM_PORT node mock-llm/server.mjs
MQ_PREFIX=<งาน>_ node workers/<x>/index.mjs
```
ตรวจเร็ว: `curl -XPOST localhost:$PORT/api/test/reset` → `{ok:true, now:'2026-10-11T10:00:00+07:00', …}`

## e2e (Playwright · chromium 1247)
```bash
cd e2e && npm install
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright BASE_URL=http://localhost:$PORT npx playwright test tests/W03.spec.ts
```
- ห้าม `npx playwright install` · `@playwright/test` ล็อก `1.64.0-alpha-1790635538000` · `video: 'on'` 1280×800 · workers 1 · timeout 120 วิ · WebGL SwiftShader · ไมค์ปลอม
- 1 เคส = 1 ไฟล์ `e2e/tests/<CASE>.spec.ts` · ชื่อ test ขึ้นต้นรหัสเคส
- helper (`import { … } from '../lib'`):
  | helper | ทำอะไร |
  |---|---|
  | `reset(request, now?)` | `POST /api/test/reset` (ค่าเริ่มต้น `2026-10-11T10:00:00+07:00`) |
  | `setNow(request, now)` | `POST /api/test/clock` เปลี่ยนแค่ "วันนี้" ไม่ล้างข้อมูล |
  | `login(page, email, {goto?})` / `loginUI(page, email)` | ล็อกอินผ่าน API / ผ่านฟอร์ม `/login` (รหัสผ่านจาก legacy SPEC ข้อ 6) |
  | `typeSlow(locator, text, 60)` · `hold(page, 3500)` | พิมพ์ทีละตัว · ค้างภาพก่อนจบ |
  | `openChat(page)` · `askChat(page, text)` → `{text, cites, ms, statusSeen}` | รอ `chat-msg-bot` `data-done="true"` |
  | `hasAmount(text, '63,023.00')` | ตรวจเงินในข้อความแบบยืดหยุ่น (โหมด ai) |
  | `stopService(name)` / `startService(name)` | `COMPOSE_PROJECT=saisai3` → `docker compose -p saisai3 stop/start` · ไม่งั้นใช้ env `SVC_<NAME>_STOP/START` |

## เว็บ — โครงที่ T04 วางไว้
- Next.js 14.2.35 App Router + TS strict · `output: 'standalone'` · build context ของ Dockerfile = root
- `lib/db.ts` (pool · `query` `queryOne` `tx`) · `lib/clock.ts` (`now(db)` `clock(db)` `CLOCK_SQL`) · `lib/money.ts` (`fmtMoney` → `฿63,023.00` · `rawMoney` → `63023.00` · `fmtDate`) · `lib/auth.ts` (`getSession()` → `{userId, companyId, role, lang, email}|null` · `getLang` · `isCustomer/isStaff/isOwner`) · `lib/http.ts` (`fail(status, errors)` · `readJson`)
- API: `GET /api/health` · `POST /api/auth/login|logout|lang` · `GET /api/auth/me` · `POST /api/test/reset` · `POST|GET /api/test/clock`
- cookie: `ss_session` (HMAC `SESSION_SECRET` · httpOnly · 7 วัน) · `lang` (th|en) · `ss_chat` (uuid · middleware ตั้งตั้งแต่ request แรก)
- `middleware.ts`: หน้า `/staff/*` (staff/owner) · `/owner/*` `/admin/*` (owner) · `/order` `/orders/*` `/claims` `/samples` `/quotes` (customer) — ไม่ล็อกอิน/สิทธิ์ไม่พอ → `/login?next=…` (พนักงานเปิดหน้าลูกค้า → `/staff/orders`) · API ตรวจสิทธิ์เองทุก route
- `components/Nav.tsx`: ลิงก์ตามบทบาท (`nav-*`) · `lang-toggle` · `current-user` (`data-role`) · `logout-button` · `test-mode-banner` · `<html data-ready="true">` หลัง load

## DB
ดู `db/README.md` (สัญญากลางทุกตาราง/คอลัมน์ · reset · hook)

## เจ้าของโฟลเดอร์
| งาน | โฟลเดอร์/ไฟล์ |
|---|---|
| T04 | compose · `.env.example` · `db/` · โครง `web/` (package.json · config · layout · globals.css · middleware · lib/db clock auth money · api/health auth test · Nav) · `e2e/package.json` `playwright.config.ts` `lib/` |
| T05 | `web/lib/rules.ts` · `web/lib/server/pricing.ts` · `web/app/api/quote/` · `web/tests/unit/` |
| T06 | `web/public/img/` `web/public/assets/` |
| T07 | หน้าร้าน `web/app/(shop)/` · API orders claims samples products addresses · `web/lib/server/{orders,products,claims,samples}.ts` · `web/lib/i18n/` |
| T08 | ใบเสนอราคา `web/app/quotes/` `web/app/api/quotes/` `web/lib/server/quotes.ts` |
| T09 | หลังร้าน staff/owner · notify · `workers/notify-worker/` |
| T10 | `web/lib/mq/` · `shared/mq-topology.mjs` · `web/app/api/chat/` |
| T11 | `mock-llm/` |
| T12 | `workers/rag-worker/` · `/admin/docs` · `/api/docs` |
| T13 | `workers/chat-worker/` |
| T14 | `web/components/chat/` |
| T15 | stt/tts worker · `/api/voice` `/api/tts` · `web/components/voice/` · `e2e/lib/fake-mic.ts` |
| T16 | `web/components/three/` · `web/app/page.tsx` |
| T17–T21 | eval dashboard · `eval/` · load dashboard · `loadtest/` · รายงาน/วิดีโอ |
| ทุกงาน | `db/init/5NN-<TID>-*.sql` (T07=510 T08=520 T09=530 T10=540 T12=550 T13=560 T15=570 T17=580 T19=590) |

`workers/*/` และ `mock-llm/` ตอนนี้เป็น placeholder ของ T04 (heartbeat / `/health`) — เจ้าของเขียนทับได้ทั้งไฟล์

## T22 GPU baseline — MODE=ai deployment (27 October 2026)

ชุดเดียว (label `saisai-20261027-{llm,stt,tts}` · verified · reliability > 0.98 · ถูกสุดที่ตรงสเปก · หลักฐาน offers ใน `/root/runs/saisai/state/vast-offers-*.json` ไม่มี secret):

| role | GPU | instance | $/hr (GPU+disk) | สร้าง | software |
|---|---|---|---:|---|---|
| llm | RTX 5090 | 57914113 | 0.53037 | 27/10 10:59:16 | NInfer (source build) Qwen `--max-concurrency 4` · history/prefix reuse off · `vast_llm/` |
| stt | RTX 4090 | 57914254 | 0.41389 | 27/10 11:00:49 | faster-whisper large-v3 (+turbo สำหรับ CER) · `vast_aibox/` MODELS=stt |
| tts | RTX 4090 | 57914350 | 0.41389 | 27/10 11:01:37 | VoxCPM2 official git cce58a5 (48 kHz, voice nongsai) + bge-reranker-v2-m3 · `vast_aibox/` MODELS=tts,rerank |

- รัน stack: `MQ_PREFIX=T22_ai_ MQ_UI_PORT=15673 docker compose -f docker-compose.yml -f docker-compose.ai.yml --env-file .env.example --env-file .env.vast --env-file .env.aibox up -d --build`
  (`.env.vast` = LLM_* · `.env.aibox` = STT_URL TTS_URL RERANK_URL AIBOX_API_KEY · gitignored `.env.*` · ห้าม commit)
- transport: LLM ผ่าน SSH tunnel + local gateway (`tools/vast-connect.py` `tools/vast-gateway.py`) · STT/TTS/rerank ผ่าน Cloudflare quick tunnel HTTPS + Bearer (adapter ตรวจ key) · URL จริงไม่อยู่ใน git
- งานที่ใช้เงินทุกตัวรันผ่าน `tools/vast-workload.py` (บันทึก PID ให้ watchdog) · budget watchdog `tools/vast-budget.py watch` (ตรวจทุก 30 s · billing + conservative reserve · $12 → destroy) · lease `tools/vast-budget.py heartbeat`
- ผล: Playwright ai 46/62 (TEST_REPORT.md) · load/GPU200 (loadtest/REPORT.md) · eval (eval/REPORT.md) · CER Whisper large-v3 0.1668 vs turbo 0.3366 (supported-language, V01–V10) · VoxCPM2 RTF warm 0.37 / cold 1.89
- adapter fixes ใน T22: chat-worker เสียงพูดรวม ≤ 600 ตัวอักษร (`TTS_MAX_CHARS`) · stt-worker `STT_HEALTH_FAILS=2`
- ค่าใช้จ่าย: ดู `/root/runs/saisai/state/vast-progress.json` (actual/estimated/headroom) และ handoff `/root/runs/saisai/state/vast-handoff.md`

Cold-TTS implementation and reproduction commands:
`workers/tts-worker/README.md`. The exclusive mock wrapper now defaults
`TTS_CACHE=off` as well as `RAG_CANDIDATE_CACHE=off`; direct compose retains the
normal `TTS_CACHE=on` default. T24's 25-user result disabled retrieval cache only,
with TTS cache active; it must not be described as all-cache-off. New results use
label `T22-mock-cold-tts`, preserving the old artifacts.
