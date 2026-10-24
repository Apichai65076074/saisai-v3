# โจทย์: เว็บโรงงานขวดแก้ว B2B "ใสใส กลาสแวร์ SaiSai Glass" v3 + แชทบอท AI ที่ฟังและพูดได้ (RabbitMQ · Hybrid RAG + reranker · Whisper · VoxCPM2 · เว็บ 3D · ประเมิน RAG · load test 1→250 คน · Vast.ai 3 GPU)

> ไฟล์นี้คือ **requirement** ที่ AI อ่านแล้วแตกเป็นงานย่อย (DAG) ให้ทีม agent — นักศึกษาแก้ไขได้ (เพิ่ม/ลดฟีเจอร์)
> ทุกข้อในหัวข้อ "เกณฑ์ทดสอบ" ต้องมี Playwright test ที่ผ่าน · ตัวเลขธุรกิจทุกตัวมาจากระบบเดิม `saisai-legacy-change-request` (`web/SPEC.md` · `web/lib/rules.ts` · `db/init/02-seed.sql`) · ตัวเลขที่ไม่มีในไฟล์เหล่านั้นติดป้าย **⚠️ สมมติฐาน** (ต้องยืนยันก่อนสร้าง)
> **สร้างแอปใหม่ทั้งหมด (greenfield แบบ BuildMart)** — ไม่ต่อโค้ดเดิม · คัดลอก `web/lib/rules.ts` ของระบบเดิมมาเป็น lib คำนวณราคา/กฎ **ห้ามแก้ตรรกะ** · seed ใช้ข้อมูลชุดเดียวกับ `02-seed.sql`
> **🧑‍💼 เป้า "Sale ≤ 1 ชม."** — พนักงานขาย (ไม่ใช่ dev) วางพรอมต์ **≤ 20 บรรทัด** ครั้งเดียว แล้วทีม AI วางแผน สร้าง deploy ทดสอบ วัดผลจนจบเอง · คนลงมือ ≤ 1 ชม. · **เวลารวมทั้งระบบเป้า ≤ 3 ชม.** · บันทึกพรอมต์ + เวลาจริงใน `SALE_RUN.md` (ข้อ 7)
>
> **v3 (เทียบระบบเดิม v2 + CR-01–CR-05):** 💬 **แชทบอท "น้องใส"** (ตอบจาก DB + rules + เอกสาร · ทำใบเสนอราคาได้) · 👂 **ฟังเสียง** (ไมค์ → Whisper ไทย/อังกฤษ) · 🗣️ **พูด** (VoxCPM2 เสียงไทย/อังกฤษ โคลนเสียงมาสคอต) · 🎯 **Hybrid RAG + reranker** (bge-reranker-v2-m3 · top 20 → top 4) จาก **PDF 7 ไฟล์ 122 หน้า** (ข้อ 5 · สร้างแล้วที่ `docs/pdf/`) · 🧊 **เว็บ 3D** (Three.js) + มาสคอต 3D **"น้องใส"** ขยับตามสถานะและขยับปากตามเสียง · 🧾 **ใบเสนอราคา** (เอกสาร QT พิมพ์ได้ แปลงเป็นออเดอร์ได้) · 📊 **ประเมิน RAG** + `/admin/eval` · 📈 **load test** (mock 1→250 คน เป้าผ่าน 200 · AI วัดต่อ GPU · คำนวณ GPU สำหรับ 200 คน) + `/admin/load` · 🐇 **RabbitMQ** (1 คิวต่อ GPU · prefetch · `--scale`) · 🖥️ **GPU 3 ใบแบบ BuildMart** (5090 Qwen · 4090 Whisper · 4090 VoxCPM2 + reranker · TTS รายประโยคขนานกับ LLM)

## 1) ข้อมูลร้าน

| หัวข้อ | ค่า |
|---|---|
| ชื่อ | บจก. ใสใส กลาสแวร์ · SaiSai Glassware Co., Ltd. |
| ลูกค้า | B2B เท่านั้น (บริษัท · ผู้ใช้หลายคนต่อบริษัท เห็นข้อมูลบริษัทตัวเองเท่านั้น BR-30) · บทบาท `customer` `staff` `owner` |
| ติดต่อเซลส์ | โทร **02-000-0000** · LINE **@saisai-test** |
| บัญชีรับโอน | บจก. ใสใส กลาสแวร์ · ธนาคารทดสอบ · เลขที่ 000-0-00000-0 |
| "วันนี้" ของระบบทดสอบ | `2026-10-11T10:00:00+07:00` (ล็อกด้วย `POST /api/test/reset`) · เวลา Asia/Bangkok · เงิน `decimal.js` ปัดครึ่งขึ้น 2 ตำแหน่ง |
| ภาษา | ไทย / อังกฤษ (ปุ่ม TH/EN · cookie `lang`) — แชทและเสียงตอบตามภาษาที่ลูกค้าใช้ |

**ขั้นต่ำ · จำนวน (BR-02–BR-07):** ขั้นต่ำต่อรุ่น B-100 **2,400** · B-150 **1,800** · B-250 **1,200** · B-500 **800** ใบ · สั่ง**ทีละ 100** · สูงสุด **200,000** ใบ/ออเดอร์

**ส่วนลดค่าขวด (BR-08/09 · ไม่ลดโลโก้/ขนส่ง · คิดตาม "วันที่กดยืนยัน" · ออเดอร์เดิมคงราคา snapshot):**

| ช่วงวันที่ยืนยัน | ขั้นส่วนลด |
|---|---|
| ก่อน 2026-11-01 | ≥ 10,000 ใบ ลด 5% · ≥ 50,000 ใบ ลด 10% |
| ตั้งแต่ 2026-11-01 00:00 (CR-02) | 5,000–9,900 ลด 3% · 10,000–29,900 ลด 5% · 30,000–49,900 ลด 7% · ≥ 50,000 ลด 10% |

**เตือนสั่งเพิ่มจะถูกกว่า (BR-11):** ถ้าขั้นถัดไปทำให้ยอดก่อน VAT ทั้งออเดอร์น้อยลง → แสดง "ถ้าสั่ง N ใบ จะได้ลด X% จ่ายน้อยลง ฿…"

**โลโก้ (BR-12):** ใบละ **฿0.80** · สั่งพิมพ์โลโก้ได้เมื่อ ≥ **5,000** ใบ

**ค่าขนส่ง (BR-13–BR-15):** ระยะเป็นจำนวนเต็ม กม. · **0–50 กม. ฟรี** · เกิน 50 กม. = **฿1,500 × จำนวนเที่ยว** · เที่ยว = ⌈จำนวน ÷ **20,000**⌉ · **> 300 กม. ต้องติดต่อเซลส์** (ระบบไม่คิดราคา · แสดงเบอร์/LINE เซลส์ · ออกใบเสนอราคาไม่ได้)

**วันรับของ (BR-16 · BR-32):** ≥ วันนี้ + **14** วัน · "วันรับของเร็วสุด" ข้ามวันหยุดโรงงาน · วันหยุด 2569: **23 ต.ค. · 5 ธ.ค. · 31 ธ.ค. 2026** (เจ้าของเพิ่ม/ลบได้ที่ `/owner/holidays`) · ลูกค้าเลื่อนวันรับเองได้เฉพาะขั้น 1–2 (BR-33)

**การชำระ / เครดิต (BR-17/18):** ส่งแล้ว < 3 ออเดอร์ = **โอนเต็มก่อนเริ่มผลิต** (prepay) · ส่งแล้ว ≥ **3** = **เครดิต 30 วัน** · ครบกำหนด = วันจัดส่ง + **30** วัน

**ขวดตัวอย่าง (BR-19):** ฟรี ฿0.00 · รุ่นละ ≤ **3** ใบ/บริษัท/เดือน · **เคลม (BR-21–BR-25):** ภายใน **7** วันนับจากวันจัดส่ง (วันจัดส่ง = วันที่ 0) · เลขล็อต `LOT-` + 6 หลัก · จำนวน 1 ≤ q ≤ สั่ง − เคลมเดิมที่ไม่ถูกปฏิเสธ · รูป **1–5** รูป JPG/PNG ≤ 5 MB · สถานะ รับเรื่อง → กำลังตรวจสอบ → อนุมัติ/ปฏิเสธ (เหตุผล 1–1,000 ตัว)

**สถานะออเดอร์ 6 ขั้น:** 1 รับออเดอร์ → 2 ยืนยันสเปก → 3 กำลังผลิต → 4 ตรวจคุณภาพ → 5 พร้อมจัดส่ง → 6 จัดส่งแล้ว (เลื่อนทีละ 1 ขั้น · prepay ต้องบันทึกรับเงินก่อนขั้น 3) · กันออเดอร์ซ้ำ 10 นาที (BR-31)

**ลำดับการคิดเงิน (`priceLines`):** ค่าขวด = ราคา/ใบ × จำนวน → − ส่วนลด (ขั้นตามวันที่ยืนยัน) → + โลโก้ → + ค่าขนส่ง = ยอดก่อน VAT → + VAT 7% (ปัดครึ่งขึ้น) = ยอดรวม · **คำนวณด้วย `web/lib/rules.ts` ที่คัดลอกมาเท่านั้น** (`quote()` · ห้ามแก้ตรรกะ · ห้ามเขียนสูตรใหม่ในหน้าเว็บ/แชท)

## 2) สินค้าตั้งต้น (seed ชุดเดียวกับ `02-seed.sql` · 9 แบบ 4 รุ่น 3 สี)

| รหัส | slug | รุ่น | ขนาด | สี | ราคา/ใบ (บาท) | ขั้นต่ำ (ใบ) | รูป |
|---|---|---|---|---|---|---|---|
| P01 | b100-clear | B-100 | 100 ml | ใส | 3.20 | 2,400 | `/assets/bottle-b100-clear.png` |
| P02 | b100-amber | B-100 | 100 ml | ชา | 3.50 | 2,400 | `/assets/bottle-b100-amber.png` |
| P03 | b150-clear | B-150 | 150 ml | ใส | 3.80 | 1,800 | `/assets/bottle-b150-clear.png` |
| P04 | b150-amber | B-150 | 150 ml | ชา | 4.10 | 1,800 | `/assets/bottle-b150-amber.png` |
| P05 | b250-clear | B-250 | 250 ml | ใส | 5.20 | 1,200 | `/assets/bottle-b250-clear.png` |
| P06 | b250-amber | B-250 | 250 ml | ชา | 5.60 | 1,200 | `/assets/bottle-b250-amber.png` |
| P07 | b250-green | B-250 | 250 ml | เขียว | 5.80 | 1,200 | `/assets/bottle-b250-green.png` |
| P08 | b500-clear | B-500 | 500 ml | ใส | 7.90 | 800 | `/assets/bottle-b500-clear.png` |
| P09 | b500-amber | B-500 | 500 ml | ชา | 8.40 | 800 | `/assets/bottle-b500-amber.png` |

**บริษัท seed:** C01 อรุณเฮลท์ดริงก์ · C02 ธีระเอนเนอร์จี · C03 Tanaka Trading Co., Ltd. (ผู้ใช้ภาษาอังกฤษ) · C04 มะลิบิวตี้ · C05 นภาฟาร์มน้ำผึ้ง · **ผู้ใช้** U01–U06 ลูกค้า (เช่น `arun@saisai.test` C01 · `theera@saisai.test` C02 · `kenji@saisai.test` C03 en) · U07 `somsri@` พนักงาน · U08 `wichai@` เจ้าของ (รหัสผ่านทดสอบตาม SPEC ข้อ 6)
**ที่อยู่ส่งของ C01 (ใช้ในเคสทดสอบ):** ADDR-01 โรงงานนครสวรรค์ **160 กม.** (หลัก) · ADDR-02 คลังบางนา **49 กม.** · ADDR-03 ลาดกระบัง **50 กม.** · ADDR-04 ฉะเชิงเทรา **51 กม.**
**เลขเอกสาร:** ออเดอร์ `SO-NNNN` (seed ถึง SO-0018) · เคลม `CL-NNNN` (ถึง CL-0004) · ขอตัวอย่าง `SR-NNNN` (ถึง SR-0003) · **ใหม่** ใบเสนอราคา `QT-NNNN` (⚠️ สมมติฐาน รูปแบบเลขตามแบบเดิม) · seed ออเดอร์/เคลม/ตัวอย่างตั้งต้นคัดลอกจาก `02-seed.sql` ทั้งชุด · มี `POST /api/test/reset` ล็อก "วันนี้" แบบเดิม

## 3) ฟีเจอร์หน้าเว็บ (frontend)

> แอปใหม่ต้องมีหน้าหลักตามพฤติกรรมใน SPEC ข้อ 1 ของระบบเดิม: `/` `/login` `/products` `/order` `/orders` `/orders/[no]` (+ เคลม · เลื่อนวันรับ) `/claims` `/samples` `/staff/orders` `/staff/claims` `/owner/holidays` · ข้อความ error ใช้ชุดเดิม (SPEC ข้อ 4) · testid ตั้งชื่อตาม SPEC ข้อ 3 เป็นแนวทาง (ไม่บังคับให้เคส e2e เดิมผ่าน)

1. **หน้าแรก `/`** — ฉาก 3D (ข้อ 12) · รูป hero (`hero-image`) เป็น fallback · ข้อความหัว + ปุ่ม "สั่งซื้อ" "ดูสินค้า" วางทับฉาก
2. **`/products`** — การ์ด 9 แบบเดิม + ปุ่ม 🔄 หมุนดูขวด 3D ในการ์ด (โหลดเมื่อเลื่อนถึง) · กรองรุ่น/สี
3. **`/order`** — ขั้นตาม SPEC เดิม (ราคาจาก `POST /api/quote` ทุกครั้งที่เปลี่ยนค่า) + ปุ่มใหม่ **"ขอใบเสนอราคา"** (`quote-request`) ข้างปุ่มยืนยัน
4. **ใบเสนอราคา** `/quotes` `/quotes/[QT-NNNN]` — สร้างจากหน้าสั่งซื้อหรือจากแชท (`[QUOTE]`) · snapshot ทุกบรรทัดเงินตาม `priceLines` ณ วันออก · พิมพ์ได้ (print CSS · หัวกระดาษชื่อบริษัท/บัญชีรับโอน) · **อายุ 7 วัน ⚠️ สมมติฐาน** · ปุ่ม "แปลงเป็นออเดอร์" (ตรวจทุกกฎซ้ำ: วันรับของ 14 วัน · วันหยุด · กันซ้ำ · ถ้าแปลงหลัง 2026-11-01 ใช้ตารางส่วนลดของวันที่แปลง แล้วแจ้ง `PRICE_CHANGED` ถ้ายอดไม่เท่าเดิม ⚠️ สมมติฐาน) · หมดอายุแล้วแปลงไม่ได้
5. **กรณีคิดราคาไม่ได้** (ระยะ > 300 กม. · จำนวน > 200,000) — แสดงข้อความ error เดิม + `sales-contact` (02-000-0000 · @saisai-test) · ปุ่มขอใบเสนอราคากดไม่ได้
6. **หลังร้าน** `/staff/orders` (บันทึกรับเงิน · เลื่อนขั้น) · `/staff/claims` (รับเรื่อง/อนุมัติ/ปฏิเสธ) · `/owner/holidays` — ตามพฤติกรรม SPEC เดิม
7. **กล่องแจ้งเตือน** (`notify-box`) ทุกหน้าหลังร้าน: ออเดอร์ใหม่ · เคลมใหม่ · ใบเสนอราคาใหม่ (มาจาก exchange `order.events`)
8. **แชทบอท "น้องใส"** — ปุ่มลอยมุมขวาล่างทุกหน้า · ประวัติเก็บ DB · ปุ่มคำถามแนะนำ 3 ปุ่ม · ไม่ล็อกอินถามข้อมูลทั่วไปได้ · **คำถามเกี่ยวกับออเดอร์/ที่อยู่/เครดิต/ทำใบเสนอราคา ต้องล็อกอิน** และเห็นเฉพาะบริษัทตัวเอง (BR-30) · คุยต่อเนื่องหลายรอบได้ (ข้อ 4.4)
9. **อ่านออกเสียง (TTS)** — ทุกคำตอบมีปุ่ม 🔊 `tts-play` · สวิตช์ `tts-auto` · เสียง **VoxCPM2** "น้องใส" ไทย + อังกฤษ · เล่นผ่าน `<audio data-testid="chat-audio">` · **เล่นทีละประโยคต่อกัน** (ประโยคแรกเริ่มเล่นก่อนคำตอบจบ · ข้อ 4.6)
10. **อ้างอิงเอกสาร (RAG)** — ตอบจาก PDF ต้องมีป้าย `chat-cite` เช่น `📄 SS-POLICY.pdf · หน้า 6` (คลิกเปิด PDF หน้านั้น)
11. **หลังร้าน → เอกสาร** `/admin/docs` (owner) — ตาราง PDF (ชื่อ · หน้า · chunk · สถานะ `queued/processing/ready/failed`) · อัปโหลดใหม่ → คิว `rag.ingest`
12. **ธีม 3D** — react-three-fiber + drei · client only (`next/dynamic` `ssr:false`)
    - **หน้าแรก**: ขวด 9 แบบลอยหมุนช้า ๆ วัสดุแก้วโปร่ง (`MeshTransmissionMaterial`) สีใส/ชา/เขียวตรงสินค้า · แสงสะท้อนนุ่ม · scroll → กล้องเคลื่อนผ่าน "สายพานโรงงาน" · คลิกขวด → `/order?model=&color=`
    - ประสิทธิภาพ: `dpr` ≤ 2 · หยุด render เมื่อแท็บไม่ active/พ้นจอ · `prefers-reduced-motion` → นิ่ง · มือถือลดจำนวนขวดเหลือ 4
    - **ไม่มี WebGL**: ใช้รูป hero/ขวดเดิม + มาสคอต 2D · ไม่มี error ค้าง
13. **มาสคอต 3D "น้องใส"** `data-testid="mascot"` ในหัวหน้าต่างแชท
    - ขวดแก้วใสทรงกลมป้อม ฝาจุกสีชา ตาโต แก้มชมพู มีฟองอากาศลอยในตัว · สร้างจาก primitive (capsule/sphere/cylinder) · ใช้ภาพ concept (ข้อ 15) เป็นต้นแบบ
    - **4 ท่า** `data-state`: `idle` (โยกเบา ๆ ฟองลอย กะพริบตา) · `listening` (เอียงตัว มีวงคลื่นเสียง) · `thinking` (มองขึ้น ฟองหมุนเร็ว + จุด …) · `talking`
    - **ขยับปากตามเสียงจริง**: `<audio>` → WebAudio `AnalyserNode` → RMS → scale ปาก · `data-mouth` 0.00–1.00 (≥ 10 ครั้ง/วิ ระหว่าง talking · จบ = 0)
    - ลำดับ: เสียง `idle → listening → thinking → talking → idle` · พิมพ์+เสียง `idle → thinking → talking → idle` · ไม่เล่นเสียง `idle → thinking → idle`
14. **ถามด้วยเสียง** — ปุ่ม `voice-mic` (กดค้าง หรือกดเริ่ม/หยุด · `audio/webm;codecs=opus` · ≤ 30 วิ) · `getUserMedia` ใหม่ทุกครั้ง + `stop()` track · `POST /api/voice` → ฟองผู้ใช้มีป้าย 🎙 `chat-msg-voice` → ส่งแชทต่อพร้อม `lang` · ถอดไม่ได้ → "ไม่ได้ยินเสียง ลองพูดอีกครั้งค่ะ" · สวิตช์ `voice-mode` (ตอบเป็นเสียงอัตโนมัติ) · `GET /api/voice/status` `{enabled:false}` → ซ่อนไมค์และ `voice-mode`
15. **รูปภาพด้วย cyolo (งาน image)** — ห้ามรูปจากเว็บอื่น/โลโก้จริง · ไม่มีตัวหนังสือในภาพยกเว้น "SaiSai"
    - `web/public/img/mascot/nongsai-concept.webp` + `nongsai-{idle,listening,thinking,talking}.webp` (512×512 โปร่งใส · fallback 2D)
    - `web/public/img/banner-factory-3d.webp` (1920×800 · fallback ฉาก 3D) · `/assets/bottle-{b100,b150,b250,b500}-{clear,amber,green}.png` 9 รูปตาม path ใน seed (พื้นโปร่งใส สไตล์เดียวกัน) · prompt ทุกรูปเก็บ `web/public/img/PROMPTS.md`
16. **หลังร้าน → ประเมิน RAG** `/admin/eval` (owner) — เหมือนแบบ BuildMart: `eval-run-select` · การ์ด `eval-metric` (`data-set` `data-metric` %) · กราฟต่อเอกสาร (Hit@4 ต่อ PDF 7 ไฟล์) และต่อประเภทคำถาม · ตารางเทียบ 2 run `eval-compare` (+/− เขียว/แดง) · **ตาราง `eval-by-doc` % ถูกต่อเล่ม + รวม · rerank on/off (ข้อ 8)** · `eval-item` (`data-id` `data-pass`) · "เฉพาะข้อผิด" (`?only=fail`) · กราฟ SVG/CSS
17. **หลังร้าน → load test** `/admin/load` (owner) — **บนสุด: การ์ดตัวเลขใหญ่ "รองรับพร้อมกันได้ N คน" ต่อโหมด + เกณฑ์ p95 ≤ 12 วิ · error ≤ 1% + กราฟ delay เทียบจำนวนผู้ใช้ (ข้อ 9)** · `load-run-select` · `load-chart` (X = ผู้ใช้ 1/10/25/50/100/150/200/250 ในโหมด mock หรือ 1/2/4/8/16/32 ในโหมด ai · Y = p50/p95 · TTFT p95 · แท่ง `queue_max`) · การ์ด `load-max-users` · ตารางต่อขั้น · ขั้นไม่ผ่านเป็นสีแดง · **เส้นเป้า 200** บนกราฟ

**data-testid ใหม่ของ v3** (หน้าหลักใช้ชื่อตาม SPEC ข้อ 3 เดิมเป็นแนวทาง):

| ที่ | testid | หมายเหตุ |
|---|---|---|
| แชท | `chat-open` `chat-input` `chat-send` `chat-msg-user` `chat-msg-bot` `chat-suggest-1..3` | หน้าต่างแชท |
| แชท | `voice-mic` · `chat-msg-voice` · `voice-mode` · `tts-play` · `tts-auto` · `chat-audio` · `chat-cite` | เสียง + อ้างอิง |
| แชท | `mascot` | `data-state` · `data-mouth` · ข้างในเป็น `<canvas>` หรือ `<img>` |
| `/order` | `quote-request` · `sales-contact` | ขอใบเสนอราคา · ข้อความติดต่อเซลส์ |
| `/quotes/[no]` | `quote-no` `quote-valid-until` (data-value) `quote-convert` `quote-expired` `quote-print` + บรรทัดเงินชุดเดิม (`line-*`) | ใบเสนอราคา |
| หลังร้าน | `notify-box` `notify-item` (data-type) | แจ้งเตือน |
| `/admin/eval` | `eval-run-select` `eval-metric` `eval-item` `eval-compare` | ประเมิน RAG |
| `/admin/load` | `load-run-select` `load-chart` (`data-points`) `load-max-users` | load test |

## 4) สถาปัตยกรรมระบบ (backend)

```text
เบราว์เซอร์ ──► web (Next.js :3600) ──publish──► RabbitMQ ──► chat-worker ×N ──► LLM (Qwen · GPU-1 RTX 5090 · หรือ mock-llm)
 🎙 ไมค์ ▲  SSE                               │  │  │  │      │ ▲  ├──► GPU-3 ai-box /v1/rerank (top 20 → top 4)
 🔊 + มาสคอต └──── chat.reply ◄───────────────┘  │  │  │      │ │  ├──► PostgreSQL + pgvector (สินค้า · ออเดอร์ · RAG chunks · quotes · eval/load runs)
                                                 │  │  │      │ │  └──► web/lib/rules.ts quote() (ราคา/กฎทั้งหมด · ตัวเดียวกับหน้าเว็บ)
               chat-worker ส่งประโยคที่จบแล้ว ── tts.request (ทีละประโยค) ──► tts-worker ×N ──► GPU-3 VoxCPM2
               อัดเสียงไมค์ ── stt.request ─────────┘  │  └──► stt-worker ×N ──► GPU-2 Whisper
               admin อัปโหลด PDF ── rag.ingest ────────┘
               ออเดอร์/เคลม/ใบเสนอราคา ── order.events (fanout) ──► notify-worker
```

**เส้นทาง "ถามด้วยเสียง → ตอบด้วยเสียง":** ไมค์ → `POST /api/voice` → `stt.request` → Whisper → ข้อความ → `chat.request` → chat-worker (SQL + rules + Hybrid RAG → rerank → Qwen สตรีม) → **ทุกครั้งที่จบประโยค** ส่ง `tts.request` ทันที (ไม่รอคำตอบจบ) → เบราว์เซอร์เล่นต่อกันเป็นคิว + มาสคอตขยับปาก · **เป้า: หยุดพูด → ได้ยินเสียงแรก < 6 วินาที** (เหมือน BuildMart · โหมด ai · วัดและรายงาน)

### 4.1 service ใน `docker compose` (ยกเว้น LLM และ ai-box ที่อยู่บน Vast)

| service | image / ภาษา | หน้าที่ |
|---|---|---|
| `web` | Next.js 14 (แอปใหม่) · port **3600**→3000 | หน้าร้าน + API · **ไม่เรียก LLM/ai-box ตรง** · env `EVAL_TOKEN` (`ss-eval`) |
| `db` | `pgvector/pgvector:pg16` (ไม่เปิดออกนอก) | schema ใหม่ + seed ชุดเดียวกับ `02-seed.sql` + pgvector · pg_trgm |
| `rabbitmq` | `rabbitmq:4-management` · UI **15672** (ในเครื่องเท่านั้น) | คิวกลาง |
| `chat-worker` | Node.js · scale ได้ | `chat.request` → SQL + `quote()` + Hybrid RAG + rerank → LLM → ทำ tag → ตอบ `chat.reply` + ส่ง `tts.request` รายประโยค · env `LLM_BASE_URL` `CHAT_PREFETCH` (4) `RERANK` |
| `rag-worker` | Node.js หรือ Python | `rag.ingest` → อ่าน PDF → chunk → `embedder` → `doc_chunks` · ตอนเริ่มระบบ ingest 7 ไฟล์จาก `/app/docs` |
| `stt-worker` | Node.js หรือ Python · scale ได้ | `stt.request` → `${STT_URL}/v1/audio/transcriptions` · `STT_PREFETCH` · consume เมื่อ `/health` ok |
| `tts-worker` | Node.js หรือ Python · scale ได้ | `tts.request` → `${TTS_URL}/v1/audio/speech` (VoxCPM2) · `TTS_PREFETCH` (2) · cache WAV ด้วย sha256(ข้อความ+ภาษา) |
| `notify-worker` | Node.js | `order.events` → ตาราง `notifications` |
| `embedder` | text-embeddings-inference (CPU) + โมเดลหลายภาษา | เวกเตอร์ · cache embedding ของคำถามซ้ำ |
| `mock-llm` | Node.js (profile `mock`) · 8000 | LLM + ai-box จำลอง (STT เทียบ fixture · TTS จาก `tts-cache` · rerank ลำดับเดิม) · หน่วงเวลาจำลอง `MOCK_LATENCY_MS` (ค่าเริ่มต้น 800 ⚠️) ให้คิวทำงานจริงตอน load test |

- ไฟล์ตั้งค่า (ห้าม commit · ห้ามพิมพ์ค่า): `.env.vast` (`LLM_BASE_URL` `LLM_MODEL` `LLM_API_KEY`) · `.env.aibox` (`STT_URL` `TTS_URL` `RERANK_URL` `AIBOX_API_KEY`) · ไม่มีไฟล์ → ทุก URL = `http://mock-llm:8000`

### 4.2 ทำไมต้องมี RabbitMQ (ออกแบบคิว)

GPU แต่ละใบรับงานพร้อมกันได้จำกัด (Qwen `--max-concurrency 4`) · ยิงตรงแล้วคนที่เกินจะ timeout · คิวช่วย: **พักงาน** (เกินที่ GPU รับไหวรอในคิว ไม่ error) · **ไม่หาย** (ack หลังเสร็จ · ล้ม > 2 ครั้ง → dead-letter) · **แยกส่วน** (เพิ่ม worker/GPU = เพิ่ม consumer) · **งานหนักไม่ถ่วงเว็บ**

**กระจายโหลด 3 GPU + pipeline ขนาน:**
- **1 คิวต่อ 1 GPU** แบบ BuildMart — `chat.request` → GPU-1 · `stt.request` → GPU-2 · `tts.request` → GPU-3 (rerank เรียกตรงจาก chat-worker) · ถ้าเพิ่ม GPU ชนิดเดียวกัน = เพิ่ม worker ที่ชี้ใบใหม่ consume คิวเดิม (competing consumers · ใช้ตอนขยายตามข้อ 9 ค)
- **prefetch = งานพร้อมกันสูงสุดที่ GPU ใบนั้นรับไหว** — `CHAT_PREFETCH` 4 · `STT_PREFETCH` 4 · `TTS_PREFETCH` 2 (ค่าต่อ worker) · งานพร้อมกันรวม = worker × prefetch ต้อง ≤ ที่ GPU รับไหว · ปรับจาก load test · scale ด้วย `docker compose up -d --scale chat-worker=2 --scale tts-worker=2`
- **pipeline ขนาน 3 ชั้น** — ① GPU-2 ถอดเสียงคนที่ 2 ขณะ GPU-1 ตอบคนที่ 1 ② LLM สตรีม → ประโยคที่จบส่ง TTS ทันที (GPU-3 ทำงานซ้อนกับ GPU-1) ③ คำตอบยาวแตกหลายประโยค เบราว์เซอร์เรียงเล่นตาม `seq`
- **prefetch ล่วงหน้า (cache)** — เสียงทักทาย/คำถามแนะนำ/ประโยคบ่อย (ราคา 9 แบบ · ขั้นต่ำ · ติดต่อเซลส์) สร้าง WAV ไว้ตอนเริ่มระบบ · embedding cache · prompt prefix cache ของ system prompt + ข้อมูลร้าน (LLM ทำ KV prefix reuse)
- **priority** — `chat.request` ตั้ง `x-max-priority 5`: รอบเสียง (voice-mode) priority 3 · ข้อความ 1 · eval/load ไม่ได้ priority (ไม่ให้ลูกค้าจริงรอ)
- **backpressure** — ความยาวคิวแชท > 2 × ความจุรวม → SSE ส่ง `status` "รอคิว ลำดับที่ n" · > 4 × → ตอบเป็นข้อความ ไม่สร้างเสียง (ลดงาน GPU-3) · > 8 × → 429 "ระบบหนาแน่น ลองใหม่ใน 30 วิ" (⚠️ สมมติฐาน ค่าตัวคูณ)

| ชื่อ | ชนิด | ใครส่ง → ใครรับ | ข้อความ (JSON) | หมายเหตุ |
|---|---|---|---|---|
| `chat.request` | queue durable · priority | web → chat-worker | `{sessionId, messageId, text, lang?, userId?, companyId?}` + `reply_to` `correlation_id` | RPC · retry 2 → `chat.dlq` · **companyId มาจาก session ฝั่ง server เท่านั้น** |
| `chat.reply` | exchange direct | worker → web | `{messageId, type:"status"\|"delta"\|"sentence"\|"done"\|"error", text, seq?, cites[], quoteNo?, retrieved[], products[]}` | web → SSE |
| `tts.request` | queue durable | chat-worker / web → tts-worker | `{messageId, seq, text, lang}` + `reply_to` | reply `{type:"tts", messageId, seq, audioId, durationMs, engine}` |
| `stt.request` | queue durable | web → stt-worker | `{audioB64, mime, lang?}` | reply `{type:"stt", text, language, durationMs}` · ≤ 30 วิ / 2 MB |
| `rag.ingest` | queue durable | web → rag-worker | `{docId}` | prefetch 1 |
| `order.events` | exchange fanout | web / chat-worker → notify-worker | `{type:"order.created"\|"claim.created"\|"quote.created", no}` | pub/sub |
| `chat.dlq` | queue | – | – | แสดงจำนวนบน dashboard |

**web API ที่เพิ่ม (v3):** `POST /api/chat` (SSE) · `POST /api/voice` · `GET /api/voice/status` · `GET /api/tts/<audioId>` · `POST /api/quotes` (จาก quote input เดิม → QT) · `GET /api/quotes` `GET /api/quotes/[no]` · `POST /api/quotes/[no]/convert` (→ ตรวจเหมือน `POST /api/orders`) · `GET/POST /api/admin/eval` · `GET/POST /api/admin/load` (POST ใช้ cookie owner หรือ `x-eval-token`) · รูปแบบ error เดิม `{"ok":false,"errors":[…]}` · เงินเป็นสตริง 2 ตำแหน่ง

**Database เพิ่ม:**
```sql
quotes(id serial pk, quote_no text unique, company_id int, created_by int, input jsonb, lines jsonb, valid_until date, converted_order_no text, created_at timestamptz)
docs(id, filename, pages, bytes bytea, status) · doc_chunks(id, doc_id, page, content, embedding vector, tsv) · chat_messages(...) · notifications(...)
eval_runs(id serial pk, label text, created_at timestamptz default now(), config jsonb, summary jsonb, items jsonb)
load_runs(id serial pk, label text, created_at timestamptz default now(), config jsonb, stages jsonb, max_users_ok int)
```

### 4.3 ทำไมต้องมี RAG · **Hybrid RAG + reranker**

- **ข้อมูลมีโครงสร้าง** (ราคา 9 แบบ · ขั้นต่ำ · ส่วนลด · ค่าส่ง · วันรับของ · เครดิต · ออเดอร์/เคลมของบริษัท) → DB + `rules.ts` · **ตัวเลขเงิน/วันที่ต้องมาจาก `quote()` หรือ SQL เท่านั้น**
- **ข้อมูลในเอกสาร** (สเปกขวด · การพิมพ์โลโก้ · มาตรฐาน QC · การใช้/ล้าง/บรรจุ · ขนส่ง/พาเลท · ขั้นตอนเคลม · FAQ อังกฤษ) → PDF 7 ไฟล์ 122 หน้า (ข้อ 5) → RAG
- **Hybrid** = vector (pgvector cosine) + keyword (`pg_trgm` · จับรหัส `B-250` `LOT-` `P07`) → RRF `Σ 1/(60+rank)` → **top 20 → reranker → top 4** · `RERANK=off` หรือ rerank ล่ม/ช้า > 3 วิ ⚠️ → ใช้ top 4 ของ RRF (แชทไม่ล้ม)
- chunk ~500 ตัวอักษร ซ้อน 80 · เก็บ `filename` + `page` · chunk แถวตารางต้องมีชื่อตาราง + หัวคอลัมน์ทุกชั้น/หัวแถว · PDF ภาษาอังกฤษ (SS-FAQ-EN) ค้นได้จากคำถามไทยและกลับกัน (embedder หลายภาษา)

### 4.4 แชทบอท "น้องใส" (chat-worker)

- พูดสุภาพลงท้าย "ค่ะ" · ลูกค้าพิมพ์/พูดอังกฤษ → ตอบอังกฤษ (C03 Tanaka ตั้งภาษา en)
- ก่อนเรียก LLM: ① ค้นสินค้า (รุ่น/สี/ราคา/ขั้นต่ำ) จากคำถาม + ประวัติ 10 ข้อความ ② ถ้าล็อกอิน: ที่อยู่ส่งของ + สถานะเครดิต + ออเดอร์ล่าสุด 5 รายการ **ของบริษัทนั้นเท่านั้น** ③ Hybrid RAG + rerank ④ ข้อมูลร้านข้อ 1 + "วันนี้" ของระบบ · **ห้ามแต่งราคา/สินค้า/สเปกที่ไม่มีใน DB หรือเอกสาร** · ห้ามเปิดเผยข้อมูลบริษัทอื่น (ถามเลข SO ของบริษัทอื่น = "ไม่พบออเดอร์นี้")
- **หลายรอบ**: ส่งประวัติ 10 ข้อความ · "อันนั้น" "สีนั้น" "แล้วถ้าหมื่นใบล่ะ" "ส่งที่บางนาแทน" ต้องหมายถึงรุ่น/สี/จำนวน/ที่อยู่ล่าสุด
- **tag คำสั่ง** (worker ทำจริง แล้วตัด tag + `<think>` ก่อนแสดง):
  - `[PRICE]{"model":"B-250","color":"green","quantity":10000,"logo":true,"addressCode":"ADDR-01"|"distanceKm":160,"pickupDate":"…"}` → เรียก `quote()` ตัวเดียวกับ `/api/quote` → ส่งบรรทัดเงิน/errors/upsell ให้โมเดลตอบต่อ (วน ≤ 2 รอบ)
  - `[QUOTE]{…เหมือน PRICE}` → สร้างใบเสนอราคาจริง (ต้องล็อกอินลูกค้า) → ตอบพร้อมเลข QT + ลิงก์
  - `[ORDER_STATUS]{"orderNo":"SO-0001"}` → อ่านสถานะ/วันรับของ/ครบกำหนด (เฉพาะบริษัทตัวเอง)
  - `quote()` คืน `DISTANCE_TOO_FAR` / `QTY_MAX` → ไม่ออก QT · ตอบให้ติดต่อเซลส์ 02-000-0000 · LINE @saisai-test
- นอกเรื่อง (การเมือง การบ้าน เขียนโค้ด) → ปฏิเสธสุภาพ ชวนกลับเรื่องขวดแก้ว
- `MODE=ai` LLM จริง · `MODE=mock` mock-llm (รองรับ tag ทั้ง 3 · ตามบริบทหลายรอบ · แปลงคำตัวเลขไทย เช่น "หมื่นใบ" = 10000 · "สองร้อยห้าสิบมิล" = B-250)
- `done` ส่ง `retrieved` (top 4) + `products` เสมอ · timeout 90 วิ · LLM ล่ม → ขอโทษ ไม่ใช่ 500

### 4.5 เสียง: ฟัง + พูด

- **STT**: faster-whisper `large-v3` vs `large-v3-turbo` วัด CER กับ V01–V10 แล้วเลือก · `initial_prompt` คำเฉพาะร้าน (ขวดแก้ว B-100 B-150 B-250 B-500 สีชา พิมพ์โลโก้ เลขล็อต เครดิต ใบเสนอราคา)
- **TTS**: VoxCPM2 อย่างเดียว · เสียง `nongsai` (โคลนจาก `voices/nongsai.wav` 5–15 วิ) · `language` ตามตัวอักษร (มีอักษรไทย → th) · ตัด emoji/tag/markdown/ป้ายอ้างอิง · อ่านเงิน/รหัสเป็นคำ (เช่น ฿5.80 → "ห้าบาทแปดสิบสตางค์" · B-250 → "บี สองร้อยห้าสิบ") · ประโยคละ ≤ 200 ตัวอักษร ⚠️ คำตอบรวม ≤ 600 ตัวอักษร
- โหมด mock: `tts-cache/<sha256>.wav` หรือ `generic.wav` · ไม่มี consumer ที่ `tts.request` → ซ่อน 🔊 / `tts-auto` / `voice-mode`

### 4.6 AI บน Vast.ai — **GPU 3 ใบ** (แบบ BuildMart)

| เครื่อง | GPU | รันอะไร |
|---|---|---|
| 🧠 GPU-1 "สมอง" | RTX 5090 32 GB | Qwen บน NInfer ตัวเดียว (`--max-concurrency 4`) |
| 👂 GPU-2 "หู" | RTX 4090 24 GB | ai-box `MODELS=stt` (faster-whisper large-v3 หรือ turbo) |
| 🗣️ GPU-3 "ปาก + จัดอันดับ" | RTX 4090 24 GB | ai-box `MODELS=tts,rerank` (VoxCPM2 + bge-reranker-v2-m3) |

- ai-box ใช้ API ชุดเดียวกับ BuildMart (`/health` · `/v1/audio/transcriptions` · `/v1/audio/speech` · `/v1/rerank` · Bearer key · semaphore ต่อโมเดล = prefetch) · เสียง `nongsai`
- **เพดานราคา: 5090 ≤ $1.20/ชม. · 4090 ≤ $0.50/ชม. ต่อใบ · รวม ≤ $2.20/ชม.** · ใช้เสร็จต้อง **destroy ทั้ง 3 ใบ** และสรุปค่าใช้จ่ายแยกเครื่อง
- **ต้องวัดจริงและรายงาน:** VRAM ต่อใบ · CER Whisper 2 รุ่น · RTF VoxCPM2 · เวลาหยุดพูด → เสียงแรก · `max_users_ok` ต่อ GPU (ข้อ 9 ข) · จำนวน GPU ที่ต้องใช้สำหรับ 200 คน (ข้อ 9 ค)

| โหมด | LLM | STT | TTS | rerank |
|---|---|---|---|---|
| `mock` (ฟรี) | mock-llm | mock-llm | mock-llm (`tts-cache`) | ลำดับเดิม |
| `ai` | GPU-1 Qwen | GPU-2 Whisper | GPU-3 VoxCPM2 | GPU-3 bge-reranker-v2-m3 |

## 5) เอกสาร PDF (แหล่งข้อมูลของ RAG · **สร้างแล้ว** · ต้นฉบับ `data/facts/*.json`)

**รวม 7 ไฟล์ 122 หน้า A4** (≥ 100 หน้า) · ไทย (ยกเว้น SS-FAQ-EN) · สารบัญ · เลขหน้า · มีตารางอ่านยาก: หัว 2–3 ชั้น · เซลล์รวม · ตารางข้ามหน้า (หัวซ้ำ) · เมทริกซ์ รุ่น × สี · เชิงอรรถ ¹ ² · ข้อเท็จจริงข้ามหน้า · เก็บที่ `docs/pdf/` · copy เข้า image ด้วย `additional_contexts`

| ไฟล์ | หน้า | หัวข้อในไฟล์ |
|---|---|---|
| `SS-CAT-BOTTLES.pdf` แคตตาล็อก + สเปกขวด | 24 | ภาพรวมโรงงาน · ตารางสเปก 9 แบบ (รหัส P01–P09 · ขนาด ml · สีที่มี ตรง seed) · มิติ สูง/กว้าง/ปาก/น้ำหนักขวด ⚠️ · ชนิดเกลียว/ฝาที่เข้ากัน ⚠️ · ความหนาผนัง ⚠️ · ตารางเมทริกซ์ รุ่น × สี (มี/ไม่มี · เชิงอรรถ "B-250 เท่านั้นที่มีสีเขียว") · สีชากันแสง UV ⚠️ · อภิธานศัพท์ · **ไม่มีราคา** |
| `SS-LOGO-PRINT.pdf` การพิมพ์โลโก้ | 18 | วิธีพิมพ์ (screen/ceramic ink ⚠️) · ขนาดพื้นที่พิมพ์ต่อรุ่น (ตารางหัว 2 ชั้น ⚠️) · จำนวนสี/ตำแหน่ง ⚠️ · ไฟล์งานที่รับ ⚠️ · ขั้นตอนอนุมัติแบบ (= ขั้น 2 ยืนยันสเปก) · ขั้นต่ำ 5,000 ใบ (ตรง BR-12) · การดูแลลายพิมพ์ ⚠️ · FAQ |
| `SS-QC-STANDARD.pdf` มาตรฐานคุณภาพ | 20 | ขั้นตอนผลิต → ตรวจคุณภาพ (ขั้น 3–4) · ระบบเลขล็อต `LOT-` + 6 หลัก · ตารางชนิดตำหนิ × ระดับ (เซลล์รวม ⚠️) · การสุ่มตรวจ AQL ⚠️ · ทนความร้อนเปลี่ยนฉับพลัน ⚠️ · ใบรับรองสัมผัสอาหาร ⚠️ · ตารางข้ามหน้า |
| `SS-USE-CARE.pdf` การใช้งานตามอุตสาหกรรม | 18 | เครื่องดื่ม/น้ำผลไม้ · น้ำผึ้ง · เครื่องสำอาง (ตรงกลุ่มลูกค้า C01–C05) · การล้าง/ฆ่าเชื้อก่อนบรรจุ ⚠️ · บรรจุร้อน (อุณหภูมิสูงสุด ⚠️) · การเก็บขวดเปล่า ⚠️ · ตารางแนะนำรุ่น × ผลิตภัณฑ์ (หัว 2 ชั้น) |
| `SS-POLICY.pdf` นโยบายการขาย | 16 | ขั้นตอนสั่งซื้อ 6 ขั้น · วันรับของ 14 วัน + วันหยุดโรงงาน 23 ต.ค./5 ธ.ค./31 ธ.ค. · การชำระ prepay → เครดิต 30 วันเมื่อส่งแล้ว 3 ออเดอร์ · ใบเสนอราคา (อายุ ⚠️) · ขวดตัวอย่าง 3 ใบ/รุ่น/เดือน · **ขั้นตอนเคลม** 7 วัน · รูป 1–5 JPG/PNG ≤ 5 MB · การพิจารณา/เหตุผลปฏิเสธ · ติดต่อเซลส์ 02-000-0000 · ตัวเลขทุกตัวตรง `rules.ts` · **ไม่มีราคาขวด** |
| `SS-LOGISTICS.pdf` บรรจุ + ขนส่ง | 14 | ขวดต่อกล่อง/กล่องต่อพาเลท ต่อรุ่น (ตารางหัว 2 ชั้น ⚠️) · รถ 1 เที่ยว = 20,000 ใบ (ตรง BR-14) · เขตส่งฟรี ≤ 50 กม. · > 300 กม. ติดต่อเซลส์ · การรับของที่โรงงาน ⚠️ · การตรวจรับ/ถ่ายรูปขวดแตกเพื่อเคลม |
| `SS-FAQ-EN.pdf` English catalog + FAQ | 12 | สรุปสินค้า 9 แบบ · MOQ · logo · lead time 14 days · samples · claims 7 days · export documents ⚠️ · contact |

- **ข้อมูลในเอกสารอยู่ใน PDF เท่านั้น** ห้ามใส่ DB/system prompt · **ราคา/ส่วนลด/ยอดเงินอยู่ใน DB + rules เท่านั้น** (PDF ไม่มีราคา → คำถามราคาใช้ทดสอบ SQL/`quote()`)
- ไฟล์ทดสอบอัปโหลด (ทีมสร้างเอง 1 หน้า · ไม่อยู่ใน `docs/pdf/` · `tests/fixtures/SS-PROMO-NOV.pdf`): **"โปรเดือนพฤศจิกายน: ออกแบบโลโก้ฟรี 1 แบบ สำหรับออเดอร์ที่พิมพ์โลโก้"** ⚠️ สมมติฐาน (ไม่กระทบตัวเลขใน rules)

**ตัวอย่างข้อเท็จจริงที่ต้องตอบได้** (เคส R ใช้ · ค่าที่เคยเป็น ⚠️ กำหนดแล้วใน `data/facts/*.json` · fact id ในวงเล็บ):

| ไฟล์ | ข้อเท็จจริง |
|---|---|
| `SS-POLICY.pdf` | เคลมได้ภายใน **7 วัน** (POL-107) · รูป **1–5** รูป (POL-119) ≤ **5 MB** (POL-121) · ส่งแล้วครบ **3** ออเดอร์ได้เครดิต **30 วัน** (POL-062) · prepay ต้องโอนก่อนเริ่มผลิต (POL-061) · ขวดตัวอย่าง **3 ใบ/รุ่น/เดือน** (POL-098) · ใบเสนอราคาอายุ **7 วัน** (POL-086) |
| `SS-LOGISTICS.pdf` | 1 เที่ยว = **20,000 ใบ** (LOG-001) · ≤ **50 กม.** ส่งฟรี (LOG-002) · B-500 กล่องละ **24 ใบ** (LOG-026 · ตารางหัว 2 ชั้น) |
| `SS-CAT-BOTTLES.pdf` | สีเขียวมีเฉพาะ **B-250** (CAT-038 · เชิงอรรถ ¹ ใต้ตาราง 3.1) · น้ำหนักขวด B-500 **320 กรัม** (CAT-062) · ปากขวด B-100/B-150 **28 มม.** · B-250 **38 มม.** · B-500 **43 มม.** (CAT-049 · CAT-053 · CAT-057 · CAT-061) |
| `SS-LOGO-PRINT.pdf` | ขั้นต่ำพิมพ์ **5,000 ใบ** (LGP-103) · อนุมัติแบบที่ขั้น "ยืนยันสเปก" (LGP-087) · พื้นที่พิมพ์ด้านหน้า B-250 **60 × 55 มม.** (LGP-028) |
| `SS-QC-STANDARD.pdf` | เลขล็อต `LOT-` + **6** หลัก (QC-032) = ปี ค.ศ. 2 หลัก + เดือน 2 หลัก + ลำดับล็อต 2 หลัก (QC-033) · อยู่ที่**ฉลากข้างกล่อง มุมขวาบนของด้านยาว** (QC-040) · ทนความร้อนเปลี่ยนฉับพลัน **42 °C** (QC-090) |
| `SS-USE-CARE.pdf` | บรรจุร้อนได้ไม่เกิน **85 °C** (USE-087) และต้องอุ่นขวด ≥ **45 °C** ก่อน (USE-088) · รุ่นที่แนะนำสำหรับน้ำผึ้ง **B-250 สีชา (P06)** (USE-032) |
| `SS-FAQ-EN.pdf` | lead time **14 days** (FAQ-070) · free samples **3 per model per month** (FAQ-096) |

> **หมายเหตุ:** `data/facts/*.json` คือต้นฉบับความจริงของเนื้อหา PDF ทั้ง 7 เล่ม (`tools/make_pdfs.py` สร้าง PDF จาก JSON · `tools/verify_pdfs.py` ตรวจผล) — แก้ข้อเท็จจริงที่ JSON แล้วสร้าง PDF ใหม่เท่านั้น ห้ามแก้ PDF ตรง · ตารางนี้และคำถาม `rag` อ้างอิง fact id · **ราคาขวดและส่วนลดอยู่ใน DB/`rules.ts` เท่านั้น ไม่อยู่ใน PDF** (PDF มีเฉพาะอัตราตาม `rules.ts` คือ ค่าโลโก้ ฿0.80/ใบ · ค่าขนส่ง ฿1,500/เที่ยว · VAT 7%)

## 6) เทคนิค (บังคับ)

- **แอปใหม่** Next.js 14 (App Router) + TypeScript + `pg` + `amqplib` + `decimal.js` · คัดลอก `saisai-legacy-change-request/web/lib/rules.ts` → `web/lib/rules.ts` **ไม่แก้ตรรกะ** (ตรวจด้วย unit test ที่คำนวณตัวอย่างใน SPEC ข้อ 4 เช่น upsell ฿320.00 / ฿260.00 ได้ตรง) · หน้าเว็บ, API, แชท, eval ใช้ `quote()` ตัวนี้ทั้งหมด · 3D: `three` + `@react-three/fiber` 8.x + `@react-three/drei` 9.x (+ `@react-three/postprocessing` 2.x) — ไลบรารีเดียวที่อนุญาตเพิ่ม
- `docker compose` ไฟล์เดียว · ห้าม bind mount (ยกเว้น `docs/pdf:ro`) · healthcheck + `depends_on: service_healthy` ทุก service
- port: **`3600`** (เว็บ · ไม่ชน 3400 3500 4100 4200) · `15672` (RabbitMQ UI · `127.0.0.1`) · นอกนั้นไม่เปิดออกนอก
- `.env.example` (MODE, LLM_BASE_URL, LLM_MODEL, LLM_API_KEY, STT_URL, TTS_URL, RERANK_URL, AIBOX_API_KEY, RERANK, CHAT_PREFETCH, STT_PREFETCH, TTS_PREFETCH, EVAL_TOKEN, DATABASE_URL, AMQP_URL, ALLOW_TEST_RESET) · `.env*` จริงห้าม commit
- คำสั่ง: mock `docker compose --profile mock up -d --build` · AI วาง `.env.vast` + `.env.aibox` แล้ว `docker compose up -d --build` · scale `--scale chat-worker=2 --scale stt-worker=2 --scale tts-worker=2` · ปิด rerank `RERANK=off docker compose up -d chat-worker`
- **ไฟล์เสียงทดสอบ** `e2e/voice-fixtures/` (สร้างครั้งเดียวด้วย VoxCPM2 เสียง "ลูกค้า" ไม่ใช่ `nongsai` · WAV mono 16-bit 48 kHz · เงียบหน้า 0.3 ท้าย 0.6 วิ · −16 LUFS · ความยาวต่างกัน ≥ 0.5 วิ) + `questions.json` `index.json` `tts-cache/`

  | ไฟล์ | ภาษา | ข้อความ |
  |---|---|---|
  | V01 | th | ขวดสองร้อยห้าสิบมิลสีเขียวใบละเท่าไร |
  | V02 | th | ถ้าสั่งหมื่นใบได้ส่วนลดกี่เปอร์เซ็นต์ |
  | V03 | th | พิมพ์โลโก้ด้วยเพิ่มเท่าไร |
  | V04 | th | ส่งไปโรงงานนครสวรรค์ค่าส่งเท่าไร |
  | V05 | th | ขอใบเสนอราคาด้วย |
  | V06 | th | ขวดแตกเคลมได้ภายในกี่วัน |
  | V07 | th | ขวดห้าร้อยมิลสั่งขั้นต่ำกี่ใบ |
  | V08 | en | What is the minimum order for the 150 ml bottle? |
  | V09 | th | วันรับของเร็วที่สุดคือวันไหน |
  | V10 | en | Can I get free samples? |

- Playwright ไมค์ปลอม (init script `fake-mic.ts` · `window.__setMicFile`) · WebGL SwiftShader · fallback `--disable-webgl` · ffmpeg สำหรับ MP4 มีเสียง — เหมือน BuildMart

## 7) เกณฑ์ทดสอบ (Playwright "เพลย์ลิสต์" · ทุกข้อมี test + วิดีโอ → GIF)

- ทุกเคสเริ่มด้วย `POST /api/test/reset` (วันนี้ = 2026-10-11 10:00 · เคสที่ระบุวันอื่นส่ง `now` เอง) · พิมพ์ทีละตัว ~60 ms · ค้างภาพ 3–5 วิ · เคส T/V ต้องได้ MP4 มีเสียง · ผ่านทั้ง `MODE=mock` และ `MODE=ai` (ai ตรวจยืดหยุ่น: ตัวเลข/คำสำคัญถูก)

**เว็บ (W)**

| # | ทดสอบ | ผ่านเมื่อ |
|---|---|---|
| W01 | `/products` | `product-list` data-count = 9 · P01 ฿3.20 "ขั้นต่ำ 2,400 ใบ" · B-250 มี 3 สี |
| W02 | สั่ง B-500 ใส 700 ใบ | `error-quantity` "B-500 สั่งขั้นต่ำ 800 ใบ" · ขั้นโลโก้–วันรับของล็อก |
| W03 | arun · B-250 ใส 10,000 · โลโก้ · ADDR-01 (160 กม.) | ค่าขวด 52,000.00 · ส่วนลด 5% −2,600.00 · โลโก้ 8,000.00 · 1 เที่ยว 1,500.00 · ก่อน VAT 58,900.00 · VAT 4,123.00 · รวม 63,023.00 |
| W04 | B-100 ใส 30,000 · ADDR-02 (49 กม.) วันนี้ 2026-10-11 แล้ว reset `now` 2026-11-01 | ต.ค.: ลด 5% −4,800.00 · ค่าส่ง 0 (2 เที่ยว) · รวม 97,584.00 → พ.ย.: ลด 7% −6,720.00 · รวม 95,529.60 |
| W05 | B-100 ใส 9,600 · ≤ 50 กม. | `upsell-warning` "ถ้าสั่ง 10,000 ใบ จะได้ลด 5% จ่ายน้อยลง ฿320.00 (ก่อน VAT)" |
| W06 | ระยะ 50 / 51 / 301 กม. (25,000 ใบ) | 0.00 / 3,000.00 (2 เที่ยว) / `sales-contact` 02-000-0000 · `quote-request` กดไม่ได้ |
| W07 | วันรับของ 2026-10-24 แล้ว 2026-12-05 | `PICKUP_TOO_SOON` · แล้ว `FACTORY_CLOSED` (วันพ่อแห่งชาติ) · `earliest-pickup` = 2026-10-25 |
| W08 | ขอใบเสนอราคาจาก W03 | ได้ `QT-0001` · หน้า QT บรรทัดเงินตรง W03 · `quote-valid-until` = 2026-10-18 ⚠️ |
| W09 | แปลง QT-0001 เป็นออเดอร์ (เลือกวันรับ 2026-10-26) | ได้ `SO-0019` · `/orders/SO-0019` ขั้น 1 · ยอด 63,023.00 |
| W10 | reset `now` 2026-10-19 → เปิด QT-0001 | `quote-expired` · ปุ่มแปลงกดไม่ได้ |
| W11 | ขอตัวอย่าง B-250 เขียว 4 ใบ แล้ว 3 ใบ | `SAMPLE_QUOTA` · แล้วได้ `SR-0004` ยอด ฿0.00 |
| W12 | ลูกค้า theera เปิด `/orders/SO-0001` (จัดส่ง 2026-06-12) | ไม่มีฟอร์มเคลม · `claim-window-error` "แจ้งเคลมได้ภายใน 7 วันนับจากวันจัดส่ง" |
| W13 | arun เปิด `/orders/SO-0001` (ของ C02) | 404 "ไม่พบออเดอร์นี้" |
| W14 | หลังร้าน: สั่งออเดอร์ใหม่ | `notify-box` มี `notify-item` data-type=`order.created` ภายใน 5 วิ |

**แชทบอท (C)**

| # | ผู้ใช้พิมพ์ | ผ่านเมื่อ |
|---|---|---|
| C01 | ติดต่อเซลส์ได้ทางไหน | มี 02-000-0000 และ @saisai-test |
| C02 | มีขวดกี่แบบ | มี 9 และขนาด 100/150/250/500 |
| C03 | ขวด 250 มล. สีเขียวใบละเท่าไร | มี 5.80 |
| C04 | B-500 สั่งขั้นต่ำกี่ใบ | มี 800 |
| C05 | สั่ง B-250 ใส 10,000 ใบ ได้ส่วนลดกี่ % | มี 5% (ผ่าน `[PRICE]`) |
| C06 | พิมพ์โลโก้ใบละเท่าไร ขั้นต่ำเท่าไร | มี 0.80 และ 5,000 |
| C07 | 25,000 ใบ ส่งไกล 160 กม. ค่าส่งเท่าไร | มี 2 เที่ยว และ 3,000 |
| C08 | วันรับของเร็วสุดวันไหน | มี 25 ต.ค. 2026 (หรือ 2026-10-25) |
| C09 | เมื่อไรจะได้เครดิต | มี 3 ออเดอร์ และ 30 วัน |
| C10 | ขอขวดตัวอย่างได้กี่ใบ | มี 3 ใบ ต่อรุ่น ต่อเดือน · ฟรี |
| C11 | มีขวด 1 ลิตรไหม (ไม่มีใน DB) | บอกว่าไม่มี ไม่แต่งสินค้า |
| C12 | ช่วยเขียนโค้ด Python ให้หน่อย | ปฏิเสธสุภาพ ชวนกลับเรื่องขวด |
| C13 | (arun) ขอใบเสนอราคา B-250 ใส 10,000 ใบ พิมพ์โลโก้ ส่งโรงงานนครสวรรค์ | ได้เลข QT- · ยอด 63,023.00 (`[QUOTE]`) |
| C14 | (arun) SO-0001 ถึงไหนแล้ว (ของ C02) | "ไม่พบออเดอร์นี้" ไม่เปิดเผยข้อมูล |

**เอกสาร · RAG (R)** — ต้องมี `chat-cite` ชี้ไฟล์ที่ถูก

| # | ผู้ใช้พิมพ์ / ทำ | ผ่านเมื่อ |
|---|---|---|
| R01 | ขวดแตกต้องแจ้งเคลมภายในกี่วัน ใช้รูปกี่รูป | มี 7 และ 1–5 · อ้างอิง `SS-POLICY.pdf` |
| R02 | รถหนึ่งเที่ยวขนขวดได้กี่ใบ | มี 20,000 · อ้างอิง `SS-LOGISTICS.pdf` |
| R03 | ขวดสีเขียวมีรุ่นไหนบ้าง | มี B-250 (จากเชิงอรรถ) · อ้างอิง `SS-CAT-BOTTLES.pdf` |
| R04 | อนุมัติแบบโลโก้ตอนไหน | มี "ยืนยันสเปก" · อ้างอิง `SS-LOGO-PRINT.pdf` |
| R05 | B-500 กล่องละกี่ใบ (ตารางหัว 2 ชั้น) | มี 24 (LOG-026) · อ้างอิง `SS-LOGISTICS.pdf` |
| R06 | B-500 สีชาใบละเท่าไร แล้วเคลมได้ภายในกี่วัน | มี 8.40 และ 7 (**Hybrid**: DB + PDF) |
| R07 | อัปโหลด `SS-PROMO-NOV.pdf` → `ready` → "เดือนพฤศจิกายนมีโปรอะไร" | มี "ออกแบบโลโก้ฟรี" · อ้างอิง `SS-PROMO-NOV.pdf` |
| R08 | What is the lead time? (ภาษาอังกฤษ) | มี 14 days · อ้างอิง `SS-FAQ-EN.pdf` หรือ `SS-POLICY.pdf` |

**คิว RabbitMQ (Q)**

| # | ทำอะไร | ผ่านเมื่อ |
|---|---|---|
| Q01 | เปิดแชท 20 หน้าต่างพร้อมกัน (mock · chat-worker ×2) | ครบ 20 · ไม่มี error · `chat.request` มี 2 consumer |
| Q02 | หยุด `chat-worker` → ถาม "B-500 ขั้นต่ำกี่ใบ" → "รอคิว" → เปิดกลับ | ข้อความไม่หาย ได้ 800 |
| Q03 | อัปโหลด PDF แล้วหยุด `rag-worker` กลางงาน → เปิดกลับ | ข้อความ `rag.ingest` ไม่หาย · `/admin/docs` สถานะเป็น `ready` |

**อ่านออกเสียง (T)** — T01 กด 🔊 ได้ยินเสียงไทย ("ใบละห้าบาทแปดสิบสตางค์") · T02 `tts-auto` เปิด → คำตอบยาว 3 ประโยค เล่นต่อกันครบ 3 ช่วงตาม `seq` และเสียงแรกเริ่มก่อน `done` · T03 ถามอังกฤษ → เสียงอังกฤษ (`language=en`)

**บทสนทนาหลายรอบ (M)** — session เดียว · 5 รอบ · ต้องผ่านทุกรอบ

| # | รอบ → ผ่านเมื่อ |
|---|---|
| M01 | B-250 มีสีอะไร → ใส ชา เขียว · สีเขียวใบละเท่าไร → 5.80 · ขั้นต่ำเท่าไร → 1,200 · ถ้าหมื่นใบค่าขวดเท่าไร → 58,000.00 ลด 5% (2,900.00) · ใส่โลโก้ด้วยเพิ่มเท่าไร → 8,000.00 |
| M02 | (arun) ราคา B-100 ใส 9,600 ใบ ส่งคลังบางนา → 30,720.00 · VAT 2,150.40 · รวม 32,870.40 + เตือนสั่ง 10,000 ถูกกว่า 320.00 · แล้วถ้าหมื่นใบล่ะ → 30,400.00 · รวม 32,528.00 · รับของเร็วสุดวันไหน → 2026-10-25 · ขอใบเสนอราคาเลย → QT- · ใบนี้หมดอายุเมื่อไร → 2026-10-18 ⚠️ |
| M03 | B-500 ใส 25,000 ใบ ส่งนครสวรรค์ (160 กม.) ค่าส่งเท่าไร → 2 เที่ยว 3,000 · ถ้าส่งลาดกระบังแทน (50) → ฟรี · ฉะเชิงเทราล่ะ (51) → 3,000 · ถ้าไกลเกิน 300 กม. → ติดต่อเซลส์ · เบอร์อะไร → 02-000-0000 |
| M04 | เคลมได้ภายในกี่วัน → 7 · ต้องแนบรูปกี่รูป → 1–5 · ไฟล์แบบไหน → JPG/PNG ≤ 5 MB · เลขล็อตเขียนยังไง → LOT- ตามด้วย 6 หลัก · (theera) SO-0001 เคลมได้ไหม → ไม่ได้ เกิน 7 วัน |
| M05 | ได้เครดิตเมื่อไร → ส่งแล้ว 3 ออเดอร์ · ครบกำหนดนับยังไง → วันจัดส่ง + 30 วัน · ถ้าส่ง 1 พ.ย. ครบกำหนดวันไหน → 2026-12-01 · โอนเข้าบัญชีอะไร → ธนาคารทดสอบ 000-0-00000-0 · ยังไม่โอนเริ่มผลิตได้ไหม → ไม่ได้ ต้องบันทึกรับเงินก่อน |
| M06 | (kenji · EN) What sizes? → 100/150/250/500 ml · Price of B-150 amber? → 4.10 · Minimum? → 1,800 · Free samples? → 3 per model per month · Earliest pickup? → 2026-10-25 |

**เสียง (V)** — ไมค์ปลอม · เปิด `voice-mode` · ทุกรอบผ่าน 5 ข้อแบบ BuildMart (ข้อความถอดถูก · ตอบถูก · `chat-audio` > 1 วิ · มาสคอต `listening → thinking → talking → idle` และ `data-mouth` > 0 · MP4 มีเสียงถาม+ตอบ) · บันทึกเวลาหยุดพูด → เสียงแรก

| # | เสียง → ผ่านเมื่อ |
|---|---|
| V01 | V07 → 800 |
| V02 | (arun) V01 → 5.80 · V02 → 5% · V03 → 8,000.00 · V04 → 1,500 (1 เที่ยว) — 4 รอบ |
| V03 | V09 → 2026-10-25 · V06 → 7 วัน · V10 → 3 per model · V05 (ยังไม่ล็อกอิน) → ขอให้ล็อกอินก่อน — 4 รอบ |
| V04 | V08 → ตอบอังกฤษ มี 1,800 |
| V05 | ปิด `voice-mode` → ถาม V07 → ตอบเป็นข้อความ ไม่เล่นเสียง |
| V06 | หยุด `stt-worker` → `voice-mic` หาย ระบบอื่นปกติ |

**3D + มาสคอต (D)** — D01 หน้าแรกมี `<canvas>` ขวด 9 ใบ · คลิกขวดเขียว → `/order?model=B-250&color=green` · D02 `mascot` ครบ 4 สถานะ + `data-mouth` · D03 ปิด WebGL → `hero-image` + มาสคอต `<img>` ไม่มี error

**ประเมิน RAG · dashboard (E)** — E01 POST `eval-run-a.json` → การ์ดตรง · E02 `eval-compare` 2 run สีถูก · E03 `?only=fail` เห็นเฉพาะข้อผิด

**Load test · dashboard (L)** — L01 POST `load-run-a.json` (8 ขั้น 1→250) → `load-chart` data-points = 8 · `load-max-users` ตรงไฟล์ · L02 ขั้นที่ไม่ผ่านเป็นสีแดง + มีเส้นเป้า 200

**รายงาน:** `TEST_REPORT.md` ตาราง "โหมด | ผ่าน / ทั้งหมด" บนสุด (W C R Q T M V D E L · รวม **62 เคส** = W14 C14 R8 Q3 T3 M6 (30 รอบ) V6 (10 รอบ) D3 E3 L2) + GIF ทุกเคส + MP4 เคส T/V + unit test ของ `rules.ts`

**Sale ≤ 1 ชม. — `SALE_RUN.md`:** พรอมต์ที่พนักงานขายวาง (≤ 20 บรรทัด · นับจริง) · เวลาที่คนลงมือ (เป้า ≤ 1 ชม.: วางพรอมต์ · ล็อกอินบัญชี · เติมเครดิต Vast · ตรวจผลตอนจบ) · เวลารวมตั้งแต่วางพรอมต์ถึงได้ `TEST_REPORT.md` + `loadtest/REPORT.md` + destroy GPU (เป้า ≤ 3 ชม.) · ขั้นไหนที่ต้องให้คนช่วย (ต้องเป็น 0 ระหว่างทาง) · ไม่ถึงเป้าให้จด ⚠️ พร้อมขั้นที่ใช้เวลานานสุด

## 8) ประเมิน RAG (`eval/`)

เหมือน BuildMart ข้อ 8 ทุกอย่าง (สคริปต์ `run_eval.mjs` → ผู้ตัดสิน Claude เขียน `judgments.json` → `score.mjs` → `POST /api/admin/eval` · รัน `RERANK=on` และ `off`) เปลี่ยนเฉพาะ:

| ชุด | จำนวน | เนื้อหา |
|---|---|---|
| `rag` | **≥ 700** (อัปเดต 24 ต.ค.) | **ทุก PDF ≥ 100 ข้อจากเล่มนั้น** (7 เล่ม) · Claude ตั้งจากเนื้อหาจริงของเล่ม (ข้อความที่ดึงจาก PDF รายหน้า หลังสร้าง PDF ข้อ 5) · ทุกข้อมี `doc` `question` `expected` (คำตอบที่คาด) `pages` (หน้าอ้างอิง · ตรวจว่าคำตอบอยู่ในหน้านั้นจริงด้วยข้อความรายหน้า) · ในแต่ละเล่ม `type` ครบ `text` `table2` `merged` `footnote` `crosspage` (เท่าที่เล่มนั้นมี) · `negative` ≥ 5 ต่อเล่ม · `en` ≥ 7 ต่อเล่ม |
| `qa` | **70–80** | `type`: `price` (9 แบบ) · `min_qty` · `discount` (ทั้ง 2 ตารางตามวันที่) · `logo` · `shipping` (ฟรี/เที่ยว/> 300) · `pickup` (14 วัน + วันหยุด) · `credit` · `sample` · `total` (ยอดรวม VAT จาก `quote()`) · `privacy` (ถามข้อมูลบริษัทอื่น → ต้องปฏิเสธ) · `offtopic` · ตัวเลขยืนยันด้วย `quote()`/SQL กับ seed จริง |
| `conv` | **10–12 บท × 4–6 รอบ** | ผสม PDF + DB + ใบเสนอราคา · ≥ 3 บทเป็นเสียง · ≥ 2 บทภาษาอังกฤษ |

- metric เดิม: `hit_at_4` `mrr` `citation_acc` `faithfulness` `correctness` `exact_value` `sql_correct` `context_retention` `stt_cer` + **ใหม่ `privacy_ok`** (qa type privacy: 1 ถ้าไม่เปิดเผยข้อมูลบริษัทอื่น · โค้ดตรวจว่าไม่มีเลข SO/ยอดของบริษัทอื่นในคำตอบ)
- `by_doc` 7 ไฟล์ · `by_type` · `eval/REPORT.md` เทียบ rerank on/off + ข้อสังเกตตารางหัว 2 ชั้น / ข้ามภาษา
- **dashboard `/admin/eval` (อัปเดต 24 ต.ค.):** ตาราง `eval-by-doc` — แถว = 7 เล่ม + แถว **รวม** · คอลัมน์ = จำนวนข้อ · **% ถูก (`correctness`) rerank on** · **% ถูก rerank off** · ผลต่าง (+/− เขียว/แดง) · กราฟแท่งคู่ on/off ต่อเล่ม · ตัวเลขใหญ่บนสุด "ถูก X% (มี reranker) · Y% (ไม่มี)" · คลิกเล่ม → `eval-item` ของเล่มนั้น (`?doc=` · `?only=fail`)

## 9) Load test — 4 ส่วน: (ก) mock 200 คน · (ข) AI ต่อ GPU · (ค) คำนวณ GPU สำหรับ 200 คน · (9.x) scale ×2 ×4 ทดสอบจริง (`loadtest/`)

ยิงผ่าน web API เท่านั้น (ทางเดียวกับผู้ใช้จริง) ไม่ยิงตรงเข้า GPU

**สคริปต์** `loadtest/run_load.mjs --base http://localhost:3600 --mode chat|stt|tts|voice|mix --users <ขั้น> --stage-sec 120 --think-sec 30 --label <ชื่อ>`
- ผู้ใช้จำลองแต่ละคน = session ของตัวเอง (ล็อกอินบัญชีทดสอบวนกัน C01–C05) · ได้คำตอบแล้ว **รอ `think-sec` (สุ่ม ±50%)** ก่อนถามใหม่ (จำลองคนจริง · ⚠️ สมมติฐาน 30 วิ) · `--think-sec 0` = stress
- Node 22 ล้วน · 250 คนจากเครื่องเดียว (ไม่พอใช้ `--shard i/n` แล้วรวมผล)
- อ่านความยาวคิว + consumer จาก `:15672/api/queues` ทุก 2 วิ · โหมด ai ดึง `nvidia-smi` ทุก GPU ทุก 10 วิ

| โหมด | ยิงอะไร | วัด |
|---|---|---|
| `chat` | `POST /api/chat` สุ่มจาก `eval/qa.json` | TTFT p50/p95 · เวลาจบ p50/p95 · tokens/s รวม · `chat.request` max |
| `stt` | `POST /api/voice` V01–V10 | p50/p95 · RTF · `stt.request` max |
| `tts` | `POST /api/tts` 1–3 ประโยค | เวลาเสียงแรก p50/p95 · RTF · `tts.request` max |
| `voice` | `/api/voice` → `/api/chat` → TTS รายประโยค | **หยุดพูด → เสียงแรก** p50/p95 · 3 คิว |
| **`mix`** (เป้าหลัก) | 70% chat + 30% voice ⚠️ สมมติฐานสัดส่วน | ทุกค่าด้านบน + error rate + GPU util ต่อใบ |

- **เกณฑ์ผ่านต่อขั้น (อัปเดต 24 ต.ค. · `loadtest/criteria.json`): delay `p95` ≤ 12 วิ และ error ≤ 1%** (delay = ส่งคำถาม → คำตอบจบ สำหรับ chat/stt/tts · หยุดพูด → เสียงแรก สำหรับ voice/mix · 429 จาก backpressure นับเป็น error) · ค่าเดิม (TTFT < 5 วิ ฯลฯ) เก็บไว้แสดงเป็นข้อมูลเท่านั้น
- `max_users_ok` = ขั้นสูงสุดที่ผ่าน (ทุกขั้นก่อนหน้าผ่าน) = **N**
- **`/admin/load` บนสุด:** การ์ดตัวเลขใหญ่ **"รองรับพร้อมกันได้ N คน"** แยกต่อโหมด (chat · stt · tts · voice · mix) ของ run ที่เลือก · ใต้การ์ดเขียนเกณฑ์ "p95 ≤ 12 วิ · error ≤ 1%" · ถัดลงมา **กราฟ delay (p50/p95) เทียบจำนวนผู้ใช้** + เส้นเกณฑ์ 12 วิ + เส้นตั้งที่ N · แล้วจึงตารางต่อขั้น
- ผล `loadtest/results/<label>.json` รูปแบบเดียวกับ BuildMart (+ `config.think_sec`) → `POST /api/admin/load` → `/admin/load`

**(ก) โหมด mock — ยิงจริง 1→250 คน** (`MODE=mock` · `MOCK_LATENCY_MS` 800 ⚠️ · chat-worker ×2 · stt/tts-worker ×1)
- `--mode mix --users 1,10,25,50,100,150,200,250` · **ผ่านเมื่อขั้น 200 คน error < 1%** และ p95 ตามเกณฑ์ (ตัวเลขเวลาไม่สะท้อน GPU จริง) · ขั้น 250 ไม่ผ่านได้ (บันทึกว่าพังที่ไหน: เว็บ · RabbitMQ · worker · DB)
- พิสูจน์ว่า web + RabbitMQ + worker + DB รับ 200 คนได้ ไม่หลุด/ไม่หายข้อความ (นับ `chat.request` publish = `chat.reply` done) · ใช้ไฟล์นี้เป็น fixture ของเคส L ได้

**(ข) โหมด AI — GPU 3 ใบ (ข้อ 4.6)** · ค่าเริ่มต้น prefetch 4/4/2 · worker ละ 1
- รัน 4 โหมดแบบ BuildMart: `chat` (GPU-1) · `stt` (GPU-2) · `tts` (GPU-3) · `voice` (ครบวง) · `--users 1,2,4,8,16,32` · **`--think-sec` เท่ากับที่ใช้ใน (ค)** · ได้ `max_users_ok` ต่อ GPU
- ลองปรับอย่างน้อย 1 ค่า (เช่น `TTS_PREFETCH` หรือ TTS รอทั้งคำตอบ vs รายประโยค) แล้วเทียบ · บอกว่า GPU ไหนเป็นคอขวด

**(ค) คำนวณจำนวน GPU สำหรับ 200 คน + ค่าใช้จ่าย/ชม. (จากผล ข)**

`GPU(ชนิด) = ⌈ 200 × สัดส่วนผู้ใช้ที่ใช้ชนิดนั้น × 1.2 ÷ max_users_ok(ชนิด) ⌉` · `ค่าใช้จ่าย/ชม. = Σ GPU(ชนิด) × ราคาต่อใบ/ชม.` (1.2 = เผื่อ 20% ⚠️)

| ชนิด | ใบ (Vast) | สัดส่วนผู้ใช้ | `max_users_ok` ต่อใบ (จาก ข) | GPU ที่ต้องใช้ | ราคา/ใบ/ชม. | ค่าใช้จ่าย/ชม. |
|---|---|---|---|---|---|---|
| LLM | RTX 5090 | 1.0 (ทุกคนแชท) | `U_chat` | ⌈240 ÷ U_chat⌉ | ≤ $1.20 | … |
| STT | RTX 4090 | 0.3 ⚠️ (ใช้ไมค์) | `U_stt` | ⌈72 ÷ U_stt⌉ | ≤ $0.50 | … |
| TTS + rerank | RTX 4090 | TTS 0.3 ⚠️ · rerank 1.0 | `U_tts` (วัดขณะมี rerank) | ⌈72 ÷ U_tts⌉ (ตรวจว่า rerank ไม่ทำให้ chat ช้า · ไม่งั้นแยก rerank ไปใบ STT) | ≤ $0.50 | … |
| **รวม** | | | | | | **Σ** |

- ตัวอย่างวิธีอ่าน: ถ้า (ข) ได้ `U_chat` = 8 → LLM ⌈240 ÷ 8⌉ = 30 ใบ → ต้องลดงานต่อคน (คำตอบสั้น · prefix cache · think time จริงยาวกว่า) หรือใช้ `--max-concurrency` สูงขึ้น แล้ววัดใหม่ — **ตัวเลขในตารางต้องมาจากผลวัดจริงเท่านั้น**
- เขียนตารางนี้พร้อมตัวเลขจริงใน `loadtest/REPORT.md` + ข้อจำกัด (วัดจากเครื่องเดียวต่อชนิด สมมติว่าเพิ่มใบแล้วโตเป็นเส้นตรง · ยังไม่ได้ทดสอบจริงที่ 200 คนบน GPU)

### 9.x Scale ×2 ×4 — ทดสอบจริง (อัปเดต 24 ต.ค.)

LLM เป็นคอขวดหลัก → เพิ่ม GPU LLM ก่อน · ใบใหม่แต่ละใบรัน Qwen `--max-concurrency 4` เท่าเดิม · chat-worker 1 ตัวต่อ LLM 1 ใบ (`LLM_URL` ชี้ใบของตัวเอง · consume `chat.request` คิวเดียวกัน = competing consumers) · prefetch ต่อ worker คงเดิม → ความจุแชทรวม = จำนวนใบ × 4

| ชุด | LLM RTX 5090 | STT RTX 4090 | TTS+rerank RTX 4090 | worker (chat/stt/tts) | prefetch (chat/stt/tts) | GPU รวม | ค่าเช่าคาด/ชม. | **เพดาน/ชม.** |
|---|---|---|---|---|---|---|---|---|
| baseline | 1 | 1 | 1 | 1/1/1 | 4/4/2 | 3 | $2.20 | **$2.50** |
| ×2 | 2 | 1 | 1 | 2/1/2 | 4/4/2 | 4 | $3.40 | **$3.80** |
| ×4 | 4 | 2 (ใบที่ 2 รับ rerank แทน) | 2 | 4/2/4 | 4/4/2 | 8 | $6.80 | **$7.50** |

- ราคาต่อใบ: 5090 ≤ $1.20 · 4090 ≤ $0.50 (ถ้าหาไม่ได้ในเพดาน → หยุดถามก่อน ห้ามเช่าแพงกว่า) · ⚠️ **ต้องให้ผู้สอนอนุมัติจำนวน GPU + เพดานต่อชุดก่อนเช่า**
- **load test เดียวกันทั้ง 3 ชุด:** `--mode mix --think-sec 30 --stage-sec 120` · baseline `--users 1,2,4,8,12,16,24,32,48` หา N(base) · ×2 และ ×4 ใช้ขั้นเดิม + เพิ่มขั้น **2×N(base)** และ **4×N(base)** ตรง ๆ (และ +1 ขั้นเหนือ) · หยุดเมื่อขั้นไม่ผ่าน
- **ผ่านเมื่อ N(×2) ≥ 2 × N(base) และ N(×4) ≥ 4 × N(base)** · ไม่ผ่าน → ดู GPU util/คิว หาคอขวดถัดไป (STT/TTS/rerank/DB) แก้แล้ววัดใหม่ (ห้ามเพิ่ม GPU เกินตารางโดยไม่ขออนุมัติ)
- ผล label `scale-base` `scale-x2` `scale-x4` → `/admin/load` แสดงการ์ด N ของ 3 ชุดเคียงกัน + กราฟ delay 3 เส้น · `loadtest/REPORT.md` ตาราง: ชุด · GPU · N · N ÷ N(base) · ผ่าน/ไม่ผ่าน · ค่าเช่าจริง/ชม. · $/ชม. ต่อผู้ใช้ 1 คน · เวลาเช่าจริง + ค่าใช้จ่ายรวม
- ⏱️ เวลาประมาณ: ต่อชุด ตั้งเครื่อง + โหลดโมเดล ~25 นาที + ยิง ~20–25 นาที ≈ 50 นาที · รวม 3 ชุด ≈ 2.5–3 ชม. · ค่าใช้จ่ายรวม ≈ $11–13 (เพดานรวม $15) · ทำต่อจากชุดเดิมได้ (เพิ่มใบจาก baseline ไม่ต้องตั้งใหม่ทั้งหมด)
