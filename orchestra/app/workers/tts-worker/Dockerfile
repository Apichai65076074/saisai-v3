# tts-worker (T15) · build context = repo root
FROM node:22-bookworm-slim
WORKDIR /app
COPY workers/tts-worker/package*.json ./workers/tts-worker/
RUN cd workers/tts-worker && npm ci --omit=dev --no-audit --no-fund
COPY shared/ ./shared/
COPY workers/tts-worker/*.mjs ./workers/tts-worker/
ENV NODE_ENV=production
WORKDIR /app/workers/tts-worker
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s CMD node -e "const fs=require('fs');process.exit(Date.now()-Number(fs.readFileSync('/tmp/healthy','utf8'))<30000?0:1)"
CMD ["node", "index.mjs"]
