#!/usr/bin/env python3
"""Sanitized status and GPU telemetry, using only VAST_SSH_KEY_FILE."""
import importlib.util
import json
import os
from pathlib import Path
import re
from types import SimpleNamespace
import time

ROOT = Path(__file__).resolve().parents[1]
os.environ['VAST_LABEL_PREFIX'] = 'saisai-20261027-'
spec = importlib.util.spec_from_file_location('toolkit', ROOT/'tools/vast-toolkit.py')
kit = importlib.util.module_from_spec(spec); spec.loader.exec_module(kit)
v = kit.client(retry=1)
result = {'checked_epoch': time.time(), 'instances': []}
for row in kit.instances(v):
    label = str(row.get('label', ''))
    if not label.startswith('saisai-20261027-'):
        continue
    item = {'id': row['id'], 'label': label, 'status': row.get('actual_status'),
            'hourly_usd': row.get('dph_total')}
    if item['status'] == 'running':
        try:
            host, port, key = kit.running_target(v, SimpleNamespace(id=row['id'], key=None))
            endpoint = '8080' if '-llm' in label else '8000'
            cmd = ['ssh', '-i', key, '-p', str(port), *kit.SSH_OPTS, f'root@{host}']
            rc, out, err = kit.sh(cmd + ['curl -fsS --max-time 5 http://127.0.0.1:'+endpoint+'/health'], 15)
            item['health_ok'] = rc == 0
            if rc == 0:
                try: item['health'] = json.loads(out)
                except ValueError: item['health'] = 'HTTP 200'
            rc, out, err = kit.sh(cmd + ['nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader'], 15)
            item['gpu'] = out.strip() if rc == 0 else 'query failed'
            rc, out, err = kit.sh(cmd + ['tail -n 30 /workspace/bootstrap.log'], 15)
            # Never print raw download URLs, environment, commands or log bodies.
            patterns = ['OutOfMemoryError', 'No space left on device', 'ModuleNotFoundError',
                        'ImportError', 'CMake Error', 'FAILED:', 'Application startup complete',
                        'Fetching', 'Downloading', 'Building', 'Setting up']
            item['bootstrap_markers'] = [p for p in patterns if p in out]
        except Exception as e:
            item['probe_error_type'] = type(e).__name__
    result['instances'].append(item)
(ROOT/'RUN/state/T23-live-status.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result))
