// ค่ากลางของ e2e (T04)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const E2E_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_DIR = path.resolve(E2E_DIR, '..');
export const VOICE_DIR = path.join(E2E_DIR, 'voice-fixtures');
export const BASE_URL = process.env.BASE_URL || 'http://localhost:3600';
export const MODE = process.env.MODE || 'mock';
export const EVAL_TOKEN = process.env.EVAL_TOKEN || 'ss-eval';
export const MQ_API = process.env.MQ_API || 'http://localhost:15672';
export const DEFAULT_NOW = '2026-10-11T10:00:00+07:00';

// chromium 1247 (PLAYWRIGHT_BROWSERS_PATH=/ms-playwright) = @playwright/test 1.64.0-alpha-1790635538000 · ห้าม npx playwright install
const CHROME_DEFAULT = '/ms-playwright/chromium-1247/chrome-linux64/chrome';
export const CHROME: string | undefined = process.env.SS_CHROME || (fs.existsSync(CHROME_DEFAULT) ? CHROME_DEFAULT : undefined);

export const MEDIA_ARGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
];
/** WebGL ผ่าน SwiftShader (ไม่มี GPU) */
export const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
/** สำหรับเคส fallback ไม่มี WebGL (D03) — เปิด browser เองด้วย args นี้ */
export const NO_WEBGL_ARGS = ['--disable-webgl', '--disable-3d-apis'];

/** รหัสผ่านทดสอบ (legacy/web/SPEC.md ข้อ 6) */
export const PASSWORDS: Record<string, string> = {
  'arun@saisai.test': 'Arun#Test2026',
  'theera@saisai.test': 'Theera#Test2026',
  'porn@saisai.test': 'Porn#Test2026',
  'kenji@saisai.test': 'Kenji#Test2026',
  'mali@saisai.test': 'Mali#Test2026',
  'napa@saisai.test': 'Napa#Test2026',
  'somsri@saisai.test': 'Somsri#Test2026',
  'wichai@saisai.test': 'Wichai#Test2026',
};
