# REPORT · saisai

- เวลา: 25/10 11:05 → 15:04 (4559 นาที)
- งาน: 24/24 เสร็จ · worker พร้อมกันสูงสุด 6 ตัว (เพดาน 3)
- ส่งงานต่อ (HANDOFF): 18 ครั้ง · โควตาหมดกลางงาน: 1 · merge conflict: 2 · ทำไม่จบแล้วทำต่อ: 3
- สลับ orchestrator: 13 ครั้ง

## งาน

| งาน | ชื่อ | สถานะ | บัญชีที่ทำ (ตามลำดับ) | รอบ | โทเคน (M) |
|---|---|---|---|---|---|
| T01 | [done] PDF 7 เล่ม 122 หน้า จาก data/facts/*.json | done |  | 0 | 0 |
| T02 | [done] คำถาม RAG 770 ข้อ (Gemini) + Qwen review 770/770 | done |  | 0 | 0 |
| T03 | [done] ไฟล์เสียงทดสอบ V01–V10 + questions/index.json | done |  | 0 | 0 |
| T04 | โครงแอปใหม่: docker compose (web·db pgvector·rabbitmq·embedder·mock profile) + schema/seed 02-seed.sql + /api/test/reset | done | yolo3 | 1 | 1.262 |
| T05 | lib กฎ: คัดลอก rules.ts (ห้ามแก้ตรรกะ) + POST /api/quote + unit test | done | cyolo2 | 1 | 0.257 |
| T06 | รูปทั้งเว็บ (cyolo): มาสคอตน้องใส concept + 4 ท่า · banner-factory-3d · ขวด 9 รูป · PROMPTS.md | done | cyolo1 | 1 | 0.371 |
| T07 | หน้าเว็บหลัก: / (shell) · /login · /products · /order · /orders · /orders/[no] · เคลม · /samples · TH/EN | done | cyolo2 → cyolo2 | 2 | 1.798 |
| T08 | ใบเสนอราคา QT: POST/GET /api/quotes · /quotes/[no] · print CSS · หมดอายุ 7 วัน · แปลงเป็นออเดอร์ | done | yolo1 → yolo3 → cyolo2 | 3 | 0.811 |
| T09 | หลังร้าน /staff/orders · /staff/claims · /owner/holidays + order.events → notify-worker + notify-box | done | cyolo2 → yolo3 | 2 | 0.551 |
| T10 | ชั้น RabbitMQ: คิว chat/stt/tts/rag · RPC chat.request→chat.reply · priority · DLQ · backpressure · SSE /api/chat | done | yolo3 | 1 | 0.552 |
| T11 | mock-llm: LLM tag PRICE/QUOTE/ORDER_STATUS · หลายรอบ · ตัวเลขไทย · STT เทียบ fixture · TTS tts-cache · rerank ลำดับเดิม · MOCK_LATENCY_MS | done | cyolo1 | 1 | 0.614 |
| T12 | rag-worker + embedder: อ่าน PDF · chunk 500/80 + หัวตาราง · pgvector + pg_trgm · ingest 7 ไฟล์ตอนเริ่ม · /admin/docs อัปโหลด | done | yolo3 → yolo1 → cyolo1 | 3 | 1.176 |
| T13 | chat-worker: SQL สินค้า/บริษัท · Hybrid RAG (vector+trgm→RRF top20→rerank top4 · fallback) · tag → quote()/QT/สถานะ · ประวัติ 10 · privacy · ส่ง tts.request รายประโยค | done | yolo1 → cyolo2 | 2 | 1.752 |
| T14 | หน้าต่างแชท: ปุ่มลอย · ฟอง · คำถามแนะนำ 3 · chat-cite (เปิด PDF หน้านั้น) · 🔊 tts-play / tts-auto คิวเล่นตาม seq | done | cyolo1 | 1 | 0.324 |
| T15 | เสียง: stt-worker · tts-worker (cache sha256 · อ่านเงิน/รหัสเป็นคำ) · /api/voice · /api/voice/status · /api/tts · voice-mic · voice-mode · fake-mic.ts | done | yolo1 → cyolo1 | 2 | 2.316 |
| T16 | 3D: ฉากหน้าแรกขวด 9 ใบ + สายพาน · หมุนขวดในการ์ด · มาสคอต 3D 4 ท่า + ขยับปาก WebAudio · fallback ไม่มี WebGL | done | yolo1 → cyolo2 → yolo3 | 3 | 0.561 |
| T17 | dashboard ประเมิน RAG: GET/POST /api/admin/eval · /admin/eval (การ์ด · กราฟต่อเล่ม · eval-by-doc on/off · compare · only=fail) | done | yolo1 → yolo3 | 2 | 0.584 |
| T18 | ชุดประเมิน: eval/rag.json (จาก 770 ข้อ) · qa.json 70–80 · conv 10–12 บท · run_eval.mjs · judgments · score.mjs · รัน mock rerank on/off | done | yolo3 | 1 | 2.069 |
| T19 | dashboard load test: GET/POST /api/admin/load · /admin/load (การ์ด N ต่อโหมด · กราฟ delay + เส้น 12 วิ + เส้นเป้า 200 · ขั้นไม่ผ่านสีแดง) | done | cyolo1 → yolo1 | 2 | 0.452 |
| T20 | load test mock: loadtest/run_load.mjs 5 โหมด · อ่านคิว :15672 · รัน mix 1→250 (chat-worker ×2) · Q01 20 หน้าต่าง | done | cyolo2 | 1 | 3.541 |
| T21 | รวมระบบ MODE=mock: Playwright 62 เคสทั้งเพลย์ลิสต์ + GIF ทุกเคส + MP4 เคส T/V + unit rules.ts → TEST_REPORT.md (คอลัมน์ mock) | done | cyolo1 → yolo3 → cyolo2 → yolo1 → yolo3 | 5 | 1.845 |
| T22 | GPU baseline (อนุมัติ 27/10): 5090 Qwen · 4090 Whisper · 4090 VoxCPM2+rerank · ai 62 เคส/eval/load · งบหยุด $12 | done | cyolo2 → cyolo2 → cyolo1 → yolo3 → yolo3 | 5 | 7.175 |
| T23 | GPU scale ×2→×4 จากชุดเดิม (อนุมัติ 27/10) · SALE_RUN · destroy+verify0 · งบรวมหยุด $12 | done | cyolo2 → cyolo2 → cyolo1 → yolo1 → cyolo2 → yolo1 → cyolo2 → yolo1 | 4 | 8.275 |
| T24 | load test mock ตัวเลขหลัก: ปิด cache/prefetch 4/4/2 · คำถามไม่ซ้ำสุ่มจาก 770 · mix 1→250 · dashboard/รายงานใช้ค่า nocache เป็นหลัก (cache = เสริม) | done | yolo3 → cyolo2 → yolo3 | 3 | 2.092 |

## บัญชี

| บัญชี | เปิดงาน (ครั้ง) | งานที่แตะ | โทเคนรวม (M) | % ต่อ 1M token (เรียนรู้จริง 5ชม./สัปดาห์) |
|---|---|---|---|---|
| cyolo1 | 9 | 9 | 8.783 | - / 2.313 |
| cyolo2 | 16 | 11 | 11.406 | - / 3.376 |
| yolo1 | 11 | 9 | 5.929 | 15.034 / 1.424 |
| yolo3 | 14 | 11 | 12.22 | 12.576 / 1.388 |

## การสลับบัญชี / orchestrator

- `12:10:32` **ORCH_LOW** ตัวคุมวง yolo3 เหลือ 14%
- `12:11:21` **ORCH_SWITCH** ส่งไม้ตัวคุมวง yolo3 → **cyolo1**
- `00:06:54` **ORCH_SWITCH** ส่งไม้ตัวคุมวง cyolo1 → **yolo1**
- `00:42:45` **ORCH_SWITCH** ส่งไม้ตัวคุมวง yolo1 → **yolo1**
- `00:47:19` **ORCH_SWITCH** ส่งไม้ตัวคุมวง yolo1 → **yolo1**
- `00:48:02` **HANDOFF** งาน T08 · yolo1 → **yolo3** · สั่งสลับเอง
- `00:48:02` **HANDOFF** งาน T09 · cyolo2 → **yolo3** · สั่งสลับเอง
- `00:48:03` **HANDOFF** งาน T12 · yolo3 → **yolo1** · สั่งสลับเอง
- `00:48:04` **HANDOFF** งาน T16 · yolo1 → **cyolo2** · สั่งสลับเอง
- `00:48:04` **HANDOFF** งาน T17 · yolo1 → **yolo3** · สั่งสลับเอง
- `00:48:04` **HANDOFF** งาน T19 · cyolo1 → **yolo1** · สั่งสลับเอง
- `00:56:36` **HANDOFF** งาน T08 · yolo3 → **cyolo2** · สั่งสลับเอง
- `00:56:39` **HANDOFF** งาน T12 · yolo1 → **cyolo1** · สั่งสลับเอง
- `00:56:43` **HANDOFF** งาน T16 · cyolo2 → **yolo3** · สั่งสลับเอง
- `09:11:17` **ORCH_SWITCH** ส่งไม้ตัวคุมวง yolo1 → **yolo1**
- `09:25:01` **HANDOFF** งาน T13 · yolo1 → **cyolo2** · คาดว่า yolo1 จะใช้ถึง 5ชม. 43.8% / สัปดาห์ 72.1% (เพดาน 100%) ก่อนงานเสร็จ → รับต่อได้ดีสุด: yolo3 (KC-QUEST 34.1)
- `10:16:52` **HANDOFF** งาน T15 · yolo1 → **cyolo1** · คาดว่า yolo1 จะใช้ถึง 5ชม. 66.4% / สัปดาห์ 75.0% (เพดาน 100%) ก่อนงานเสร็จ → รับต่อได้ดีสุด: yolo3 (KC-QUEST 30.8)
- `12:32:24` **HANDOFF** งาน T21 · cyolo1 → **yolo3** · cyolo1 ใช้ถึงเพดานแล้ว (5ชม. 97% · สัปดาห์ 16%/100%) → รับต่อได้ดีสุด: yolo3 (KC-QUEST 10.8)
- `12:34:42` **HANDOFF** งาน T21 · yolo3 → **cyolo2** · คาดว่า yolo3 จะใช้ถึง 5ชม. 85.0% / สัปดาห์ 21.2% (เพดาน 42%) ก่อนงานเสร็จ → รับต่อได้ดีสุด: cyolo2 (KC-QUEST 7.6)
- `12:35:06` **HANDOFF** งาน T21 · cyolo2 → **yolo1** · cyolo2 ใช้ถึงเพดานแล้ว (5ชม. 98% · สัปดาห์ 16%/100%) → รับต่อได้ดีสุด: yolo3 (KC-QUEST 16.4)
- `12:35:33` **HANDOFF** งาน T21 · yolo1 → **yolo3** · คาดว่า yolo1 จะใช้ถึง 5ชม. 70.3% / สัปดาห์ 75.8% (เพดาน 100%) ก่อนงานเสร็จ → รับต่อได้ดีสุด: yolo3 (KC-QUEST 16.8)
- `21:08:55` **ORCH_SWITCH** ส่งไม้ตัวคุมวง yolo1 → **yolo1**
- `21:11:51` **ORCH_LOW** ตัวคุมวง yolo1 เหลือ 13%
- `21:12:12` **ORCH_SWITCH** ส่งไม้ตัวคุมวง yolo1 → **cyolo1**
- `23:45:50` **HANDOFF** งาน T24 · cyolo2 → **yolo3** · สั่งสลับเอง
- `09:20:41` **ORCH_SWITCH** ส่งไม้ตัวคุมวง cyolo1 → **cyolo1**
- `10:04:21` **HANDOFF** งาน T22 · cyolo2 → **cyolo2** · Orchestrator review T24 พบ TTS sentence audio cache ยังเปิด ผล25คนคือ retrieval-cache-off ไม่ใช่ทุกcacheoff. ก่อนเช่าGPUเพิ่ม TTS_CACHE=off bypass read/writeทั้งmemory+DB และพิสูจน์counter; ใช้ primary GPU nocacheทุกชั้น ห้าม prefix/responsecache. ถ้าเวลาmockก่อน10:30ยังพอวัด1,10,15,20,25เพื่ออัปเดตheadlineจริง ถ้าไม่ทันรายงานcaveatไม่อ้างallcacheoff. ยังไม่สร้างGPUจึงหยุดเพื่อแก้promptแล้วกลับบัญชีเดิมได้.
- `10:53:05` **ORCH_SWITCH** ส่งไม้ตัวคุมวง cyolo1 → **cyolo1**
- `11:47:40` **ORCH_LOW** ตัวคุมวง cyolo1 เหลือ 14%
- `11:48:10` **ORCH_SWITCH** ส่งไม้ตัวคุมวง cyolo1 → **yolo1**
- `12:14:17` **LIMIT_HANDOFF** งาน T22 · cyolo1 → **yolo3** · 
- `21:34:43` **ORCH_SWITCH** ส่งไม้ตัวคุมวง yolo1 → **cyolo1**
- `23:17:19` **HANDOFF** งาน T23 · cyolo1 → **yolo1** · cyolo1 CLI stalled since23:09 with model refresh timeouts; GPU independently verified0. Preserve WIP. Resume settled budget feasibility and authorized scale if feasible; read current tasks/T23.md and handoff.
- `10:22:26` **ORCH_SWITCH** ส่งไม้ตัวคุมวง cyolo1 → **yolo1**
- `13:00:31` **ORCH_SWITCH** ส่งไม้ตัวคุมวง yolo1 → **yolo1**

## โควตาตอนจบ

| บัญชี | แพลน | ใช้ไป 5 ชม. | ใช้ไปสัปดาห์ | เพดาน | เหลือ (headroom) | หมดอายุ/รีเซ็ต | เร่งด่วน U | คะแนน | slot |
|---|---|---|---|---|---|---|---|---|---|
| yolo1 | team | 67% | 30% | 100% | **33%** | 02/11 20:59 (125.9 ชม.) | 0.16 | 22.8 | 3 |
| yolo2 | team | ปิดไว้ใน accounts.json | | | | | | | 0 |
| yolo3 | max | 17% | 41% | 42% | **1%** | 31/10 08:00 (64.9 ชม.) | 0.27 | 16.6 | 0 |
| yolo4 | – | ยังไม่ล็อกอิน | | | | | | | 0 |
| yolo5 | – | ยังไม่ล็อกอิน | | | | | | | 0 |
| cyolo1 | plus | 0% | 28% | 100% | **72%** | 02/11 21:12 (126.1 ชม.) | 0.16 | 38.4 | 2 |
| cyolo2 | plus | 7% | 1% | 100% | **93%** | 04/11 13:35 (166.5 ชม.) | 0.126 | 44.8 | 2 |
| cyolo3 | – | ยังไม่ล็อกอิน | | | | | | | 0 |
| cyolo4 | – | ยังไม่ล็อกอิน | | | | | | | 0 |
| cyolo5 | – | ยังไม่ล็อกอิน | | | | | | | 0 |
