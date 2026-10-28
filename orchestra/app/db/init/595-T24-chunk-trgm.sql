-- T24 · ดัชนี trigram ต่อ chunk (ไม่ใช่ cache: คำนวณจาก doc_chunks.content ตอนเขียน ผ่าน trigger · ลบตาม chunk ด้วย cascade)
-- ใช้ใน workers/chat-worker/lib/retrieve.mjs คำนวณขอบบนของ word_similarity เพื่อตัด chunk ที่ไม่มีทางติด top 20
-- แล้วคำนวณคะแนนจริงด้วยสูตรเดิมเฉพาะ chunk ที่เหลือ → ผลเท่าเดิมทุกตัว (ทดสอบเทียบ 770+78 คำถาม)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE IF NOT EXISTS doc_chunk_trgms (
  chunk_id int NOT NULL REFERENCES doc_chunks(id) ON DELETE CASCADE,
  part smallint NOT NULL,  -- 0 = content ทั้งก้อน · 1 = หัวข้อ split_part(content, ']', 1) (ถ่วง 4 เท่าใน retrieve)
  trgm text NOT NULL,
  PRIMARY KEY (trgm, part, chunk_id)
);
CREATE INDEX IF NOT EXISTS doc_chunk_trgms_chunk_idx ON doc_chunk_trgms (chunk_id);
CREATE OR REPLACE FUNCTION doc_chunk_trgms_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN DELETE FROM doc_chunk_trgms WHERE chunk_id = OLD.id; END IF;
  INSERT INTO doc_chunk_trgms (chunk_id, part, trgm)
    SELECT NEW.id, 0, g FROM unnest(show_trgm(coalesce(NEW.content, ''))) g
    UNION ALL SELECT NEW.id, 1, g FROM unnest(show_trgm(split_part(coalesce(NEW.content, ''), ']', 1))) g ON CONFLICT DO NOTHING;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS doc_chunk_trgms_sync ON doc_chunks;
CREATE TRIGGER doc_chunk_trgms_sync AFTER INSERT OR UPDATE OF content ON doc_chunks
  FOR EACH ROW EXECUTE FUNCTION doc_chunk_trgms_sync();
-- backfill chunk ที่มีอยู่แล้ว (idempotent)
INSERT INTO doc_chunk_trgms (chunk_id, part, trgm)
  SELECT c.id, 0, g FROM doc_chunks c, unnest(show_trgm(coalesce(c.content, ''))) g
  UNION ALL SELECT c.id, 1, g FROM doc_chunks c, unnest(show_trgm(split_part(coalesce(c.content, ''), ']', 1))) g ON CONFLICT DO NOTHING;
