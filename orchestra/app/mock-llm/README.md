# SaiSai mock LLM / ai-box (T11)

Node 22 runtime ใช้ built-in modules เท่านั้น ไม่ต้องใช้ DB, RabbitMQ หรือ GPU

```bash
npm ci --prefix mock-llm
# กรณี npm ของเครื่องบล็อก install scripts ให้ดาวน์โหลด ffmpeg สำหรับการทดสอบ:
node mock-llm/node_modules/ffmpeg-static/install.js
PORT=5102 MOCK_LATENCY_MS=800 \
  FFMPEG_BIN="$PWD/mock-llm/node_modules/ffmpeg-static/ffmpeg" \
  node mock-llm/server.mjs
```

ใน image ใช้ ffmpeg/espeak-ng จาก Debian โดยตรง ค่าเริ่มต้น `PORT=8000`,
`MOCK_LATENCY_MS=800` (รวม health/models ด้วย; unit tests ตั้ง 0)
ตั้ง `ESPEAK_BIN`/`FFMPEG_BIN` เพื่อเลือก binary ได้

API:

- `GET /health`, `GET /v1/models`
- `POST /v1/chat/completions`: OpenAI SSE (`[DONE]`) หรือ JSON เมื่อ `stream:false`
- `POST /v1/rerank`: `{query,documents}` → `{results:[{index,relevance_score,document}]}` เรียงลำดับเดิม
- `POST /v1/audio/transcriptions`: multipart `file` → `{text,language,duration}` (วินาที)
- `POST /v1/audio/speech`: `{input,voice,language}` → `audio/wav`

แชทอ่าน `CTX_JSON:` จาก system message เท่านั้น และจำรุ่น/สี/จำนวน/โลโก้/ที่อยู่จากประวัติ
รองรับตัวเลขไทยทั้งคำและตัวเลข ๐–๙ ส่ง `[PRICE]`, `[QUOTE]`, `[ORDER_STATUS]`
ให้ worker ทำงานจริง เมื่อได้รับ `*_RESULT:` จึงแสดงผลโดยไม่คำนวณยอดเงินเอง
ราคา/กฎมาจาก CTX; เอกสารมาจาก chunks พร้อม `[n]`; ไม่โหลด PDF/seed ใน runtime
ระบบค้นประโยคนี้เป็น deterministic mock ไม่ใช่โมเดลสำหรับตอบเอกสารทั่วไป

STT ตรวจ sha256 จาก fixture index ก่อน ถ้าไฟล์ถูกแปลงจะใช้ ffmpeg ถอดเป็น PCM
16 kHz mono แล้วเทียบความยาวและ envelope correlation (หักค่าเฉลี่ย ปรับ offset และ padding)
กับ V01–V10 เสียงเงียบ/เสีย/ไม่ใกล้ fixture คืน `text:''` จึงใช้กับเสียงทั่วไปไม่ได้
TTS อ่าน `e2e/voice-fixtures/tts-cache/<sha256(input+language)>.wav` ก่อน
แล้วลอง espeak-ng; ล้มเหลวใช้ WAV tone ที่ปรับ envelope ความยาว 1.2–8 วินาที
เก็บ cache ที่สร้างใหม่ในหน่วยความจำสูงสุด 100 รายการ ไม่เขียนไฟล์เสียงลง repo

ทดสอบจาก repo root (PyMuPDF ต้องติดตั้งแล้ว; ใช้ Chromium ที่มีอยู่ ห้าม install browser):

```bash
node --check mock-llm/server.mjs
node --check mock-llm/lib/llm.mjs
node --check mock-llm/lib/audio.mjs
node --test mock-llm/test/
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright node mock-llm/test/mediarecorder.mjs
docker build -t saisai-t11-mock:test -f mock-llm/Dockerfile .
docker run --rm --network none saisai-t11-mock:test node mock-llm/test/container-smoke.mjs
curl -fsS http://127.0.0.1:5102/health
curl -fsS -F file=@e2e/voice-fixtures/V01.wav http://127.0.0.1:5102/v1/audio/transcriptions
```

ผลตรวจ 2026-10-25:

- Node tests 49/49 ผ่าน: C01–C14, M01–M06 ทุกช่วงสนทนา, R01–R08,
  V01–V10 ทั้ง hash และ ffmpeg WebM/Opus, SSE/JSON/rerank/TTS/latency/error
- RAG tests อ่าน PDF จริงด้วย PyMuPDF; CTX สินค้า/ที่อยู่/กฎอ่านจาก legacy seed/rules แบบ read-only
  RESULT ตัวอย่างใช้ตรวจ protocol และการแสดงผล ไม่มีการจำลองสูตรเงิน
- Chromium MediaRecorder จริง (WebAudio 48 kHz → WebM/Opus + silence padding) 10/10 ผ่าน
- curl บนพอร์ต 5102: health, STT 10/10 ตรง questions.json, TTS RIFF >1 วินาที,
  “สั่งหมื่นใบ ขวดสองร้อยห้าสิบมิล” ส่ง PRICE รุ่น B-250 จำนวน 10000
- Docker build และ native audio smoke ผ่าน ไม่ได้รัน docker compose

ไม่มีไฟล์ส่วนกลางที่แก้ ไม่มีการเปลี่ยน fixture เดิม งานนี้ไม่มี Playwright case ที่เป็นเจ้าของ;
การตรวจเคสเว็บ C/R/M/V/T ร่วมกับ worker เป็นหน้าที่ของงานเจ้าของเคสและ T21

เวลาทำงาน 2026-10-25 11:44:48–11:57:02 น. (Asia/Bangkok), 12 นาที 14 วินาที
