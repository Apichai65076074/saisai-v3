# TEST_REPORT — SaiSai v3

| โหมด | ผ่าน / ทั้งหมด |
|---|---|
| mock | **62 / 62** |
| ai (T22 · GPU จริง) | **46 / 62** (63 test: 47 ผ่าน · 16 ไม่ผ่าน) |

- รันเมื่อ: 2026-10-26T13:52:51+07:00 → 2026-10-26T14:22:26+07:00 (Asia/Bangkok) · ระบบ: `docker compose --profile mock up -d --build` (project `saisai3` · web :3600 · chat-worker ×2 · stt/tts/rag/notify-worker ×1 · mock-llm)
- คำสั่ง: `cd e2e && COMPOSE_PROJECT=saisai3 MQ_API=http://localhost:15673 BASE_URL=http://localhost:3600 npx playwright test  (63 test · 31 นาที · exit 0)`
- Playwright 63 test ใน 62 ไฟล์เคส (W14 มี 2 test · นับผ่านเมื่อผ่านทั้งคู่) · workers 1 · retries 0 · video on
- GIF: **62 / 62** ไฟล์ใน `test-gifs/` · MP4 มีเสียง (เคส T/V): **9 / 9** ไฟล์ใน `test-videos/` (ตรวจ stream `Audio: aac` + volumedetect)
- unit `rules.ts`: **ผ่าน 26 / 26** · sha256 `web/lib/rules.ts` = `1f880cd34c63667d90b7fac8e0cdbd6dfaa0a80ef270cda007e4957dfbf3122c` ✅ ตรงสัญญาและ legacy
- ระบบรัน: `e2e/scripts/compose.sh --profile mock up -d --build --scale chat-worker=2` · `.env` = `MQ_UI_PORT=15673` (15672 ถูก container อื่นใช้) + `RAG_HOLD_MS=15000` (ให้ Q03 หยุด rag-worker ระหว่าง processing ได้) · ผลรอบก่อนหน้าดูหัวข้อ 'ประวัติการแก้' ท้ายไฟล์

## สรุปต่อกลุ่ม (mock)

| กลุ่ม | ผ่าน / ทั้งหมด | ai |
|---|---|---|
| W เว็บ | 14 / 14 | 14 / 14 |
| C แชทบอท | 14 / 14 | 11 / 14 |
| R เอกสาร · RAG | 8 / 8 | 7 / 8 |
| Q คิว RabbitMQ | 3 / 3 | 2 / 3 |
| T อ่านออกเสียง | 3 / 3 | 1 / 3 |
| M หลายรอบ | 6 / 6 | 0 / 6 |
| V เสียง | 6 / 6 | 3 / 6 |
| D 3D + มาสคอต | 3 / 3 | 3 / 3 |
| E ประเมิน RAG | 3 / 3 | 3 / 3 |
| L Load dashboard | 2 / 2 | 2 / 2 |
| **รวม** | **62 / 62** | **46 / 62** |

## W — เว็บ

| เคส | ผ่านเมื่อ (PROBLEM ข้อ 7) | mock | เวลา | GIF |
|---|---|---|---|---|
| W01 | `/products` → `product-list` data-count = 9 · P01 ฿3.20 "ขั้นต่ำ 2,400 ใบ" · B-250 มี 3 สี | ✅ | 6.8 วิ | [GIF](test-gifs/W01.gif) |
| W02 | สั่ง B-500 ใส 700 ใบ → `error-quantity` "B-500 สั่งขั้นต่ำ 800 ใบ" · ขั้นโลโก้–วันรับของล็อก | ✅ | 10.2 วิ | [GIF](test-gifs/W02.gif) |
| W03 | arun · B-250 ใส 10,000 · โลโก้ · ADDR-01 (160 กม.) → ค่าขวด 52,000.00 · ส่วนลด 5% −2,600.00 · โลโก้ 8,000.00 · 1 เที่ยว 1,500.00 · ก่อน VAT 58,900.00 · VAT 4,123.00 · รวม 63,023.00 | ✅ | 8.8 วิ | [GIF](test-gifs/W03.gif) |
| W04 | B-100 ใส 30,000 · ADDR-02 (49 กม.) วันนี้ 2026-10-11 แล้ว reset `now` 2026-11-01 → ต.ค.: ลด 5% −4,800.00 · ค่าส่ง 0 (2 เที่ยว) · รวม 97,584.00 → พ.ย.: ลด 7% −6,720.00 · รวม 95,529.60 | ✅ | 13.3 วิ | [GIF](test-gifs/W04.gif) |
| W05 | B-100 ใส 9,600 · ≤ 50 กม. → `upsell-warning` "ถ้าสั่ง 10,000 ใบ จะได้ลด 5% จ่ายน้อยลง ฿320.00 (ก่อน VAT)" | ✅ | 11.7 วิ | [GIF](test-gifs/W05.gif) |
| W06 | ระยะ 50 / 51 / 301 กม. (25,000 ใบ) → 0.00 / 3,000.00 (2 เที่ยว) / `sales-contact` 02-000-0000 · `quote-request` กดไม่ได้ | ✅ | 8.9 วิ | [GIF](test-gifs/W06.gif) |
| W07 | วันรับของ 2026-10-24 แล้ว 2026-12-05 → `PICKUP_TOO_SOON` · แล้ว `FACTORY_CLOSED` (วันพ่อแห่งชาติ) · `earliest-pickup` = 2026-10-25 | ✅ | 7.9 วิ | [GIF](test-gifs/W07.gif) |
| W08 | ขอใบเสนอราคาจาก W03 → ได้ `QT-0001` · หน้า QT บรรทัดเงินตรง W03 · `quote-valid-until` = 2026-10-18 ⚠️ | ✅ | 9.7 วิ | [GIF](test-gifs/W08.gif) |
| W09 | แปลง QT-0001 เป็นออเดอร์ (เลือกวันรับ 2026-10-26) → ได้ `SO-0019` · `/orders/SO-0019` ขั้น 1 · ยอด 63,023.00 | ✅ | 9.1 วิ | [GIF](test-gifs/W09.gif) |
| W10 | reset `now` 2026-10-19 → เปิด QT-0001 → `quote-expired` · ปุ่มแปลงกดไม่ได้ | ✅ | 7.9 วิ | [GIF](test-gifs/W10.gif) |
| W11 | ขอตัวอย่าง B-250 เขียว 4 ใบ แล้ว 3 ใบ → `SAMPLE_QUOTA` · แล้วได้ `SR-0004` ยอด ฿0.00 | ✅ | 7.6 วิ | [GIF](test-gifs/W11.gif) |
| W12 | ลูกค้า theera เปิด `/orders/SO-0001` (จัดส่ง 2026-06-12) → ไม่มีฟอร์มเคลม · `claim-window-error` "แจ้งเคลมได้ภายใน 7 วันนับจากวันจัดส่ง" | ✅ | 7.9 วิ | [GIF](test-gifs/W12.gif) |
| W13 | arun เปิด `/orders/SO-0001` (ของ C02) → 404 "ไม่พบออเดอร์นี้" | ✅ | 7.4 วิ | [GIF](test-gifs/W13.gif) |
| W14 | หลังร้าน: สั่งออเดอร์ใหม่ → `notify-box` มี `notify-item` data-type=`order.created` ภายใน 5 วิ | ✅ | 34.9 วิ | [GIF](test-gifs/W14.gif) |

## C — แชทบอท

| เคส | ผ่านเมื่อ (PROBLEM ข้อ 7) | mock | เวลา | GIF |
|---|---|---|---|---|
| C01 | ติดต่อเซลส์ได้ทางไหน → มี 02-000-0000 และ @saisai-test | ✅ | 18.0 วิ | [GIF](test-gifs/C01.gif) |
| C02 | มีขวดกี่แบบ → มี 9 และขนาด 100/150/250/500 | ✅ | 13.7 วิ | [GIF](test-gifs/C02.gif) |
| C03 | ขวด 250 มล. สีเขียวใบละเท่าไร → มี 5.80 | ✅ | 15.4 วิ | [GIF](test-gifs/C03.gif) |
| C04 | B-500 สั่งขั้นต่ำกี่ใบ → มี 800 | ✅ | 16.1 วิ | [GIF](test-gifs/C04.gif) |
| C05 | สั่ง B-250 ใส 10,000 ใบ ได้ส่วนลดกี่ % → มี 5% (ผ่าน `[PRICE]`) | ✅ | 19.8 วิ | [GIF](test-gifs/C05.gif) |
| C06 | พิมพ์โลโก้ใบละเท่าไร ขั้นต่ำเท่าไร → มี 0.80 และ 5,000 | ✅ | 18.2 วิ | [GIF](test-gifs/C06.gif) |
| C07 | 25,000 ใบ ส่งไกล 160 กม. ค่าส่งเท่าไร → มี 2 เที่ยว และ 3,000 | ✅ | 17.4 วิ | [GIF](test-gifs/C07.gif) |
| C08 | วันรับของเร็วสุดวันไหน → มี 25 ต.ค. 2026 (หรือ 2026-10-25) | ✅ | 17.1 วิ | [GIF](test-gifs/C08.gif) |
| C09 | เมื่อไรจะได้เครดิต → มี 3 ออเดอร์ และ 30 วัน | ✅ | 13.8 วิ | [GIF](test-gifs/C09.gif) |
| C10 | ขอขวดตัวอย่างได้กี่ใบ → มี 3 ใบ ต่อรุ่น ต่อเดือน · ฟรี | ✅ | 15.1 วิ | [GIF](test-gifs/C10.gif) |
| C11 | มีขวด 1 ลิตรไหม (ไม่มีใน DB) → บอกว่าไม่มี ไม่แต่งสินค้า | ✅ | 18.0 วิ | [GIF](test-gifs/C11.gif) |
| C12 | ช่วยเขียนโค้ด Python ให้หน่อย → ปฏิเสธสุภาพ ชวนกลับเรื่องขวด | ✅ | 19.8 วิ | [GIF](test-gifs/C12.gif) |
| C13 | (arun) ขอใบเสนอราคา B-250 ใส 10,000 ใบ พิมพ์โลโก้ ส่งโรงงานนครสวรรค์ → ได้เลข QT- · ยอด 63,023.00 (`[QUOTE]`) | ✅ | 20.9 วิ | [GIF](test-gifs/C13.gif) |
| C14 | (arun) SO-0001 ถึงไหนแล้ว (ของ C02) → "ไม่พบออเดอร์นี้" ไม่เปิดเผยข้อมูล | ✅ | 19.6 วิ | [GIF](test-gifs/C14.gif) |

## R — เอกสาร · RAG

| เคส | ผ่านเมื่อ (PROBLEM ข้อ 7) | mock | เวลา | GIF |
|---|---|---|---|---|
| R01 | ขวดแตกต้องแจ้งเคลมภายในกี่วัน ใช้รูปกี่รูป → มี 7 และ 1–5 · อ้างอิง `SS-POLICY.pdf` | ✅ | 16.3 วิ | [GIF](test-gifs/R01.gif) |
| R02 | รถหนึ่งเที่ยวขนขวดได้กี่ใบ → มี 20,000 · อ้างอิง `SS-LOGISTICS.pdf` | ✅ | 17.2 วิ | [GIF](test-gifs/R02.gif) |
| R03 | ขวดสีเขียวมีรุ่นไหนบ้าง → มี B-250 (จากเชิงอรรถ) · อ้างอิง `SS-CAT-BOTTLES.pdf` | ✅ | 15.8 วิ | [GIF](test-gifs/R03.gif) |
| R04 | อนุมัติแบบโลโก้ตอนไหน → มี "ยืนยันสเปก" · อ้างอิง `SS-LOGO-PRINT.pdf` | ✅ | 14.4 วิ | [GIF](test-gifs/R04.gif) |
| R05 | B-500 กล่องละกี่ใบ (ตารางหัว 2 ชั้น) → มี 24 (LOG-026) · อ้างอิง `SS-LOGISTICS.pdf` | ✅ | 15.1 วิ | [GIF](test-gifs/R05.gif) |
| R06 | B-500 สีชาใบละเท่าไร แล้วเคลมได้ภายในกี่วัน → มี 8.40 และ 7 (**Hybrid**: DB + PDF) | ✅ | 17.4 วิ | [GIF](test-gifs/R06.gif) |
| R07 | อัปโหลด `SS-PROMO-NOV.pdf` → `ready` → "เดือนพฤศจิกายนมีโปรอะไร" → มี "ออกแบบโลโก้ฟรี" · อ้างอิง `SS-PROMO-NOV.pdf` | ✅ | 35.9 วิ | [GIF](test-gifs/R07.gif) |
| R08 | What is the lead time? (ภาษาอังกฤษ) → มี 14 days · อ้างอิง `SS-FAQ-EN.pdf` หรือ `SS-POLICY.pdf` | ✅ | 16.5 วิ | [GIF](test-gifs/R08.gif) |

## Q — คิว RabbitMQ

| เคส | ผ่านเมื่อ (PROBLEM ข้อ 7) | mock | เวลา | GIF |
|---|---|---|---|---|
| Q01 | เปิดแชท 20 หน้าต่างพร้อมกัน (mock · chat-worker ×2) → ครบ 20 · ไม่มี error · `chat.request` มี 2 consumer | ✅ | 107.1 วิ | [GIF](test-gifs/Q01.gif) |
| Q02 | หยุด `chat-worker` → ถาม "B-500 ขั้นต่ำกี่ใบ" → "รอคิว" → เปิดกลับ → ข้อความไม่หาย ได้ 800 | ✅ | 22.3 วิ | [GIF](test-gifs/Q02.gif) |
| Q03 | อัปโหลด PDF แล้วหยุด `rag-worker` กลางงาน → เปิดกลับ → ข้อความ `rag.ingest` ไม่หาย · `/admin/docs` สถานะเป็น `ready` | ✅ | 32.4 วิ | [GIF](test-gifs/Q03.gif) |

## T — อ่านออกเสียง

| เคส | ผ่านเมื่อ (PROBLEM ข้อ 7) | mock | เวลา | GIF | MP4 (เสียง) |
|---|---|---|---|---|---|
| T01 | manual Thai speech pronounces baht and model codes; cached WAV is playable | ✅ | 30.2 วิ | [GIF](test-gifs/T01.gif) | [MP4](test-videos/T01.mp4) 🔊 aac · max -2.3 dB · เสียงคำตอบ (TTS) ที่เล่นจริงในเทสต์ |
| T02 | auto speech streams three sentences in sequence before done | ✅ | 57.0 วิ | [GIF](test-gifs/T02.gif) | [MP4](test-videos/T02.mp4) 🔊 aac · max -0.5 dB · เสียงคำตอบ (TTS) ที่เล่นจริงในเทสต์ |
| T03 | English question plays English TTS | ✅ | 29.5 วิ | [GIF](test-gifs/T03.gif) | [MP4](test-videos/T03.mp4) 🔊 aac · max -1.4 dB · เสียงคำตอบ (TTS) ที่เล่นจริงในเทสต์ |

## M — หลายรอบ

| เคส | ผ่านเมื่อ (PROBLEM ข้อ 7) | mock | เวลา | GIF |
|---|---|---|---|---|
| M01 | B-250 มีสีอะไร → ใส ชา เขียว · สีเขียวใบละเท่าไร → 5.80 · ขั้นต่ำเท่าไร → 1,200 · ถ้าหมื่นใบค่าขวดเท่าไร → 58,000.00 ลด 5% (2,900.00) · ใส่โลโก้ด้วยเพิ่มเท่าไร → 8,000.00 | ✅ | 40.0 วิ | [GIF](test-gifs/M01.gif) |
| M02 | (arun) ราคา B-100 ใส 9,600 ใบ ส่งคลังบางนา → 30,720.00 · VAT 2,150.40 · รวม 32,870.40 + เตือนสั่ง 10,000 ถูกกว่า 320.00 · แล้วถ้าหมื่นใบล่ะ → 30,400.00 · รวม 32,528.00 · รับของเร็วสุดวันไหน → 2026-10-25 · ขอใบเสนอราคาเลย → QT- · ใบนี้หมดอายุเมื่อไร → 2026-10-18 ⚠️ | ✅ | 44.4 วิ | [GIF](test-gifs/M02.gif) |
| M03 | B-500 ใส 25,000 ใบ ส่งนครสวรรค์ (160 กม.) ค่าส่งเท่าไร → 2 เที่ยว 3,000 · ถ้าส่งลาดกระบังแทน (50) → ฟรี · ฉะเชิงเทราล่ะ (51) → 3,000 · ถ้าไกลเกิน 300 กม. → ติดต่อเซลส์ · เบอร์อะไร → 02-000-0000 | ✅ | 46.4 วิ | [GIF](test-gifs/M03.gif) |
| M04 | เคลมได้ภายในกี่วัน → 7 · ต้องแนบรูปกี่รูป → 1–5 · ไฟล์แบบไหน → JPG/PNG ≤ 5 MB · เลขล็อตเขียนยังไง → LOT- ตามด้วย 6 หลัก · (theera) SO-0001 เคลมได้ไหม → ไม่ได้ เกิน 7 วัน | ✅ | 42.2 วิ | [GIF](test-gifs/M04.gif) |
| M05 | ได้เครดิตเมื่อไร → ส่งแล้ว 3 ออเดอร์ · ครบกำหนดนับยังไง → วันจัดส่ง + 30 วัน · ถ้าส่ง 1 พ.ย. ครบกำหนดวันไหน → 2026-12-01 · โอนเข้าบัญชีอะไร → ธนาคารทดสอบ 000-0-00000-0 · ยังไม่โอนเริ่มผลิตได้ไหม → ไม่ได้ ต้องบันทึกรับเงินก่อน | ✅ | 37.5 วิ | [GIF](test-gifs/M05.gif) |
| M06 | (kenji · EN) What sizes? → 100/150/250/500 ml · Price of B-150 amber? → 4.10 · Minimum? → 1,800 · Free samples? → 3 per model per month · Earliest pickup? → 2026-10-25 | ✅ | 36.7 วิ | [GIF](test-gifs/M06.gif) |

## V — เสียง

| เคส | ผ่านเมื่อ (PROBLEM ข้อ 7) | mock | เวลา | GIF | MP4 (เสียง) | หยุดพูด → เสียงแรก |
|---|---|---|---|---|---|---|
| V01 | V07 → 800 | ✅ | 36.0 วิ | [GIF](test-gifs/V01.gif) | [MP4](test-videos/V01.mp4) 🔊 aac · max -0.8 dB · เสียงคำถามจากไมค์ + คำตอบ TTS ที่เล่นจริงในเทสต์ | 7.72 วิ |
| V02 | (arun) V01 → 5.80 · V02 → 5% · V03 → 8,000.00 · V04 → 1,500 (1 เที่ยว) — 4 รอบ | ✅ | 266.1 วิ | [GIF](test-gifs/V02.gif) | [MP4](test-videos/V02.mp4) 🔊 aac · max -1 dB · เสียงคำถามจากไมค์ + คำตอบ TTS ที่เล่นจริงในเทสต์ | 5.30 วิ · 7.85 วิ · 6.02 วิ · 6.51 วิ |
| V03 | V09 → 2026-10-25 · V06 → 7 วัน · V10 → 3 per model · V05 (ยังไม่ล็อกอิน) → ขอให้ล็อกอินก่อน — 4 รอบ | ✅ | 215.8 วิ | [GIF](test-gifs/V03.gif) | [MP4](test-videos/V03.mp4) 🔊 aac · max -0.6 dB · เสียงคำถามจากไมค์ + คำตอบ TTS ที่เล่นจริงในเทสต์ | 7.09 วิ · 5.34 วิ · 5.23 วิ · 6.23 วิ |
| V04 | V08 → ตอบอังกฤษ มี 1,800 | ✅ | 35.4 วิ | [GIF](test-gifs/V04.gif) | [MP4](test-videos/V04.mp4) 🔊 aac · max -1.3 dB · เสียงคำถามจากไมค์ + คำตอบ TTS ที่เล่นจริงในเทสต์ | 5.21 วิ |
| V05 | ปิด `voice-mode` → ถาม V07 → ตอบเป็นข้อความ ไม่เล่นเสียง | ✅ | 26.0 วิ | [GIF](test-gifs/V05.gif) | [MP4](test-videos/V05.mp4) 🔊 aac · max -1.1 dB · เสียงคำถามจากไมค์ (คำตอบเป็นข้อความ ไม่เล่นเสียงตามเคส) | ไม่เล่นเสียง (ตามเคส) |
| V06 | หยุด `stt-worker` → `voice-mic` หาย ระบบอื่นปกติ | ✅ | 20.1 วิ | [GIF](test-gifs/V06.gif) | [MP4](test-videos/V06.mp4) 🔊 aac · max -3.3 dB · เสียง = TTS ของระบบสำหรับคำตอบเดียวกัน ("B-500 ขั้นต่ำ 800 ใบ ค่ะ") สร้างหลังรัน วางช่วงค้างภาพ (spec V06 ไม่กดเล่นเสียง) | ไม่ได้พูด (ไมค์ถูกซ่อนตามเคส) |

## D — 3D + มาสคอต

| เคส | ผ่านเมื่อ (PROBLEM ข้อ 7) | mock | เวลา | GIF |
|---|---|---|---|---|
| D01 | nine glass bottles, conveyor camera and green bottle order | ✅ | 18.9 วิ | [GIF](test-gifs/D01.gif) |
| D02 | mascot four states and measured RMS at least ten times per second | ✅ | 16.9 วิ | [GIF](test-gifs/D02.gif) |
| D03 | disabled WebGL shows hero and two-dimensional mascot without errors | ✅ | 6.9 วิ | [GIF](test-gifs/D03.gif) |

## E — ประเมิน RAG

| เคส | ผ่านเมื่อ (PROBLEM ข้อ 7) | mock | เวลา | GIF |
|---|---|---|---|---|
| E01 | POST eval-run-a.json → eval-metric cards match the file · unauthorized POST → 401 | ✅ | 9.3 วิ | [GIF](test-gifs/E01.gif) |
| E02 | eval-compare of 2 runs shows +/− in the right green/red · eval-by-doc has 7 docs + total | ✅ | 9.6 วิ | [GIF](test-gifs/E02.gif) |
| E03 | ?only=fail shows only data-pass=false items · ?doc= filters one document | ✅ | 10.8 วิ | [GIF](test-gifs/E03.gif) |

## L — Load dashboard

| เคส | ผ่านเมื่อ (PROBLEM ข้อ 7) | mock | เวลา | GIF |
|---|---|---|---|---|
| L01 | POST load-run-a.json → load-chart 8 points and load-max-users from the file | ✅ | 16.4 วิ | [GIF](test-gifs/L01.gif) |
| L02 | failing stage is red and the chart has the 200-user target line | ✅ | 8.7 วิ | [GIF](test-gifs/L02.gif) |

**ผล T24 (mock · ปิด retrieval cache เท่านั้น · TTS cache ยังเปิด ไม่ใช่ all-cache-off):** **25 คน** (mix · ปิด retrieval cache เท่านั้น · prefetch 4/4/2 · คำถามไม่ซ้ำสุ่มจาก 770 ข้อ · error < 1% และ p95 ≤ 12 วิ · 25 คน p95 8.26 วิ error 0% · 50 คนไม่ผ่าน p95 13.5 วิ error 3.9%) — **ไม่ผ่านเป้า 200 คน** · run #11 `mock-mix-nocache-pruned` (ก่อนแก้คอขวด run #10 = 10 คน) · รายละเอียด `loadtest/REPORT.md`
- ข้อมูลเสริม: ปิด retrieval cache เท่านั้น + rag770 แต่ prefetch 48/16/32 = 50 คน (run #12 · 100 คน p95 17.2 วิ)
- ข้อมูลเสริม (ไม่ใช่ตัวเลขหลัก): T20 final **เปิด cache + คำถามซ้ำ (eval/qa.json) + prefetch 48/16/32** = 200 คน p95 5.75 วิ · 250 คน p95 7.10 วิ (run #3 `mock-mix`) · `/admin/load` เลือก run หลักเป็นค่าเริ่มต้น และติดป้าย "เสริม · เปิด cache · คำถามซ้ำ" ให้ run ที่เปิด cache

## เวลาหยุดพูด → เสียงแรก (V · mock)

- 10 รอบที่มีเสียงตอบ: ต่ำสุด 5.21 วิ · มัธยฐาน 6.23 วิ · สูงสุด 7.85 วิ
- วัดใน browser: เวลาที่ไมค์ปลอมเล่นไฟล์ WAV จบ → `chat-audio` เริ่มเล่นประโยคแรก (รวม STT mock + chat-worker + TTS mock · `MOCK_LATENCY_MS=800` ต่อการเรียกแต่ละครั้ง)

## ประวัติการแก้ (T21 · MODE=mock)

| รอบ | ผล | สาเหตุ → การแก้ (แก้โค้ดแอป/สภาพแวดล้อม ไม่แก้ expected/เกณฑ์) |
|---|---|---|
| 1 (12:35–12:57) | 51 / 63 test | **T01–T03 V01 V04 V05**: `ffmpeg-static` ใน `e2e/node_modules` ดาวน์โหลดไม่ครบ (segfault ตั้งแต่ `-version`) → ติดตั้ง binary 7.0.2 ที่สมบูรณ์ใหม่ · **D02 D03**: console error `GET /favicon.ico 404` → เพิ่ม `web/app/favicon.ico` · **V02 V03**: ประโยคสั้น (เช่น "ค่ะ") ได้ WAV 0.56 วิ < 1 วิ → `workers/tts-worker` เติมความเงียบท้ายไฟล์ให้ ≥ 1.2 วิ (`TTS_MIN_MS`) · **Q03**: rag-worker ใน compose ทำเสร็จก่อนหยุดได้ → compose ส่ง `RAG_HOLD_MS` ให้ rag-worker (`.env` ตั้ง 15000 ตอนทดสอบ) · **Q01**: ต้องมี 2 consumer → เปิดระบบด้วย `--scale chat-worker=2` |
| เฉพาะที่ล้ม | 8 ผ่าน · 5 ล้มเพราะ ffmpeg ตัวเดิม | ยืนยัน D02 D03 Q01 Q03 V03–V06 ผ่านหลังแก้ |
| 2 (13:13–13:49) | 61 / 63 test | **R07**: ไฟล์ `SS-PROMO-NOV.pdf` เดิม (จาก Q03) ยังแสดง `ready` ทันทีหลังกดอัปโหลดซ้ำ → แชทถามขณะกำลัง ingest ใหม่ → `web/app/admin/docs/DocsPanel.tsx` แสดงแถวของไฟล์ที่กำลังอัปโหลดเป็น `queued` จนกว่า API จะตอบ · **Q01**: `POST /api/auth/login` ของหน้าต่างที่ 18 หมดเวลา 30 วิ — เครื่องมี 4 core load ~10 (Chromium 20 หน้าต่าง + อัดวิดีโอ) ไม่พบ pool/event-loop ค้างใน web (login ตอบ 0.2 วิหลังรัน) → ไม่แก้เกณฑ์ รันซ้ำ |
| **3 (13:52–14:22)** | **63 / 63 test = 62 / 62 เคส** | รอบที่ใช้ในรายงานนี้ (รันเต็มรอบเดียว · retries 0) |

## Unit test `rules.ts`

- คำสั่ง: `cd web && npx vitest run tests/unit/rules.test.ts` (และ `npm test` ทั้งชุด)
- ผล: 26 passed
- `sha256sum web/lib/rules.ts` = `1f880cd34c63667d90b7fac8e0cdbd6dfaa0a80ef270cda007e4957dfbf3122c` · legacy = `1f880cd34c63667d90b7fac8e0cdbd6dfaa0a80ef270cda007e4957dfbf3122c` · สัญญา = `1f880cd34c63667d90b7fac8e0cdbd6dfaa0a80ef270cda007e4957dfbf3122c`

## วิธีสร้างรายงานนี้ใหม่

```bash
cd e2e && COMPOSE_PROJECT=saisai3 MQ_API=http://localhost:15673 BASE_URL=http://localhost:3600 npx playwright test
node scripts/make-media.mjs          # → test-gifs/*.gif · test-videos/*.mp4 · test-results/media.json
SS_UNIT_LOG=/tmp/unit.log node scripts/make-report.mjs   # → TEST_REPORT.md
```

## T22 MODE=ai — Playwright บน GPU จริง (27/10/2026 12:17–12:40 · 23.1 นาที)

- ระบบ: compose `saisai3` + `docker-compose.ai.yml` (`MODE=ai` · LLM 5090 Qwen NInfer · STT 4090 faster-whisper large-v3 · TTS 4090 VoxCPM2 git cce58a5 เสียง nongsai + bge-reranker-v2-m3) ·
  worker chat/stt/tts 1/1/1 · prefetch 4/4/2 · `RAG_CANDIDATE_CACHE=off` `TTS_CACHE=off` · rag-worker `RAG_HOLD_MS=15000`
- คำสั่ง: `cd e2e && SS_OUTPUT_DIR=test-results-ai COMPOSE_PROJECT=saisai3 MQ_API=http://localhost:15673 BASE_URL=http://localhost:3600 npx playwright test` (ผ่าน `tools/vast-workload.py` ที่ watchdog ตามได้) ·
  เคส/เกณฑ์เดิมทั้งหมด ไม่แก้ assertion · retries 0 · **รันครั้งเดียว ผลตามจริง** (รันนี้ทำก่อนแก้ cap เสียงพูด 600 ตัวอักษร / STT health ที่ใช้ใน load r2 — ไม่ได้รัน Playwright ai ซ้ำ)
- ผล: **46 / 62 เคส** (47 / 63 test) · GIF ai **61 / 62** ใน `test-gifs/ai/` (Q01 ไม่มีวิดีโอ) · MP4 มีเสียง T/V **9 / 9** ใน `test-videos/ai/` · artifacts mock เดิมไม่ถูกแตะ
- report JSON: `/root/runs/saisai/state/ai-e2e/report-run1.json`

| เคส | ai | เวลา | สาเหตุจริง (ข้อความ error แรก) | หลักฐาน |
|---|---|---|---|---|
| C05 | ❌ | 12.5 วิ | ไม่พบ `5%` — Qwen ไม่เรียก [PRICE] บอกให้ติดต่อเซลส์ | [GIF](test-gifs/ai/C05.gif) |
| C08 | ❌ | 10.2 วิ | ตอบ "25 ตุลาคม 2026" ถูก แต่ regex เคสต้อง `2026-10-25` หรือ `25 ต.ค. 2026` | [GIF](test-gifs/ai/C08.gif) |
| C13 | ❌ | 18.1 วิ | ไม่มี QT- — Qwen ถามวันรับ/ไฟล์โลโก้แทนการเรียก [QUOTE] | [GIF](test-gifs/ai/C13.gif) |
| M01 | ❌ | 30.1 วิ | ยอดรวมไม่ครบตามเกณฑ์ (ตอบเฉพาะค่าขวด 58,000.00) | [GIF](test-gifs/ai/M01.gif) |
| M02 | ❌ | 20.6 วิ | ไม่พบ 10,000 ในรอบต่อมา (ตอบ QT-0001 และยอด 30,720.00/32,870.40 ถูก) | [GIF](test-gifs/ai/M02.gif) |
| M03 | ❌ | 50.7 วิ | ไม่พบ DISTANCE_TOO_FAR/เซลส์ ในรอบระยะทางเกิน | [GIF](test-gifs/ai/M03.gif) |
| M04 | ❌ | 31.8 วิ | ไม่พบ "ไม่ได้/เกิน" ในรอบเคลมเกิน 7 วัน | [GIF](test-gifs/ai/M04.gif) |
| M05 | ❌ | 24.5 วิ | ไม่พบ 2026-12-01 (วันครบกำหนดเครดิต) | [GIF](test-gifs/ai/M05.gif) |
| M06 | ❌ | 33.8 วิ | ไม่พบ 2026-10-25 (รูปแบบวันที่) | [GIF](test-gifs/ai/M06.gif) |
| Q01 | ❌ | 1.0 วิ | Error: expect(received).toBe(expected) // Object.is equality (baseline chat-worker ×1 แต่เคสต้อง 2 consumer · ล้มก่อนเปิดหน้าต่าง → ไม่มีวิดีโอ/GIF) | – |
| R01 | ❌ | 12.5 วิ | ไม่พบช่วง 1–5 รูปตามเกณฑ์เอกสาร | [GIF](test-gifs/ai/R01.gif) |
| T01 | ❌ | 55.3 วิ | เสียง tts-play เล่นไม่จบใน 30 วิ (VoxCPM2 serialize) | [GIF](test-gifs/ai/T01.gif) |
| T02 | ❌ | 82.2 วิ | เสียงแรก 19.1 วิ เกินเกณฑ์ 14.3 วิ | [GIF](test-gifs/ai/T02.gif) |
| V01 | ❌ | 42.4 วิ | ไม่ได้รับ response เสียง/chat-msg-voice ว่าง ใน 30 วิ | [GIF](test-gifs/ai/V01.gif) |
| V02 | ❌ | 163.6 วิ | เล่นเสียงไม่ครบใน 90 วิ | [GIF](test-gifs/ai/V02.gif) |
| V03 | ❌ | 50.0 วิ | ตอบ "25 ตุลาคม 2026" แต่เคสต้อง 2026-10-25 | [GIF](test-gifs/ai/V03.gif) |

สรุปสาเหตุ: Qwen ไม่ใช้ tag `[PRICE]`/`[QUOTE]` ตามคำสั่งในบางเคส (C05 C13 M01–M06) · ตอบวันเป็น "25 ตุลาคม 2026" แต่เคสตรวจ `2026-10-25|25 ต.ค. 2026` (C08 V03 — คำตอบถูกแต่รูปแบบไม่ตรง; ไม่แก้ test) ·
TTS VoxCPM2 serialize ช้า (T01 T02 V01 V02) · Q01 ต้อง chat consumer 2 ตัวแต่ baseline = 1

**รันเสริม (ไม่แทนผลหลัก) 14:18–14:30:** รันเฉพาะ 16 เคสที่ไม่ผ่านซ้ำหลังแก้ adapter (เสียงพูด ≤ 600 ตัวอักษร · STT health 2 ครั้ง) → ผ่าน 3 (C05 C13 V01) · ไม่ผ่าน 13 ·
ผลแกว่งตาม Qwen sampling · output `e2e/test-results-ai-r2` · log `/root/runs/saisai/state/ai-e2e/playwright-r2-failed.log` · ตัวเลขหลักคงเป็น 46/62 (รันครบชุดครั้งเดียว)

**T23 (28/10/2026) — 16 เคส ai ที่ไม่ผ่าน: ไม่ได้รันซ้ำบนชุด ×2** · ชุด ×2 (5090×2 + 4090 STT/TTS/rerank) พร้อมใช้งาน 12:20–12:26 แต่ budget gate ของ controller
คำนวณว่าการรัน 16 เคส (~20 นาที × $2.455/ชม. บนประมาณการ $11.33) จะเกินเพดานกันชน $11.75 (projected $12.357) จึงข้าม และใช้งบที่เหลือกับ load mix (ตัวเลขหลัก T23)
ก่อน destroy · ผล ai ยังเป็น 46/62 จาก T22 (+ รันเสริม 3/16) · ไม่แก้ assertion/golden/fixtures · รายละเอียด [loadtest/REPORT.md](loadtest/REPORT.md#t23-earlier-2810-round--2-measured-28102026-ai--cache-off--4-skipped-at-the-10-rule)

**T23 รอบสุดท้าย (28/10/2026 13:51–15:01) — 16 เคส ai ที่ไม่ผ่าน: ยังไม่ได้รันซ้ำ** · ใช้งบกับ load ×2 ครบ 4 โหมด (chat 32 · stt 0 · tts 1 · voice 0) และ ×4 แชท (16) ตามลำดับคำสั่ง ·
หลัง ×4 ยอดจริง $13.07 · เคสเสียงต้องมี STT/TTS บนชุด ×2 ซึ่งปล่อยไปแล้วก่อน ×4 · ชุดใหม่ 5 GPU + ~20 นาทีจะเกินจุดหยุด $14.5 จึงไม่รัน ·
ผล ai ยังเป็น 46/62 (T22) + รันเสริม 3/16 · ไม่แก้ assertion/golden/fixtures · เว็บ/การ์ด /admin/load ตรวจในเบราว์เซอร์แล้ว (5 โหมด · 3 การ์ด + 3 เส้น) ·
รายละเอียด [loadtest/REPORT.md](loadtest/REPORT.md#t23--final-28102026-13511501-07-2-all-four-modes--4-chat-measured-ai--cache-off)

## T22 cold-TTS correction (mock · 27 October 2026)

`TTS_CACHE=off` bypasses worker memory, DB read/write, singleflight and warmup,
mock provider memory/disk replay and HTTP replay. Runtime proof: 3 identical
requests -> 3 unique IDs, 3 WAV deliveries, 3 replay 404, `no-store`, unchanged
`tts_audio` row count. Unit counter proof: 6 requests -> 6 upstream calls and
zero DB reads/writes/memory hits/shared calls. Web unit 49 pass (15 integration
skipped), load unit 8 pass, worker cold/text 9 pass, provider cold 1 pass;
web build/typecheck pass. Logs in `RUN/state/`. Supplied shared dev DB endpoint
refused TCP connections; runtime proof used the exclusive saisai3 stack.

T01 retains its original cache-ID/Range assertions. Such cache-on behavior is a
separate correctness configuration; no assertion was weakened to accommodate
cold measurements. No AI Playwright case was executed in this blocked session.

T22 corrected mock cold-TTS run #15: highest contiguous passing stage **15 users**;
20 users failed (p95 22.61s, error1.27%); 25 users passed but does not override
the failed stage20. Completed 10:24:02 before cutoff; details in loadtest/REPORT.md.

Cold-TTS browser regression: original T02 passed (1/1, mock only), including
three ordered audio completions, first audio before done, animated mouth and
AAC/sound assertions. Its MP4 and metrics are under RUN/state/T22-T02-artifacts;
prior mock artifacts are unchanged. Final worker runtime counters after load and
browser proof: requests334/upstream334, memoryHits0/dbReads0/dbWrites0/shared0.
This is additional mock proof, not one of the pending 62 AI results.

Final TTS suite: **12/12 passed, zero skips**, including the existing cache-on
and MQ integration assertions, run inside the authorized exclusive compose with
T22_tests_ queues and a local fake AI box. The host attempt recorded one DB
connection-refused failure and one integration skip; it was not counted as pass.
Final web image build/deploy passed; /api/health reports healthy MODE=mock.
Continuation observed 10:05–10:29 +07; earlier account elapsed time is not measured here.
