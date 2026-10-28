// pg pool เดียวต่อ process (T04) · ไม่พึ่ง Next → lib/server/* และ worker (tsx) import ได้
// ชนิดข้อมูลที่ได้กลับ: NUMERIC → string ("5.20") · DATE → string 'YYYY-MM-DD' · BIGINT → number · TIMESTAMPTZ → Date
import pg from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';

pg.types.setTypeParser(1082, (v: string) => v); // DATE ไม่แปลงเป็น Date (กันเลื่อนวันตาม timezone)
pg.types.setTypeParser(20, (v: string) => Number(v)); // BIGINT (id) → number

/** สิ่งที่ฟังก์ชันใน lib/server/* รับเป็น `db` ได้: Pool หรือ PoolClient (ใน transaction) */
export type Db = Pick<pg.Pool, 'query'> | PoolClient;

const g = globalThis as unknown as { __ssPool?: pg.Pool };

export const pool: pg.Pool =
  g.__ssPool ??
  (g.__ssPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://ss:ss@db:5432/saisai',
    max: Number(process.env.PG_POOL_MAX || 10),
    options: '-c timezone=Asia/Bangkok',
  }));

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query<T>(text, params);
  return r.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const r = await pool.query<T>(text, params);
  return r.rows[0] ?? null;
}

/** BEGIN … COMMIT (ROLLBACK เมื่อ throw) */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
