import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../web/package.json', import.meta.url));
const { Pool } = require('pg');
const { retrieve } = await import('../lib/retrieve.mjs');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
for (const q of process.argv.slice(2)) {
  const chunks = await retrieve(db, q);
  console.log(q, chunks.map(c => ({ file: c.filename, page: c.page, text: c.content.slice(0, 180), score: c.score })));
}
await db.end();
