#!/usr/bin/env bash
# Exclusive mock stack (T20, T24); never consumes inherited dev-infra endpoints.
# T24 defaults = headline load-test setup: cache off, prefetch 4/4/2, web :3600, no MQ prefix.
set -euo pipefail
cd "$(dirname "$0")/.."
export DATABASE_URL=postgres://ss:ss@db:5432/saisai
export AMQP_URL=amqp://guest:guest@rabbitmq:5672
export EMBED_URL=http://embedder:80
export LLM_BASE_URL=http://mock-llm:8000/v1 LLM_MODEL=mock LLM_API_KEY=mock
export STT_URL=http://mock-llm:8000 TTS_URL=http://mock-llm:8000 RERANK_URL=http://mock-llm:8000 AIBOX_API_KEY=mock
export EVAL_TOKEN=ss-eval ALLOW_TEST_RESET=1 RERANK=on
export MODE=mock MOCK_LATENCY_MS=${MOCK_LATENCY_MS:-800} MQ_PREFIX=${MQ_PREFIX-} WEB_PORT=${WEB_PORT:-3600} MQ_UI_PORT=${MQ_UI_PORT:-15673}
export RAG_CANDIDATE_CACHE=${RAG_CANDIDATE_CACHE:-off} CHAT_PREFETCH=${CHAT_PREFETCH:-4} STT_PREFETCH=${STT_PREFETCH:-4} TTS_PREFETCH=${TTS_PREFETCH:-2}
export TTS_CACHE=${TTS_CACHE:-off}
exec docker compose --env-file .env.example --profile mock "$@"
