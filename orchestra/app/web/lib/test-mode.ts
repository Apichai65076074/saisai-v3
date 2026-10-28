// โหมดทดสอบ (T04): POST /api/test/* ใช้ได้เมื่อ ALLOW_TEST_RESET=1
export const DEFAULT_NOW = '2026-10-11T10:00:00+07:00';

export function testResetAllowed(): boolean {
  return process.env.ALLOW_TEST_RESET === '1';
}

/** now จาก body: undefined/null → DEFAULT_NOW · สตริง ISO ที่ parse ได้ → ค่านั้น · อื่น ๆ → null (ผิดรูปแบบ) */
export function parseNow(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return DEFAULT_NOW;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(v) && !Number.isNaN(new Date(v).getTime())) return v;
  return null;
}
