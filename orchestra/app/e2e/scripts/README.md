# e2e/scripts (T21 · รวมระบบ MODE=mock)

```bash
e2e/scripts/compose.sh --profile mock up -d --build --scale chat-worker=2   # docker compose โดยตัด env ของ dev shell ออก
# .env (ไม่ commit): MQ_UI_PORT=15673 ถ้า 15672 ไม่ว่าง · RAG_HOLD_MS=15000 สำหรับ Q03
cd e2e && COMPOSE_PROJECT=saisai3 MQ_API=http://localhost:15673 BASE_URL=http://localhost:3600 npx playwright test
node scripts/make-media.mjs [CASE ...]   # test-results/report.json → test-gifs/<CASE>.gif (ทุกเคส) · test-videos/<CASE>.mp4 (T/V มีเสียง) · test-results/media.json
(cd ../web && npx vitest run tests/unit/rules.test.ts) > /tmp/unit.log
SS_UNIT_LOG=/tmp/unit.log SS_RUN_INFO=/tmp/run.json node scripts/make-report.mjs   # → TEST_REPORT.md
```

- GIF: 5 fps เวลาเท่าจริง · หลายหน้าต่างในเทสต์เดียว (Q01 20 หน้าต่าง) วางเป็นตาราง · หลาย test ในเคสเดียว (W14) ต่อกัน
- MP4: ใช้ `voice.mp4` ที่ `saveVoiceMp4` (e2e/lib/fake-mic.ts) mux เสียงไมค์+TTS ไว้ · V06 (spec ไม่เล่นเสียง) ใช้ TTS ของระบบสำหรับคำตอบเดียวกันหลังรัน · ตรวจ `Audio: aac` + volumedetect
- `fix-history.md` = ประวัติรอบที่ล้มและการแก้ (แทรกใน TEST_REPORT.md)
- ⚠️ ถ้า `ffmpeg-static` segfault ตั้งแต่ `-version` = ดาวน์โหลดไม่ครบ → `rm -rf node_modules/ffmpeg-static && npm ci`
