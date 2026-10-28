# SALE_RUN — SaiSai v3

> เป้า (PROBLEM ข้อ 7): คนลงมือ ≤ 1 ชม. · เวลารวมตั้งแต่วางพรอมต์ถึงได้ `TEST_REPORT.md` + `loadtest/REPORT.md` + destroy GPU ≤ 3 ชม. · ขั้นที่ต้องให้คนช่วยระหว่างทาง = 0
> ไฟล์นี้: **ส่วน mock = T21** (เสร็จแล้ว) · ส่วน ai / Vast / พรอมต์ ≤ 20 บรรทัด = **รอ T22**

## ส่วน mock (T21)

### เวลา (จาก `/root/runs/saisai/logs/events.jsonl` · Asia/Bangkok)

| จุด | เวลา |
|---|---|
| เริ่ม (event แรก `INIT`) | 2026-10-25 11:05:53 |
| T21 เริ่ม (`START T21`) | 2026-10-26 12:31:49 |
| Playwright รอบที่ใช้ในรายงาน | 2026-10-26 13:52:51 → 14:22:26 (63 test · 29.6 นาที) |
| ได้ `TEST_REPORT.md` แถว mock 62/62 (commit `58c440b`) | 2026-10-26 ~14:27 |
| event ล่าสุดใน log ขณะเขียน | 2026-10-26 13:59:43 |

- **เวลารวม (wall clock) ≈ 27 ชม. 22 นาที** (11:05:53 → ~14:28) — ⚠️ **เกินเป้า 3 ชม.**
- ช่วงที่ไม่มีงานเดิน (ไม่มี event > 1 ชม.):
  - 2026-10-25 12:18:26 → 2026-10-26 00:04:22 (**11 ชม. 46 นาที**) — โควตาบัญชีหมด (`ORCH_LOW` yolo3 headroom 14 เมื่อ 12:10 → `QUOTA` ถัดไปตอน 00:04 ที่ yolo1 = 100)
  - 2026-10-26 00:56:43 → 09:11:17 (**8 ชม. 15 นาที**) — งานทั้งชุดถูก `HANDOFF` แล้วค้าง · `ORCH_SWITCH` 09:11 ได้ PID 907 (เครื่องบูตใหม่ราว 09:08 ตาม `uptime`) = orchestrator ถูกเปิดใหม่หลังรีบูต
  - 10:59 → 12:31 (1 ชม. 32 นาที) ไม่ใช่ช่วงว่าง: เป็น T20 (load test) ที่ทำงานอยู่
- **เวลาที่ทำงานจริง (ตัด 2 ช่วงว่าง) ≈ 7 ชม. 20 นาที** — ⚠️ ยังเกินเป้า 3 ชม.
- **ขั้นที่ใช้เวลานานสุด:** การรอโควตาบัญชี AI (≈ 20 ชม. รวม) · ในช่วงที่ทำงาน: T20 load test (1 ชม. 32 นาที) และ T21 integration (≈ 1 ชม. 55 นาที: Playwright เต็ม 3 รอบ × ~30 นาที + แก้ 5 จุด + สร้าง GIF/MP4 ~6 นาที)

### ขั้นที่ต้องให้คนช่วย (โหมด mock)

| # | ขั้น | ต้องใช้คน? |
|---|---|---|
| 1 | เปิดระบบ `docker compose --profile mock up -d --build --scale chat-worker=2` | ไม่ (worker รันเอง · ผ่าน `e2e/scripts/compose.sh`) |
| 2 | `.env`: `MQ_UI_PORT=15673` เพราะ 15672 ถูก container อื่นถือ · `RAG_HOLD_MS=15000` ให้ Q03 หยุด rag-worker กลางงานได้ | ไม่ (worker เขียนเอง) |
| 3 | รัน Playwright 62 เคส / แก้แอป / GIF / MP4 / รายงาน | ไม่ |
| 4 | เปิด orchestrator ใหม่หลังโควตาหมด/เครื่องรีบูต (00:04 และ 09:11 ของ 2026-10-26 · PID ต่ำ = หลังบูต) | ⚠️ **น่าจะใช่ 1–2 ครั้ง** — log ไม่มี event ที่ระบุว่าคนทำ แต่การเปิดหลังรีบูตต้องมีคนหรือ service ภายนอกสั่ง |

- โหมด mock ไม่ต้องใช้ล็อกอิน Vast / เครดิต / GPU
- **สรุป mock:** ขั้นที่ต้องให้คนช่วยระหว่างทาง ≈ 1–2 (การเปิด orchestrator ใหม่) ⚠️ ไม่ถึงเป้า 0 · เวลารวมไม่ถึงเป้า 3 ชม. ⚠️ (สาเหตุหลักคือรอโควตา ไม่ใช่ตัวงาน)

### ระบบ mock ที่เปิดค้างไว้ให้ลอง

- http://localhost:3600 (project `saisai3` · chat-worker ×2) · RabbitMQ UI http://localhost:15673 (guest/guest)
- รายงาน: `TEST_REPORT.md` · GIF `test-gifs/` · MP4 `test-videos/`

### ระบบรองรับกี่คน (mock · T24)

- **ค่าหลัก: 25 คนพร้อมกัน** (โหมดผสมแชท+เสียง · ปิด cache · prefetch 4/4/2 · คำถามไม่ซ้ำสุ่มจาก 770 ข้อ · เกณฑ์ error < 1% และ p95 ≤ 12 วิ) — ยังไม่ถึงเป้า 200 คน · คอขวดที่เหลือ = ความจุคิวแชท (chat-worker 2 × prefetch 4) · ดู `loadtest/REPORT.md`
- ข้อมูลเสริม (ปิด cache + คำถามไม่ซ้ำ แต่ prefetch 48/16/32): 50 คน
- ข้อมูลเสริม (เปิด cache + คำถามซ้ำ + prefetch 48/16/32 · T20): 200 คน p95 5.75 วิ / 250 คน p95 7.10 วิ — ใช้อ้างเป็นตัวเลขหลักไม่ได้
- T22 (GPU) ใช้ runner/กติกาเดียวกัน: `loadtest/README.md` หัวข้อ "Headline capacity"

## ส่วน ai (Vast.ai + ai-box)

รอ T22 — พรอมต์ที่พนักงานขายวาง (≤ 20 บรรทัด · นับจริง) · เวลาที่คนลงมือ (ล็อกอินบัญชี · เติมเครดิต Vast · ตรวจผล) · เวลารวมถึง destroy GPU

## T23 — AI scale ×2 (4 โหมด) + ×4 แชท วัดแล้ว (28/10/2026 รอบสุดท้าย) · STATUS INCOMPLETE

พรอมต์ที่ใช้รัน (16 บรรทัด):
```text
อ่าน progress/T23.md, NOTES ล่าสุด และ loadtest/REPORT.md ส่วน T23
ตรวจ show_instances=0 และยอด billing จริงก่อนเช่า · หยุด $14.5 · เพดาน $15 · ตัดจบ 16:30
python3 tools/vast-scale-controller.py --dry-run (ไม่เช่า) ต้องผ่าน · owner = PID ของ worker (T23_WORKER_PID)
เลือก verified reliability>=0.99 ถูกสุด 5090<=1.20 4090<=0.50 ลองไม่เกิน 3 ครั้ง/บทบาท
×2 = 5090×2 LLM + 4090 STT + 4090 TTS + 4090 rerank · worker 2/1/2 · prefetch 4/4/2
ปิด cache ทั้งหมด (TTS_CACHE=off RAG_CANDIDATE_CACHE=off provider cache off) · rag770 seed 20261027 think30 stage120
T23_RUN_TAG=<tag> python3 tools/vast-scale-controller.py  (deploy + watchdog + lease)
พร้อมแล้ว handover: T23_X2_MODES=stt,tts,voice python3 tools/vast-scale-controller.py --resume-x2
วัด ×2 แยกโหมด chat · stt · tts · voice (ห้ามวัดแค่ mix) · host ช้า/ล่ม → เปลี่ยน host (VAST_MIN_INET_DOWN=2000)
×4 แชทเท่านั้น: python3 tools/vast-scale-controller.py --x4-chat (ปล่อย STT/TTS · เพิ่ม llm-3/llm-4)
×4 ทำเมื่อยอดจริง <= $12.5 และ projected < $14.4 · load <= 20 นาที · ขั้น 16,32,48,64,80 stop-on-fail
destroy ทุกเครื่อง label งาน แล้วตรวจ show_instances = 0 สองครั้ง + ตรวจอิสระ
คืน saisai3 :3600 เป็น MODE=mock · เปิด /admin/load เลือกโหมดดูการ์ด base/×2/×4
อัปเดต loadtest/REPORT.md, TEST_REPORT.md, SALE_RUN.md · commit (ไม่ push · ไม่มี .env*/key)
```

ผล AI (ไม่ใช่ mock · ปิด cache · คำถามไม่ซ้ำ): **แชท** base 16 → ×2 **32 คน (2.00× ผ่าน)** → ×4 **16 คน (ไม่ผ่านเป้า 64)** ·
**STT** ×2 0 คน (GPU ถอดเสียง 0.4 วิ แต่ส่งไฟล์ไปเครื่องไอร์แลนด์ 4–14 วิ = คอขวดเครือข่าย) · **TTS** ×2 1 คน (base 0) ·
**voice** ×2 0 คน (base 1) · ×4 วัดเฉพาะแชทตามคำสั่ง · คอขวด ×4 = ส่วนที่ไม่ได้ขยาย (rerank 4090 ใบเดียว / embedder CPU / retrieval) ไม่ใช่ GPU LLM (ใช้เฉลี่ย 8–16 %) ·
ดู [รายงาน AI](loadtest/REPORT.md#t23--final-28102026-13511501-07-2-all-four-modes--4-chat-measured-ai--cache-off) ·
ผล [x2-chat](loadtest/results/scale-x2-chat.json) [x2-stt](loadtest/results/scale-x2-stt.json) [x2-tts](loadtest/results/scale-x2-tts.json)
[x2-voice](loadtest/results/scale-x2-voice.json) [x4](loadtest/results/scale-x4.json) [bill](loadtest/results/scale-final-billing.json) · ผล mock แยกอยู่ส่วน mock ด้านบน

ค่าใช้จ่าย Vast (billing API จริง · T22+T23 รวม): หลัง baseline **$5.072** · หลัง ×2 ครบ 4 โหมด **$11.884** · หลัง ×4 + cleanup **$13.066** ·
$/ชม.: base 1.358 · ×2 2.378 · ×4 แชท 2.534 · $/ชม./ผู้ใช้แชท: 0.085 · 0.074 · 0.158 · รอบนี้ 8 เครื่อง $3.05 (เปิด 19–68 นาที/ใบ) ·
destroy ครบ 15:00 ตรวจ show_instances 0/0 สองครั้ง + ตรวจอิสระ 15:01 0/0 · เว็บ :3600 MODE=mock.

เวลา: รอบสุดท้าย 28/10 13:51–~15:15 +07 (≈1 ชม. 25 นาที · agent ล้วน · คนใช้เวลาแค่อนุมัติ) · T23 ทุกรอบ 27–28/10 รวมเกิน 3 ชม. มาก (หลายรอบล้มจาก offer หาย/host ช้า/worker ตาย) ·
ยังค้าง: รันซ้ำ 16 เคส ai (เกินงบ $14.5) · ×4 ของ stt/tts/voice (คำสั่งให้วัดแชทอย่างเดียว) · ×4 แชทไม่ถึง 4×Nbase · STT ×2 ต้องเลือก host ใกล้/แบนด์วิดท์สูง

## T23 (รอบก่อนหน้า 28/10) — AI scale ×2 วัดแล้ว · ×4 ข้าม · STATUS INCOMPLETE

พรอมต์ที่ใช้รัน (12 บรรทัด):
```text
อ่าน progress/T23.md, RUN/state/vast-handoff.md และ NOTES ล่าสุด
ตรวจ show_instances=0 และ reconcile ยอดที่ settle แล้วก่อนเช่า
python3 tools/vast-scale-controller.py --dry-run (ไม่เช่า) ต้องผ่าน
เลือก verified reliability>=0.99 ถูกสุด 5090<=1.20 4090<=0.50 ลองไม่เกิน3ครั้ง/บทบาท
×2 = 5090×2 LLM + 4090 STT + 4090 TTS + 4090 rerank · worker 2/1/2 prefetch 4/4/2
ปิด cache ทั้งหมดรวม TTS_CACHE=off · rag770 seed 20261027 think30 stage120
T23_RUN_TAG=<tag> python3 tools/vast-scale-controller.py (watchdog $12 + lease ผูก PID)
วัด mix ก่อน แล้ว voice/chat/16 เคส ai ถ้างบผ่าน gate
ยอดประมาณการ >= $10 ข้าม ×4 · >= $12 หยุดทันที
destroy ทุกเครื่อง label งานแล้วตรวจ show_instances=0 สองครั้ง
คืน saisai3 :3600 เป็น MODE=mock
อัปเดต loadtest/REPORT.md, TEST_REPORT.md, SALE_RUN.md แล้ว commit (ไม่ push)
```

ผล AI (ไม่ใช่ mock): ×2 รองรับ mix ได้ **1 คน** (p95 6.07 วิ error 0%) · 2 คนไม่ผ่าน (voice 3/3 STT 504 · chat 5/5 p95 5.63 วิ) ·
อัตราขยายประเมินไม่ได้เพราะ baseline r2 N=0 · ×4 **ไม่ได้วัด** (ยอดประมาณการ $11.34 ≥ $10) · voice-only/chat-only/16 เคส ai ไม่ได้รัน (งบ) ·
ดู [รายงาน AI](loadtest/REPORT.md#t23-earlier-2810-round--2-measured-28102026-ai--cache-off--4-skipped-at-the-10-rule), [scale-x2.json](loadtest/results/scale-x2.json),
[scale-x4.json](loadtest/results/scale-x4.json), [bill](loadtest/results/scale-billing-20261028.json) · ผล mock แยกอยู่ส่วน mock ด้านบน

ค่าใช้จ่าย Vast (billing API, T22+T23 รวม): หลัง baseline **$5.072** · หลัง ×2 **$8.075** · หลัง cleanup **$8.101** (×4 ไม่ได้เช่า) · ×2 = $2.455/ชม. = $2.455/ชม./คน ·
GPU ชุด ×2 เปิด 52.8–66.3 นาที/ใบ · รอบล้มก่อนหน้าวันนี้ (offer หาย/gate) รวม $0.17 · destroy ครบ ตรวจ show_instances 0/0 สองครั้ง 12:26 + ตรวจอิสระซ้ำ 0/0.

เวลา: รอบนี้ 28/10 10:31–~12:45 +07 (≈2 ชม. 15 นาที · agent ล้วน ไม่มีคนลงมือ) · GPU เปิดจริงชุดหลัก 11:19–12:26 (67 นาที) · รวมทั้งโครงการเกิน 3 ชม. มาก (ดูส่วนบน) ·
ยังค้าง: ×4, voice/chat-only ×2, 16 เคส ai บน ×2, การพิสูจน์ ×2≥2×Nbase (ต้องมี baseline N>0) — ต้องเพิ่มงบจากผู้ใช้หากต้องการวัดต่อ

## T23 (historical) — AI scale: STATUS BLOCKED (27/10/2026)

พรอมต์สำหรับรันต่อ (10 บรรทัด; ยังไม่ได้ใช้เช่าชุดทดแทน):
```text
อ่าน handoff/ledger T22 และตรวจสถานะสดก่อนเริ่ม
ต้องมี baseline เดิมและ Nbase>0 มิฉะนั้นหยุดขอคำสั่ง
ตรวจ T22 rerank-off eval และ AI 62 เคสจบก่อน
ปิด retrieval/result/response/prefix/TTS cache และเก็บ runtime proof
×2 เพิ่ม 5090 หนึ่งใบและ 4090 หนึ่งใบ แยก TTS/rerank วัด chat/voice/mix
ใช้ mix think30 stage120 rag770 seed พร้อม repeats และ publish/done
×4 วัด load เท่านั้นไม่เกิน30นาที ถ้ายอดถึง$10ให้ข้าม
คง prefetch4/4/2 และเกณฑ์ p95≤12s error<1%
ดู actual+conservative accrued รวมnetwork/storageทุก≤60s ถึง$12destroyก่อนรอ
destroyเครื่องlabelงานทั้งหมดและตรวจshow_instances=0ก่อนจบ
```

ผลที่เกิดจริง: baseline r2 N=0 จึงไม่เพิ่ม GPU; destroy baseline T22 ครบ 3
เครื่องและตรวจสดสองครั้งได้ 0 ทั้งบัญชี 14:37:22/27 +07. Post-cleanup bill
snapshot **$5.072** (billing ยัง settle ได้) ไม่มีผล ×2/×4 และไม่มีการกล่าวอ้าง
ว่าเพิ่มความจุได้ตามเป้า ดู [รายงาน AI T23](loadtest/REPORT.md#t23--blocked-latest-baseline-n0-original-instances-destroyed),
[baseline AI](loadtest/results/scale-base.json), [cleanup](loadtest/results/scale-cleanup.json).
ผล mock แยกอยู่ในส่วน mock ด้านบน และ [cold-TTS mock](loadtest/results/T22-mock-cold-tts.json);
ไม่ได้ใช้ตัวเลข mock แทน AI.

เวลาของ T23: ตรวจสดเริ่ม 14:36 +07; เวลาจบและผลตรวจ build บันทึกท้ายหัวข้อนี้.
ไม่ต้องให้คนช่วยระหว่างตรวจ/cleanup/แก้ display; เวลาคนลงมือจริงตลอดโครงการ
ไม่มี log ที่วัดพอจะอ้าง ≤1ชม. ได้. GPU T22 อย่างเดียวคิดเงินประมาณ3.6ชม./ใบ
ก่อนcleanup จึงเกินเป้ารวม3ชม.แล้ว. ใช้เวลาเริ่มโครงการจากส่วนmockเดิม
25/10 11:05:53 ถึง27/10ประมาณ14:40 = ประมาณ51ชม.34นาที (รวมช่วงรอ;
ไม่ได้ลดเคส/เกณฑ์). นี่ไม่ใช่เวลาทำงานของT23เพียงงานเดียว.

ยังค้าง: positive baseline/คำสั่งหลังcleanup, ×2/×4 measurements,
central ledger/watchdog reconciliation, browser integration ของscale display,
และคืน saisai3 MODE=mock :3600. Healthยังเป็นai; workerนี้ไม่ได้รับexclusive
จึงไม่รันComposeหรืออ้างว่าคืนmockแล้ว. ห้ามเช่าชุดใหม่แทนเอง.

T23 finished documentation at 2026-10-27T14:42:07+07:00 (approximately 6 minutes after live
preflight). Targeted tests 4/4 and production build passed. Scale measurements
remain BLOCKED; no claim of full task completion.
