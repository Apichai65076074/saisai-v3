# notify-worker (T09) · build context = repo root
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/workers/notify-worker
COPY workers/notify-worker/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY shared/ /app/shared/
COPY workers/notify-worker/ ./
CMD ["node", "index.mjs"]
