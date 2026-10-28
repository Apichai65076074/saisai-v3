// Controls only a process started here, verified against its absolute entrypoint in /proc.
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const action = process.argv[2], service = process.argv[3] || 'chat';
const entries = { chat: 'workers/chat-worker/index.mjs', rag: 'workers/rag-worker/index.mjs', mock: 'mock-llm/server.mjs', web: 'web/node_modules/next/dist/bin/next' };
if (!entries[service]) throw new Error('Unknown service');
const entry = path.join(root, entries[service]);
const runtime = path.join(root, 'workers/chat-worker/test-results/service');
mkdirSync(runtime, { recursive: true });
const pidFile = path.join(runtime, `${service}.pid`);
function owned() { try { const pid = Number(readFileSync(pidFile, 'utf8')); return pid > 1 && readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').includes(entry) ? pid : null; } catch { return null; } }
if (action === 'start') {
  if (!owned()) {
    const log = openSync(path.join(runtime, `${service}.log`), 'a');
    const child = spawn(process.execPath, [entry, ...(service === 'web' ? ['dev', '-p', process.env.PORT || '4602'] : [])], { cwd: service === 'web' ? path.join(root, 'web') : root,
      detached: true, stdio: ['ignore', log, log], env: { ...process.env, PORT: service === 'mock' ? process.env.MOCK_LLM_PORT || '5102' : process.env.PORT,
      HEARTBEAT_FILE: path.join(runtime, `${service}.healthy`) } });
    writeFileSync(pidFile, String(child.pid)); child.unref();
  }
} else if (action === 'stop') {
  const pid = owned(); if (!pid) throw new Error('No owned process');
  process.kill(pid, 'SIGTERM');
  for (let i = 0; i < 100 && owned(); i++) await new Promise(resolve => setTimeout(resolve, 100));
  if (owned()) throw new Error('Process did not stop');
  try { unlinkSync(pidFile); } catch {}
} else throw new Error('Usage: dev-service.mjs start|stop [chat|rag|mock|web]');
