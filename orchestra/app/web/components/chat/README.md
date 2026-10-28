# T14 — Shared chat window

`ChatWidget` is mounted once in `app/layout.tsx` (the only shared-file change: import + mount). It uses `/api/chat/history` and the POST SSE contract from T10. It keeps reading after `done` for late audio replies. Citations open the encoded PDF URL at the cited page in a new tab. UI labels and suggestions follow the layout `lang` prop; `identity` reloads history when the signed-in user changes.

TTS availability is checked on opening and every 15 seconds while open. Manual 🔊 sends the complete answer to `/api/tts`. Automatic replies use one audio element and a sequence buffer: 1-based sequences and 0-based sequences announced by the worker are supported. Missing clips wait for their predecessor; duplicates are ignored. Autoplay rejection offers a user-gesture resume button. Closing, disabling auto, changing identity, or sending another question clears queued playback. `data-done=true` marks textual completion independently of audio completion.

## Integration with T15 / T16

- `voiceSlot?: ReactNode` renders inside `[data-slot="voice"]`; this container exposes `data-busy` and `data-tts-enabled`. T15 owns `voice-mic` and `voice-mode`; the widget does not duplicate them. A voice component can be passed at the existing layout mount.
- After transcription dispatch `window.dispatchEvent(new CustomEvent('saisai:voice-message', {detail:{text, lang:'th', tts:true}}))`. This uses the same SSE client, sends `via:'voice'`, and adds `chat-msg-voice` inside the user bubble. The widget rejects submissions during history loading or an active request; disable the recording controls using the slot's `data-busy` state.
- Dispatch `saisai:voice-listening` with boolean `detail` for listening state.
- Import `useChatAvatarState()` and the live binding `chatAudioElement` from `./ChatWidget` (or `./avatar`). The state is a string: `idle | listening | thinking | talking`. `talking` follows actual media `playing`/`pause`/`ended` events.
- `mascotSlot?: ReactNode` replaces the fallback image inside the required mascot wrapper. T16 can attach its AnalyserNode to the shared audio element and update the wrapper's `data-mouth` (initially `0.00`). Create/cache one MediaElementAudioSourceNode per element. The element stays mounted when the panel closes.

## Verification (mock only)

From repo root:

```sh
npm ci --prefix web
npm ci --prefix e2e
cd web && npx vitest run components/chat/test/chat.test.ts
```

Start the development server on the allocated T14 port (`MODE=mock MQ_PREFIX=T14_ PORT=4602 npm run dev --prefix web`, with the task's DATABASE_URL and AMQP_URL exported). Then:

```sh
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright BASE_URL=http://localhost:4602 node web/components/chat/test/browser.mjs
```

The isolated Chromium test stubs chat/history/TTS APIs and injects a timed ReadableStream. It checks incremental text before done, delivery 2/1/3 → playback 1/2/3 before done, late TTS after done, audio language, citations, history, suggestions, manual playback, auto cancellation, voice transcript/error, close and unavailable TTS. A second browser page plays an actual generated PCM WAV and checks talking → idle. There are no extra dependencies and no changes to another task's e2e cases. Unit tests cover byte-fragmented Thai SSE, CRLF, duplicate clips, both sequence bases, blocked playback retry and stale callbacks.

Stop the dev server before `npm run build --prefix web` because Next dev/build share `.next`. These tests verify the component contracts; real T13/T15 worker integration belongs to their assigned cases and T21's combined run.

Verified 2026-10-25: targeted Vitest 5/5, production `npm run build`, and the Chromium contract script against both development and production servers passed. The production run also asserts that sequence 3 arrives and plays after textual `done`, while sequence 1 starts before `done`. Only layout.tsx outside this component directory was changed; no dependencies were added.
