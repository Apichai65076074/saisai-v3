# NOTES — orchestrator · SaiSai v3 · RUN=/root/runs/saisai

## กติกาจากพรอมต์ผู้ใช้ (ถือตลอด · ขัด recipe ให้ถือข้อนี้)
- PROBLEM=/workspace/noom_saisai/SAISAI.md · PLAN=/workspace/noom_saisai/plan/tasks.json (ห้ามตัดเคสทดสอบ) · mirror=/workspace/noom_saisai/orchestra · BACKEND=mock
- ข้อมูลพร้อมแล้ว ห้ามสร้างใหม่: docs/pdf · data/facts · gemini/rag-questions · test-fixtures/voice · rules.ts ต้นฉบับต้อง hash ตรง T05
- accounts: yolo2 disabled · yolo1 เปิดตาม accounts.json ที่อัปเดต 12:14 (บันทึกว่าได้รับอนุญาต 12:13) · yolo3 budget_pct 40 · cyolo1/2 เปิด
- ทำถึง mock ครบ: 62 เคส + load test mock 200 คน + RAG eval 770 ข้อ; **อนุมัติ GPU ล่าสุด27/10 09:20มีผลเหนือholdเดิม** → T22หลังT24 แล้วT23 ตามpromptใหม่/งบหยุด$12 เพดาน$15
- ห้าม git push · GPUเฉพาะT22/T23ตามอนุมัติ · ห้ามเปิด/พิมพ์ .env (toolkitอ่านcredentialภายในprocessได้ตามข้อยกเว้นT22/T23) · ห้าม docker compose down -v · ห้ามลบ volume · ห้ามแตะ container saisai06-* saisai05-* app-* paintpod-* · เว็บ 3600 ห้ามชน 3400
- ต้องแสดงตารางงานให้ผู้ใช้ดูก่อน dispatch

## การปรับแผน (เหตุผล)
1. owns: ตัด prefix `app/` (root ของ repo = $RUN/app) · เพิ่มไฟล์เคส Playwright `e2e/tests/<CASE>.spec.ts` ให้เจ้าของเคสละ 1 งาน (62 เคสครบ · ตาราง _shared ข้อ 10) · T21 ไม่ได้เป็นเจ้าของ e2e/tests ทั้งโฟลเดอร์แล้ว แต่รันทั้งหมด + แก้โค้ดได้
2. T13 depends += T14 (เคส C/R/M ต้องใช้หน้าต่างแชท) · T15 depends += T13 (เคส T/V ต้องมี chat-worker ส่ง tts.request รายประโยค)
3. T20 exclusive: true (load test 200 คนต้อง compose เต็ม chat-worker ×2 · recipe ห้าม compose นอกงาน exclusive)
4. R07 (ต้องใช้แชท) ย้ายเจ้าของเคสไป T13 · Q02 (ต้องมี chat-worker) ไป T13 · T10 ทดสอบ Q02 แบบ stub
5. T22 T23 status hold (orch ไม่ dispatch) · เมื่อ T21 เสร็จจะได้ STUCK = ถึงเป้าโหมด mock แล้ว
6. dev infra แยกจาก BuildMart: ss-devdb 56432 · ss-devmq 56672/56673 · ss-devembed 56680 · port_base 4600 (mock 5100+) · compose project `saisai3` · RabbitMQ UI ใช้ env MQ_UI_PORT (15672 ถูก buildmart-rabbitmq-1 ใช้อยู่ → ใช้ 15673 ตอนรันจริง)
7. บทเรียน BuildMart: cyolo plus หมด 5 ชม. เร็ว → per_account_max cyolo 2 · ใช้ gpt-6.1-sol/medium · yolo 3
8. inputs (PDF · facts · คำถาม 770 · voice fixtures) commit ลง main แล้ว (9b58af8) · hash อยู่ใน inputs.sha256

## บันทึกเหตุการณ์
- 25/10 ~11:25 ผู้ใช้สั่งไปต่อ: legacy อยู่ /workspace/noom_saisai/legacy → sha256 rules.ts ตรง 1f880cd3…122c · copy (web db docs CHANGE-REQUESTS *.md · ไม่เอา .env/node_modules/rea-out/demo/test-files) → app/legacy · commit 287c62d (blob hash ตรง)
- ผู้ใช้: ใช้ MQ UI 15673 ได้ · หยุด stack buildmart ด้วย `docker compose -p buildmart stop` แล้ว (ไม่ down · volume buildmart_pgdata/hfcache ยังอยู่) · ตอนนี้ 15672 ว่าง → prompt ใช้กติกา "ถ้า 15672 ไม่ว่างใช้ 15673"
- ผู้ใช้: espeak-ng ใช้ได้ในโหมด mock · เวลารวมเกิน 3 ชม. ให้บันทึกตามจริงใน REPORT/SALE_RUN · **ห้ามลดเคส**
- 11:35 DONE T06 (cyolo1 · 0.37M) รูป 15 ไฟล์ + PROMPTS.md
- 11:44 DONE T04 (yolo3 · 1.26M) โครง compose/db/web/e2e · เพิ่ม lib/http.ts session-token.ts test-mode.ts
- 11:49 DONE T05 (cyolo2 · 0.26M) rules.ts byte-identical (orch ตรวจ sha256 ซ้ำแล้ว) + pricing + unit
- 11:57 DONE T11 (cyolo1 · 0.61M) mock-llm
- 11:58 DONE T10 (yolo3 · 0.55M) mq+SSE · ⚠️ worker ใช้ pkill -f 'next dev' กระทบ T07 → เพิ่มกติกาห้าม pkill ตามชื่อใน _shared
- 12:07 MERGE_CONFLICT T07 (cyolo2) → orch คืนคิว/เปิดใหม่
- 12:08 DONE T14 (cyolo1 · 0.32M) หน้าต่างแชท
- 12:10 **ORCH_LOW yolo3** (5 ชม. 86% · สัปดาห์ 8%/เพดาน 42%) → handover ตาม recipe ไป cyolo1 (headroom 38%) · cyolo1/2 5 ชม. ~62% แล้ว

## ส่งไม้ orchestrator (12:10 · yolo3 → cyolo1)
- สถานะ: เสร็จ T01–T06 T10 T11 T14 (9/23) · รัน T07 (cyolo2 · รอบหลัง merge conflict) T12 · ที่เหลือรอ dependency
- ตัวคุมวงคนใหม่: วน `dispatch`/`wait` ต่อจนงาน mock ครบ (T21 เสร็จ) · **T22 T23 = hold ห้ามเริ่ม ห้ามเปลี่ยน status** (รอผู้ใช้อนุมัติ GPU) → เมื่อ T21 เสร็จจะได้ STUCK = ถึงเป้า → `report` → `export --to /workspace/noom_saisai/orchestra` → ตรวจชื่อไฟล์ไม่มี .env* ติดไป → `infra down` · เปิดเว็บ mock ค้างไว้ (3600)
- ตรวจหลัง T05 ทุกครั้งที่ merge: `sha256sum app/web/lib/rules.ts` ต้อง = 1f880cd3…122c
- ระวังโควตา cyolo plus หมด 5 ชม. เร็ว: ถ้า LIMIT_HANDOFF วนถี่ ให้ stop งาน (requeue) แล้วรอรีเซ็ต อย่าปล่อยวน · yolo3 รีเซ็ต 5 ชม. แล้วใช้ต่อได้ (budget 40%)
- กติกาผู้ใช้ทั้งหมดอยู่หัวไฟล์นี้ (ห้าม push · ห้ามเช่า GPU · ห้ามอ่าน .env · ห้าม down -v/ลบ volume · ห้ามแตะ saisai06-* saisai05-* app-* paintpod-* · buildmart ถูก stop ไว้ตามคำสั่งผู้ใช้ ห้าม start/down)
- 12:14 ผู้ใช้แจ้ง: yolo3 เปลี่ยนเป็น Pro · เปิด yolo1 สำรอง ถ้า yolo3 ติด limit ให้ handover/ส่งงานไป yolo1 ได้

- 12:18 DONE T07 (cyolo2 · 1.798M รวม 2 รอบ) · build/Playwright 10/10/HTTP/MQ ผ่าน · orch merge แล้ว · ตรวจ rules.ts SHA256 ตรงต้นฉบับ · เปิด T08 T09 T16 T17 T19 ต่อพร้อม T12

- 12:18 ตรวจพบ accounts.json มีการเปิด yolo1 (mtime 12:14:24; note ผู้ใช้อนุญาต 12:13) และ yolo3 note เปลี่ยนเป็น Pro · orch จัดสรร T08/T16/T17 ไป yolo1 ตาม config ปัจจุบัน; ไม่แก้ accounts.json
- 00:04 Docker ล่มช่วง 12:20–23:50 (RAM ใน VM 7GB ไม่พอ) · เพิ่ม WSL เป็น 10GB+swap 8GB · ตั้ง max_agents=3 · worker ที่ค้างตอนล่มให้ตรวจแล้ว requeue · ห้ามรัน stack พร้อมกันเกิน 2 ชุด
- 00:47 orchestrator ใหม่ (yolo1 · pid 2195) รับไม้ · orchestrator 00:06/00:42 ล้มเพราะ OAuth refresh ชนกัน · ไม่มี worker รันจริง (state/running ค้าง 6 งาน) · infra up (ss-devdb/mq/embed ดับตอน Docker ล่ม) · stop --requeue T08 T09 T12 T16 T17 T19 (WIP ใน wt/ ยังอยู่ · T09 มี commit a496f10 · T12 มี 29b64ac)
- 00:56 ผู้ใช้สั่งพัก: kill orchestrator + stop --requeue งานที่รันอยู่ (WIP อยู่ใน branch) · ปิดเครื่อง · เช้า handover --to yolo1
- 09:13 orchestrator yolo1 (pid 907) รับไม้ตามคำสั่งผู้ใช้ (quota แนะนำ cyolo2 แต่ผู้ใช้ระบุ yolo1 · ไม่ handover) · infra up ใหม่ (ดับตอนปิดเครื่อง) · dispatch T12→cyolo1 T08→cyolo2 T16→yolo3
- 09:20 DONE T08 (cyolo2 · 0.81M รอบนี้) QT · rules.ts sha ตรง · เปิด T17 แทน
- 09:22 DONE T16 (yolo3 · 0.56M) 3D ฉาก/ขวด/มาสคอต · เปิด T19
- 09:23 DONE T12 (cyolo1 · 1.18M รวม) rag-worker+ingest · เปิด T13 (chat-worker)
- 09:25 HANDOFF T13 yolo1→คิว (คาด 5ชม.yolo1 44%) · T09→yolo3 รอบ 2
- 09:35 DONE T19 (yolo1 · 0.45M) load dashboard · T13 ได้ slot
- 09:37 DONE T17 (yolo3 · 0.58M) eval dashboard · ไม่มีงานพร้อม (T15 T18 T20 รอ T13)
- 09:42 DONE T09 (yolo3 · 0.55M รอบนี้) หลังร้าน+notify-worker · เหลือ T13 วิ่งเดี่ยว (คอขวด)
- 10:09 DONE T13 (cyolo2 · 1.75M) chat-worker · เปิด T15 T18
- 10:17 HANDOFF T15 yolo1→ต่อ (คาด 5ชม.yolo1 66%)
- 10:48 T15 ใช้ 1.9M (ประเมิน 0.97) ยังคืบหน้า · T18 71% (mock-rerank-on hit@4 0.83)
- 10:53 DONE T18 (yolo3 · 2.07M) eval 770+78+12 บท · mock rerank on=off (คาดไว้ mock rerank คืนลำดับเดิม) · rag hit@4 83% correctness 49% (mock ผู้ตอบเป็นคอขวด) · qa 96% privacy 100%
- 10:59 DONE T15 (cyolo1 · 2.32M รวม) เสียง STT/TTS + T/V · เปิด T20 (exclusive)
- 11:45 T20 baseline mix 1→250: ขั้น 200 คน HTTP_429 233 · MISSING_TTS 96 (คิว chat เกินเกณฑ์ backpressure) · worker วิเคราะห์ต่อ
- 12:04 T20 2.2M: ขั้น 200 error 0% แต่ p95 40s · worker เพิ่ม candidate cache ใน chat-worker/lib/retrieve.mjs (นอก owns · T21 ต้องรัน C/R/M ซ้ำ) · ถ้าเกิน ~3M → ให้หยุดปรับและรายงานตามจริง
- 12:32 DONE T20 (cyolo2 · 3.54M เกินประเมิน) load mix final: 200 คน error 0% p95 5.75s · 250 คน p95 7.10s · ⚠️ ผ่านเพราะ prefetch + RRF candidate cache (คำถามโหลดซ้ำกัน · รายงานระบุไว้ข้อ 110) · baseline ไม่มี cache: 200 คน p95 40s · Q01 ผ่าน · เปิด T21 (exclusive)
- 12:41 T21 HANDOFF cyolo2(5ชม.98%)→yolo1(กันไว้ orchestrator)→yolo3 รอบ 5 · WARN_NO_TARGET (yolo3 คาด 5ชม. 89%) ปล่อยรัน · cyolo1/2 5ชม.หมด
- 13:10 T21 รอบ1 Playwright 51/63 · fail D02 D03 Q01 Q03 T01-03 V01-05 · worker rerun กลุ่มนี้
- 13:56 ผู้ใช้สั่ง (สำคัญ): ตัวเลขรองรับกี่คนหลักต้องมาจาก load test ที่ปิด prefetch/cache และใช้คำถามไม่ซ้ำ (สุ่มจาก 770 ข้อ) · ตัวเลขเปิด cache ให้แสดงเป็นข้อมูลเสริมพร้อมระบุชัด · ใช้กับทั้ง mock และ GPU · ห้ามลดเกณฑ์
- 13:56 T21 รอบเต็ม#2 61/63 (R07 race · Q01 login timeout CPU) → รอบเต็ม#3

## orchestrator yolo1 (pid 2631 · รับไม้ 26/10 21:08)
- 21:09 DONE T21 (yolo3 · 1.85M รวม · worker จบ 14:29 แต่ orch เดิมหยุดก่อน merge) · mock 62/62 · GIF 62 · MP4 9 · merge d715fbf · rules.ts sha ตรง
- 21:15 เพิ่ม T24 (exclusive · dep T21) ตามคำสั่งผู้ใช้ 13:56 ที่ยังไม่มีงานรองรับ: load test ตัวเลขหลักปิด cache + prefetch 4/4/2 + คำถามไม่ซ้ำจาก 770 · cache on = เสริม · compose default RAG_CANDIDATE_CACHE=off
- 21:16 START T24 → yolo3 (KC-QUEST)
- 21:17 **ORCH_LOW yolo1** (5 ชม. 87% · headroom 13%) → handover ตาม recipe (quota แนะนำ cyolo1 headroom 84%)

## ส่งไม้ orchestrator (21:17 · yolo1 → บัญชีที่ handover เลือก)
- สถานะ: เสร็จ 21/24 (T01–T21) · รัน T24 (yolo3 · exclusive) · T22 T23 = hold ห้ามเริ่ม/ห้ามเปลี่ยน status
- ตัวคุมวงคนใหม่: วน `dispatch`/`wait` จน T24 DONE → ตรวจ `results/mock-mix-nocache.json` เอง (config.cache=off · prefetch 4/4/2 · questions=rag770 · repeats) + sha256 rules.ts → จะได้ STUCK (เหลือ T22 T23 hold) = ถึงเป้า mock → `report` → `export --to /workspace/noom_saisai/orchestra` → ตรวจชื่อไฟล์ไม่มี .env* → `infra down` · เปิดเว็บ mock ค้างที่ :3600 (`docker compose -p saisai3 --profile mock up -d` ใน app/ ถ้าไม่ได้รันอยู่)
- สรุปให้ผู้ใช้: ตัวเลขรองรับกี่คนหลัก = ผล nocache ของ T24 · ผล T20 (cache on 250 คน) = เสริม

## รับไม้ cyolo1 (26/10 ต่อจาก handover 21:12)
- อ่าน BOARD/NOTES/recipe + skills yolo/cyolo แล้ว เริ่มขั้น 3 โดยใช้ worker T24 yolo3 เดิม ไม่สร้าง worker ซ้ำ · T22/T23 hold คงเดิม
- T24 รอบหลักกำลังรัน cache off / prefetch 4/4/2 / rag770 seed 20261026 / stage120 think30 · ผลชั่วคราว 1 คน p95 3.25s, 10 คน 7.98s ผ่าน; 25 คน 19.32s ไม่ผ่าน error0 repeats0 · worker วิเคราะห์คอขวดระหว่างวัดขั้นต่อไป
- แผนเทียบเวลาจริงอยู่ /workspace/noom_saisai/plan/out/plan.json (ไม่ใช่ plan/plan.json)
- 23:43 T24 INCOMPLETE เพราะ yolo3 CLI ECONNREFUSED (is_error=true · worker exit) → orch เปิดรอบ2 cyolo2 gpt-6.1-sol/medium อัตโนมัติ · WIP d8ac821 ไม่สูญหาย
- ผลเทียบ query ฉบับสุดท้าย 858/858 identical · keyword p50 652.7→81.1ms, p95 1442.5→217.6ms · hit@4 770 ข้อ pruned=fullscan=74.7%, top4_differs=[] (T18 83% วัดผ่าน chat API คนละเส้นทาง) · รอบ2เริ่มโหลด nocache-pruned ต่อ
- 23:45 ผู้ใช้สั่งพัก: kill orchestrator + requeue งานที่รันอยู่ · เช้า handover
- 27/10 09:20 ผู้ใช้อนุมัติ GPU (T22 แล้วต่อด้วย T23): เพดานรวม $15 · ถ้าใช้ถึง $12 ให้หยุดรอผู้ใช้ · เช่าเพิ่มทีละขั้น baseline→×2→×4 (ไม่เช่าชุดใหม่) · เลือกเครื่อง verified reliability>0.98 ราคาถูกสุด · ตัวเลขหลักของ load test บน GPU = ปิด cache และใช้คำถามไม่ซ้ำ · หลังจบให้ destroy ทุก instance และตรวจ vastai show instances ต้องได้ 0 · ใช้ VAST_SSH_KEY_FILE เท่านั้น (ห้ามใช้ key ของอาจารย์) · รายงานค่าใช้จ่ายสะสมหลังจบแต่ละขั้น
- T24: ให้ทำต่อได้ถึง 10:30 · ถ้ายังไม่จบ ให้สรุป N จากขั้นที่วัดได้แล้ว (10 ผ่าน / 25 ไม่ผ่าน) ถ้าทำได้ให้วัดเพิ่มที่ 15 และ 20 คน แล้วไปทำ T22 ต่อ
- 27/10 09:23 orchestrator รับไม้ cyolo1: อ่านสถานะ/recipe/skill yolo+cyolo แล้ว เริ่มขั้น 3 ต่อ T24 ผ่าน orch เท่านั้น; อนุมัติ GPU ล่าสุด 09:20 มีผลเหนือ hold เดิม แต่จะเปิด T22 หลัง T24 และใส่ข้อจำกัดงบ/SSH/cleanup ใน prompt ก่อน dispatch
- 09:28 ปรับ T22/T23 ready ตามอนุมัติ09:20 และ T22 depends_on+=T24; เขียน prompt+shared exception ครบ baseline→×2→×4, watchdogงบรวม/หยุด$12, SSHตามenv, cleanup; baselineคงไว้เฉพาะส่งต่อT23ทันทีพร้อมwatchdog≤10นาที มิฉะนั้นdestroy ไม่เช่าชุดใหม่; check OK24งาน. T24รอบ3 yolo3 opus/medium กำลังทำต่อ WIPเดิม
- 09:42 orch ตรวจผล T24 pruned raw JSON เอง: cache off/prefetch4/4/2/rag770 seed20261026, text357ข้อ repeats0 (voice142/unique10/repeats132แยก); 25คนผ่าน p95=8.265s error0, 50คนไม่ผ่าน p95=13.500s error3.902%; broker publish=chat done ทุกขั้น; maxที่วัดผ่าน=25 ไม่อ้างผ่าน200. rules.ts main sha256ตรง1f880cd3…122c. Vast preflight toolkit: credential env/keyพร้อม, SDK1.9.0 driftจากskill1.8.2 ต้องตรวจsignatureก่อนcreate, ไม่มีinstanceของงานค้าง
- 10:03 DONE T24 yolo3 รวม2.092M รอบ3 merge a4220e6; raw JSON independent assertionsผ่าน cacheoff/prefetch4/4/2/rag770/repeats0/publish=done, rules hashเดิม, L01/L02 log2passed. แต่พบcaveatสำคัญTTS sentencecacheยังเปิด (REPORTบันทึกตรง): 25คนคือretrieval-cache-off ไม่ใช่allcacheoff; T22 cyolo2 เริ่มอัตโนมัติแล้วก่อนเช่าGPU จึง stop/requeueแก้prompt10:05ให้เพิ่มTTS_CACHEoff+runtimeproofและprimaryGPUปิดcacheทุกชั้น; ถ้าทัน10:30วัดmockเพิ่มเติม มิฉะนั้นรายงานcaveatและไปGPU
- 10:25 T22 cyolo2รอบ2แก้TTS_CACHEoffครบworker(memory/DB/singleflight/warmup)+mockprovider(memory/disk)+one-useHTTP/no-store; unitcounter6requests→6upstream/0DB, runtime3requests3WAV/replay404/DBไม่เพิ่ม; coldmock120s/think30 1,10,15ผ่าน/20fail(p95=22.61s,error1.27%)/25pass(p95=9.35s), raw max_users_strict=15ตามcontiguous rule, configcache+tts_cacheoff/repeats0. **ขาด voices/nongsai.wav และได้ถามผู้ใช้ขอไฟล์/pathแล้ว** ห้ามเช่าก่อนพร้อม. ตั้งmax_agents0ชั่วคราวป้องกันauto-retryวนmissinginputขณะรอworkerปิดprep (ต้องคืน3ก่อนจบ/ส่งต่อ). GPUยัง0 ค่าเช่า0
- 10:30 T22 INCOMPLETE statusBLOCKED missing authorized voices/nongsai.wav; ไม่มีworkerรัน. ตั้งT22holdรอไฟล์5–15วิหรือpathจากผู้ใช้ (ไม่ใช่รออนุมัติGPUใหม่), T23readyแต่depT22จึงไม่เริ่ม; คืนmax_agents3แล้ว. WIP7177356อยู่task/T22ยังไม่mergeเข้าmainเพราะGPUงานไม่ครบ, ห้ามmarkDONE. MainมีT24 a4220e6; เว็บmock3600รันcold-TTSโค้ดจากwt/T22. Workerรายงาน49webpass/15integration skip, TTS12/12ในcompose, runner8/8, T02browserพร้อมMP4เสียงผ่าน; runtime334requests=334upstream/DBcache shared0; show_instances10:27task0/other0/spent$0. เมื่อได้เสียงที่มีสิทธิ์ใช้ให้ตรวจinput→retryT22→dispatch/waitต่อจากWIP ไม่ต้องทำขั้น1–2หรือโหลดmockซ้ำ
- 10:33 orchตรวจเองหลังworkerจบ: coldJSON cacheoff+tts_cacheoff/prefetch4/4/2/rag770/repeats0, publish=doneทุกขั้น และcontiguousN15ตรงmax_users_strict; rules shaเดิม; GET3600/api/health ok/dbtrue/modemock; Vast SDK show_instancesทั้งบัญชี0, VAST_API_KEY exact-match scanไฟล์เปลี่ยนบนbranch CLEAN. checkOK24งาน/BOARDอัปเดต/REPORTcheckpointสร้างแล้ว; waitคืนSTUCK T22,T23ไม่มีworker. ยังไม่exportฉบับจบหรือinfra downเพราะGPUค้างรอinputและต้องคงเว็บmockให้ลอง; evidence/preflightอยู่wt/T22/RUN/state (workerใช้relativeRUN ไม่ใช่RUN/stateกลาง ให้ย้าย/ปรับเป็นabsoluteก่อนwatchdogงานGPU)
- 27/10 10:53 ผู้ใช้ส่งเสียงต้นแบบแล้ว: /workspace/noom_saisai/voices/nongsai.wav (10.9 วิ · 48kHz mono) + nongsai.txt (ข้อความตรงกับเสียง) · เป็นเสียงสังเคราะห์จาก Windows TTS ไม่ใช่เสียงคนจริง ผู้ใช้อนุญาตให้ใช้ · ให้ copy ไปไว้ที่ voices/ ของแอป แล้วทำ T22 ต่อตามที่อนุมัติไว้ 09:20
- orchestrator รับไม้รอบ10:53: ตรวจเสียงและcopyเข้าapp/voices+wt/T22/voicesแล้ว; เพิ่มpromptให้ใช้RUN absoluteสำหรับwatchdog/ledger ก่อนdispatchT22ต่อจากWIP ไม่รันmockซ้ำ
- 11:04 T22รอบ3→cyolo1 gpt-6.1-sol/medium: baseline3GPUแล้ว IDs57914113(5090)/57914254(STT4090)/57914350(TTS4090), independentSDKตรวจlabelsครบ/other0; burnGPU+disk$1.35815/hr, billed~$0.032 estimateพร้อมnetworkreserve~$1.586. watchdogPID210989ตรวจว่ารันจริง; state/ledgerabsoluteแล้ว. ยังmodel-installไม่มีผลaiและยังไม่mergeT22.
- 11:42 T22ยังรอบ3/cyolo1: QwenจริงตอบTH cached_tokens0/cache_n0สองคำขอ; NInfer64d10fbf enginehistoryoff/concurrency4. CERauto20ครบlarge.3359/turbo.3827; supportedTHENfallbackไม่ใช้goldenlarge.1668/turbo.3366เลือกlarge. TTSแก้brotliและcompilerบนเครื่องเดิมแล้วwarmup; chatunit13/retryDLQproofผ่าน. ยังไม่มีAI62/eval/load/scaleจึงห้ามmarkDONE. billing~$1.07 estimate$2.444/burn$1.35815; watchdogปัจจุบันPID239198.

## ส่งไม้ ORCH_LOW 27/10 11:47 — cyolo1 headroom14%
- งาน22/24เสร็จ, T22รอบ3 cyolo1 gpt-6.1-sol/mediumยังรัน อย่าสร้างworkerซ้ำ; T23readyรอT22. ใช้orch dispatch/waitต่อขั้น3ทันที ไม่ทำขั้น1–2. logs/T22.a3.cyolo1.jsonl และprogress/T22.md. ยังไม่mergeT22.
- GPUbaseline3เครื่องยังอยู่IDs57914113(5090LLM)/57914254(4090STT)/57914350(4090TTSrerank), labelprefixsaisai-20261027-. watchdogPID239198 detachedยังรัน; state/vast-ledger.json, vast-progress.json, vast-lease.json absolute. workerต่ออายุlease300s; หากhandoffT23ใช้600s. budgetถึง$12ต้องdestroyและหยุดรอผู้ใช้ เพดาน$15; ไม่เช่าชุดใหม่, ห้ามkeyอื่น. ล่าสุด {"stage": "final-AI-deployment", "ids": [57914113, 57914254, 57914350], "actual_usd": 1.209, "estimated_usd": 2.56827, "burn_hr": 1.35815, "headroom_to_12_usd": 9.43173, "last_checked": 1793076459.3355703, "watchdog_pid": 239198, "other_instances": 0}
- NInferbuild635targets+weightsสำเร็จ ตอบTHจริง cached_tokens0/cache_n0สองคำขอ; state/vast-ninfer-proof.txt historyoff/concurrency4. STTlibcublaspathแก้แล้ว CER20auto large.3359/turbo.3827; TH/ENfallbackไม่ใช้golden CER20ใหม่large.1668/turbo.3366เลือกlarge. TTSแก้brotli+build-essentialแล้วน้ำหนักครบ กำลังfinaldeploy/ตรวจhealth+HTTPtransport(SSHproxyช้า); ยังไม่วัดTTSRTF/AI62/eval770/loadbaseline จึงห้ามmarkDONE.
- chatunit13ผ่านในcompose/mockแยกผลจากai; retry/DLQproofผ่าน; adapterunit4/loadunitผ่าน; webbuildผ่าน. workerกำลังอ่านe2eเสียงที่คาดtranscriptตรงexact ต้องคงgolden/fixtures/62casesตามเดิม รายงานai failตามจริง ห้ามลดเกณฑ์.
- ผู้ใช้อนุญาตเสียงWindowsTTSแล้วvoices/nongsai.wav+txtอยู่ทั้งappและwt/T22. appgitมี??voices/ที่orchcopyไว้; workercommitเสียงในtask/T22ได้. rulesSHA256ตรง1f880cd34c63667d90b7fac8e0cdbd6dfaa0a80ef270cda007e4957dfbf3122c. ห้ามอ่าน/พิมพ์.env; runtimecredentialsอยู่wt/T22/.vast-private/ignoreแล้ว. ห้ามpush/down-v/ลบvolume/แตะstackอื่น. จบงานจริงค่อยreport/export/infra down คืนmock3600และverifyGPU0.

## รับไม้ yolo1 (27/10 11:48 ต่อจาก ORCH_LOW cyolo1)
- อ่าน BOARD/NOTES/recipe + skills แล้ว เริ่มขั้น 3 ทันที · ไม่สร้าง worker ซ้ำ · 11:58 T22 ยังรัน cyolo1 (5ชม. 92% · คาด LIMIT_HANDOFF เร็ว ๆ นี้ → orch สลับเอง) · stage VoxCPM-inference-preflight · actual $1.42 / est $2.79 · other_instances 0
- 12:14 LIMIT_HANDOFF T22 cyolo1(5ชม.99%)→yolo3 รอบ4 · stage genuine-VoxCPM2-install · actual $1.84 est $3.21 · other0
- 12:33 T22 yolo3: VoxCPM2 จริง health ok RTF warm .373 · เริ่ม Playwright62 MODE=ai · actual $2.07
- 12:52 T22 ai Playwright run1 47/63 pass (fail C05 C08 C13 M01–M06 R01 T01 T02 V01–V03 Q01) GIF61 MP4 9 · เริ่ม load baseline · $2.69
- 13:25 T22 load r1: chat U=16 · stt fail@4 · tts fail@1 p95 12.6s · voice fail@1 · worker แก้ chat≤600ตัวอักษร (ตรง PROBLEM:196) + stt healthGate → r2 · $3.52
- 14:06 T22 load r2: stt U=16 · voice U=1 (first audio p95 10.1s) · tts+rerank U=0 (p95 12.4s) · eval gpu rerank-on hit4 .977 mrr .94 faith .967 qa .641 · กำลัง rerank-off · $4.36
- 14:32 MERGE_CONFLICT T22 → orch เปิดรอบ5 yolo3 merge main · stage T23-handoff · watchdog 322880 alive · $4.92 est $6.29
- 27/10 14:15 ผู้ใช้ปรับ T23: คอขวดคือ TTS+rerank บน 4090 ใบเดียว → ×2 = เพิ่ม 5090 1 ใบ (LLM) + 4090 1 ใบ (แยก TTS ออกจาก rerank) วัดทั้งแชทและเสียง · ×4 = รันไม่เกิน 30 นาที วัดเฉพาะ load test ไม่ต้องรัน eval/Playwright ซ้ำ · ถ้าใช้ถึง $10 ให้ข้าม ×4 แล้วสรุปผลที่มี · T22 ให้ทำ rerank-off eval และ Playwright 62 เคส (ai) ให้เสร็จก่อน แล้วค่อยเริ่ม T23 · destroy ทุกเครื่องเมื่อจบ และตรวจต้องได้ 0
- 14:35 DONE T22 yolo3 รอบ5 รวม7.18M merge 9715e1f · rules sha ตรง · ai pw 47/63 · eval rerank on/off 860 · load: chat16 stt16 voice1 tts0 · $4.95 est $6.31 · START T23 → cyolo2 14:35 (lease เหลือ~6นาที)
- 14:45 T23 cyolo2: baseline mix N=0 (1คน err25% p95 25.9s) → ไม่ scale ตามกติกา T23 · destroy 3 เครื่อง · orch ตรวจเอง show_instances=0 · ยอด ~$5.03 · ต่อ: รายงาน/การ์ด · ตอนปิดงานต้องคืนเว็บ :3600 เป็น mock (ตอนนี้ MODE=ai ชี้ GPU ที่ทำลายแล้ว)
- 14:55 stop T23 รอบ2 (auto-retry ของงาน BLOCKED) → status hold · orch merge task/T23 เอง f95322a (สแกน secret ใน diff = 0) · คืนเว็บ :3600 MODE=mock จาก app/main healthy · ต่อ report/export/infra down
- 14:47 report · export → /workspace/noom_saisai/orchestra (ไม่มี .env/key · exact-match scan 0) · infra down · เว็บ mock :3600 เปิดค้างไว้
- 14:50 ปิดรอบ: 23/24 done · T23 hold (ต้องให้ผู้ใช้ตัดสินใจเช่าชุดใหม่หรือไม่) · GPU 0 เครื่อง · ยอด Vast ~$5.03 · mock 62/62 · ai 46/62 · export แล้ว · infra down · เว็บ mock :3600 เปิดค้าง (project saisai3 จาก app/) · ถ้าผู้ใช้สั่ง scale ใหม่: ต้องแก้ ai fail (M ทั้งกลุ่ม · TTS p95 12s · Qwen ไม่เรียก [PRICE]) ก่อน ไม่งั้น baseline N=0 ซ้ำ
- 27/10 21:35 ผู้ใช้อนุมัติ T23 แบบเช่าชุดใหม่: ×2 = 5090×2 (LLM) + 4090 STT + 4090 TTS + 4090 rerank (แยก TTS ออกจาก rerank) · ×4 = เพิ่ม 5090 ให้ครบ 4 ใบ + 4090 TTS อีก 1 ใบ รันไม่เกิน 30 นาที วัดเฉพาะ load test · ตัวเลขหลักต้องปิด cache และใช้คำถามไม่ซ้ำ · ยอดสะสม (รวม T22 ราว $5.03) ถ้าถึง $10 ให้ข้าม ×4 · ถึง $12 ให้หยุดทันที · ทำ SALE_RUN.md · destroy ทุกเครื่องแล้วตรวจต้องได้ 0

## รับไม้ cyolo1 (27/10 21:35 ต่อจาก yolo1)
- อ่าน BOARD/NOTES/recipe และ skills yolo/cyolo แล้ว ข้ามขั้น1–2 เริ่มdispatch/wait; T23รอบ3→cyolo1 gpt-6.1-sol/medium ผ่านorch ไม่มีworkerซ้ำ. ล่าสุดอนุมัติ21:35ให้เช่าชุดใหม่มีผลเหนือข้อห้ามbaselineเดิม/N0; ยึดtopologyและงบรวมเดิม:ถึง$10ข้าม×4 ถึง$12หยุดและcleanup; T23exclusive=trueใช้composesaisai3ได้. vastaiSDK1.9.0.
- 21:38 workerพบขาดhandoff/ledger/voices และdevinfraปิด; orchcopyเสียงเดิมกับsanitizedhistoricalstateเข้าwt/T23/RUN/stateพร้อมheaderอนุมัติล่าสุด/exclusivecompose/absoluteRUN; workerอ่านรับทราบแล้ว ไม่ต้องถามผู้ใช้ซ้ำ. LiveSDKorchตรวจGPU0; workerbillingsettled$5.088. กำลังเลือกoffers×2.
- 21:54 T23leaseหมดระหว่างprovision:watchdogdestroy3GPU→verify0 ยอดactual~$5.292/estimate$8.174. Orchชี้แจงcontrollerheartbeatต้องผูกworkerPID/startticks+finite deadline ไม่heartbeatลอย; retryเช่าชุดใหม่ยังอนุญาตถ้างบremainingทำได้จริง ไม่ถือว่าจบเพราะleaseผิดพลาด.
- 23:00 T23หลายpaiddeploymentattemptยังไม่พร้อม:leaseหมด→destroy3,APIwatchdogstale→destroy2,offerหาย,5090offlineซ้ำ→cleanup. ล่าสุดReadTimeout watch cleanupและorchเรียกdirectcleanupเองยืนยันstate/vast-cleanup.json task0/other0. WorkerกำลังปิดรายงานBLOCKED(ไม่มี×2/×4measurement) พร้อมbuild/unit7/L01L02ผ่าน. ตั้งmax_agents0ชั่วคราวกันautodispatchหลังINCOMPLETE; ต้องคืน3หลังตั้งT23holdและก่อนจบ. ยังไม่mergeรายงานล่าสุด/ยังไม่export.
- 23:18 cyolo1workerCLIเงียบตั้งแต่23:09พร้อมmodel-refresh timeoutซ้ำ; orchstop/requeueWIPแล้วส่งT23→yolo1 opus/mediumผ่านorchstart. คืนmax_agents3. Promptชี้settleinvoice>=15min(ครบแล้ว),โค้ดcontrollerต้องรองรับClaudePIDก่อนเช่า,งบ/zero/mock/8budgettests/7unit/L01L02ผ่าน;ยังไม่มี×2/×4measurement.
- 23:19 ผู้ใช้สั่งหยุด T23 ถาวร (เช่าล้มหลายรอบ) · ส่งงานด้วยผล baseline + ค่าคำนวณ ×2/×4 · ห้ามเช่า GPU อีก
- 28/10 10:25 ผู้ใช้สั่งเริ่ม T23 ใหม่ (เป้า 100%): (0) ก่อนเช่าจริง ให้แก้ controller ของ lease/watchdog ให้ผูกกับ PID ของ worker และมี deadline ชัดเจน แล้วทดสอบ dry-run แบบไม่เช่า · เลือกเฉพาะเครื่อง verified reliability>=0.99 · ถ้า offer หายหรือเครื่อง offline ให้ลองตัวถัดไป ไม่เกิน 3 ครั้งต่อบทบาท (1) ×2 = 5090×2 + 4090 STT + 4090 TTS + 4090 rerank วัด load แบบปิด cache · ระหว่างรอบนี้ให้รันซ้ำ 16 เคส ai ที่เคยไม่ผ่าน (2) ×4 รันไม่เกิน 30 นาที วัดเฉพาะ load (3) อัปเดต TEST_REPORT + SALE_RUN · งบ: ใช้จริงไปแล้ว $5.37 ถ้ายอดสะสมถึง $12 ให้หยุด · ตัดจบ 17:00 ไม่ว่าอยู่ขั้นไหน ให้ destroy ทุกเครื่องแล้วตรวจต้องได้ 0 และสรุปผลที่มีตามจริง

## รับไม้ yolo1 (28/10 10:23 ต่อจาก cyolo1)
- อ่าน BOARD/NOTES/recipe + skills แล้ว ข้ามขั้น1–2 · T23 ready (RETRY 10:22 ตามคำสั่ง 10:25) · ไม่มี worker ค้าง · dispatch ผ่าน orch
- 28/10 10:24 แก้ไข: เวลาตัดจบ T23 คือ 17:00 (ไม่ใช่ 14:30) · ผู้ใช้ส่งงาน 22:00
- 10:30 FAILED T23 cyolo2 (model at capacity กลาง x2-deploy) · watchdog destroy 58044931 เอง → verify0 · orch ตรวจ SDK = 0 · actual $5.368 · retry → start yolo1 opus
- 10:59 T23 yolo1: r3 ล้มที่ budget gate (ประเมิน lane ขนานสูงเกิน) cleanup verify0 · แก้ gate ใช้ราคาสด · reconcile actual $5.409 · r4 10:55 กำลัง deploy x2 ids 58046704/58046920 · actual $5.43 est $7.21
- 11:09 T23 r4 ล้ม: offer 5090 หาย 3 ครั้ง (no_such_ask ไม่เสียเงิน) · 4090 STT/TTS รัน ~5 นาที แล้ว cleanup · orch ตรวจ SDK = 0 · worker แก้ให้ 4090 รอ 5090 ตัวแรกก่อน
- 11:20 T23 worker: gate projected<$11.75 (ต่ำกว่า $12) · บันทึก host ที่ offer หายลง vast-failed-hosts.json · หมายเหตุ: นับ "≤3 ครั้ง/บทบาท" ต่อ run — offer หาย = ไม่มีเครื่อง ไม่เสียเงิน ต้องแจ้งผู้ใช้ตอนสรุป
- 11:37 T23 r5: x2 ครบ 5 เครื่อง (58048734 58049004 58049112 58049267 58049699) กำลัง deploy · actual $5.99 est $9.32
- 11:56 T23 r5: LLM×2+rerank healthy · STT/TTS ยังติดตั้ง (worker แก้ HF_HUB_DISABLE_XET) · actual $6.83 est $10.08
- 12:15 T23 r5b: readiness ~45 นาที (STT ติดตั้ง/ดาวน์โหลดโมเดลช้า) · actual $7.59 est $10.84 · gate load projected<$11.75 · ×4 จะถูก SKIP อัตโนมัติ (est>=$10 ในโค้ด) — ต้องแจ้งผู้ใช้
- 12:29 FAILED(BLOCKED) T23 yolo1: x2 mix N=1 (p95 6.07s err0%) · 2 คนไม่ผ่าน (STT 504) · ×4/voice/chat/ai16 ถูก gate ตัด · actual $8.101 (billing) est $11.35 · GPU0 orch ตรวจ SDK · เว็บ :3600 mock healthy · orch merge 5db8d89 (scan: 11 hit = docker sha256 digest) · rules sha ตรง · T23 → hold
- 12:33 ปิดรอบ: 23/24 done · T23 hold (ต้องให้ผู้ใช้ตัดสินใจงบเพิ่ม) · report · export → /workspace/noom_saisai/orchestra (มีแค่ .env.example) · infra down · GPU 0 · เว็บ mock :3600 เปิดค้าง
- 28/10 13:00 ผู้ใช้อนุมัติ T23 รอบสุดท้าย: (0) วิเคราะห์และแก้ STT 504 จาก log รอบที่แล้ว ทดสอบในโหมด mock ก่อน (ไม่เสียเงิน) (1) เช่า ×2 แล้ววัด load แบบปิด cache แยกโหมด chat · stt · tts · voice ห้ามวัดแค่ mix · ถ้ามีเวลาให้รันซ้ำ 16 เคส ai ที่ไม่ผ่าน (2) ×4 วัดเฉพาะ chat ไม่เกิน 20 นาที ทำเฉพาะเมื่อยอดใช้จริงไม่เกิน $12.5 · งบ: ยึดยอดใช้จริงจาก billing เพดานรวม $15 หยุดทันทีเมื่อถึง $14.5 (ปรับ gate ที่คิดเงินกันไว้ให้สอดคล้องกัน ไม่ให้ตัดงานเร็วเกินไป) · ตัดจบ 16:30 destroy ทุกเครื่องแล้วตรวจต้องได้ 0 · รายงานผลทุกโหมดตามจริง

## รับไม้ yolo1 (28/10 13:01 · orchestrator ใหม่ pid 311281)
- อ่าน BOARD/NOTES/recipe + skills yolo/cyolo แล้ว ข้ามขั้น1–2 · ไม่มี worker ค้าง · check OK · 13:01 dispatch T23 → cyolo2 (รอบสุดท้ายตามอนุมัติ 13:00 · ตัดจบ 16:30 · หยุด $14.5)
- 13:20 T23 cyolo2: STT504 แก้+ทดสอบ mock ผ่าน (adapter 6 tests · voice 4/4) · dry-run ผ่าน · gate ใหม่ $14.5/$12.5 · เช่า ×2 แล้ว (controller 319838 watchdog 319981) · actual $8.357
- 13:38 T23: STT diag V02/V05/V10 ผ่าน (1–2s) · controller handover ภายใน (lease ผูก PID ใหม่ เครื่องชุดเดิม 5 ใบ) · เริ่มวัด chat/stt ก่อน TTS พร้อม · AI16 เลื่อนเป็น optional
- 13:50 FAILED T23 cyolo2 (codex "model at capacity" กลาง x2-load-stt) · watchdog 319981 เห็น owner ตาย → budget-stop destroy 5 เครื่อง → cleanup verified 0 · orch ตรวจ vastai SDK เอง = 0 · actual $9.818 · วัดได้ x2 chat (U32 pass p95 10.85s · U48 fail 17.4s) · orch WIP commit 3ec8106 ใน task/T23
- 13:55 retry → start T23 yolo1 opus (เลี่ยง codex capacity · ตามแนวรอบ 10:30) · ต่อ: x2 stt/tts/voice → x4 chat (actual≤$12.5) → AI16 · หยุด $14.5 · ตัด 16:30
- 14:00 T23 yolo1: เผลอเริ่ม controller x2 จริงจากการรัน --help (ไม่มี argparse) · อยู่ในขอบอนุมัติ x2 5 เครื่อง จึงเก็บไว้ · controller 416438 owner 415804 watchdog 416465 deadline 16:25 · actual $9.971 · ต้องแจ้งผู้ใช้ตอนสรุป
- 14:18 T23 yolo1: deploy ชุดใหม่ x2 เสร็จ 14:08 · controller r6 --resume-x2 (451381) · stt วัดแล้ว · กำลัง tts-readiness · actual $11.07 burn $2.27/ชม.
- 14:27 T23: x2 stt FAIL U=1 (คอขวด network upload ไป host Ireland 4–14s · GPU decode ~0.4s) · tts host TR ช้า → destroy เปลี่ยนตัวที่ 2/3 · actual $11.42
- 14:46 T23: x2 ครบ 4 โหมด chat32 · stt0 · tts1 · voice0 (MISSING_TTS_SENTENCE p95 34s) · x4 chat เริ่มที่ actual $11.884 (≤12.5) ปล่อย STT/TTS · เพิ่ม llm-3/4 · projected $13.81
- 14:55–15:04 T23 yolo1 จบ: x4 chat (5090×4+rerank · ปล่อย STT/TTS) U16 p95 7.66s ✓ · U32 12.24s ✗ → N=16 (เป้า 64 ไม่ผ่าน · LLM util 8–16% → คอขวด rerank/embedder/retrieval) · cleanup verified 0 สองครั้ง · orch ตรวจ SDK เอง = 0 · billing actual T22+T23 $13.066 · :3600 mock healthy (compose saisai3 รันจาก wt/T23 ซึ่งโค้ดตรง main)
- 15:06 orch merge task/T23 → main b95f856 (scan: 7 hit = docker sha256 digest) · rules sha ตรง · T23 → done (ครบตามอนุมัติ 13:00 · AI16 optional ไม่ได้รัน)
