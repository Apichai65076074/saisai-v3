## ประวัติการแก้ (T21 · MODE=mock)

| รอบ | ผล | สาเหตุ → การแก้ (แก้โค้ดแอป/สภาพแวดล้อม ไม่แก้ expected/เกณฑ์) |
|---|---|---|
| 1 (12:35–12:57) | 51 / 63 test | **T01–T03 V01 V04 V05**: `ffmpeg-static` ใน `e2e/node_modules` ดาวน์โหลดไม่ครบ (segfault ตั้งแต่ `-version`) → ติดตั้ง binary 7.0.2 ที่สมบูรณ์ใหม่ · **D02 D03**: console error `GET /favicon.ico 404` → เพิ่ม `web/app/favicon.ico` · **V02 V03**: ประโยคสั้น (เช่น "ค่ะ") ได้ WAV 0.56 วิ < 1 วิ → `workers/tts-worker` เติมความเงียบท้ายไฟล์ให้ ≥ 1.2 วิ (`TTS_MIN_MS`) · **Q03**: rag-worker ใน compose ทำเสร็จก่อนหยุดได้ → compose ส่ง `RAG_HOLD_MS` ให้ rag-worker (`.env` ตั้ง 15000 ตอนทดสอบ) · **Q01**: ต้องมี 2 consumer → เปิดระบบด้วย `--scale chat-worker=2` |
| เฉพาะที่ล้ม | 8 ผ่าน · 5 ล้มเพราะ ffmpeg ตัวเดิม | ยืนยัน D02 D03 Q01 Q03 V03–V06 ผ่านหลังแก้ |
| 2 (13:13–13:49) | 61 / 63 test | **R07**: ไฟล์ `SS-PROMO-NOV.pdf` เดิม (จาก Q03) ยังแสดง `ready` ทันทีหลังกดอัปโหลดซ้ำ → แชทถามขณะกำลัง ingest ใหม่ → `web/app/admin/docs/DocsPanel.tsx` แสดงแถวของไฟล์ที่กำลังอัปโหลดเป็น `queued` จนกว่า API จะตอบ · **Q01**: `POST /api/auth/login` ของหน้าต่างที่ 18 หมดเวลา 30 วิ — เครื่องมี 4 core load ~10 (Chromium 20 หน้าต่าง + อัดวิดีโอ) ไม่พบ pool/event-loop ค้างใน web (login ตอบ 0.2 วิหลังรัน) → ไม่แก้เกณฑ์ รันซ้ำ |
| **3 (13:52–14:22)** | **63 / 63 test = 62 / 62 เคส** | รอบที่ใช้ในรายงานนี้ (รันเต็มรอบเดียว · retries 0) |
