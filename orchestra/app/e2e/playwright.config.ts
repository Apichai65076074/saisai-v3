// Playwright (T04 · T21 แก้ได้) · 1 เคส = 1 ไฟล์ tests/<CASE>.spec.ts
import { defineConfig } from '@playwright/test';
import { BASE_URL, CHROME, MEDIA_ARGS, WEBGL_ARGS } from './lib/env';

export default defineConfig({
  testDir: './tests',
  outputDir: process.env.SS_OUTPUT_DIR || './test-results',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: process.env.SS_REPORT_JSON || './test-results/report.json' }]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 800 },
    video: { mode: 'on', size: { width: 1280, height: 800 } },
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    permissions: ['microphone'],
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: { ...(CHROME ? { executablePath: CHROME } : {}), args: [...MEDIA_ARGS, ...WEBGL_ARGS] },
      },
    },
  ],
});
