// T21: app/**/test/*.test.mjs เป็นสคริปต์ node:test (รันด้วย `node --test` กับ server จริง) ไม่ใช่ชุด vitest
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: { exclude: [...configDefaults.exclude, 'app/**/test/*.test.mjs'] },
});
