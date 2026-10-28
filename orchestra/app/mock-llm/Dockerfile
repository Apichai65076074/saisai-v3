FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg espeak-ng && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY mock-llm/ ./mock-llm/
COPY e2e/voice-fixtures/ ./e2e/voice-fixtures/
ENV PORT=8000
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "mock-llm/server.mjs"]
