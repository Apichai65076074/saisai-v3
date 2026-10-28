# Load test — T22 GPU baseline + T22 cold-TTS mock + T24 retrieval-only + T20 supplementary

## T22 corrected mock baseline: retrieval + TTS cache off

**Highest passing contiguous stage = 15 users**, not 25. Run #15
`T22-mock-cold-tts`, 27 October 2026 **10:12:56–10:24:02 +07** (11m06s),
completed before the 10:30 cutoff. This is mock evidence; no GPU was rented.

| users | n | error % | p95 s | queue max C/S/T | publish/done | result |
|---:|---:|---:|---:|---|---|---|
| 1 | 5 | 0.00 | 6.08 | 1/0/3 | 5/5 | ผ่าน |
| 10 | 41 | 0.00 | 5.39 | 2/0/9 | 41/41 | ผ่าน |
| 15 | 62 | 0.00 | 5.33 | 15/0/9 | 62/62 | ผ่าน |
| 20 | 79 | 1.27 | 22.61 | 10/0/37 | 79/79 | ไม่ผ่าน |
| 25 | 97 | 0.00 | 9.35 | 17/2/18 | 97/97 | ผ่าน |

Stage 20 failed: one `MISSING_TTS` voice request (27.08s); chat p95 3.19s,
voice p95 26.25s. Stage 25 passed, but cannot repair the failed preceding stage;
`max_users_ok.mix = max_users_strict.mix = 15`. Do not claim stable monotonic
capacity from a single run. No criterion, duration or question fixture changed.

Configuration: mock latency 800ms, chat/STT/TTS workers 2/1/1, prefetch 4/4/2,
MQ_PREFIX=T22_, stage120/think30±50%, rag770 deck seed20261026. 197 text questions,
197 unique, zero text repeats. Voice fixtures: 87 requests from 10 files, 77
repeats (random with replacement); mix choice also uses the runner's unseeded
Math.random. Publish/done and drain conservation true at every stage; telemetry
valid at every stage. Initial management observation was 0/0/0 immediately after
recreate, later samples show 2/1/1; raw samples remain unchanged in result JSON.

Cache scope: RAG_CANDIDATE_CACHE=off; TTS_CACHE=off on web, tts-worker and
mock-llm. Worker skips memory read/write, DB read/write, singleflight and warming;
mock provider skips speech memory and fixture-disk replay. Web holds unique
one-use deliveries for <=90s (32MiB bound); GET consumes bytes and sets no-store,
subsequent GET returns404 without DB fallback. This is transport buffering, not
text-keyed reuse. Health/model-name metadata remains cached; model weights and
OS file pages are outside response cache scope. No provider/NInfer prefix-cache
claim is made because AI deployment has not run. Counter/unit/HTTP evidence in
RUN/state and workers/tts-worker/README.md.

### T22 GPU baseline (MODE=ai · วัดจริง 27/10/2026)

ชุดเดียวที่เช่า (ไม่เช่าซ้ำ): **5090 Qwen NInfer `--max-concurrency 4`** (57914113 · $0.53037/hr รวม disk) ·
**4090 faster-whisper large-v3** (57914254 · $0.41389/hr) · **4090 VoxCPM2 (official git cce58a5, 48 kHz, เสียง nongsai) + bge-reranker-v2-m3**
(57914350 · $0.41389/hr) · รวม $1.35815/hr · worker chat/stt/tts = 1/1/1 · prefetch 4/4/2 · stage 120 s · think 30 s ±50% ·
`--questions rag770 --seed 20261027` · `--stop-on-fail` (ขั้นหลังขั้นที่ไม่ผ่าน = ไม่ได้วัด ไม่มีการเติมตัวเลข) · เกณฑ์ error < 1% และ p95 ≤ 12 s (ไม่เปลี่ยน)

**Cache scope (ตัวเลขหลัก):** `RAG_CANDIDATE_CACHE=off` · `TTS_CACHE=off` (web/tts-worker: memory+DB+singleflight+warmup ปิด · `TTS_WARM=0`) ·
Qwen/NInfer: history/prefix reuse ปิด ตรวจแล้ว `cached_tokens=0`/`cache_n=0` บนคำขอซ้ำ (state/vast-ninfer-proof.txt) ·
STT/TTS/rerank adapter ไม่มี response/result/audio cache · HTTP `Cache-Control: no-store` และ Cloudflare `CF-Cache-Status: DYNAMIC` ·
VoxCPM2 `build_prompt_cache` ของ upstream สร้างจากเสียงอ้างอิงใหม่ทุกคำขอ (ส่ง prompt path ทุกครั้ง ไม่ memoize) · model weights / OS file cache ไม่ใช่ response cache

**การแก้ระหว่างวัด (บันทึกทั้งก่อน/หลัง ไม่ทับผลเดิม):**
- r1 stt ไม่ผ่านที่ 4 คน (2/16 error) — สาเหตุ: stt-worker ตรวจ `/health` ผ่าน tunnel timeout 5 s ครั้งเดียว → cancel consumer → `/api/voice` 503 · แก้: `STT_HEALTH_FAILS=2` (ต้องล้ม 2 ครั้งติด) → r2
- r1 voice ไม่ผ่านที่ 1 คน (`MISSING_TTS_SENTENCE`: คำตอบ Qwen ยาว 27 ประโยค TTS ไม่ทัน 20 s หลัง done) — PROBLEM กำหนดเสียงพูดรวม ≤ 600 ตัวอักษร แต่ worker ไม่ได้บังคับ · แก้: chat-worker ส่ง sentence/tts จนครบ 600 ตัวอักษร (ข้อความแชทยังครบ) → r2
- chat และ tts ไม่ได้รับผลจากการแก้ จึงไม่วัดซ้ำ

**chat r1 (GPU-1 5090 Qwen)** · `gpu-chat-nocache` · 2026-10-27T05:51:29.356Z–2026-10-27T06:04:25.872Z · cache=off tts_cache=off prefetch={'chat': 4, 'stt': 4, 'tts': 2} consumers={'chat': 1, 'stt': 1, 'tts': 1} questions=rag770 seed=20261027 unique=247 repeats=0 voice served/repeats=0/0

| users | n | err % | p50 s | p95 s | first audio p95 s | queue max C/S/T | publish/done | conservation | pass |
|---:|---:|---:|---:|---:|---:|---|---|---|---|
| 1 | 4 | 0.00 | 2.92 | 4.01 | – | 1/0/0 | 4/4 | True | ผ่าน |
| 2 | 7 | 0.00 | 2.61 | 5.58 | – | 1/0/0 | 7/7 | True | ผ่าน |
| 4 | 18 | 0.00 | 2.46 | 6.36 | – | 1/0/0 | 18/18 | True | ผ่าน |
| 8 | 32 | 0.00 | 2.51 | 7.10 | – | 5/0/0 | 32/32 | True | ผ่าน |
| 16 | 64 | 0.00 | 2.75 | 10.06 | – | 12/0/0 | 64/64 | True | ผ่าน |
| 32 | 122 | 0.00 | 3.65 | 23.11 | – | 29/0/0 | 122/122 | True | ไม่ผ่าน |

max_users_ok (strict, contiguous) = 16 · stopped_on_failed_stage=32

**stt r1 (before health fix)** · `gpu-stt-nocache` · 2026-10-27T06:04:26.109Z–2026-10-27T06:10:47.386Z · cache=off tts_cache=off prefetch={'chat': 4, 'stt': 4, 'tts': 2} consumers={'chat': 1, 'stt': 1, 'tts': 1} questions=rag770 seed=20261027 unique=0 repeats=0 voice served/repeats=31/21

| users | n | err % | p50 s | p95 s | first audio p95 s | queue max C/S/T | publish/done | conservation | pass |
|---:|---:|---:|---:|---:|---:|---|---|---|---|
| 1 | 5 | 0.00 | 2.20 | 4.38 | – | 2/0/0 | 0/0 | True | ผ่าน |
| 2 | 10 | 0.00 | 2.41 | 3.24 | – | 0/1/0 | 0/0 | True | ผ่าน |
| 4 | 16 | 12.50 | 1.89 | 3.61 | – | 0/1/0 | 0/0 | True | ไม่ผ่าน |

max_users_ok (strict, contiguous) = 2 · stopped_on_failed_stage=4

**stt r2 (primary)** · `gpu-stt-nocache-r2` · 2026-10-27T06:23:43.574Z–2026-10-27T06:36:45.197Z · cache=off tts_cache=off prefetch={'chat': 4, 'stt': 4, 'tts': 2} consumers={'chat': 1, 'stt': 1, 'tts': 1} questions=rag770 seed=20261027 unique=0 repeats=0 voice served/repeats=237/227

| users | n | err % | p50 s | p95 s | first audio p95 s | queue max C/S/T | publish/done | conservation | pass |
|---:|---:|---:|---:|---:|---:|---|---|---|---|
| 1 | 5 | 0.00 | 1.92 | 2.03 | – | 0/1/0 | 0/0 | True | ผ่าน |
| 2 | 10 | 0.00 | 1.79 | 4.49 | – | 0/1/0 | 0/0 | True | ผ่าน |
| 4 | 17 | 0.00 | 2.03 | 3.82 | – | 0/1/0 | 0/0 | True | ผ่าน |
| 8 | 32 | 0.00 | 2.16 | 7.83 | – | 0/3/0 | 0/0 | True | ผ่าน |
| 16 | 70 | 0.00 | 2.12 | 10.09 | – | 0/11/0 | 0/0 | True | ผ่าน |
| 32 | 103 | 20.39 | 8.87 | 30.58 | – | 0/27/0 | 0/0 | True | ไม่ผ่าน |

max_users_ok (strict, contiguous) = 16 · stopped_on_failed_stage=32

**tts r1** · `gpu-tts-nocache` · 2026-10-27T06:10:47.512Z–2026-10-27T06:13:03.284Z · cache=off tts_cache=off prefetch={'chat': 4, 'stt': 4, 'tts': 2} consumers={'chat': 1, 'stt': 1, 'tts': 1} questions=rag770 seed=20261027 unique=5 repeats=0 voice served/repeats=0/0

| users | n | err % | p50 s | p95 s | first audio p95 s | queue max C/S/T | publish/done | conservation | pass |
|---:|---:|---:|---:|---:|---:|---|---|---|---|
| 1 | 5 | 0.00 | 9.50 | 12.65 | 12.62 | 0/0/1 | 0/0 | True | ไม่ผ่าน |

max_users_ok (strict, contiguous) = unavailable (stage 1 failed) · stopped_on_failed_stage=1

**tts + concurrent rerank (U_tts)** · `gpu-tts-nocache-rerank` · 2026-10-27T06:43:56.360Z–2026-10-27T06:46:08.275Z · cache=off tts_cache=off prefetch={'chat': 4, 'stt': 4, 'tts': 2} consumers={'chat': 1, 'stt': 1, 'tts': 1} questions=rag770 seed=20261027 unique=8 repeats=0 voice served/repeats=0/0

| users | n | err % | p50 s | p95 s | first audio p95 s | queue max C/S/T | publish/done | conservation | pass |
|---:|---:|---:|---:|---:|---:|---|---|---|---|
| 1 | 4 | 0.00 | 11.58 | 12.44 | 12.43 | 1/0/1 | 4/4 | True | ไม่ผ่าน |

max_users_ok (strict, contiguous) = unavailable (stage 1 failed) · stopped_on_failed_stage=1

**voice r1 (before 600-char cap)** · `gpu-voice-nocache` · 2026-10-27T06:13:03.385Z–2026-10-27T06:15:38.553Z · cache=off tts_cache=off prefetch={'chat': 4, 'stt': 4, 'tts': 2} consumers={'chat': 1, 'stt': 1, 'tts': 1} questions=rag770 seed=20261027 unique=0 repeats=0 voice served/repeats=3/0

| users | n | err % | p50 s | p95 s | first audio p95 s | queue max C/S/T | publish/done | conservation | pass |
|---:|---:|---:|---:|---:|---:|---|---|---|---|
| 1 | 3 | 100.00 | 28.48 | 28.94 | – | 1/0/24 | 3/3 | True | ไม่ผ่าน |

max_users_ok (strict, contiguous) = unavailable (stage 1 failed) · stopped_on_failed_stage=1

**voice r2 (primary)** · `gpu-voice-nocache-r2` · 2026-10-27T06:36:45.342Z–2026-10-27T06:41:15.966Z · cache=off tts_cache=off prefetch={'chat': 4, 'stt': 4, 'tts': 2} consumers={'chat': 1, 'stt': 1, 'tts': 1} questions=rag770 seed=20261027 unique=0 repeats=0 voice served/repeats=9/3

| users | n | err % | p50 s | p95 s | first audio p95 s | queue max C/S/T | publish/done | conservation | pass |
|---:|---:|---:|---:|---:|---:|---|---|---|---|
| 1 | 3 | 0.00 | 9.83 | 10.08 | 10.08 | 1/4/6 | 3/3 | True | ผ่าน |
| 2 | 6 | 83.33 | 24.94 | 26.92 | 12.64 | 2/0/20 | 6/6 | True | ไม่ผ่าน |

max_users_ok (strict, contiguous) = 1 · stopped_on_failed_stage=2

**mix scale-base r1** · `gpu-mix-scale-base-nocache` · 2026-10-27T06:15:38.675Z–2026-10-27T06:20:05.891Z · cache=off tts_cache=off prefetch={'chat': 4, 'stt': 4, 'tts': 2} consumers={'chat': 1, 'stt': 1, 'tts': 1} questions=rag770 seed=20261027 unique=9 repeats=0 voice served/repeats=4/0

| users | n | err % | p50 s | p95 s | first audio p95 s | queue max C/S/T | publish/done | conservation | pass |
|---:|---:|---:|---:|---:|---:|---|---|---|---|
| 1 | 6 | 0.00 | 2.66 | 4.01 | – | 1/0/4 | 6/6 | True | ผ่าน |
| 2 | 7 | 28.57 | 8.78 | 25.58 | 11.74 | 1/1/12 | 7/7 | True | ไม่ผ่าน |

max_users_ok (strict, contiguous) = 1 · stopped_on_failed_stage=2

**mix scale-base r2** · `gpu-mix-scale-base-nocache-r2` · 2026-10-27T06:41:16.201Z–2026-10-27T06:43:26.007Z · cache=off tts_cache=off prefetch={'chat': 4, 'stt': 4, 'tts': 2} consumers={'chat': 1, 'stt': 1, 'tts': 1} questions=rag770 seed=20261027 unique=2 repeats=0 voice served/repeats=2/0

| users | n | err % | p50 s | p95 s | first audio p95 s | queue max C/S/T | publish/done | conservation | pass |
|---:|---:|---:|---:|---:|---:|---|---|---|---|
| 1 | 4 | 25.00 | 3.59 | 25.90 | 8.51 | 1/1/9 | 4/4 | True | ไม่ผ่าน |

max_users_ok (strict, contiguous) = unavailable (stage 1 failed) · stopped_on_failed_stage=1

**SUPPLEMENTARY tuning TTS_PREFETCH=1 (voice)** · `gpu-voice-tune-ttsprefetch1` · 2026-10-27T06:46:40.793Z–2026-10-27T06:49:01.811Z · cache=off tts_cache=off prefetch={'chat': 4, 'stt': 4, 'tts': 2} consumers={'chat': 1, 'stt': 1, 'tts': 1} questions=rag770 seed=20261027 unique=0 repeats=0 voice served/repeats=4/0

| users | n | err % | p50 s | p95 s | first audio p95 s | queue max C/S/T | publish/done | conservation | pass |
|---:|---:|---:|---:|---:|---:|---|---|---|---|
| 1 | 4 | 25.00 | 10.80 | 25.75 | 10.82 | 1/1/10 | 4/4 | True | ไม่ผ่าน |

max_users_ok (strict, contiguous) = unavailable (stage 1 failed) · stopped_on_failed_stage=1

- llm: NVIDIA GeForce RTX 5090 · VRAM max 22866 / 32607 MiB · util max 100 % · samples 999
- stt: NVIDIA GeForce RTX 4090 · VRAM max 5434 / 24564 MiB · util max 97 % · samples 999
- tts: NVIDIA GeForce RTX 4090 · VRAM max 10290 / 24564 MiB · util max 100 % · samples 998

| role | GPU | users × share × 1.2 | measured U | GPU200 (estimate) | $/GPU/hr | $/hr |
|---|---|---:|---:|---:|---:|---:|
| llm | RTX 5090 Qwen | 240 | 16 | ⌈240/16⌉ = 15 | 0.53037 | 7.96 |
| stt | RTX 4090 Whisper large-v3 | 72 | 16 | ⌈72/16⌉ = 5 | 0.41389 | 2.07 |
| tts | RTX 4090 VoxCPM2 + rerank | 72 | unavailable (0) | unavailable | 0.41389 | unavailable |
| **รวม** | | | | | | **unavailable (TTS U=0); known part $10.03/hr** |


**คอขวด:** GPU-3 (VoxCPM2) — โมเดล batch 1 ต้อง serialize (execution concurrency 1) · `/api/tts` 1–3 ประโยค p95 12.6 s ที่ 1 คน (12.4 s ขณะมี rerank) ·
เสียงแรก (หยุดพูด→เสียงแรก) p95 10.1 s ที่ 1 คน (เป้า < 6 s ไม่ผ่าน) · RTF warm ≈ 0.37 (ประโยค 5.4 s) แต่ cold 1.89 และ p95 ใน load 0.77 ·
รองลงมา LLM 5090 (16 คน) และ STT (16 คน)

**Tuning (ผลเสริม ไม่ใช่ค่าหลัก):** `TTS_PREFETCH=1` (loadtest/tuning/tts-prefetch1.yml · log worker `prefetch 1`; ฟิลด์ `config.prefetch` ใน JSON เป็น hint จาก env ของ runner = 2) ·
voice 1 คน error 25% (ไม่ผ่าน) เทียบ prefetch 2 r2 ผ่าน 1 คน → ไม่ช่วย เพราะ GPU TTS serialize อยู่แล้ว · คืนค่า 2 หลังวัด

**GPU200 (PROBLEM 9 ค · ประมาณการเชิงเส้นจากเครื่องเดียวต่อชนิด · ไม่ได้ทดสอบ 200 คนจริงบน GPU):**
U_tts = 0 (ขั้น 1 คนไม่ผ่าน) → TTS และยอดรวม = **unavailable** (ไม่หารศูนย์/ไม่เดา) · ส่วนที่คำนวณได้ LLM 15 ใบ + STT 5 ใบ ≈ $10.03/hr ·
ต้องลดงาน TTS ต่อคน (คำตอบเสียงสั้นลง/ลด timesteps/batch) แล้ววัดใหม่ก่อนประเมิน TTS

## ผล T24: ปิด retrieval cache เท่านั้น (TTS cache ยังเปิด) · prefetch 4/4/2 · คำถามไม่ซ้ำ rag770

**ผลเดิม 25 คน (โหมด mix · mock · retrieval-cache-off เท่านั้น ไม่ใช่ all-cache-off)** — ขั้นสูงสุดที่ error < 1% และ p95 ≤ 12 วิ
โดยทุกขั้นก่อนหน้าผ่าน (run #11 `mock-mix-nocache-pruned`) · **ไม่ผ่านเป้า 200 คน** (ไม่ลดเกณฑ์)
ก่อนแก้คอขวด (run #10 `mock-mix-nocache`) ได้ 10 คน

เงื่อนไขทั้งสองรัน: `RAG_CANDIDATE_CACHE=off` (ยืนยันจาก log `[retrieve] RAG_CANDIDATE_CACHE=off`
ทุก chat-worker · ดู results/T24-cache-runtime.log) · `CHAT_PREFETCH=4 STT_PREFETCH=4 TTS_PREFETCH=2`
· chat-worker ×2 · STT/TTS ×1 · DB pool cap 16 (T20) · `MOCK_LATENCY_MS=800` · stage 120 วิ · think 30 วิ ±50%
· mix 70% แชท / 30% เสียง · web :3600 · project saisai3 · `--questions rag770 --seed 20261026`
(770 ข้อจาก gemini/rag-questions/*.jsonl สับด้วย seed แจกแบบไม่คืนข้ามทุก session ทั้งรัน)
· เสียงใช้ V01–V10 (มี 10 ไฟล์ → ซ้ำแน่นอน นับแยกใน `config.voice_questions`)

### รอบที่ 2 (หลังแก้คอขวด · ค่าหลัก) — run #11 · results/mock-mix-nocache-pruned.json

เวลาที่ 27/10/2026 09:25–09:38 · วัดขั้น 1,10,15,20,25,50 (เพิ่ม 15/20 ตามข้อกำหนดรับไม้ ·
ไม่ได้วัด 100–250 ซ้ำ เพราะ 50 ไม่ผ่านแล้ว)

| users | n | error % | p50 s | p95 s | queue max C/S/T | publish/done | คำถามซ้ำ | ผ่าน (err<1% · p95≤12s) |
|---:|---:|---:|---:|---:|---|---|---:|---|
| 1 | 4 | 0.00 | 2.55 | 3.90 | 1/0/0 | 4/4 | 0 | ผ่าน |
| 10 | 42 | 0.00 | 2.81 | 4.66 | 2/0/0 | 42/42 | 0 | ผ่าน |
| 15 | 63 | 0.00 | 2.79 | 5.35 | 3/1/12 | 63/63 | 0 | ผ่าน |
| 20 | 82 | 0.00 | 2.75 | 5.76 | 8/1/11 | 82/82 | 0 | ผ่าน |
| 25 | 103 | 0.00 | 2.74 | 8.26 | 16/1/6 | 103/103 | 0 | ผ่าน |
| 50 | 205 | 3.90 | 2.78 | 13.50 | 39/1/8 | 205/205 | 0 | ไม่ผ่าน |

- คำถามที่ใช้ 357 ข้อ ไม่ซ้ำเลย (`config.repeats = 0` · `unique_questions = 357`) · เสียง 142 ครั้งจาก 10 ไฟล์ (ซ้ำ 132)
- publish chat.request = SSE done ทุกขั้น (message conservation = true)
- 50 คน: error ทั้ง 8 ครั้งเป็น `MISSING_TTS` ของ voice — คิว chat สูงสุด 39 > 4× ความจุ (2 worker × prefetch 4 = 8)
  → backpressure ตาม PROBLEM 4.2 ส่ง `tts:false` · แชทล้วน 143 ครั้ง error 0 แต่ p95 10.9 วิ / voice p95 15.6 วิ
- **คอขวดที่เหลือ = ความจุคิว chat ที่ prefetch 4** (งานพร้อมกันได้ 8 งาน แต่ละงาน ~2.7 วิ: embed + rerank 800 ms
  + LLM 800 ms×รอบ) ไม่ใช่ CPU: DB p90 34% · embedder p90 49% · chat-worker < 10% (results/mock-mix-nocache-pruned-cpu.jsonl)
  การขยับต่อต้องเพิ่ม worker/prefetch ซึ่งห้ามในรันหลัก → ดูรันเสริม prefetch48 ด้านล่าง

### รอบที่ 1 (ก่อนแก้) — run #10 · results/mock-mix-nocache.json

เวลา 26/10/2026 21:18–21:40 · keyword search = full scan trigram (โค้ดเดิม T13)

| users | n | error % | p50 s | p95 s | queue max C/S/T | publish/done | คำถามซ้ำ | ผ่าน (err<1% · p95≤12s) |
|---:|---:|---:|---:|---:|---|---|---:|---|
| 1 | 4 | 0.00 | 3.07 | 3.25 | 1/0/0 | 4/4 | 0 | ผ่าน |
| 10 | 41 | 0.00 | 3.90 | 7.98 | 9/0/21 | 41/41 | 0 | ผ่าน |
| 25 | 92 | 0.00 | 3.76 | 19.32 | 25/0/1 | 92/92 | 0 | ไม่ผ่าน |
| 50 | 183 | 4.92 | 5.26 | 29.81 | 42/2/8 | 183/183 | 0 | ไม่ผ่าน |
| 100 | 276 | 23.55 | 27.34 | 50.64 | 79/14/0 | 255/255 | 0 | ไม่ผ่าน |
| 150 | 414 | 46.86 | 31.90 | 45.04 | 77/29/0 | 287/287 | 0 | ไม่ผ่าน |
| 200 | 609 | 66.17 | 11.74 | 43.77 | 76/51/0 | 295/295 | 346 | ไม่ผ่าน |
| 250 | 838 | 74.82 | 3.42 | 42.85 | 78/53/0 | 294/294 | 581 | ไม่ผ่าน |

- repeats รวม 927 (served 1,697 > 770 ข้อ → หมดสำรับครั้งแรกในขั้น 200 · ขั้น ≤ 150 ไม่ซ้ำ) ·
  publish/done เท่ากันทุกขั้น (ขั้น 100+ มี HTTP 429 จึง accepted < attempted)
- คอขวด: DB CPU p90 267% / max 343% (เครื่อง 4 core) จาก keyword trigram full scan ทุก chunk ทุกคำถาม
  (วัด idle p50 653 ms / p95 1.44 s ต่อคำถาม)

### การแก้คอขวด (ไม่ใช่ cache · ไม่เพิ่ม prefetch · ไม่ข้าม RAG/rerank)

- `db/init/595-T24-chunk-trgm.sql`: ตาราง `doc_chunk_trgms` = trigram ของแต่ละ chunk (ดัชนี สร้างจาก
  doc_chunks.content ด้วย trigger · ลบตาม cascade) — เป็น index ไม่ใช่ cache ของผลค้น
- `workers/chat-worker/lib/retrieve.mjs` `keywordPruned`: คำนวณ "ขอบบน" ของ word_similarity จากจำนวน
  trigram ที่ตรง แล้วคำนวณคะแนนจริงด้วยสูตรเดิมเฉพาะ chunk ที่ยังมีสิทธิ์ติด top 20 (exact pruning) ·
  `RAG_KEYWORD=fullscan` สลับกลับแบบเดิมได้ · ไม่มีตาราง → full scan อัตโนมัติ
- พิสูจน์ผลเท่าเดิม: 858 คำถาม (770 rag + 78 qa) top-20 keyword เหมือนกันทุกข้อ 858/858
  (results/T24-keyword-equivalence.json · full scan p50 653 ms → pruned 81 ms · p95 1.44 s → 218 ms)
  · RAG hit@4 บน 770 ข้อ (rerank on) pruned = fullscan = 74.7% · MRR 62.6 · top-4 ต่างกัน 0 ข้อ
  (results/T24-rag-hit4.json · ตัวเลข T18 83% วัดผ่าน chat API บนชุด qa 78 ข้อ จึงเทียบตรงไม่ได้ แต่คุณภาพไม่ลดลง)

### ตรวจ cache แฝง

- `grep -rn -i cache` ใน chat-worker/rag-worker/web: results/T24-cache-audit.txt — cache ของ retrieval มีแค่
  RRF candidate cache (ปิดด้วยสวิตช์ · off = ไม่อ่าน/ไม่เขียน/ไม่ singleflight · unit test ยืนยันเรียก DB ทุกครั้ง)
  ที่เหลือเป็น HTTP header (`no-store`, PDF/wav max-age) และสถิติคิว 0.5 วิของ lib/mq (ไม่ใช่คำตอบ)
- ⚠️ นอกขอบเขตสวิตช์: **tts-worker (T15) เก็บเสียงต่อประโยคตาม sha256(ข้อความ+ภาษา)** (หน่วยความจำ + ตาราง
  tts_audio) ประโยคที่เหมือนกันเดิมจะไม่สังเคราะห์ซ้ำ · ไม่ใช่ cache ของคำตอบ/retrieval (แชททุกข้อยังผ่าน
  embed/ค้น/rerank/LLM) แต่ทำให้ TTS ของประโยคซ้ำเร็วขึ้น — ไม่ได้ปิดในงานนี้ (ไฟล์ของ T15) บันทึกไว้ให้ T22 ทราบ

### รันเสริม: prefetch 48/16/32 + cache off + rag770 — run `mock-mix-nocache-prefetch48`

⚠️ **เสริม** (prefetch ไม่ใช่ค่าเริ่มต้น) · run #12 · results/mock-mix-nocache-prefetch48.json · 27/10/2026 09:39–09:58
· cache off · rag770 seed 20261026 · ผลอื่นเหมือนรันหลัก → **N = 50 คน**

| users | n | error % | p50 s | p95 s | queue max C/S/T | publish/done | คำถามซ้ำ | ผ่าน (err<1% · p95≤12s) |
|---:|---:|---:|---:|---:|---|---|---:|---|
| 1 | 5 | 0.00 | 2.94 | 4.17 | 0/0/0 | 5/5 | 0 | ผ่าน |
| 10 | 43 | 0.00 | 2.76 | 3.85 | 2/0/0 | 43/43 | 0 | ผ่าน |
| 25 | 104 | 0.00 | 2.80 | 5.03 | 5/2/0 | 104/104 | 0 | ผ่าน |
| 50 | 207 | 0.00 | 2.76 | 7.63 | 46/2/1 | 207/207 | 0 | ผ่าน |
| 100 | 378 | 0.00 | 2.83 | 17.25 | 99/2/1 | 378/378 | 0 | ไม่ผ่าน |
| 150 | 531 | 0.00 | 5.02 | 24.10 | 150/3/4 | 531/531 | 122 | ไม่ผ่าน |
| 200 | 705 | 0.00 | 4.07 | 28.54 | 196/5/8 | 705/705 | 499 | ไม่ผ่าน |
| 250 | 879 | 0.00 | 4.65 | 30.89 | 243/4/10 | 879/879 | 617 | ไม่ผ่าน |

- error 0 ทุกขั้น (prefetch สูงพอ ไม่เกิด backpressure/429) แต่ p95 เกิน 12 วิ ตั้งแต่ 100 คน
- repeats 1,238 (served 2,008 > 770 → หมดสำรับในขั้น 150) · ขั้น ≤ 100 ไม่ซ้ำ
- คอขวดเมื่อไม่มี cache และคำถามไม่ซ้ำ: embedder TEI บน CPU (p90 124% · max 248%) + DB (p90 127% · max 205%)
  ทุกคำถามต้อง embed ใหม่ + ค้น vector/trigram จริง · ต่างจาก T20 final ที่ cache ซ่อนงานนี้ไว้

### วิธีรันซ้ำ (T22 บน GPU ใช้ runner เดียวกัน)

ดู loadtest/README.md หัวข้อ "Headline capacity" · ต้องได้ `config.cache="off"` ·
`config.prefetch={chat:4,stt:4,tts:2}` · `config.questions="rag770"` · ห้ามเปิด cache/เพิ่ม prefetch ในรันหลัก

```sh
loadtest/compose_mock.sh up -d --build --scale chat-worker=2
MQ_API=http://localhost:15673 MQ_PREFIX= MODE=mock EVAL_TOKEN=ss-eval \
  node loadtest/run_load.mjs --base http://localhost:3600 --mode mix \
  --users 1,10,15,20,25,50 --questions rag770 --label mock-mix-nocache-pruned --post
```

---

# ข้อมูลเสริม (T20) — ⚠️ เปิด cache + คำถามซ้ำ (eval/qa.json ~78 ข้อ) ไม่ใช่ตัวเลขหลัก

ผล T20 final (prefetch 48/16/32 + RRF candidate cache **เปิด** + คำถามซ้ำ) 200 คน p95 5.75s ·
250 คน p95 7.10s — ใช้ได้เฉพาะเป็นข้อมูลเสริม เพราะประโยชน์ส่วนใหญ่มาจากคำถามซ้ำ

## T20 — mock load test (เสริม)

ผล: ผ่านเป้าหมาย 200 คน error 0% / p95 5.75s; 250 คนผ่านด้วย error 0% / p95 7.10s
Q01 ผ่านครบ 20 หน้าต่าง; final run #3 แสดงใน /admin/load; หยุด compose แล้ว

## วิธีวัด

Node 22 ล้วน ยิงผ่าน public web API บน http://localhost:4600 เท่านั้น ทุกคนมี
cookie jar และ UUID chat session แยกกัน ล็อกอินวน C01–C05 โหมด mix สุ่ม chat 70%
และ voice 30% ต่อ transaction; think 30 วินาที ±50%; แต่ละขั้นเริ่มคำขอใหม่
120 วินาที แล้วรอคำขอที่เริ่มแล้วจบทั้งหมด ไม่ตัด timeout/error ออกจากผล
เริ่มผู้ใช้พร้อมกันตอนต้นขั้น จึงรวม burst ใน percentile ด้วย

ทุก run ใช้ mock latency 800 ms, chat-worker ×2, STT/TTS ×1, PDF 7 เล่ม ready
(122 หน้า / 334 chunks), prefix T20_, RabbitMQ API http://localhost:15673
รัน compose จาก worktree T20 ด้วยชื่อ project saisai3 ไม่ใช้ GPU

เกณฑ์ T19: p95 ≤12s และ error ≤1%; สำหรับเป้าหมาย 200 คนตรวจ error <1%
และ publish = done เพิ่มเติม เวลาของ chat = ส่ง→done, STT/TTS = ส่ง→จบ,
voice = ก่อนส่งไฟล์เสียงที่บันทึกเสร็จ→audio byte แรก (รวม STT/chat/TTS)
mix ใช้เวลาของ transaction แต่ละชนิดตามนี้ ทั้ง error และ 429 อยู่ใน denominator
และการกระจาย latency; ไม่เฉลี่ย percentile ของกลุ่มย่อย

อ่าน ready/unacked/total/consumers/publish ทุก 2s จาก /api/queues; queue max
ในตารางคือ total (ready+unacked) ซึ่งอาจพลาด peak ที่สั้นกว่า sampling interval
พัก 6s หลังแต่ละขั้นให้ management counters อัปเดต นับ broker publish แยกจาก
HTTP accepted และ SSE done; ไม่มีทราฟฟิกอื่นที่ publish เข้า prefix นี้ระหว่างวัด

## Baseline — prefetch 4/4/2 (run #1)

| users | n | error % | p50 s | p95 s | queue max C/S/T | publish/done | ผ่าน |
|---:|---:|---:|---:|---:|---|---|---|
| 1 | 4 | 0.00 | 3.28 | 5.42 | 1/0/0 | 4/4 | ผ่าน |
| 10 | 41 | 0.00 | 3.20 | 5.49 | 3/1/2 | 41/41 | ผ่าน |
| 25 | 101 | 0.00 | 3.13 | 9.77 | 17/1/7 | 101/101 | ผ่าน |
| 50 | 206 | 1.94 | 3.13 | 14.36 | 40/1/23 | 206/206 | ไม่ผ่าน |
| 100 | 360 | 8.06 | 5.34 | 25.68 | 73/11/9 | 346/346 | ไม่ผ่าน |
| 150 | 477 | 31.87 | 18.01 | 26.23 | 73/23/14 | 421/421 | ไม่ผ่าน |
| 200 | 647 | 50.85 | 20.37 | 26.30 | 75/31/0 | 414/414 | ไม่ผ่าน |
| 250 | 852 | 65.02 | 4.19 | 30.57 | 76/43/0 | 399/399 | ไม่ผ่าน |

200 คน: 233 HTTP 429 + 96 MISSING_TTS; publish/done 414/414 ไม่มีข้อความที่
เข้าคิวแล้วหาย แต่ตอบไม่ทันและ backpressure ปิดเสียงตามข้อกำหนด 250 คนไม่ผ่าน
ทั้ง error และ latency คอขวดแรกคือจำนวนงานพร้อมกันและการสะสมของคิว chat/STT
CPU snapshot และ queue snapshot อยู่ใน results/baseline-200-*.jsonl
Docker ในเครื่องนี้รายงาน memory เป็น 0B จึงไม่ใช้เป็นหลักฐานการใช้ RAM

## Prefetch-only — 32/16/32, chat DB pool cap 16 (run #2)

| users | n | error % | p50 s | p95 s | queue max C/S/T | publish/done | ผ่าน |
|---:|---:|---:|---:|---:|---|---|---|
| 1 | 4 | 0.00 | 2.99 | 3.37 | 1/0/0 | 4/4 | ผ่าน |
| 10 | 42 | 0.00 | 3.11 | 5.27 | 2/0/6 | 42/42 | ผ่าน |
| 25 | 100 | 0.00 | 3.09 | 6.37 | 20/0/6 | 100/100 | ผ่าน |
| 50 | 186 | 0.00 | 3.13 | 12.49 | 50/2/5 | 186/186 | ไม่ผ่าน |
| 100 | 379 | 0.00 | 3.52 | 20.22 | 100/5/6 | 379/379 | ไม่ผ่าน |
| 150 | 516 | 0.00 | 5.55 | 30.77 | 150/3/9 | 516/516 | ไม่ผ่าน |
| 200 | 586 | 0.00 | 15.99 | 40.13 | 199/2/4 | 586/586 | ไม่ผ่าน |
| 250 | 655 | 0.00 | 23.26 | 52.51 | 249/3/6 | 655/655 | ไม่ผ่าน |

การเพิ่ม concurrency แก้ 429/เสียงหายได้ (error 0% ทุกขั้น) แต่ไม่ได้แก้ latency
200 p95 40.13s และ 250 p95 52.51s เวลาส่วนใหญ่เสียก่อน delta แรก
EXPLAIN ANALYZE ของ weighted trigram scan บน 334 chunks ช่วงโหลดใช้ 978ms
(ดู results/retrieval-explain.txt); embedder ช่วง burst 50 คนสูงสุดประมาณ 1.88s
จึงระบุ full-scan retrieval ของคำถามซ้ำเป็นคอขวดถัดไป ไม่สรุปจาก CPU snapshot
จุดเดียวว่าทรัพยากรทุกชนิดเพียงพอ

ไฟล์และ label ของ run #2 เปลี่ยนเป็น mock-mix-prefetch-only เพื่อแยกจาก final
เปลี่ยนเฉพาะ metadata ชื่อ ไม่มีการแก้ตัวเลขวัด

## Final — prefetch 48/16/32 + versioned RRF candidate cache

| users | n | error % | p50 s | p95 s | queue max C/S/T | publish/done | ผ่าน |
|---:|---:|---:|---:|---:|---|---|---|
| 1 | 5 | 0.00 | 2.01 | 5.58 | 1/0/0 | 5/5 | ผ่าน |
| 10 | 44 | 0.00 | 2.78 | 5.09 | 2/0/0 | 44/44 | ผ่าน |
| 25 | 106 | 0.00 | 2.79 | 5.27 | 8/1/4 | 106/106 | ผ่าน |
| 50 | 210 | 0.00 | 2.61 | 4.70 | 8/2/5 | 210/210 | ผ่าน |
| 100 | 426 | 0.00 | 2.59 | 5.67 | 31/3/4 | 426/426 | ผ่าน |
| 150 | 633 | 0.00 | 2.62 | 5.67 | 52/6/8 | 633/633 | ผ่าน |
| 200 | 846 | 0.00 | 2.62 | 5.75 | 69/4/7 | 846/846 | ผ่าน |
| 250 | 1018 | 0.00 | 2.63 | 7.10 | 104/12/3 | 1018/1018 | ผ่าน |

ผ่านครบทุกขั้น สูงสุดที่ทดสอบผ่าน 250 คน (max_users_ok.mix = 250)
200 คน: 846 requests / error 0% / p95 5.75s / publish=done 846/846
250 คน: 1018 requests / error 0% / p95 7.10s / publish=done 1018/1018
250 คนไม่พังในเงื่อนไข mock ที่วัด จึงไม่มีจุดล้มในรอบ final ภายในช่วงนี้
ยังไม่ได้วัดเกิน 250 และไม่อ้างว่า 250 คือขีดจำกัดจริง

รวม 3288 transactions: chat 2297 / voice 991
(voice 30.14%) ไม่มี error ทั้ง 3,288 ครั้ง
broker publish = HTTP accepted = SSE done = 3,288; ทุกขั้น conservation และ
telemetry valid ตรวจ DB ได้ user/assistant อย่างละ 3,288 และ 786 sessions
หลังจบทั้งสามคิว ready/unacked = 0/0 ดู final-audit.json และ final-db-audit.txt


## การปรับที่จำเป็นในไฟล์ของ T13

- workers/chat-worker/index.mjs: เพิ่ม 2 บรรทัด จำกัด pool ไม่เกิน 16 ต่อ process
  แยกจาก MQ prefetch หากไม่จำกัด ที่ prefetch 48 สอง worker เปิดได้สูงสุด 192
  connections ซึ่งเกิน DB ค่าเดิมเมื่อรวม service อื่น
- workers/chat-worker/lib/retrieve.mjs: เพิ่ม 29 บรรทัด cache RRF candidates ต่อ
  DB สูงสุด 256 key, sliding TTL 5 นาที; key รวม query, embed endpoint และ
  fingerprint ของ id/updated_at ของ ready docs ทุกเล่ม ตรวจ fingerprint ทุกครั้ง
  upload/reingest/delete จึงทำให้ผลเก่าใช้ไม่ได้ Concurrent query เดียวกันแชร์งาน
  ไม่ cache fallback หลัง embedder ล่ม และ clone candidates ก่อนส่งให้ caller
  ยังทำ rerank และ LLM ทุก request ไม่ cache คำตอบ/สถานะออเดอร์/ราคา ไม่ฝังข้อมูล
  PDF ใน seed หรือ prompt นอกเส้นทาง RAG ไม่มีการแก้ rules หรือตัวเลขธุรกิจ

การวัด final รวมช่วงอุ่น cache ตามลำดับ 1→250 จริง ประโยชน์ขึ้นกับการถามซ้ำ
ของ eval/qa.json และ voice fixtures; cold burst ที่เป็นคำถามใหม่ทั้งหมดอาจยังติด
full scan และต้องวัดต่างหาก ตัวเลขนี้ไม่ใช่ความจุของโมเดล AI/GPU จริง

## การทดสอบและหลักฐาน

- Runner/cache: node --check และ node --test loadtest/test/*.test.mjs ผ่าน 5/5
  กลุ่ม รวม SSE UTF-8 split, cookie แยก session, 4 pipeline, 429, SSE error,
  missing audio/บาง sentence, duplicate done, cache singleflight, document
  invalidation, DB isolation, TTL และ outage recovery
- chat-worker หลังแก้: node --test test/chat.test.mjs test/stream.test.mjs
  ใน container ผ่าน 13/13 ไม่มี skip (ดู chat-worker-cached-tests.log)
- web Docker build ครั้งแรกผ่าน compile และ strict TypeScript; e2e typecheck ผ่าน
- Q01 หลังแก้ผ่าน 1.3 นาที: 20 authenticated contexts / UUID แยก / ส่งพร้อมกัน /
  ทุกคำตอบมี 800 และ done หนึ่งครั้ง / ไม่มี HTTP/SSE/page error / consumer 2
  ตรวจทั้งก่อนและหลัง มี 20 user + 20 assistant ใน DB และวิดีโอครบ 20 ชุด
  รายงาน Q01-cached-playwright.json และ Q01-cached.log
- Q01 ใช้หน้า /orders, รอ hydration, static fallback ไม่มี WebGL และ reduced
  motion; video 480×360 ทุก context เตรียมหน้าต่างก่อน send barrier
  รอบแรกที่ใช้ /products และวิดีโอขนาดใหญ่ timeout ระหว่างเตรียมหน้า ไม่ได้ส่ง
  แชทครบ จึงเก็บ log ของความพยายามก่อนหน้าไว้และรันทดสอบใหม่ครบ 20 หน้าต่าง
  ไม่ลดจำนวนคำตอบ เกณฑ์ error หรือการตรวจ consumer
- API ไม่มี completion_tokens usage: tokens_per_sec เป็น null เมื่อไม่มีข้อมูล
  เก็บ output_chars_per_sec จริงแทน ไม่มีการแต่ง tokens/s หรือ GPU utilization
  ค่าทั้ง TTFT, completion, first audio, RTF และ raw samples อยู่ใน JSON
- --shard i/n แบ่ง global user index และเขียนผลแยก ห้ามบวก broker counters
  ข้าม shard/เฉลี่ย percentile; ต้องรวม raw samples ก่อนคำนวณใหม่ ไม่ได้ใช้ shard
  ในการวัดครั้งนี้ --post ห้ามนำ shard-local capacity เข้า dashboard

ตรวจด้วย Chromium หลัง login owner: /admin/load เลือก run #3
ชื่อ mock-mix, load-chart มี data-points=8 และ load-max-users ของ mix มี
data-value=250 ไม่มี page error เก็บหลักฐาน dashboard-proof.json และ
[ภาพหน้า dashboard](results/admin-load-mock-mix.png)

จบด้วย loadtest/compose_mock.sh stop สำเร็จ ทุก 11 containers ของ saisai3
เป็น Exited (0) (ดู compose-stop.log / stopped-services.txt) ไม่ใช้ down และไม่ลบ
volume ไม่หยุด dev infrastructure หรือ container ของงานอื่น


## คำสั่งที่ใช้

```sh
# จาก /root/runs/saisai/wt/T20; wrapper ระบุ endpoint ภายใน compose ชัดเจน
# ป้องกัน inherited dev DATABASE_URL/AMQP_URL/EMBED_URL ชี้ localhost ใน container
loadtest/compose_mock.sh up -d --build --scale chat-worker=2
MQ_API=http://localhost:15673 MQ_PREFIX=T20_ MODE=mock \
  node loadtest/run_load.mjs --base http://localhost:4600 --mode mix \
  --users 1,10,25,50,100,150,200,250 --stage-sec 120 --think-sec 30 \
  --label mock-mix-baseline --post

CHAT_PREFETCH=48 STT_PREFETCH=16 TTS_PREFETCH=32 \
  loadtest/compose_mock.sh up -d --build --scale chat-worker=2
MQ_API=http://localhost:15673 MQ_PREFIX=T20_ MODE=mock EVAL_TOKEN=ss-eval \
CHAT_PREFETCH=48 STT_PREFETCH=16 TTS_PREFETCH=32 \
  node loadtest/run_load.mjs --base http://localhost:4600 --mode mix \
  --users 1,10,25,50,100,150,200,250 --stage-sec 120 --think-sec 30 \
  --label mock-mix --post

node --test loadtest/test/*.test.mjs
cd e2e
BASE_URL=http://localhost:4600 MQ_API=http://localhost:15673 MQ_PREFIX=T20_ \
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright npx playwright test tests/Q01.spec.ts
# กลับ root แล้วจบด้วย:
# loadtest/compose_mock.sh stop
```

มี smoke จริงสำหรับ chat/stt/tts/voice แยกใน results/smoke-*.json (10s / think 0)
เป็นการตรวจ pipeline ไม่ใช้แทนผลความจุ 120s ต่อขั้น ไม่มีการแก้ legacy, source
PDF/facts/questions/voice fixtures, ไฟล์เคสของงานอื่น หรือเช่า GPU

เริ่มงาน: 2026-10-26 10:59:43 +07 (เวลาเริ่มสร้าง progress)
หยุดระบบและบันทึกรายงาน: 2026-10-26T12:30:59+07:00
เวลารวมถึงจุดนี้ 1 ชั่วโมง 31 นาที 16 วินาที (ไม่เกินเป้า 3 ชั่วโมง)

## T23 — final 28/10/2026 (13:51–15:01 +07): ×2 all four modes + ×4 chat measured (AI · cache off)

Authorization 28/10 13:00 (×2 = 5090×2 LLM + 4090 STT + 4090 TTS + 4090 rerank; ×4 chat-only ≤20 min only if actual ≤ $12.5;
stop $14.5; cap $15; cleanup by 16:30). Common config for every number below: `MODE=ai`, rag770 questions seed 20261027,
0 repeats (unique per stage), think 30 s, stage 120 s, `--stop-on-fail`, prefetch chat/stt/tts 4/4/2, LLM `--max-concurrency 4`
per 5090, TTS execution concurrency 1 per GPU, `TTS_CACHE=off` + `RAG_CANDIDATE_CACHE=off` + provider response/audio cache off
(health `response_cache:off audio_cache:off`; [provider proof](results/scale-x2-provider-proof.json)). Criteria unchanged: p95 ≤ 12 s, error < 1 %.

| mode | baseline N (T22) | ×2 N | ×2 target 2×Nbase | ×2 verdict | ×4 N | ×4 target 4×Nbase | ×4 verdict |
|---|---:|---:|---:|---|---:|---:|---|
| chat | 16 ([gpu-chat-nocache](results/gpu-chat-nocache.json)) | **32** ([scale-x2-chat](results/scale-x2-chat.json)) | 32 | **pass (2.00×)** | **16** ([scale-x4](results/scale-x4.json)) | 64 | **fail (1.00×)** |
| stt | 16 (r2) | **0** ([scale-x2-stt](results/scale-x2-stt.json)) | 32 | fail (transport, see below) | not measured | – | chat-only ×4 by rule |
| tts | 0 | **1** ([scale-x2-tts](results/scale-x2-tts.json)) | – (Nbase 0) | ratio undefined; +1 user vs baseline | not measured | – | chat-only ×4 |
| voice | 1 (r2) | **0** ([scale-x2-voice](results/scale-x2-voice.json)) | 2 | fail | not measured | – | chat-only ×4 |

Stages (users · n · error · p50 · p95 · max queue):

- ×2 chat (posted run 35, prior worker round 13:2x–13:50, same approved topology): 1·4·0%·2.31·2.49 · 2·8·0%·1.76·4.92 · 4·19·0%·1.82·2.83 · 8·34·0%·1.69·4.04 · 16·67·0%·2.08·6.14 (q7) · **32·131·0%·2.25·10.85 (q24) ✓** · 48·196·0%·2.25·17.38 (q41) ✗
- ×2 stt (run 36): 1·3·33%·9.71·15.47 ✗ (one empty transcript → 422)
- ×2 tts (run 37): **1·4·0%·7.04·10.43 ✓** · 2·8·0%·9.29·15.94 ✗ (TTS RTF p95 0.68→0.93)
- ×2 voice (run 38): 1·3·33%·21.20·34.23 ✗ (`MISSING_TTS_SENTENCE`; STT + per-sentence TTS latency add up)
- ×4 chat (run 39): **16·68·0%·2.10·7.66 (q16) ✓** · 32·130·0%·2.42·12.24 (q28) ✗ — ladder 16,32,48,64,80 started at Nbase; stopped at first failure; load window ≈5 min of the 20 min cap.

Bottlenecks (evidence-based):
- **STT ×2 = network path, not GPU.** The STT 4090 host (Ireland) decoded in 0.36–0.52 s with queue 0 (server `stt_timing`),
  while client end-to-end was 4.5–14 s for a 165 KB WAV over the SSH tunnel. The selector picks the cheapest verified host and did
  not consider geography/bandwidth to this site ([diagnostic](results/scale-x2-stt-transport-diagnostic.json)). Not fixed in-run.
- **TTS ×2**: one dedicated 4090 with execution concurrency 1 renders a sentence in ~7 s (p50); two concurrent users queue → p95 15.9 s.
  The first TTS host (Türkiye, pip ~380 KB/s) could not finish setup in time and was replaced (attempt 2/3) by a 9.25 Gbps host.
- **Chat ×4 did not scale past ×2.** All four 5090s received work (telemetry max 100 %, but average utilization only 8–16 % during
  the run), yet chat queue depth at 32 users stayed ~the same as ×2 (28 vs 24). The limit is therefore a shared, unscaled stage in the
  chat path (single rerank 4090, CPU TEI embedder, retrieval/DB in the local stack), not LLM GPU capacity. Not isolated further.

Topology / cost per set ($/hr = GPU+disk quote at create):

| set | GPUs (workers chat/stt/tts) | $/hr | N (chat) | $/hr per chat user | cumulative billed (T22+T23) |
|---|---|---:|---:|---:|---|
| baseline (T22) | 5090 + 4090 STT + 4090 TTS+rerank (1/1/1) | 1.358 | 16 | 0.085 | $5.072 after baseline |
| ×2 | 5090×2 + 4090 STT + 4090 TTS + 4090 rerank (2/1/2) | 2.378 | 32 | 0.074 | **$11.884** after ×2 four modes (14:37) |
| ×4 chat-only | 5090×4 + 4090 rerank (4/–/–) · STT/TTS released, unused by chat | 2.534 | 16 | 0.158 | **$13.066** after ×4 + cleanup (15:01) |

×4 deviates from the 8-GPU table on purpose: the user limited ×4 to a chat-only measurement, so the STT/TTS GPUs (already measured on
×2) were destroyed before adding llm-3/llm-4 to save budget. ×4 STT/TTS/voice capacity is therefore **not measured**.

Per-instance bill for this round ([scale-final-billing.json](results/scale-final-billing.json); GPU / disk / download / upload / total $):

| instance · role | create→destroy (+07) | GPU | disk | down | up | total |
|---|---|---:|---:|---:|---:|---:|
| 58060632 llm-1 5090 | 13:51:58–15:00:04 | 0.546 | 0.042 | 0.130 | 0.004 | 0.722 |
| 58060863 llm-2 5090 | 13:54:43–15:00:04 | 0.523 | 0.040 | 0.130 | 0.004 | 0.697 |
| 58061043 stt 4090 | 13:56:32–14:37:52 | 0.285 | 0.010 | 0.013 | 0 | 0.308 |
| 58061251 tts 4090 (slow host, replaced) | 13:58:55–14:18:48 | 0.145 | 0.005 | 0.002 | 0 | 0.152 |
| 58061653 rerank 4090 | 14:03:35–15:00:04 | 0.354 | 0.013 | 0.006 | 0 | 0.373 |
| 58063016 tts 4090 (replacement) | 14:19:01–14:37:52 | 0.133 | 0.013 | 0.055 | 0 | 0.201 |
| 58064542 llm-3 5090 | 14:38:19–15:00:04 | 0.165 | 0.014 | 0.130 | 0.004 | 0.313 |
| 58064819 llm-4 5090 | 14:41:24–15:00:04 | 0.138 | 0.012 | 0.130 | 0.004 | 0.284 |
| **this round** | | | | | | **3.050** |
| **T22+T23 all task instances** | | 11.136 | 0.603 | 1.289 | 0.038 | **13.066** |

Billing may still settle slightly after destroy. Peak actual stayed below the $14.5 stop; x4 entry gate actual $11.884 ≤ $12.5,
projected $13.81 < $14.4 (real kept burn + two fresh 5090 quotes over 35 min + $0.45).

Controller chain (all owner-bound to the Claude worker PID, same independent watchdog 416465, lease handed over with SIGSTOP→verify→SIGKILL,
no fresh set created during handovers): r2 deploy (13:51) → r6 `--resume-x2` stt/tts/voice (14:08) → r7 `--x4-chat` (14:37) → r8
`--x4-chat --x4-resume` (14:49, readiness window). Cleanup 15:00:07/08 verified + second `show_instances` check task 0 / other 0;
independent recheck 15:01:00 task 0 / other 0; watchdog stopped only after verification; saisai3 :3600 restored to `MODE=mock` (healthy).
/admin/load comparison per mode (rendered): chat base 16 / ×2 32 (2.00× ผ่าน) / ×4 16 (1.00× ไม่ผ่าน) · stt 16 / 0 / ยังไม่ได้วัด ·
tts 0 / 1 / ยังไม่ได้วัด · voice 1 / 0 / ยังไม่ได้วัด · mix 0 / 1 / ยังไม่ได้วัด ([screenshot](results/scale-20261028-final-dashboard-chat.png)).

Not done: rerun of the 16 previously failing AI Playwright cases (voice cases need STT/TTS on ×2; after ×2 four modes + ×4 the
actual was $13.07, and a new five-GPU set plus ~20 min of cases would exceed the $14.5 stop). ×4 for stt/tts/voice (chat-only by rule).

## T23 (earlier 28/10 round) — ×2 measured 28/10/2026 (AI · cache off) · ×4 skipped at the $10 rule

User authorization 27/10 21:35 + 28/10 10:25 (fresh set, verified reliability ≥0.99, ≤3 offer attempts per role, $10 skip ×4, $12 stop).
Controller `tools/vast-scale-controller.py` (finite deadline, lease bound to the Claude worker PID/start ticks,
independent `$12` watchdog ≤60 s fresh). Runs today: r3 (gate refused STT, 1 GPU 2.7 min), r4 (three 5090 offers
vanished `no_such_ask`, 2×4090 ~5–8 min), r5 deploy → r5b `--resume-x2` handover (same live set/watchdog) → load.

| set | GPU topology (workers chat/stt/tts · prefetch 4/4/2) | mix N (strict p95≤12s, err<1%) | N/Nbase | verdict | $/hr (GPU+disk) | $/hr per user | cumulative billed |
|---|---|---:|---|---|---:|---:|---|
| baseline (T22 r2) | 5090 LLM + 4090 STT + 4090 TTS+rerank · 1/1/1 | **0** (r1 historical: 1) | – | baseline fails | 1.358 | – | $5.072 after baseline |
| ×2 (28/10 r5) | 5090×2 LLM + 4090 STT + 4090 TTS + 4090 rerank · 2/1/2 | **1** | undefined (Nbase=0) | not provable; 2 users fail | 2.455 | 2.455 | **$8.075** after ×2 (billing API at 12:26) |
| ×4 | +5090×2 +4090 TTS (8 GPU) · 4/2/4 | not measured | – | **SKIPPED**: estimate $11.34 ≥ $10 | quote +$1.467/hr (3 GPUs) | – | unchanged; post-cleanup $8.101 |

×2 stages ([scale-x2.json](results/scale-x2.json), posted run #32; mix think 30 s, stage 120 s, rag770 seed 20261027, 0 repeats,
cache off incl. `TTS_CACHE=off`/`RAG_CANDIDATE_CACHE=off`, provider cache headers off — see [provider proof](results/scale-x2-provider-proof.json)):

| users | n | error | p50 | p95 | chat p95 | voice | result |
|---:|---:|---:|---:|---:|---:|---|---|
| 1 | 5 | 0% | 3.42 s | 6.07 s | 6.07 s | none sampled | ✓ |
| 2 | 8 | 37.5% | 5.38 s | 30.06 s | 5.63 s (5/5 ok) | 3/3 `STT_HTTP_504` (30 s) | ✗ stop-on-fail |

Bottleneck observed: **voice/STT path** (all 3 voice transactions timed out at the STT gateway; chat on 2×5090 stayed
≈5.6 s p95). With only one STT 4090 freshly warmed and 504s at 30 s, the doubling target 2×Nbase cannot be judged
(Nbase=0) and the measured ×2 capacity is 1 user. Queue max chat 1 / stt 2 / tts 0 — no DB/queue saturation.
Ladder: base stage 1, 2×Nbase(r1)=2, one above=4 (budget-sized; stopped at 2).

Not run because of the controller budget gate (projected > $11.75 including the 5-GPU burn): voice-only (`scale-x2-voice`,
projected $11.780), chat-only (`scale-x2-chat`, $11.782), and the 16 previously failing AI Playwright cases ($12.357).
×4 skipped by the user's $10 rule (estimate $11.34; projected with full 30 min ≈ $15.12). TTS execution concurrency per
GPU = 1 (provider health `tts_execution_concurrency: 1`); no independent multi-request TTS proof.

Per-instance bill 28/10 ([scale-billing-20261028.json](results/scale-billing-20261028.json); GPU / disk / download / upload):

| instance / role | create→destroy (+07) | GPU $ | disk $ | down $ | up $ | total $ |
|---|---|---:|---:|---:|---:|---:|
| 58045480 llm-1 (r3) | 10:35:57–10:38:38 (2.7 min) | 0.035 | 0.004 | 0 | 0 | 0.039 |
| 58046704 stt (r4) | 10:55:00–11:03:32 (8.5 min) | 0.073 | 0.003 | 0.001 | 0 | 0.077 |
| 58046920 tts (r4) | 10:58:45–11:03:32 (4.8 min) | 0.051 | 0.003 | 0 | 0 | 0.054 |
| 58048734 llm-1 5090 | 11:19:57–12:26:14 (66.3 min) | 0.606 | 0.024 | 0.064 | 0.003 | 0.697 |
| 58049112 llm-2 5090 | 11:25:29–12:26:14 (60.8 min) | 0.647 | 0.022 | 0.064 | 0.002 | 0.735 |
| 58049004 stt 4090 | 11:23:37–12:26:14 (62.6 min) | 0.371 | 0.019 | 0.014 | 0 | 0.404 |
| 58049267 tts 4090 | 11:27:24–12:26:14 (58.8 min) | 0.362 | 0.018 | 0.030 | 0.001 | 0.411 |
| 58049699 rerank 4090 | 11:33:32–12:26:19 (52.8 min) | 0.298 | 0.012 | 0.004 | 0 | 0.314 |
| **28/10 subtotal** | | | | | | **2.731** |
| **T22+T23 total (billing API, all task instances)** | | | | | | **8.101** |

Cleanup: controller cleanup verified + second `show_instances` check (12:26:19/21 +07) task 0 / other 0; independent
recheck afterwards task 0 / other 0. Watchdog stopped only after verification. saisai3 :3600 restored to MODE=mock (healthy).
/admin/load scale cards: base run 25 N=0, ×2 run 32 N=1, ×4 "ยังไม่ได้วัด", ratio "ยังประเมินไม่ได้"
([rendered attributes](results/scale-20261028-admin-cards.txt)).

## T23 (historical 27/10) — BLOCKED: latest baseline N=0; original instances destroyed

Preflight 27 October 2026 14:36 +07 found the original T22 instances alive.
The latest baseline is `gpu-mix-scale-base-nocache-r2`, not the earlier r1 which
passed one user. r2 has **N=0**, error **25%**, p95 **25.90s** at one user.
T23 explicitly prohibits scaling a zero baseline. No offer search/create or
replacement rental was performed. ×2/×4 were not measured; they are neither
passes nor measured failures. The newer 14:15 topology instruction (×2 adds one
5090 AND one 4090 to separate TTS/rerank) supersedes the original four-GPU ×2.

| set | GPU topology | measured N | N/Nbase | scale verdict | $/hr | $/hr/user | rental time / accumulated cost |
|---|---|---:|---|---|---:|---|---|
| baseline | 5090×1 + 4090×2; workers 1/1/1; prefetch 4/4/2 | 0 | unavailable | baseline fails | 1.35815 | unavailable | T22 billed GPU-hours per instance below; $5.072 at cleanup snapshot |
| ×2 | planned 5090×2 + 4090×3, dedicated TTS separate from rerank | unmeasured | unavailable | BLOCKED Nbase=0 | unquoted | unavailable | no added rentals; $5.072 unchanged snapshot |
| ×4 | planned 5090×4 + 4090×4; ≤30 min, load only | unmeasured | unavailable | BLOCKED Nbase=0 | unquoted | unavailable | no added rentals; $5.072 unchanged snapshot |

Baseline provenance/config/topology: [scale-base.json](results/scale-base.json),
with original stage observations retained. It is an annotated copy of r2, not a
new measurement. `scale-x2.json` and `scale-x4.json` contain explicit BLOCKED
statuses and empty stages; they must not be ingested as successful load runs.
No doubling claim, 200-user extrapolation or invented $/user is made. TTS/rerank
is the observed T22 bottleneck; TTS concurrency per GPU was not independently
verified in T23. Original question seed/repeats, cache limits, queue/publish-done
and GPU observations remain in the T22 baseline and sections above.

T22 rerank-off eval is present (860 items; eval/REPORT.md). The AI full suite
executed 62 cases with 46 passing (TEST_REPORT.md); T23 did not rerun eval or
Playwright. `RUN/state/vast-handoff.md` and the live central ledger/watchdog
handoff were not present inside this worktree. Central state was not accessed
under the worker filesystem restriction. No new watchdog was started because
T23 immediately cleaned up rather than renting/running GPU workloads; no
unverified existing watchdog PID was stopped. Live checks/billing and cleanup
are recorded separately from the stale checked-in RUN/state snapshots.

Destroy requests: **57914113, 57914254, 57914350**. Two read-after-delete
`show_instances()` checks at **14:37:22 and 14:37:27 +07** returned zero task
instances and zero other instances. See [scale-cleanup.json](results/scale-cleanup.json).

| instance / role | billed GPU hours | GPU $ | storage $ | download $ | upload $ | total $ |
|---|---:|---:|---:|---:|---:|---:|
| 57914113 / LLM | 3.611 | 1.781 | 0.135 | 0.130 | 0.004 | 2.050 |
| 57914254 / STT | 3.601 | 1.440 | 0.050 | 0.022 | 0.001 | 1.513 |
| 57914350 / TTS+rerank | 3.575 | 1.430 | 0.050 | 0.027 | 0.002 | 1.509 |
| total | | 4.651 | 0.235 | 0.179 | 0.007 | **5.072** |

Bill source: [scale-billing-final.json](results/scale-billing-final.json).
These are billing API GPU-hours, not independently measured create-to-destroy
wall times. Billing buckets can settle later; $5.072 is the post-cleanup snapshot,
not a guaranteed final settlement. Pre-cleanup snapshot was $5.032. No T23 GPU
added cost beyond baseline time until destroy. Estimated full-rate active burn
before destroy was $1.35815/hr; verified active burn after destroy is $0/hr.
Historical conservative ledger totals / cost at the instant baseline completed
were unavailable locally; neither is reconstructed as a false actual total.

Remaining: positive valid baseline and new user direction after cleanup before
any replacement rental; actual ×2 chat/voice/mix and ×4 load results; independent
TTS concurrency proof; central watchdog/ledger reconciliation; integration browser
verification of scale cards; restore central MODE=mock :3600. At 14:38 the health
endpoint still reported MODE=ai. This worker is not designated exclusive and is
forbidden to run Compose, so no shared stack was mutated to claim mock restored.

T23 code validation: targeted API-parser/server-render tests **4/4 passed**;
`cd web && npm run build` **exit 0**, including strict TypeScript. Logs:
[unit](results/scale-unit.log), [build](results/scale-build.log). No golden,
rules, voice/PDF/question fixtures or existing 62 Playwright cases were changed.
Browser/HTTP integration of the new scale comparison was not run.
Completed documentation at 2026-10-27T14:42:07+07:00; T23 observed work interval from 14:36
was approximately 6 minutes (separate from the full project duration above).
