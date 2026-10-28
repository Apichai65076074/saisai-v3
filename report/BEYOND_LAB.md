# BEYOND LAB — สิ่งที่ทำเกินโจทย์ และที่เรียนรู้

> ทุกตัวเลขอ้างไฟล์ต้นทางในวงเล็บ (path เริ่มจาก `orchestra/app/` ถ้าไม่ระบุ) · ค่าที่คำนวณเองติดป้าย **(คำนวณ)**
> สถานะ ณ 28/10/2026 15:05: **24/24 งานเสร็จ · T23 ✅ done** (`orchestra/BOARD.md`) · ผล ×2/×4 อยู่ใน `report/SCALING.md`

---

## 1) รองรับกี่คน — ตอบตรง ๆ: cache vs ไม่ cache

เกณฑ์ (`loadtest/criteria.json`): error < 1% และ p95 ≤ 12 วิ · เป้า 200 คน · กราฟ: `report/latency_vs_users.png`

| การตั้งค่า | N ที่ผ่าน | p95 ที่ขั้น N | ขั้นแรกที่ล้ม | ไฟล์ต้นทาง |
|---|---:|---:|---|---|
| mock · **เปิด cache** + คำถามซ้ำ + prefetch 48/16/32 (T20 · *เสริม*) | 250 (ผ่านทุกขั้นที่วัด) | 7.10 วิ | ไม่มี (ยังไม่วัดเกิน 250) | `loadtest/results/mock-mix.json` |
| mock · ปิด retrieval cache เท่านั้น (T24 · TTS cache ยังเปิด) | 25 | 8.26 วิ | 50 คน: error 3.90% · p95 13.50 วิ | `mock-mix-nocache-pruned.json` |
| mock · **ปิด cache ทุกชั้น** (T22 cold-TTS) · **ตัวเลขหลักที่ซื่อสัตย์สุด** | **15** | 5.33 วิ | 20 คน: error 1.27% · p95 22.61 วิ (25 คนผ่านอีกครั้ง แต่ไม่นับเพราะขั้น 20 ล้ม) | `T22-mock-cold-tts.json` |
| GPU จริง · ปิด cache ทุกชั้น · chat | 16 | 10.06 วิ | 32 คน: p95 23.11 วิ | `gpu-chat-nocache.json` |
| GPU จริง · stt | 16 | 10.09 วิ | 32 คน: error 20.39% | `gpu-stt-nocache-r2.json` |
| GPU จริง · voice ครบวงจร | 1 | 10.08 วิ | 2 คน: error 83.33% | `gpu-voice-nocache-r2.json` |
| GPU จริง · tts | 0 | – | 1 คน: p95 12.65 วิ | `gpu-tts-nocache.json` |
| GPU จริง · mix 70/30 | 0 | – | 1 คน: error 25% · p95 25.90 วิ | `gpu-mix-scale-base-nocache-r2.json` |

อ่านให้ตรง: **250 คนมาจากการเปิด cache และถามคำถามซ้ำ** (`loadtest/REPORT.md`: "ประโยชน์ส่วนใหญ่มาจากคำถามซ้ำ") ไม่ใช่ความสามารถของระบบกับคำถามใหม่ · เมื่อปิด cache ทั้งหมดและคำถามไม่ซ้ำ ระบบ mock รับได้ **15 คน** และบน GPU จริงยังรับ mix ไม่ได้แม้ 1 คน · ไม่มีหลักฐานว่า 200 คนผ่านในเงื่อนไขหลัก
ผลเดิมของ T24 "25 คน" เคยถูกตั้งเป็นค่าหลัก แต่ orchestrator ตรวจพบว่า TTS sentence cache ยังเปิด จึงแก้และวัดใหม่เป็น 15 (`orchestra/orchestra/NOTES.md` 27/10 10:03–10:33)

## 2) ตรวจคำถาม: Gemini → Qwen → canary 30 → strict

ลำดับ: **Gemini เขียน 770 ข้อ** (7 เล่ม × 110 · `gemini/rag-questions/*.jsonl`, ตรวจโครงสร้างด้วย `gemini/check_questions.py`) → **Qwen ตรวจอิสระทุกข้อ** → **canary** ทดสอบว่าผู้ตรวจจับข้อผิดได้จริงไหม → **strict-tokens** ตรวจตัวเลข/รหัสรุ่น/สีแบบกฎ ไม่ใช้โมเดล (`qwen/review_questions.py`)

| ขั้น | ผล | ไฟล์ |
|---|---|---|
| Qwen review | ผ่าน 770 / 770 | `qwen/review/*.jsonl` (770 แถว `ok=true`) |
| canary 30 ข้อ (ดัดให้ผิดโดยตั้งใจ: number 7 · model 7 · color 6 · flip→unanswerable 10) | **Qwen อย่างเดียวจับได้ 27 / 30 = 90.0%** (flip 10/10 · model 6/7 · number 6/7 · color 5/6) → แตะเกณฑ์ ≥ 90% พอดี | `qwen/review-canary/*.jsonl` (ฟิลด์ `caught`) |
| strict-tokens บน canary | จับได้ 20 / 20 ข้อที่ใช้กฎได้ (number 7/7 · model 7/7 · color 6/6) · flip_unanswerable ใช้กฎไม่ได้ ต้องพึ่ง Qwen | `qwen/review-strict/canary.jsonl` |
| รวม Qwen + strict | **30 / 30** (คำนวณ: 3 ข้อที่ Qwen พลาดอยู่ในกลุ่ม number/model/color ซึ่ง strict จับได้ทั้งหมด) | สองไฟล์ข้างบน |
| strict บนข้อจริง | 693 / 693 ผ่าน (ข้อที่มี `fact_ids` ให้ตรวจได้) | `qwen/review-strict/real.jsonl` |

**ข้อสังเกต:** ตัวเลข "30/30" ใน SUBMIT เป็นผลของ *Qwen + strict รวมกัน* ไม่ใช่ Qwen เดี่ยว (Qwen เดี่ยว 27/30) — บทเรียนคือผู้ตรวจที่เป็นโมเดลควรมีด่านกฎคู่กัน · ข้อ unanswerable ที่ไม่มี fact ตรวจด้วยกฎไม่ได้ จึงยังพึ่งโมเดลล้วน

## 3) ใช้ AI 4 ค่าย แยกคนทำ / คนตรวจ

| ค่าย | หน้าที่ | หลักฐาน |
|---|---|---|
| Google Gemini | **ผู้เขียน** ชุดคำถาม RAG 770 ข้อ (ไม่ตอบ ไม่ตัดสิน) | `orchestra/BOARD.md` T02 · `gemini/` |
| Alibaba Qwen | **ผู้ตรวจ** ชุดคำถาม (review/canary) และเป็น LLM ที่ตอบจริงในโหมด ai (GPU-1) | `qwen/review_questions.py` · `SAISAI.md` สถาปัตยกรรม |
| Anthropic Claude (บัญชี `yolo*`) | ผู้สร้างงาน (worker/orchestrator) + ผู้ตัดสินมือ 64 ข้อใน eval | `orchestra/orchestra/NOTES.md` · `eval/REPORT.md` หัวข้อ "ผู้ตัดสิน" |
| โมเดล `gpt-6.1-sol` (บัญชี `cyolo*`) | ผู้สร้างงาน (worker/orchestrator) อีกสาย | `NOTES.md` ("ใช้ gpt-6.1-sol/medium") · `orchestra/orchestra/REPORT.md` ตารางบัญชี |

หลักการ: ผู้เขียนคำถามไม่ใช่ผู้ตรวจ · ผู้สร้างโค้ดถูกตรวจซ้ำโดย orchestrator (เช่น sha256 ของ `rules.ts` ตรงต้นฉบับทุกครั้งที่ merge · JSON ผล load ถูกตรวจ `cache/prefetch/repeats/publish=done` ก่อนรับงาน — NOTES 10:03/10:33) · ข้อสังเกตที่ควรบอกตรง ๆ: Qwen เป็นทั้ง *ผู้ตรวจคำถาม* และ *ผู้ตอบในโหมด ai* ซึ่งอาจเอนเอียงเข้าข้างกัน · และ judgments มือ 64 ข้อผูกกับคำตอบ mock จึงใช้ไม่ได้กับคำตอบ AI (ใช้ 0 · stale 64 ใน `eval/REPORT.md` หัวข้อ T22) — คะแนน AI เป็นอัตโนมัติล้วน

## 4) Scale ตรงคอขวด (ไม่เพิ่มของทั้งชุด)

หลักฐานแต่ละรอบบอกว่าคอขวดย้ายที่ — แก้ทีละจุดที่วัดได้:

| ลำดับ | คอขวดที่วัดได้ | การแก้ | ผล | ไฟล์ |
|---|---|---|---|---|
| 1 | DB: keyword trigram full scan — DB CPU p90 267% (4 core) | ดัชนี `doc_chunk_trgms` + pruning (ผล top-20 เหมือนเดิม 858/858) · p50 653→81 ms | mock nocache 10 → 25 คน | `loadtest/REPORT.md` ผล T24 · `T24-keyword-equivalence.json` |
| 2 | ความจุคิว chat (worker 2 × prefetch 4) | (รันเสริม) prefetch 48/16/32 | 25 → 50 คน · error 0 แต่ p95 เกิน 12 วิตั้งแต่ 100 | `mock-mix-nocache-prefetch48.json` |
| 3 | embedder บน CPU (p90 124%) + DB (p90 127%) | ยังไม่แก้ (ระบุเป็นคอขวดถัดไป) | – | `mock-mix-nocache-prefetch48-cpu.jsonl` |
| 4 | GPU TTS — VoxCPM2 batch 1 ทำทีละงาน · RTF p95 0.77 | ลอง `TTS_PREFETCH=1` ไม่ช่วย (voice 1 คน error 25%) | ยังไม่แก้ | `gpu-tts-nocache.json` · `gpu-voice-tune-ttsprefetch1.json` |
| 5 | LLM 5090 (U=16) และ STT (U=16) | เพิ่มใบตามสูตร ⌈users×share×1.2/U⌉ → ×2 (5090×2) | chat 16 → **32 คน (2.00×)** · ผ่านตามเป้า | `scale-x2-chat.json` |
| 6 | **เพิ่ม 5090 เป็น 4 ใบ (×4) ไม่ช่วย**: util เฉลี่ย 8–16% · คิว chat 28 (×2: 24) → ติดขั้นที่ไม่ได้ขยาย (rerank 4090 ใบเดียว · embedder CPU · retrieval/DB) | ไม่แก้ในรอบนี้ — ข้อเสนอ ยังไม่ได้วัด: ขยาย rerank/embedder ก่อน (`SCALING.md` ข้อ 5) | chat **16 คน (1.00× ของ baseline · เป้า 64 ไม่ผ่าน)** | `scale-x4.json` · `loadtest/REPORT.md` T23 final |
| 7 | STT ×2 = เครือข่าย (GPU ถอดเสียง 0.36–0.52 วิ แต่ client เห็น 4.5–14 วิ ผ่าน tunnel ไปไอร์แลนด์) | ยังไม่แก้ | stt ×2 = 0 คน (baseline 16) | `scale-x2-stt.json` · `scale-x2-stt-transport-diagnostic.json` |

บทเรียนจาก T23: การ scale ตามคอขวดที่วัดได้ใช้ได้ถึง ×2 (แยก TTS ออกจาก rerank + 5090 อีกใบ: chat 32 · tts 0→1) แต่ ×4 แสดงว่าคอขวดย้ายไปขั้นที่ไม่ได้ขยาย — การเพิ่ม GPU LLM ต่อไปจึงจ่ายเงินเพิ่มโดยความจุไม่เพิ่ม ($/ชม./ผู้ใช้ chat 0.085 → 0.074 ที่ ×2 → **0.158** ที่ ×4 · `loadtest/REPORT.md`) · ⚠️ การชี้ว่าขั้นใดใน rerank/embedder/retrieval เป็นตัวจำกัดจริงเป็นการอนุมานจาก util และความยาวคิว ยังไม่ได้วัดแยกรายขั้น · TTS เดี่ยวผ่านแค่ 1 คน (p95 10.43 วิ) ที่ 2 คนล้ม (15.94 วิ)

## 5) ข้อสังเกต/ข้อเสนอ 4 ข้อต่อเครื่องมือ LAB (orchestrator)

> หมายเหตุที่มา: ทั้ง 4 ข้อมาจากข้อสังเกตของผู้ใช้ที่ส่งมาโดยตรง (ตัวเลขเวลาในข้อ 1 มาจากการทดลองในสำเนาของผู้ใช้ ไม่ได้รันซ้ำในรายงานนี้) · เครื่องมือทำงานได้ดีหลายจุด (เช่น watchdog ทำลาย GPU และตรวจเหลือ 0 ได้เองแม้ worker ตาย) ข้อเสนอด้านล่างเป็นการต่อยอด

1. **`planner.py` คำนวณ κ ครั้งเดียวตอนเริ่ม ทำให้ประมาณเวลาไม่ตรง readme**
   - ข้อสังเกต: `planner.py` บรรทัด 171 คำนวณ κ ครั้งเดียวตอนเริ่ม · ผล catfood (examples) จากโค้ดปัจจุบันได้ 131 นาที ไม่ตรงกับ readme ที่ระบุ 125 นาที · เมื่อทดลองในสำเนาของผู้ใช้ให้คำนวณใหม่ทุกรอบ (งานที่เสร็จแล้วให้ cost=0) ได้ 125 นาที ตรงกับ readme · saisai_ai เปลี่ยนจาก 149 → 130 นาที · catfood เปลี่ยนจาก 118 → 105 นาที
   - ข้อเสนอ: ให้คำนวณ κ ใหม่ทุกรอบการวางแผน โดยนับงานที่เสร็จแล้วเป็น cost=0 (ควรให้ผู้ดูแลเครื่องมือยืนยันว่าตรงเจตนาของ readme)
2. **เวลารีเซ็ตโควตาบางครั้งอ่านจากไฟล์ session เก่า**
   - ข้อสังเกต: หลังรีสตาร์ต เวลารีเซ็ตโควตาแสดง "-" แล้วระบบใช้ค่าสมมติแทน เพราะบางครั้งอ่านจากไฟล์ session เก่า
   - ข้อเสนอ: ตรวจอายุไฟล์ก่อนใช้ค่า ถ้าเก่าเกินเกณฑ์ให้ถือว่าไม่ทราบ แทนการใช้ค่าสมมติ
3. **`LIMIT_HANDOFF` retry วนซ้ำ**
   - ข้อสังเกต: พบ retry วนซ้ำ — T10 ใน BuildMart เกิดถึง 24 รอบ
   - ข้อเสนอ: จำกัดจำนวนรอบ retry และเว้นระยะระหว่างรอบ (backoff) แล้วหยุดรอผู้ใช้เมื่อเกินจำนวนที่กำหนด
4. **orchestrator/worker จบ turn ระหว่างรองานเบื้องหลัง**
   - ข้อสังเกต: พบทั้งใน T22 (worker a1) และใน orchestrator ระหว่างรอ T21 — จบ turn ทั้งที่งานเบื้องหลังยังไม่เสร็จ
   - ข้อเสนอ: ห้ามรันเบื้องหลังข้ามช่วง turn หรือให้ orchestrator ตรวจ STATUS แล้ว resume งานที่จบ turn ไปก่อนเวลา

## 6) คู่มือพัก / กลับมาทำต่อ + WSL RAM

จากเหตุการณ์จริงใน `NOTES.md` (25–27/10): ผู้ใช้สั่งพัก 00:56 และ 23:45 แล้วปิดเครื่อง · เช้า handover ต่อ

**ก่อนพัก**
1. ถ้ามีงาน GPU: ตรวจว่า instance ถูก destroy และ `show_instances = 0` (บันทึกใน `loadtest/results/scale-final-verification.json`) — *ห้ามพักทั้งที่ GPU ยังเช่าอยู่* เพราะคิดเงินต่อเนื่อง ($1.35815/ชม. ต่อชุด baseline · `loadtest/REPORT.md`)
2. kill orchestrator + `stop --requeue` งานที่รันอยู่ — WIP เก็บใน branch/worktree (`wt/`) ไม่หาย (NOTES 00:56, 23:45)
3. หยุด compose ด้วย `stop` ไม่ใช้ `down -v` ไม่ลบ volume (`loadtest/compose_mock.sh stop` · NOTES กติกาข้อ 8)

**กลับมาทำต่อ**
1. เปิดเครื่อง → `infra up` ใหม่ (ss-devdb / ss-devmq / ss-devembed ดับตอนปิดเครื่อง · NOTES 09:13)
2. `handover --to <บัญชีที่มี headroom>` แล้วให้ orchestrator `dispatch`/`wait` ต่อจาก state เดิม ไม่สร้าง worker ซ้ำ (NOTES 11:48)
3. ตรวจ sha256 ของ `web/lib/rules.ts` = `1f880cd34c63667d90b7fac8e0cdbd6dfaa0a80ef270cda007e4957dfbf3122c` (TEST_REPORT.md)
4. เปิดเว็บ mock: `docker compose -p saisai3 --profile mock up -d` ใน `app/` (NOTES 21:17) · `GET :3600/api/health` ต้อง `mode=mock`
5. ตรวจ `git status` ว่า `orchestra/` และ `voices/` ยังเป็น untracked ตามที่ตั้งใจ

**WSL RAM** (NOTES 00:04): Docker ล่มเพราะ RAM ใน VM 7 GB ไม่พอ → ปรับ WSL เป็น **10 GB + swap 8 GB** · `max_agents=3` · รัน stack พร้อมกัน ≤ 2 ชุด · ตัวอย่าง `%UserProfile%\.wslconfig` (รูปแบบมาตรฐานของ WSL2 · ค่า 10/8 จาก NOTES):
```ini
[wsl2]
memory=10GB
swap=8GB
```
แล้วรัน `wsl --shutdown` ให้มีผล · หมายเหตุ: ค่า Docker memory ที่รายงานในเครื่องนี้เป็น 0B (`loadtest/REPORT.md` baseline) จึงใช้ดู RAM ผ่าน WSL/Windows แทน

## 7) คุมงบ GPU — ใช้จริงรวม $13.07 จากเพดาน $15

ยอดสะสมจริง (billing API · T22 + T23 ทุก instance) = **$13.066** ≈ $13.07 · เหลือใต้เพดาน $15 อีก $1.934 (คำนวณ) · เครดิตคงเหลือ $6.39 · ตรวจ `show_instances` ได้ task 0 / other 0 (`loadtest/results/scale-final-billing.json`)

| จุดเวลา | ยอดสะสม | ที่มา |
|---|---:|---|
| หลัง baseline T22 (27/10 14:37) | $5.072 (หลัง settle: $5.370 — คำนวณ 8.101 − 2.731) | `scale-billing-final.json` · `loadtest/REPORT.md` |
| ยอดบันทึกใน BOARD (28/10 10:31 · ประเมินระมัดระวัง $6.55) | $5.368 | `orchestra/BOARD.md` |
| หลัง ×2 รอบเช้า 28/10 (12:26) | $8.101 (รอบนั้น $2.731) | `loadtest/REPORT.md` "earlier 28/10 round" |
| หลัง ×2 ครบ 4 โหมด (14:37) | $11.884 | `loadtest/REPORT.md` · `SALE_RUN.md` |
| หลัง ×4 chat + cleanup (15:01) | **$13.066** (GPU 11.136 + disk 0.603 + download 1.289 + upload 0.038) | `scale-final-billing.json` |
| รอบสุดท้ายนี้ (8 เครื่อง · 19–68 นาที/ใบ) | $3.050 | `loadtest/REPORT.md` ตาราง per-instance |

กติกางบที่ใช้ (28/10 13:00 · `loadtest/REPORT.md`): เพดาน $15 · จุดหยุด $14.5 · ×4 ทำได้เมื่อยอดจริง ≤ $12.5 (ตอนเข้า ×4 = $11.884 · ประมาณการ $13.81 < $14.4) · load ≤ 20 นาที · ตัดจบ 16:30 · เลือกเครื่อง verified reliability ≥ 0.99

อัตราเผาต่อชม.: baseline 1.358 · ×2 2.378 · ×4 chat 2.534 (`loadtest/REPORT.md`) · $/ชม./ผู้ใช้ chat: 0.085 · 0.074 · 0.158 · หลัง destroy = $0/ชม.

กลไกที่ใช้คุมได้จริง: (ก) เพดาน/จุดหยุดกำหนดก่อนเช่า และ controller มี budget gate ตัดขั้นที่ประมาณการเกินงบ (ข) watchdog อิสระ ผูก owner-PID ของ worker + lease ส่งต่อได้ ไม่เช่าชุดใหม่ซ้ำตอน handover (ค) เลือก host verified เท่านั้น เปลี่ยน host ที่ช้า (TTS host แรกติดตั้งไม่ทัน ถูกแทนที่ · $0.152) (ง) หลังจบ destroy แล้วตรวจ `show_instances` สองครั้ง + ตรวจอิสระ (15:00:07/08 และ 15:01:00 → 0/0 · `loadtest/REPORT.md`)

ข้อสังเกตต้นทุน: ใช้เงิน $13.07 เพื่อได้ข้อสรุปหลักที่ใช้ได้จริงสองข้อ — chat scale ได้ถึง ×2 แต่ ×4 ไม่ช่วย และ voice/TTS/STT ยังเป็นคอขวดของระบบเสียงครบวงจร · งานที่ตัดเพราะงบ: รัน Playwright ai 16 เคสที่ล้มซ้ำ (ประมาณการจะเกินจุดหยุด $14.5) และ ×4 ของ stt/tts/voice
