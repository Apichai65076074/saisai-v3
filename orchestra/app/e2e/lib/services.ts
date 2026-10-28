// หยุด/เปิด service ระหว่างเคส (Q02 Q03 V06) (T04)
// - env COMPOSE_PROJECT=saisai3 → docker compose -p saisai3 stop|start <name> (รันที่ root ของ repo)
// - ไม่งั้น (dev process ของแต่ละงาน) → คำสั่งจาก env SVC_<NAME>_STOP / SVC_<NAME>_START
//   NAME = ชื่อ service ตัวใหญ่ - → _ เช่น SVC_RAG_WORKER_STOP="pkill -f workers/rag-worker/index.mjs"
//   SVC_RAG_WORKER_START="nohup node workers/rag-worker/index.mjs > /tmp/rag.log 2>&1 &"
import { execSync } from 'node:child_process';
import { REPO_DIR } from './env';

function envKey(name: string, action: 'STOP' | 'START'): string {
  return `SVC_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${action}`;
}

function run(name: string, action: 'stop' | 'start'): void {
  const project = process.env.COMPOSE_PROJECT;
  let cmd: string;
  if (project === 'saisai3') {
    cmd = `docker compose -p saisai3 ${action} ${name}`;
  } else {
    const key = envKey(name, action === 'stop' ? 'STOP' : 'START');
    const v = process.env[key];
    if (!v) throw new Error(`${action} ${name}: ตั้ง COMPOSE_PROJECT=saisai3 หรือ env ${key}`);
    cmd = v;
  }
  execSync(cmd, { cwd: REPO_DIR, stdio: 'inherit', timeout: 120_000, shell: '/bin/bash' });
}

export async function stopService(name: string): Promise<void> {
  run(name, 'stop');
}

export async function startService(name: string): Promise<void> {
  run(name, 'start');
}

/** ใช้ service ได้ไหม (สำหรับ test.skip เมื่อไม่มีวิธีหยุด/เปิด) */
export function canControlService(name: string): boolean {
  return process.env.COMPOSE_PROJECT === 'saisai3' || (!!process.env[envKey(name, 'STOP')] && !!process.env[envKey(name, 'START')]);
}
