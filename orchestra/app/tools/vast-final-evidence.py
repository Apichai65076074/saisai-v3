#!/usr/bin/env python3
"""Read-only sanitized billing/inventory evidence; never emits raw API records."""
import importlib.util
import json
import re
from pathlib import Path
import time

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('budget', ROOT/'tools/vast-budget.py')
budget = importlib.util.module_from_spec(spec); spec.loader.exec_module(budget)
def capture():
    v = budget.kit.client(retry=1)
    rows, total = budget.owned(v)
    ledger = budget.read('vast-ledger.json', {'instances': {}})
    instances = {}
    fields = {'gpu': 'gpu', 'disk': 'storage', 'bwd': 'download', 'bwu': 'upload'}
    for charge in budget.kit.charges(v, 3):
        iid = str(charge.get('source', '')).removeprefix('instance-')
        label = str((charge.get('metadata') or {}).get('label') or '')
        if iid not in ledger['instances'] and not label.startswith(budget.PREFIX): continue
        item = instances.setdefault(iid, dict(instance_id=int(iid), label=label, gpu=0, storage=0, download=0, upload=0, other=0, gpu_hours_billed=0))
        for part in charge.get('items') or []:
            field = fields.get(part.get('type'), 'other')
            item[field] += max(0, float(part.get('amount') or 0))
            if field == 'gpu':
                hours = re.match(r'([\d.]+) hours', str(part.get('description') or ''))
                if hours: item['gpu_hours_billed'] += float(hours.group(1))
    sums = dict(gpu=0, storage=0, download=0, upload=0, other=0, usd=0)
    for iid, item in instances.items():
        entry = ledger['instances'].get(iid, {})
        item['rental_hours'] = round((entry.get('end_epoch', time.time())-entry.get('start_epoch', time.time()))/3600, 4)
        for field in sums:
            if field != 'usd':
                item[field] = round(item[field], 5); sums[field] += item[field]
        item['total'] = round(sum(item[f] for f in sums if f != 'usd'), 5)
        sums['usd'] += item['total']
    user = v.show_user() or {}
    return {'credit_remaining_usd': round(float(user.get('credit') or 0), 2), 'captured_epoch': time.time(), 'inventory': {'task_instances': len(rows), 'other_instances': total-len(rows)},
            'instances': list(instances.values()), 'total': {f: round(n, 5) for f,n in sums.items()},
            'rental_hours_source': 'SDK start_date to first verified absence; conservative upper bound, separate from billed GPU-hours', 'billing_settlement_note': 'Actual billing snapshot; invoices may settle after destroy.'}
if __name__ == '__main__':
    result = budget.bounded_call(capture, 40)
    (ROOT/'loadtest/results/scale-final-billing.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({'inventory': result['inventory'], 'total': result['total']}))
