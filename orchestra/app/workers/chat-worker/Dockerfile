FROM node:22-bookworm-slim
WORKDIR /app
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci --omit=dev
COPY web/lib/ ./web/lib/
COPY shared/ ./shared/
COPY workers/chat-worker/ ./workers/chat-worker/
WORKDIR /app/workers/chat-worker
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s CMD node -e "const fs=require('fs');process.exit(Date.now()-Number(fs.readFileSync('/tmp/healthy','utf8'))<30000?0:1)"
CMD ["node", "index.mjs"]
