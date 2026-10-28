// เอกสาร RAG (T12) · ใช้ร่วมกันระหว่าง /api/admin/docs และหน้า /admin/docs
import { query } from '@/lib/db';

export type DocRow = {
  id: number;
  filename: string;
  pages: number | null;
  chunks: number;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  error: string | null;
  size: number;
  updatedAt: string;
};

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function listDocs(): Promise<DocRow[]> {
  const rows = await query<{
    id: number; filename: string; pages: number | null; chunks: number | null; status: DocRow['status'];
    error: string | null; size: number | null; updated_at: Date;
  }>(`SELECT id, filename, pages, chunks, status, error, octet_length(bytes) AS size, updated_at FROM docs ORDER BY filename`);
  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    pages: r.pages,
    chunks: r.chunks ?? 0,
    status: r.status,
    error: r.error,
    size: Number(r.size ?? 0),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

/** ชื่อไฟล์ที่ยอมรับ: ตัวอักษร/ตัวเลข . _ - ลงท้าย .pdf (ไม่มี path) */
export function safePdfName(name: string): string | null {
  const base = name.split(/[\\/]/).pop()?.trim() ?? '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.pdf$/i.test(base)) return null;
  return base.replace(/\.pdf$/i, '.pdf');
}
