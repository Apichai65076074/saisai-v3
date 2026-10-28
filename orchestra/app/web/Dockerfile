# SaiSai v3 · web (Next.js 14 standalone) · build context = repo root (T04)
FROM node:22-bookworm-slim AS deps
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/web/node_modules ./web/node_modules
COPY web/ ./web/
# โฟลเดอร์กลางที่ web import ได้ (shared/mq-topology.mjs ของ T10) — ถ้ายังไม่มีให้สร้างว่างไว้
RUN mkdir -p /app/shared
COPY shared* /app/shared/
# เกณฑ์ load test (T19) · bundle ตอน build ให้ /api/admin/load และ /admin/load
COPY loadtest/criteria.json /app/loadtest/criteria.json
WORKDIR /app/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p public && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 TZ=Asia/Bangkok
# outputFileTracingRoot = repo root → server อยู่ที่ web/server.js
COPY --from=build /app/web/.next/standalone ./
COPY --from=build /app/web/.next/static ./web/.next/static
COPY --from=build /app/web/public ./web/public
COPY --from=build /app/shared ./shared
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=12 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "web/server.js"]
