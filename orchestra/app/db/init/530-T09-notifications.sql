-- T09 · notify-worker บันทึกแบบ idempotent (ข้อความเดิมถูกส่งซ้ำ → ไม่เกิดแถวซ้ำ)
CREATE UNIQUE INDEX IF NOT EXISTS notifications_type_no_uniq ON notifications (type, no);
CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications (id DESC);
