#!/usr/bin/env bash
# T21: docker compose ของระบบรวม (project saisai3 · root ของ repo) โดยไม่ให้ env ของ dev shell
# (DATABASE_URL/AMQP_URL/EMBED_URL/MQ_PREFIX ของงานแต่ละตัว) หลุดเข้า ${VAR:-default} ของ compose
# ใช้: e2e/scripts/compose.sh --profile mock up -d --build --scale chat-worker=2
cd "$(dirname "$0")/../.." || exit 1
exec env -u DATABASE_URL -u AMQP_URL -u EMBED_URL -u PORT -u MQ_PREFIX docker compose "$@"
