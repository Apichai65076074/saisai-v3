#!/usr/bin/env python3
"""Read-only search: cheapest verified offer with sanitized evidence."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import time

os.environ['VAST_LABEL_PREFIX'] = 'saisai-20261027-'
spec = importlib.util.spec_from_file_location('toolkit', Path(__file__).with_name('vast-toolkit.py'))
kit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kit)


def select(v, gpu, disk, cap, cuda, excluded=()):
    q = f'verified=true rentable=true reliability>=0.99 num_gpus=1 gpu_name={gpu} dph<={cap} disk_space>{disk+10} direct_port_count>=1 inet_down_cost<=0.01 inet_up_cost<=0.01'
    # Optional bandwidth floor (Mbps) when a slow host made model setup impractical.
    if os.environ.get('VAST_MIN_INET_DOWN'):
        q += ' inet_down>=' + os.environ['VAST_MIN_INET_DOWN']
    rows = kit.search(v, q, disk)
    failures = Path('/root/runs/saisai/state/vast-failed-hosts.json')
    bad_machines = set(json.loads(failures.read_text()).get('machine_ids', [])) if failures.exists() else set()
    rows = [r for r in rows if kit.cuda_compatible(r, cuda) and kit.geo_ok(r, type('Args', (), {})())
        and float(r['dph_total']) <= cap and r.get('verification') == 'verified'
        and float(r.get('reliability') or 0) >= .99 and r['id'] not in excluded
        and r.get('machine_id') not in bad_machines]
    rows.sort(key=lambda r: (float(r['dph_total']), -float(r.get('reliability') or 0), -float(r.get('inet_down') or 0)))
    fields = ['id', 'machine_id', 'gpu_name', 'gpu_ram', 'dph_total', 'dph_base', 'storage_cost',
              'reliability', 'verification', 'cuda_max_good', 'inet_down', 'inet_down_cost', 'inet_up_cost', 'geolocation', 'disk_space', 'cpu_ram']
    safe = [{k: r.get(k) for k in fields} for r in rows]
    path = Path(f'/root/runs/saisai/state/vast-offers-{gpu}.json')
    path.write_text(json.dumps({'epoch': time.time(), 'query': q, 'storage_gb': disk, 'offers': safe}, indent=2)+'\n')
    if not safe:
        raise SystemExit('No matching offers in approved price cap')
    return safe[0]


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--gpu', choices=['RTX_5090', 'RTX_4090'], required=True)
    a = p.parse_args()
    print(json.dumps(select(kit.client(), a.gpu, 80 if a.gpu == 'RTX_5090' else 50,
        1.2 if a.gpu == 'RTX_5090' else .5, 13.0 if a.gpu == 'RTX_5090' else 12.4)))
