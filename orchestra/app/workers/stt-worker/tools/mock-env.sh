# Source from repo root; uses allocated mock resources only. Never reads .env files.
export MODE=mock MQ_PREFIX=T15_ PORT=4600 MOCK_LLM_PORT=5100
export DATABASE_URL=postgres://dev:dev@127.0.0.1:56432/t_t15
export AMQP_URL=amqp://guest:guest@127.0.0.1:56672 EMBED_URL=http://127.0.0.1:56680
export LLM_BASE_URL=http://127.0.0.1:5100/v1 LLM_MODEL=mock LLM_API_KEY=mock
export STT_URL=http://127.0.0.1:5100 TTS_URL=http://127.0.0.1:5100 RERANK_URL=http://127.0.0.1:5100
export AIBOX_API_KEY=mock RERANK=on ALLOW_TEST_RESET=1 MOCK_LATENCY_MS=800
export FFMPEG_BIN="$PWD/e2e/node_modules/ffmpeg-static/ffmpeg"
export BASE_URL=http://localhost:4600 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
export SVC_STT_WORKER_STOP='node workers/stt-worker/tools/dev-service.mjs stop stt'
export SVC_STT_WORKER_START='node workers/stt-worker/tools/dev-service.mjs start stt'
