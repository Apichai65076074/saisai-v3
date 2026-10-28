# รูปแบบผลประเมิน (eval run) — สัญญาระหว่าง T17 (dashboard/API) ↔ T18 (`eval/score.mjs`)

`POST /api/admin/eval` รับ JSON 1 run · ตอบ `201 {"ok":true,"id":<int>}`
สิทธิ์: header `x-eval-token: $EVAL_TOKEN` (ค่าเริ่มต้น `ss-eval`) **หรือ** cookie ของเจ้าของ (owner)
ไม่มีทั้งสอง → `401 {"ok":false,"errors":[{"code":"UNAUTHORIZED",...}]}` · ล็อกอินแต่ไม่ใช่ owner → `403 FORBIDDEN`
รูปแบบผิด → `400 {"ok":false,"errors":[{"code":"EVAL_INVALID","field":"<path>","message":"..."}]}`

```jsonc
{
  "label": "2026-10-25 mock rerank on",          // 1–200 ตัวอักษร · แสดงใน eval-run-select
  "config": {
    "rerank": "on",                              // "on" | "off"  (บังคับ) · dashboard จับคู่ run on/off จากค่านี้
    "mode": "mock",                              // "mock" | "ai"  (บังคับ)
    "llm": "mock", "embed": "multilingual-e5-small", "k": 4   // อื่น ๆ ใส่ได้อิสระ (แสดงเป็นข้อความ)
  },
  "summary": {                                   // ค่า metric = 0..1 (สัดส่วน) หรือ null (ไม่ได้วัด) · n = จำนวนข้อ/บท
    "rag":  { "n": 770, "hit_at_4": 0.91, "mrr": 0.84, "citation_acc": 0.88, "faithfulness": 0.93, "correctness": 0.87 },
    "qa":   { "n": 75,  "correctness": 0.95, "exact_value": 0.96, "sql_correct": 0.97, "privacy_ok": 1 },
    "conv": { "n": 12,  "context_retention": 0.9, "stt_cer": 0.06, "correctness": 0.88 }  // correctness ของ conv ไม่บังคับ
  },
  "by_doc": [                                    // ชุด rag ต่อเล่ม (ไฟล์ใน docs/pdf · ใส่ ".pdf" หรือไม่ใส่ก็ได้ — API เติมให้)
    { "doc": "SS-CAT-BOTTLES.pdf", "n": 110, "correctness": 0.9, "hit_at_4": 0.95, "mrr": 0.88 }
    // … ครบ 7 เล่ม · บังคับ doc n correctness · metric อื่นไม่บังคับ
  ],
  "by_type": [                                   // ต่อประเภทคำถาม · type แนะนำ "<set>:<type>" เช่น "rag:table" "qa:price"
    { "type": "rag:table", "n": 112, "correctness": 0.82, "hit_at_4": 0.9 }
  ],
  "items": [                                     // ทุกข้อ · id ไม่ซ้ำใน run
    {
      "id": "CAT-Q001",                          // บังคับ
      "set": "rag",                              // "rag" | "qa" | "conv"  (บังคับ)
      "doc": "SS-CAT-BOTTLES.pdf",               // rag = เล่มของคำถาม · qa/conv = null
      "type": "direct",                          // บังคับ (string)
      "pass": true,                              // บังคับ (boolean) · ?only=fail = pass:false
      "question": "…", "expected": "…", "answer": "…",
      "cites": [{ "filename": "SS-CAT-BOTTLES.pdf", "page": 3 }],      // ที่บอทอ้าง
      "retrieved": [{ "filename": "SS-CAT-BOTTLES.pdf", "page": 3, "score": 0.81 }], // ไม่บังคับ (top 4)
      "pages": [3],                              // หน้าที่ถูก (ไม่บังคับ)
      "metrics": { "hit_at_4": 1, "correctness": 1 },               // ไม่บังคับ
      "reason": "…",                             // เหตุผลของผู้ตัดสิน (ไม่บังคับ)
      "turns": [ /* conv: รายการรอบ {question, expected, answer, pass, …} */ ]
    }
  ]
}
```

- เก็บในตาราง `eval_runs(label, config, summary, items)` → `summary` jsonb = `{rag, qa, conv, by_doc, by_type}`
  (รับรูปแบบ BuildMart ด้วย: `summary.by_doc` / `summary.by_type` เป็น object `{"<doc>": {n, ...}}` → แปลงเป็น array ให้)
- `GET /api/admin/eval` (owner หรือ token) → `{ok:true, runs:[{id,label,created_at,config,summary:{rag,qa,conv}}]}` ใหม่ → เก่า
- `GET /api/admin/eval?id=<id>` → `{ok:true, run:{id,label,created_at,config,summary,by_doc,by_type,items}}` · ไม่พบ → 404
- dashboard: ถูก X% = `summary.rag.correctness` ของ run ที่ `rerank:"on"` · Y% = ของ run `rerank:"off"` ที่จับคู่
  (run ที่เลือกในช่อง "เทียบกับ" ถ้า rerank ตรงข้าม · ไม่งั้น run ล่าสุดที่ rerank ตรงข้าม) · ตาราง `eval-by-doc` ใช้ `by_doc[].correctness` ของทั้งคู่
- `stt_cer` ต่ำ = ดี (ผลต่างติดลบเป็นสีเขียว) · metric อื่นสูง = ดี
