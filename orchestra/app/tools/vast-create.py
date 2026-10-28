#!/usr/bin/env python3
"""Create one baseline role, guarded by a live watchdog and label reconciliation."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time

spec = importlib.util.spec_from_file_location('selector', Path(__file__).with_name('vast-select.py'))
selector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(selector)
kit = selector.kit

role = sys.argv[1]
if role not in ('llm', 'llm-1', 'llm-2', 'llm-3', 'llm-4', 'stt', 'tts', 'tts-2', 'rerank'):
    raise SystemExit('Unknown approved GPU role')
root = Path('/root/runs/saisai/state')
progress = json.loads((root/'vast-progress.json').read_text())
os.kill(progress['watchdog_pid'], 0)
if time.time() - progress['last_checked'] > 60:
    raise SystemExit('Watchdog stale')
lease = json.loads((Path('/root/runs/saisai/state')/'vast-lease.json').read_text())
if time.time() >= lease.get('expires_epoch', 0):
    raise SystemExit('Controller lease expired; create prohibited')
v = kit.client(retry=1)
label = 'saisai-20261027-' + role
if kit.by_label(v, label):
    raise SystemExit('Existing role: reconcile and reuse; create prohibited')
gpu, disk, cap, cuda = ('RTX_5090', 80, 1.2, 13.0) if role.startswith('llm') else ('RTX_4090', 50, .5, 12.4)
excluded = set()
for offer_attempt in range(3):
    progress = json.loads((root/'vast-progress.json').read_text())
    os.kill(progress['watchdog_pid'], 0)
    if time.time()-progress['last_checked']>60:raise SystemExit('Watchdog stale before attempt')
    lease=json.loads((root/'vast-lease.json').read_text())
    if time.time()>=lease.get('expires_epoch',0) or time.time()>=lease.get('deadline_epoch',0):
        raise SystemExit('Finite lease expired before attempt')
    pick = selector.select(v, gpu, disk, cap, cuda, excluded=excluded)
    evidence = json.loads((root/f'vast-offers-{gpu}.json').read_text())
    evidence.update({'role': role, 'label': label, 'selected': pick})
    (root/f'vast-selected-{role}.json').write_text(json.dumps(evidence, indent=2)+'\n')
    rows = kit.instances(v)
    burn = sum(float(r.get('dph_total') or 0) for r in rows if str(r.get('label', '')).startswith('saisai-20261027-'))
    stage_x4 = role in ('llm-3', 'llm-4', 'tts-2')
    cap_total = 7.5 if stage_x4 else 3.8
    if burn + pick['dph_total'] > cap_total:
        raise SystemExit('Approved stage hourly cap exceeded')
    # Check actual plus accrued via the live guard immediately before every create.
    spec_guard = importlib.util.spec_from_file_location('budget', Path(__file__).with_name('vast-budget.py'))
    guard = importlib.util.module_from_spec(spec_guard)
    spec_guard.loader.exec_module(guard)
    progress = guard.check(v)
    if stage_x4 and progress['actual_usd'] > 12.5:
        raise SystemExit('Skip x4: actual billing exceeds $12.5')
    # Reserve all remaining stage GPUs, their network allowance, 45min setup/load
    # (30min for x4) plus 5min cleanup, rather than budgeting only this one GPU.
    # Env overrides let a chat-only x4 reserve just the roles it keeps/adds.
    roles = os.environ.get('VAST_STAGE_ROLES', 'llm-1,llm-2,stt,tts,rerank').split(',')
    if stage_x4:
        roles += os.environ.get('VAST_X4_ROLES', 'llm-3,llm-4,tts-2').split(',')
    active_labels = {r.get('label') for r in rows}
    remaining = [r for r in roles if 'saisai-20261027-'+r not in active_labels]
    def quoted(gpu_name, cap_rate, count):
        # Parallel lanes: price the other GPU type from its fresh (<15min) eligible quote,
        # taking the count-th cheapest offer so each remaining role gets a distinct host.
        try:
            data = json.loads((root/f'vast-offers-{gpu_name}.json').read_text())
            offers = data['offers']
            if time.time()-data['epoch'] < 900 and len(offers) >= count:
                return max(float(o['dph_total']) for o in offers[:max(count, 1)])
        except (OSError, KeyError, ValueError):
            pass
        return cap_rate
    llm_left = sum(r.startswith('llm') for r in remaining)
    llm_rate = pick['dph_total'] if role.startswith('llm') else quoted('RTX_5090', 1.2, llm_left)
    other_rate = pick['dph_total'] if not role.startswith('llm') else quoted('RTX_4090', .5, len(remaining)-llm_left)
    future_burn = burn + sum(llm_rate if r.startswith('llm') else other_rate for r in remaining)
    remaining_minutes = min(30 if stage_x4 else 45, max(0, (lease.get('deadline_epoch', time.time()+45*60)-time.time())/60))
    if remaining_minutes < 5:
        raise SystemExit('Insufficient finite-controller time for setup and load')
    reserve = len(remaining) * .15 + future_burn * (remaining_minutes + 5) / 60
    if progress['actual_usd'] + reserve >= guard.STOP_USD:
        raise SystemExit('Insufficient conservative headroom for remaining stage plus cleanup')
    image = 'nvidia/cuda:13.0.2-devel-ubuntu24.04' if role.startswith('llm') else 'pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime'
    cmd = [sys.executable, str(Path(__file__).with_name('vast-toolkit.py')), 'create', '--label', label,
        '--offer-id', str(pick['id']), '--machine-id', str(pick['machine_id']), '--expect-dph', str(pick['dph_total']),
        '--max-instances', '8', '--disk', str(disk), '--image', image, '--max-dph', str(cap), '--timeout', '600', '--yes']
    env = dict(os.environ, VAST_LABEL_PREFIX='saisai-20261027-')
    with (root/f'vast-create-{role}.log').open('w') as log:
        result = subprocess.run(cmd, env=env, stdout=log, stderr=log)
    matches = kit.by_label(v, label)
    safe = [{'id': r['id'], 'label': r['label'], 'status': r.get('actual_status'), 'dph_total': r.get('dph_total')} for r in matches]
    print(json.dumps({'returncode': result.returncode, 'instances': safe}))
    if result.returncode == 0 and len(matches) == 1:
        break
    log_text=(root/f'vast-create-{role}.log').read_text()
    (root/f'vast-create-{role}-attempt-{offer_attempt+1}.log').write_text(log_text)
    vanished=not matches and ('no_such_ask' in log_text or 'หายไปแล้ว' in log_text)
    offline=bool(matches) and all(r.get('actual_status') in ('offline','unknown') for r in matches)
    if offline:
        # Only this role's verified failed instances; other roles remain running.
        for row in matches:
            v.destroy_instance(id=int(row['id']))
            if not kit.verify_gone(v,int(row['id'])):
                raise SystemExit('Offline role cleanup not verified')
        failed_path=root/'vast-failed-hosts.json'
        failed=json.loads(failed_path.read_text()) if failed_path.exists() else {'machine_ids':[]}
        failed['machine_ids']=sorted(set(failed['machine_ids'])|{pick['machine_id']})
        failed.setdefault('attempts',[]).append({'role':role,'offer':pick['id'],'machine':pick['machine_id'],'epoch':time.time(),'reason':'offline; destroyed and verified'})
        failed_path.write_text(json.dumps(failed,indent=2)+'\n')
    if vanished:
        # Phantom listing: exclude its machine for later runs too (no instance was created).
        failed_path=root/'vast-failed-hosts.json'
        failed=json.loads(failed_path.read_text()) if failed_path.exists() else {'machine_ids':[]}
        failed['machine_ids']=sorted(set(failed['machine_ids'])|{pick['machine_id']})
        failed.setdefault('attempts',[]).append({'role':role,'offer':pick['id'],'machine':pick['machine_id'],'epoch':time.time(),'reason':'no_such_ask; verified no instance'})
        failed_path.write_text(json.dumps(failed,indent=2)+'\n')
    if (vanished or offline) and offer_attempt < 2:
        excluded.add(pick['id'])
        continue
    raise SystemExit('Creation/SSH not verified; cleanup required before continuing')
