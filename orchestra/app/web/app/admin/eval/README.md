# /admin/eval — dashboard ประเมิน RAG (T17)

- API: `web/app/api/admin/eval/route.ts` (`GET` list / `?id=` · `POST` บันทึก run) · รูปแบบ JSON = `web/app/api/admin/eval/SCHEMA.md` (สัญญากับ T18)
- สิทธิ์: cookie owner (`wichai@saisai.test`) หรือ header `x-eval-token: $EVAL_TOKEN` (ค่าเริ่มต้น `ss-eval`) · ไม่มี → 401 · ล็อกอินแต่ไม่ใช่ owner → 403
- หน้า (server component): `?run=<id>` (ค่าเริ่มต้น run ล่าสุด) · `?compare=<id>|none` (ค่าเริ่มต้น run ล่าสุดที่ rerank ตรงข้าม) · `?doc=<ไฟล์>` · `?only=fail`
  - ตัวเลขใหญ่ `eval-headline` "ถูก X% (มี reranker) · Y% (ไม่มี)" · การ์ด `eval-metric` (`data-value` = สัดส่วน 0–1 ตามไฟล์)
  - `eval-by-doc` 7 เล่ม + รวม (n · on · off · ผลต่าง ▲เขียว/▼แดง) + กราฟแท่งคู่ on/off · กราฟ Hit@4 ต่อเล่ม · กราฟต่อ type
  - `eval-compare` (run ที่เลือก − run ที่เทียบ · `stt_cer` ต่ำ = ดี) · `eval-item` (`data-id` `data-pass` `data-doc`)
- ไม่มี migration (ใช้ตาราง `eval_runs` ใน `001_schema.sql`)
- fixtures: `e2e/fixtures/eval-run-{a,b}.json` (ข้อมูลสมมติ · `config.fixture: true` · A = rerank on · B = rerank off · SS-POLICY ตั้งให้ off ดีกว่าเพื่อทดสอบสีแดง)

## ทดสอบ
```bash
node db/apply.mjs --reset                                   # DATABASE_URL ของงาน
cd web && PORT=4601 ALLOW_TEST_RESET=1 npm run dev
cd e2e && BASE_URL=http://localhost:4601 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright npx playwright test tests/E01.spec.ts tests/E02.spec.ts tests/E03.spec.ts
# ส่งผลด้วย curl:
curl -X POST -H 'content-type: application/json' -H 'x-eval-token: ss-eval' --data @e2e/fixtures/eval-run-a.json http://localhost:4601/api/admin/eval
```
