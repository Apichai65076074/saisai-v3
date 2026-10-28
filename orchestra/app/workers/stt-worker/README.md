# STT and browser voice (T15)

`stt.request` is consumed with shared topology and `STT_PREFETCH` (default 4). Every request uses multipart file, Bearer `AIBOX_API_KEY` and the shop vocabulary `initial_prompt`. Audio is limited to 2 MiB and 30 seconds (WAV checked before upload; compressed audio checked against the transcription duration). The consumer is cancelled when STT `/health` fails and restored after recovery. Requests finish with a correlated `stt` reply before acknowledgement. The worker reconnects to RabbitMQ; its container heartbeat is `/tmp/healthy`, overridden by `HEARTBEAT_FILE` for local processes.

`POST /api/voice` accepts multipart `audio`; empty/unrecognized speech returns 422 with `ไม่ได้ยินเสียง ลองพูดอีกครั้งค่ะ`, oversized uploads return 413, and unavailable consumers return 503. `GET /api/voice/status` reports the live consumer count. VoiceControls mounts in the chat voice slot, records a fresh WebAudio microphone using WebM/Opus for at most 30 seconds, stops every track and aborts uploads when closed. Recognized text uses the existing chat event interface with `via: voice` and an explicit TTS preference. The recording state drives the shared listening mascot state. Disabled STT hides the microphone; text and TTS continue working.

## Local mock run

From repository root, with dependencies already installed in `web` and `e2e`:

```sh
npm ci --prefix workers/stt-worker
npm ci --prefix workers/tts-worker
source workers/stt-worker/tools/mock-env.sh
node db/apply.mjs --reset # allocated task DB only; do this once before starting
for svc in mock rag chat stt tts web; do
  node workers/stt-worker/tools/dev-service.mjs start "$svc"
done
```

The supplied shell file sets only the allocated T15 DB, prefix and ports. It never reads .env files. The RAG worker ingests the seven supplied PDFs; wait for all seven `ready` entries in `workers/stt-worker/test-results/service/rag.log`. The PID controller verifies the absolute entrypoint in `/proc` and stops only processes it created. Runtime PID/log/heartbeat files are ignored by git.

```sh
node --check workers/stt-worker/index.mjs
node --check workers/tts-worker/index.mjs
node --test workers/tts-worker/test workers/stt-worker/test
cd e2e && npm run typecheck && cd ..
./e2e/node_modules/.bin/playwright test -c e2e/playwright.config.ts \
  'e2e/tests/(T0[1-3]|V0[1-6]).spec.ts'
# Run build after stopping the dev web process (both use web/.next):
node workers/stt-worker/tools/dev-service.mjs stop web
(cd web && npm run build)
# Stop remaining owned processes after verification:
for svc in stt tts chat rag mock; do
  node workers/stt-worker/tools/dev-service.mjs stop "$svc"
done
```

V06 uses the shared service helpers and the `SVC_STT_WORKER_STOP/START` commands set by mock-env.sh; it always restarts the owned STT worker in `finally`. No compose operations or GPU services are used.

## Browser fixture and export API

`e2e/lib/fake-mic.ts` exports `installFakeMic(page)` before navigation, then `window.__setMicFile('/__voice-fixtures/V07.wav')` loads a supplied WAV. Every `getUserMedia` call creates a fresh WebAudio stream; real MediaRecorder Opus bytes go to the real STT API. There is no transcription/chat API interception. `speakFixture` clicks start/stop around actual fixture playback. `assertVoiceTurn` checks transcription, semantic answer, audio duration/language, all mascot states, mouth amplitude and stopped microphone tracks on each turn.

For T21, call `window.__startVoiceCapture()` after opening the chat. The helper branches the mascot's existing MediaElementSource into a WebAudio mixer (it never attempts a second source for the same element) and mixes in the actual fake microphone input. `saveVoiceMp4(page, testInfo)` stops capture, closes the page to finalize Playwright video, muxes using the installed ffmpeg-static binary, checks AAC/non-silent audio for both question and answer segments and attaches `voice.mp4` plus `voice-metrics.json`. It closes the page, so call it last. Capture timestamps use the page navigation clock; `offsetMs` aligns captured audio with video approximately at navigation start. Raw Playwright video and raw mixed WebM remain available for re-export. Pass the optional `rounds` array as the third argument to verify every question/answer segment in a multi-turn MP4. Each multi-turn V case also attaches `all-rounds` JSON with individual stop-speaking → first-audio measurements; manual TTS has no speech latency.

T02 uses the explicit three-sentence catalog summary supported by the mock. That explicit fixture paces chunks at 300 ms while `MOCK_LATENCY_MS=800` retains the required service delay, allowing a cold first TTS sentence to play before the answer finishes. Other mock streams retain their default pacing; optional `MOCK_STREAM_DELAY_MS` configures general streaming. T02 needs no special environment setting. All catalog values come from SQL context. For AI mode use a model that follows the three-sentence instruction; the sequence assertions remain unchanged.

## Shared-file additions

The previous handoff added the VoiceControls import and voiceSlot prop in `web/app/layout.tsx`. This continuation adds a microphone bubble marker in `web/components/chat/chat.module.css`, optional stream-delay configuration and explicit speech-fixture pacing lines in `mock-llm/server.mjs` and an explicit three-sentence overview branch in `mock-llm/lib/llm.mjs` for T02. No business calculation is copied; product data comes from the existing SQL context. No source PDFs, facts, questions, original voice fixtures, legacy files, shared schema or dependencies are changed.

## Verification record — 2026-10-26

Mock only, allocated T15 database/queue prefix/ports:

- All nine browser cases passed together, 0 skipped, 0 flaky, 740.5 seconds. This covers ten complete voice-to-audio turns, one voice-mode-off turn (also with tts-auto enabled), and STT shutdown/restart with text/TTS availability.
- Node worker tests: 14/14 passed, including live DB/RabbitMQ integration, with no skipped checks. English sentences containing the baht currency sign stay English; Thai money/code normalization remains covered.
- Existing mock regression suite: 49/49 passed. The initial local attempt lacked its ignored ffmpeg-static executable; copying the already installed e2e binary into that package fixed the local test environment without changing dependencies.
- e2e strict TypeScript check and Node syntax checks passed. Production build and the stricter multi-turn export recheck passed as recorded below.

Full-run stop-speaking → first-audio measurements (milliseconds):

| Case | Fixture(s), in order | Latency ms |
| --- | --- | --- |
| V01 | V07 | 12678 |
| V02 | V01, V02, V03, V04 | 10483, 11307, 7536, 7689 |
| V03 | V09, V06, V10, V05 | 10448, 7371, 8154, 8162 |
| V04 | V08 | 6375 |
| V05 | V07, voice mode off | no reply audio, as required |

For these ten audio replies, median = 8158 ms and nearest-rank p95 = 12678 ms. This full run used mock service latency 800 ms and general stream pacing 300 ms. The mock latency exceeded the 6-second AI target; no AI/GPU latency claim is made. The final setup keeps general mock pacing at its existing default and paces only the explicit three-sentence T02 fixture. Per-turn JSON includes states, mouth amplitude, audio duration/sequence/language and microphone release counts.

Artifacts: `e2e/test-results/voice-verified/report.json`, eight `voice.mp4` exports plus mixed WebM and original Playwright videos under that directory. V06 has its original video. These runtime artifacts are intentionally ignored by git and remain in this worktree for T21.

The stricter V02/V03 rerun passed 2/2 in 5.7 minutes, verifying all 62 question/answer segments across both multi-turn MP4 exports. It also asserts “7 days” rather than a bare digit for claims. The rerun report and videos are in `e2e/test-results/voice-multiturn/`; `all-rounds` now includes fixture filename, transcript, answer and per-turn metrics. Latencies in fixture order were V02: 8475/11547/5997/7486 ms and V03: 8032/6172/7578/6705 ms.

Final verification: `npm run build` passed with Next.js 14.2.35, including strict web types and all voice/TTS routes. Final e2e typecheck and worker syntax checks passed. T02 was rerun with no `MOCK_STREAM_DELAY_MS` setting and a freshly restarted TTS worker: 1/1 passed in 51.2 seconds, sequence 1/2/3 completed, first audio started 2994 ms before done. Its artifacts are in `e2e/test-results/voice-default/`. The final mock regression rerun passed 49/49 in 6.6 seconds. All owned web/chat/rag/STT/TTS/mock processes were stopped after testing.

No compose operations, GPU rental, push, original fixture changes or legacy edits were performed. T15 commit timestamps start at 10:14:32 +07; this continuation completed around 10:59 +07 on 2026-10-26. Work before the first commit was not timed, so that preparation duration is unknown.
