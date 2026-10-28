#!/usr/bin/env python3
"""Detached T22/T23 budget guard. State is sanitized; credentials stay in toolkit.

Start before rental: python3 tools/vast-budget.py watch
Renew controller lease: python3 tools/vast-budget.py heartbeat
Destroy only this run: python3 tools/vast-budget.py cleanup
"""
import argparse
import importlib.util
import json
import multiprocessing
import os
from pathlib import Path
import signal
import time

ROOT = Path('/root/runs/saisai/state')
PREFIX = 'saisai-20261027-'
STOP_USD = 14.5
CAP_USD = 15.0

def spend_for_gate(progress):
    # Latest authorization uses billing, with current live GPU/disk accrual only.
    # Historical blanket download reserves remain visible but do not block work.
    return progress['actual_usd'] + progress['burn_hr'] / 60

os.environ['VAST_LABEL_PREFIX'] = PREFIX
spec = importlib.util.spec_from_file_location('toolkit', Path(__file__).with_name('vast-toolkit.py'))
kit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kit)
lease_spec = importlib.util.spec_from_file_location('lease_policy', Path(__file__).with_name('vast-lease.py'))
lease_policy = importlib.util.module_from_spec(lease_spec); lease_spec.loader.exec_module(lease_policy)


def write(name, data):
    ROOT.mkdir(parents=True, exist_ok=True)
    path = ROOT / name
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, indent=2) + '\n')
    tmp.replace(path)


def read(name, default):
    path = ROOT / name
    return json.loads(path.read_text()) if path.exists() else default


def owned(v):
    rows = kit.instances(v)
    return [r for r in rows if str(r.get('label', '')).startswith(PREFIX)], len(rows)


def cleanup(v):
    # Stop only PIDs explicitly registered by this run's workload controller.
    for proc in read('vast-load-processes.json', []):
        if 'finished_epoch' in proc:
            continue
        try:
            pid = int(proc['pid'])
            actual_ticks = Path(f'/proc/{pid}/stat').read_text().split()[21]
            if actual_ticks != proc.get('start_ticks'):
                continue
            if proc.get('pgid') == pid:
                os.killpg(pid, signal.SIGTERM)
            else:
                os.kill(pid, signal.SIGTERM)
        except (ProcessLookupError, FileNotFoundError):
            pass
    rows, _ = owned(v)
    for row in rows:
        v.destroy_instance(id=int(row['id']))
    # Read-after-delete verification; never touch other labels.
    for _ in range(12):
        rows, total = owned(v)
        if not rows:
            ledger = read('vast-ledger.json', {'instances': {}})
            for entry in ledger['instances'].values():
                entry.setdefault('end_epoch', time.time())
            write('vast-ledger.json', ledger)
            write('vast-cleanup.json', {'checked_epoch': time.time(), 'task_instances': 0,
                                      'other_instances': total, 'verified': True})
            return
        time.sleep(5)
    raise RuntimeError('cleanup verification failed')


def estimate(ledger, now, billed):
    accrued = sum((r.get('end_epoch', now) - r['start_epoch']) / 3600 * r['burn_hr'] + (r.get('network_reconciled_usd', r['network_reserve_usd']) if 'end_epoch' in r else r['network_reserve_usd'])
                  for r in ledger['instances'].values())
    return max(accrued, billed)


def check(v, watchdog_pid=None):
    now = time.time()
    ledger = read('vast-ledger.json', {'instances': {}})
    rows, total = owned(v)
    active = {str(r['id']) for r in rows}
    for key, entry in ledger['instances'].items():
        if key not in active:
            entry.setdefault('end_epoch', now)
    for r in rows:
        key = str(r['id'])
        # Charge full running GPU+disk rate even while loading/stopped.
        rate = float(r.get('dph_total') or 0)
        if rate <= 0:
            raise RuntimeError('cannot estimate instance hourly price')
        if key not in ledger['instances']:
            ledger['instances'][key] = {'id': int(key), 'label': r['label'],
                'start_epoch': min(now, float(r.get('start_date') or now)), 'burn_hr': rate,
                'network_reserve_usd': 0.50}
        ledger['instances'][key]['burn_hr'] = max(rate, ledger['instances'][key]['burn_hr'])
    # Must have a working billing API, including network charges. Never log raw rows.
    charges = kit.charges(v, 3)
    billed = 0.0
    billed_network = {}
    for charge in charges:
        label = str((charge.get('metadata') or {}).get('label') or '')
        source = str(charge.get('source') or '').removeprefix('instance-')
        if label.startswith(PREFIX) or source in ledger['instances']:
            for item in charge.get('items') or []:
                amount = max(0, float(item.get('amount') or 0))
                billed += amount
                if item.get('type') in ('bwd', 'bwu'):
                    billed_network[source] = billed_network.get(source, 0.0) + amount
    for key, amount in billed_network.items():
        if key in ledger['instances']:
            ledger['instances'][key]['network_reserve_usd'] = max(
                ledger['instances'][key]['network_reserve_usd'], amount)
            if 'end_epoch' in ledger['instances'][key] and 'network_reconciled_usd' in ledger['instances'][key]:
                ledger['instances'][key]['network_reconciled_usd'] = max(ledger['instances'][key]['network_reconciled_usd'], amount + .05)
    burn = sum(ledger['instances'][str(r['id'])]['burn_hr'] for r in rows)
    estimated = estimate(ledger, now, billed)
    lease = read('vast-lease.json', {'expires_epoch': 0})
    stopped = bool(rows) and (spend_for_gate({'actual_usd': billed, 'burn_hr': burn}) >= STOP_USD or now >= lease['expires_epoch'] or ('owner_pid' in lease and not lease_policy.valid(lease, now)))
    write('vast-ledger.json', ledger)
    progress = {'stage': 'budget-stop' if stopped else lease.get('stage', 'preflight'),
        'ids': [int(r['id']) for r in rows], 'actual_usd': round(billed, 5),
        'estimated_usd': round(estimated, 5), 'burn_hr': round(burn, 5),
        'headroom_to_stop_usd': round(max(0, STOP_USD-billed), 5), 'stop_usd': STOP_USD, 'cap_usd': CAP_USD,
        'last_checked': now, 'watchdog_pid': watchdog_pid if watchdog_pid is not None else read('vast-progress.json', {}).get('watchdog_pid'), 'other_instances': total-len(rows)}
    write('vast-progress.json', progress)
    with (ROOT/'vast-budget-history.jsonl').open('a') as history:
        history.write(json.dumps(progress)+'\n')
    if stopped:
        cleanup(v)
        raise SystemExit('budget/lease stop: task instances destroyed')
    return progress


def bounded_call(operation, timeout_s, *args, **kwargs):
    """Wall-clock boundary independent of SDK/request timeout behavior."""
    ctx = multiprocessing.get_context('fork')
    receiver, sender = ctx.Pipe(duplex=False)
    def run():
        try:
            sender.send(('ok', operation(*args, **kwargs)))
        except SystemExit:
            sender.send(('stop', None))
        except BaseException as exc:
            sender.send(('error', type(exc).__name__))
        finally:
            sender.close()
    child = ctx.Process(target=run)
    child.start(); sender.close()
    try:
        if not receiver.poll(timeout_s):
            raise TimeoutError('SDK operation exceeded hard wall-clock deadline')
        kind, payload = receiver.recv()
        if kind == 'stop': raise SystemExit('budget/lease cleanup verified')
        if kind != 'ok': raise RuntimeError('SDK check failed: '+payload)
        return payload
    finally:
        receiver.close()
        if child.is_alive(): child.terminate()
        child.join(timeout=1)
        if child.is_alive(): child.kill(); child.join()


def main():
    p = argparse.ArgumentParser()
    p.add_argument('action', choices=['watch', 'heartbeat', 'cleanup', 'check'])
    p.add_argument('--stage', default='deployment')
    p.add_argument('--handoff', action='store_true')
    a = p.parse_args()
    if a.action == 'heartbeat':
        write('vast-lease.json', {'stage': a.stage, 'expires_epoch': time.time() + (600 if a.handoff else 300)})
        return
    v = kit.client(retry=1)
    if a.action == 'cleanup':
        cleanup(v)
        return
    if a.action == 'check':
        print(json.dumps(check(v)))
        return
    last_success = None
    while True:
        started = time.monotonic()
        try:
            max_wait = 40 if last_success is None else min(40, max(1, 55 - (time.time()-last_success)))
            progress = bounded_call(check, max_wait, v, watchdog_pid=os.getpid())
            last_success = progress['last_checked']
        except SystemExit:
            raise
        except Exception as e:
            # A transient request may retry only inside the 60-second evidence window.
            last = read('vast-progress.json', {})
            if time.time() - last.get('last_checked', 0) <= 35:
                write('vast-transient-error.json', {'epoch': time.time(), 'error_type': type(e).__name__})
                time.sleep(5)
                continue
            # Fail closed when fresh billing or price cannot be assessed.
            write('vast-watchdog-error.json', {'epoch': time.time(), 'error_type': type(e).__name__})
            while True:
                try:
                    bounded_call(cleanup, 40, kit.client(retry=1))
                    raise SystemExit('watchdog fail-closed cleanup verified')
                except Exception:
                    time.sleep(5)
            # Remain alive until label-scoped cleanup can be verified.
        time.sleep(max(1, 30 - (time.monotonic() - started)))


if __name__ == '__main__':
    main()
