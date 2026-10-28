#!/usr/bin/env python3
"""Start owned tunnels/telemetry; save only PIDs and role IDs to central state."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
STATE = Path('/root/runs/saisai/state')
spec = importlib.util.spec_from_file_location('toolkit', ROOT/'tools/vast-toolkit.py')
kit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kit)
v = kit.client()
processes = json.loads((STATE/'vast-local-processes.json').read_text()) if (STATE/'vast-local-processes.json').exists() else []
# Historical PIDs are not touched; select roles from the current approved set.
roles = [('llm-1', 58080, 8080), ('llm-2', 58084, 8080), ('stt', 58082, 8000), ('tts', 58083, 8000), ('rerank', 58086, 8000)]
if os.environ.get('VAST_SCALE') == '4':
    roles += [('llm-3', 58088, 8080), ('llm-4', 58090, 8080), ('tts-2', 58087, 8000)]
if os.environ.get('VAST_CONNECT_ROLES'):
    roles = [r for r in roles if r[0] in os.environ['VAST_CONNECT_ROLES'].split(',')]
def live_process(role, kind):
    for item in processes:
        if item.get('role') != role or item.get('kind') != kind or 'start_ticks' not in item:
            continue
        try:
            if Path(f"/proc/{item['pid']}/stat").read_text().split()[21] == item['start_ticks']:
                return True
        except FileNotFoundError:
            pass
    return False

for role, local, remote in roles:
    if live_process(role, 'tunnel'):
        continue
    rows = kit.by_label(v, 'saisai-20261027-'+role)
    if len(rows) != 1:
        raise SystemExit('Expected one instance for '+role)
    iid = rows[0]['id']
    host, port, key = kit.running_target(v, SimpleNamespace(id=iid, key=None))
    base = ['ssh', '-i', key, '-p', str(port), *kit.SSH_OPTS, '-o', 'ServerAliveInterval=15', '-o', 'ExitOnForwardFailure=yes']
    bind = '127.0.0.1' if role.startswith('llm') else '0.0.0.0'
    log = (STATE/f'vast-tunnel-{role}.log').open('a')
    proc = subprocess.Popen([*base, '-N', '-L', f'{bind}:{local}:127.0.0.1:{remote}', f'root@{host}'], stdout=log, stderr=log, start_new_session=True)
    processes.append({'role': role, 'kind': 'tunnel', 'pid': proc.pid, 'start_ticks': Path(f'/proc/{proc.pid}/stat').read_text().split()[21], 'id': iid})
    log = (STATE/f'vast-gpu-{role}.csv').open('a')
    command = 'nvidia-smi --query-gpu=timestamp,name,memory.used,memory.total,utilization.gpu,power.draw --format=csv -l 10'
    proc = subprocess.Popen([*base, f'root@{host}', command], stdout=log, stderr=subprocess.DEVNULL, start_new_session=True)
    processes.append({'role': role, 'kind': 'telemetry', 'pid': proc.pid, 'start_ticks': Path(f'/proc/{proc.pid}/stat').read_text().split()[21], 'id': iid})
    (STATE/'vast-local-processes.json').write_text(json.dumps(processes, indent=2)+'\n')
for role, local, remote in roles:
    if not role.startswith('llm') or live_process(role, 'gateway'):
        continue
    log = (STATE/f'vast-gateway-{role}.log').open('a')
    gateway_env = dict(os.environ, VAST_LLM_UPSTREAM_PORT=str(local), VAST_LLM_GATEWAY_PORT=str(local+1))
    proc = subprocess.Popen(['python3', str(ROOT/'tools/vast-gateway.py')], stdout=log, stderr=log, env=gateway_env, start_new_session=True)
    processes.append({'role': role, 'kind': 'gateway', 'pid': proc.pid, 'start_ticks': Path(f'/proc/{proc.pid}/stat').read_text().split()[21]})
(STATE/'vast-local-processes.json').write_text(json.dumps(processes, indent=2)+'\n')
print(json.dumps({'new_roles': [r[0] for r in roles]}))
