#!/usr/bin/env python3
"""Run an owned workload with PIDs registered for the independent budget guard."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

p = argparse.ArgumentParser()
p.add_argument('--cwd', default=str(Path(__file__).resolve().parents[1]))
p.add_argument('--log', required=True)
p.add_argument('command', nargs=argparse.REMAINDER)
a = p.parse_args()
command = a.command[1:] if a.command[:1] == ['--'] else a.command
if not command:
    raise SystemExit('workload command required')
env = dict(os.environ)
env.update({'MODE': 'ai', 'MQ_PREFIX': os.environ.get('MQ_PREFIX', 'T23_ai_'), 'RAG_CANDIDATE_CACHE': 'off', 'TTS_CACHE': 'off',
    'BASE_URL': 'http://localhost:3600', 'MQ_API': os.environ.get('MQ_API', 'http://localhost:15672'),
    'COMPOSE_PROJECT': 'saisai3', 'PLAYWRIGHT_BROWSERS_PATH': '/ms-playwright'})
path = Path('/root/runs/saisai/state/vast-load-processes.json')
items = json.loads(path.read_text()) if path.exists() else []
with open(a.log, 'a') as log:
    proc = subprocess.Popen(command, cwd=a.cwd, env=env, stdout=log, stderr=log, start_new_session=True)
    ticks = Path(f'/proc/{proc.pid}/stat').read_text().split()[21]
    item = {'pid': proc.pid, 'pgid': proc.pid, 'start_ticks': ticks, 'started_epoch': time.time(), 'log': a.log}
    items.append(item)
    path.write_text(json.dumps(items, indent=2)+'\n')
    result = proc.wait()
item['exit_code'] = result
item['finished_epoch'] = time.time()
path.write_text(json.dumps(items, indent=2)+'\n')
print(json.dumps({'pid': proc.pid, 'exit_code': result, 'log': a.log}))
sys.exit(result)
