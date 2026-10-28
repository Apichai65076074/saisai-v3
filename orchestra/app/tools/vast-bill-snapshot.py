#!/usr/bin/env python3
"""Sanitized per-instance network bill snapshot for vast-reconcile-ended.py (read-only)."""
import importlib.util
import json
from pathlib import Path
import time

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('budget',ROOT/'tools/vast-budget.py')
budget=importlib.util.module_from_spec(spec);spec.loader.exec_module(budget)
v=budget.kit.client(retry=1)
net={}
for row in budget.kit.charges(v,3):
    source=str(row.get('source','')).removeprefix('instance-')
    for item in row.get('items') or []:
        kind={'bwd':'download','bwu':'upload'}.get(item.get('type'))
        if kind:net.setdefault(source,{'download':0,'upload':0})[kind]+=max(0,float(item.get('amount') or 0))
ledger=budget.read('vast-ledger.json',{'instances':{}})
rows=[{'instance_id':int(k),'download':round(net.get(k,{}).get('download',0),3),'upload':round(net.get(k,{}).get('upload',0),3)} for k in ledger['instances']]
out={'instances':rows,'captured_epoch':time.time(),'note':'network-only snapshot (bwd/bwu) for ended-reserve reconciliation'}
(ROOT/'loadtest/results/scale-resume-billing-settled.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'instances':len(rows)}))
