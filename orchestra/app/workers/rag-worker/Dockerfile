# rag-worker (T12) · Node (คิว/DB) + Python PyMuPDF (อ่าน PDF) · build context = repo root
FROM node:22-bookworm-slim
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PYTHONUNBUFFERED=1 NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY workers/rag-worker/requirements.txt /tmp/requirements.txt
# wheel 2.0 ดึง onnxruntime/pymupdf4llm (ส่วนเสริม) ที่ core `import pymupdf` ไม่ใช้ → --no-deps
RUN pip3 install --no-cache-dir --break-system-packages --no-deps -r /tmp/requirements.txt \
 && python3 -c "import pymupdf; print('pymupdf', pymupdf.__version__)"
WORKDIR /app/workers/rag-worker
COPY workers/rag-worker/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY shared/ /app/shared/
COPY workers/rag-worker/ ./
# PDF ตั้งต้น 7 เล่ม (compose ยัง bind mount ./docs/pdf:/app/docs:ro ทับได้)
COPY docs/pdf/ /app/docs/
ENV DOCS_DIR=/app/docs
CMD ["node", "index.mjs"]
