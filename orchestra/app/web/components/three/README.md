# T16 — 3D storefront and Nong Sai

`Hero` dynamically loads the R3F factory scene without SSR. Nine product variants use transmission glass; desktop scroll moves the camera toward conveyor rollers. Small screens show four bottles. DOM bottle links remain keyboard accessible and navigate to the canonical order query. `BottleSpin` mounts its scene only after the user opens it and its card intersects the viewport; drag rotates it with OrbitControls.

`Stage` probes WebGL before mounting Canvas, caps DPR at 2, suspends frames outside the viewport or in a hidden document, and uses demand rendering for reduced motion. Missing/lost WebGL falls back to T06's existing hero, bottle and mascot images. Missing images have alt text and hide on error.

`Mascot3D` occupies T14's existing mascot wrapper. It reads the shared avatar store and audio element; one cached MediaElementAudioSourceNode per audio element feeds an AnalyserNode and the speakers. RMS updates `data-mouth` every 50 ms, resetting to `0.00` on pause/end. The four primitive poses follow the supplied concept (round glass body, brown cork, eyes, cheeks, arms, feet and bubbles).

Shared-file integration: `web/app/layout.tsx` adds the mascot slot and server-derived test flag; `web/app/(shop)/products/view.tsx` fills its existing bottle-spin slot. No new dependencies.

## Mock development and checks

From the repo root, using the task's provided environment (never load an `.env`):

```sh
export MODE=mock ALLOW_TEST_RESET=1 MQ_PREFIX=T16_
export DATABASE_URL=postgres://dev:dev@127.0.0.1:56432/t_t16
export AMQP_URL=amqp://guest:guest@127.0.0.1:56672
node db/apply.mjs --reset
cd web
npm ci --no-audit --no-fund
PORT=4602 npm run dev
```

In another shell, from the repo root:

```sh
cd e2e
npm ci --no-audit --no-fund
BASE_URL=http://localhost:4602 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright npx playwright test tests/D01.spec.ts tests/D02.spec.ts tests/D03.spec.ts
cd ../web
npm run build
```

D01 logs in as customer `arun@saisai.test` (`/order` is customer-only), then checks the nine overlays, canvas, green order URL and in-card rotation. D02 checks all four states and a varying PCM signal played through the real shared audio and WebAudio graph, measures at least ten positive RMS samples per second, and checks end-of-audio zero. This branch has no T13/T15 workers/endpoints, so it uses the explicitly allowed `window.__saisaiMascot.play(url)` and `.state(state)` hook. The hook is only installed when the server supplies `ALLOW_TEST_RESET=1`. When `/api/tts/status` is absent, the D01–D03 tests supply that status response so opening chat can be tested independently; no chat response or mouth values are mocked. D03 launches a separate Chromium with `--disable-webgl --disable-3d-apis`, checks image fallbacks and records its own video. Each test resets the task DB, holds the final view and rejects browser console errors.

Last verified 2026-10-26 (mock, dev server on 4602, SwiftShader): D01 ✓ 33.8s · D02 ✓ 41.7s · D03 ✓ 13.4s · `npm run build` passes.
