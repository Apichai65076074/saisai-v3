// Local Q03 service control: only stop the PID started by this script.
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const entry = path.join(root, 'workers/rag-worker/index.mjs');
const runtime = path.join(root, 'workers/rag-worker/test-results/service');
const pidFile = path.join(runtime, 'rag.pid');
mkdirSync(runtime, { recursive: true });

function ownedPid() {
  try {
    const pid = Number(readFileSync(pidFile, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 1) return null;
    const args = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
    return args.includes(entry) ? pid : null;
  } catch { return null; }
}

const action = process.argv[2];
const pid = ownedPid();
if (action === 'stop') {
  if (!pid) throw new Error('No owned rag-worker PID found; start it with dev-service.mjs first');
  if (pid) {
    process.kill(pid, process.env.RAG_STOP_SIGNAL === 'SIGKILL' ? 'SIGKILL' : 'SIGTERM');
    for (let i = 0; i < 100 && ownedPid(); i++) await new Promise(r => setTimeout(r, 100));
    if (ownedPid()) throw new Error(`rag-worker PID ${pid} did not stop`);
  }
  try { unlinkSync(pidFile); } catch { /* Already stopped. */ }
} else if (action === 'start') {
  if (!pid) {
    const log = openSync(path.join(runtime, 'rag.log'), 'a');
    const child = spawn(process.execPath, [entry], {
      cwd: root, detached: true, stdio: ['ignore', log, log], env: process.env,
    });
    writeFileSync(pidFile, String(child.pid));
    child.unref();
  }
} else throw new Error('Usage: node workers/rag-worker/tools/dev-service.mjs start|stop');
