# ชุดประเมิน RAG + แชทบอท (T18)

Node 22 ล้วน (fetch ในตัว) · สคริปต์สร้างชุดข้อมูลใช้ `tsx` และ `pg` จาก `web/node_modules` (`npm ci --prefix web`)

| ไฟล์ | เนื้อหา |
|---|---|
| `rag.json` | 770 ข้อ = แปลงตรงจาก `gemini/rag-questions/*.jsonl` (`tools/build_rag.mjs` · qid→`id` · book→`doc` .pdf · answer→`expected` · คง `pages` `type` `fact_ids` `difficulty` · เพิ่ม `lang`) ไม่ตัด/แต่งคำถาม |
| `qa.json` | 78 ข้อ: price 9 แบบ · min_qty · discount (ตารางเดิม/ตั้งแต่ 1 พ.ย. ตาม `now`) · logo · shipping · pickup · credit · sample · total · privacy · offtopic · ตัวเลขทุกตัวมาจาก `priceFromInput()`→`quote()` และ SQL กับ seed (`tools/build_qa.mjs`) |
| `conv.json` | 12 บท × 4–5 รอบ (54 รอบ) · 4 บทเสียง (V01–V10) · 3 บทอังกฤษ · ผสม PDF + DB + ใบเสนอราคา (`tools/build_conv.mjs` · ค่าเอกสารตรวจกับ `data/facts`) |
| `accounts.json` | บัญชีทดสอบ seed (legacy SPEC ข้อ 6) สำหรับข้อที่ต้องล็อกอิน |
| `judgments.json` | ผลตัดสินที่ตรวจด้วยตนเอง (override คะแนนอัตโนมัติ · ผูกกับ `answer_sha` ของคำตอบที่ตรวจ) |
| `results/<label>.raw.json` · `results/<label>.json` | คำตอบดิบ · ผลคะแนนตาม `web/app/api/admin/eval/SCHEMA.md` |
| `REPORT.md` | เทียบ rerank on/off · by_doc · by_type · ข้อสังเกต |

## รัน

```sh
# สร้างชุดข้อมูลใหม่ (ฐานต้อง seed แล้ว · ไม่เขียนลงฐาน)
node eval/tools/build_rag.mjs && python3 gemini/check_questions.py
node --import ./web/node_modules/tsx/dist/loader.mjs eval/tools/build_qa.mjs
node --import ./web/node_modules/tsx/dist/loader.mjs eval/tools/build_conv.mjs

# เก็บคำตอบผ่าน /api/chat (header x-eval-token → priority 0) · resume ได้
node eval/run_eval.mjs --base http://localhost:4601 --set all --label mock-rerank-on --rerank on --concurrency 4 \
  --stt-url http://127.0.0.1:5101
# ผู้ตัดสินสุ่มตรวจ แล้วเขียน eval/judgments.json
node eval/tools/judge_sample.mjs --label mock-rerank-on
# คิดคะแนน + POST เข้า /admin/eval
DATABASE_URL=... node eval/score.mjs --label mock-rerank-on --post http://localhost:4601
node eval/tools/report.mjs --on mock-rerank-on --off mock-rerank-off
node --test 'eval/test/*.test.mjs'
```

- `run_eval.mjs`: ทุกข้อใช้ cookie `ss_chat` ใหม่ (บทสนทนาใช้ session เดิมทุกรอบ) · qa/conv ที่มี `now` จะ `POST /api/test/reset {now}` ทีละกลุ่ม (ต้อง `ALLOW_TEST_RESET=1` · reset ลบข้อมูลธุรกิจ/แชท/ใบเสนอราคา ห้ามใช้กับระบบจริง) · ข้อที่มี `account` ล็อกอินบัญชีนั้น · รอบเสียงส่ง wav ไป `POST /api/voice`; ถ้า web ยังไม่มี endpoint (404/503) และใส่ `--stt-url` จะถอดเสียงตรงกับ STT (`/v1/audio/transcriptions`) แล้วส่งข้อความด้วย `via:'voice'` (บันทึก `stt.via`) · 429/503 ลองใหม่ 4 ครั้ง · ข้อที่ error บันทึก `error` และ exit 1 (`--resume` ยิงเฉพาะข้อที่ยังไม่สำเร็จ)
- `score.mjs` metric: `hit_at_4` `mrr` (top 4 ที่ค้นได้มีไฟล์+หน้าที่คาด) · `citation_acc` (ป้ายอ้างอิงตรงไฟล์+หน้า) · `faithfulness` (สัดส่วนตัวเลขในคำตอบที่มีอยู่ในข้อความหน้าที่ค้นได้ · อ่านจาก `doc_chunks`) · `correctness` (rag: ตัวเลข/วันที่ใน expected ครบ + คำสำคัญ ≥ 60% · unanswerable ต้องตอบว่าไม่พบ) · `exact_value` (qa: ค่าทุกตัวใน `expected_values` อยู่ในคำตอบ หลัง normalize comma/เลขไทย) · `sql_correct` (qa ที่ค่ามาจาก SQL) · `privacy_ok` (ไม่มีเลข SO/ยอดของบริษัทอื่น) · `context_retention` (รอบที่อ้างถึงรอบก่อนตอบถูก) · `stt_cer` · ข้อที่ไม่เข้าเกณฑ์ metric = null (ไม่ใช่ 0)
- ทดสอบสคริปต์: `node --test 'eval/test/*.test.mjs'` (ไม่ต้องใช้เว็บ/DB)

## ระบบ dev ที่ใช้รัน (โหมด mock เท่านั้น)

```sh
export MODE=mock MQ_PREFIX=T18_ PORT=4601 MOCK_LLM_PORT=5101 DATABASE_URL=postgres://dev:dev@127.0.0.1:56432/t_t18
export AMQP_URL=amqp://guest:guest@127.0.0.1:56672 EMBED_URL=http://127.0.0.1:56680
export LLM_BASE_URL=http://127.0.0.1:5101/v1 LLM_MODEL=mock LLM_API_KEY=mock RERANK_URL=http://127.0.0.1:5101
export STT_URL=http://127.0.0.1:5101 ALLOW_TEST_RESET=1 MOCK_LATENCY_MS=0 EVAL_TOKEN=ss-eval RERANK=on
node db/apply.mjs --reset
for s in mock rag chat web; do node workers/chat-worker/tools/dev-service.mjs start $s; done   # รอ docs ready ครบ 7 เล่ม
# รอบ off: RERANK=off node workers/chat-worker/tools/dev-service.mjs stop chat && RERANK=off ... start chat
```

## บันทึกการตรวจ (2026-10-26 · mock เท่านั้น)

- `python3 gemini/check_questions.py` ผ่าน (770 ข้อ ไม่แก้ต้นฉบับ) · `node --test 'eval/test/*.test.mjs'` 9/9 ผ่าน · `node --check` ทุกสคริปต์ผ่าน
- รัน `mock-rerank-on` และ `mock-rerank-off` ครบ 860 items ต่อ run (rag 770 · qa 78 · conv 12) error 0 · `score.mjs --post` → 201 id 1 และ 2
- `/admin/eval` (owner) แสดง 2 run ใน `eval-run-select` · การ์ด `eval-metric` 12 ค่า (รวม `privacy_ok`) · `eval-by-doc` 7 เล่ม + รวม on/off · `eval-item` 860 แถว
- ไม่ได้แก้ไฟล์นอก `eval/` · ไม่ได้รัน docker compose / GPU · เวลา: commit แรก 10:12 ถึงจบ ~10:55 (+ อ่านโจทย์/สำรวจก่อน commit แรก ~10 นาที)
