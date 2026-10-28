# SaiSai v3 · db (T04) · build context = repo root
# init รันครั้งเดียวตอน volume pgdata ว่าง · ลำดับชื่อไฟล์ 001 → 002 → 5NN-<TID>-*.sql
FROM pgvector/pgvector:pg16
ENV TZ=Asia/Bangkok
COPY db/init/*.sql /docker-entrypoint-initdb.d/
