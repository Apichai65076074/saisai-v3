#!/usr/bin/env node
// รัน db/init/*.sql ตามลำดับชื่อไฟล์กับ $DATABASE_URL (dev db ของแต่ละงาน) — T04
// ใช้: node db/apply.mjs [--reset]   (--reset = DROP SCHEMA public CASCADE; CREATE SCHEMA public; ก่อน)
// โหลด `pg` จาก web/node_modules (cd web && npm install) หรือ db/node_modules
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function loadPg() {
  for (const base of [join(here, 'package.json'), join(here, '..', 'web', 'package.json'), join(here, '..', 'package.json')]) {
    try { return createRequire(base)('pg'); } catch { /* ลองที่ถัดไป */ }
  }
  console.error('หา module "pg" ไม่เจอ — รัน `cd web && npm install` ก่อน');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL ยังไม่ได้ตั้ง'); process.exit(1); }

const pg = loadPg();
const client = new pg.Client({ connectionString: url });
await client.connect();
let failed = false;
try {
  if (process.argv.includes('--reset')) {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    console.log('reset schema public');
  }
  const dir = join(here, 'init');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const t0 = Date.now();
    try {
      await client.query(readFileSync(join(dir, f), 'utf8'));
    } catch (e) {
      console.error(`ล้มที่ ${f}: ${e.message}`);
      failed = true;
      break;
    }
    console.log(`applied ${f} (${Date.now() - t0} ms)`);
  }
} finally {
  await client.end();
}
process.exit(failed ? 1 : 0);
