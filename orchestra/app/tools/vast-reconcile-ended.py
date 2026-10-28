#!/usr/bin/env python3
"""Reconcile network reserves for verified ended rentals after invoice settling.

Keep original reserves/audit data and full GPU+storage accrual through first
verified absence. Only an ended instance's future-network allowance is replaced
with settled network plus $0.05; running rentals always retain the $0.50 floor.
Requires two equal sanitized bill snapshots >=30s apart and zero >=15min.
"""
import importlib.util
import json
from pathlib import Path
import time

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('budget',ROOT/'tools/vast-budget.py')
budget=importlib.util.module_from_spec(spec);spec.loader.exec_module(budget)
v=budget.kit.client(retry=1)
rows,total=budget.owned(v)
if rows:raise SystemExit('Cannot settle reserves with owned instances active')
cleanup=budget.read('vast-cleanup.json',{})
if not cleanup.get('verified') or time.time()-cleanup['checked_epoch']<900:
    raise SystemExit('Need verified zero for at least 15 minutes')
previous=ROOT/'loadtest/results/scale-resume-billing-settled.json'
if time.time()-previous.stat().st_mtime<30:raise SystemExit('Need independent billing snapshot at least 30s later')
old=json.loads(previous.read_text())
old_network={str(r['instance_id']):round(r['download']+r['upload'],3) for r in old['instances']}
charges=budget.kit.charges(v,3)
current={}
for row in charges:
    source=str(row.get('source','')).removeprefix('instance-')
    for item in row.get('items') or []:
        if item.get('type') in ('bwd','bwu'):
            current[source]=current.get(source,0)+max(0,float(item.get('amount') or 0))
ledger=budget.read('vast-ledger.json',{'instances':{}})
changes=[]
for key,entry in ledger['instances'].items():
    if 'end_epoch' not in entry or key not in old_network:
        raise SystemExit('Missing ended-instance or previous billing proof')
    actual=round(current.get(key,0),3)
    if actual!=old_network[key]:raise SystemExit('Network charges still changing; keep conservative reserve')
    entry['network_reconciled_usd']=actual+.05
    entry['network_reconciliation']={'checked_epoch':time.time(),'actual_network_usd':actual,
        'additional_reserve_usd':.05,'verified_zero_epoch':cleanup['checked_epoch'],
        'previous_bill':'loadtest/results/scale-resume-billing-settled.json'}
    changes.append({'id':int(key),'original_reserve':entry['network_reserve_usd'],'ended_network_plus_buffer':actual+.05})
budget.write('vast-ledger.json',ledger)
result={'checked_epoch':time.time(),'task_instances':0,'other_instances':total,'changes':changes,
        'note':'Original historical estimates retained; full GPU+storage accrual retained. No running reserve reduced.'}
(ROOT/'loadtest/results/scale-resume-ended-reconciliation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
