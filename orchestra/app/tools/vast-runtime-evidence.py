#!/usr/bin/env python3
"""Capture allowlisted runtime settings/counters only; credentials remain in memory."""
import json
from pathlib import Path
import subprocess
import time
import urllib.request
ROOT=Path(__file__).resolve().parents[1]
config=json.loads((ROOT/'.vast-private/runtime.json').read_text())
result={'captured_epoch':time.time(),'providers':{},'containers':[]}
for role,port in [('stt',58082),('tts',58083),('rerank',58086)]:
    item={}
    for route in ('health','metrics'):
        try:
            req=urllib.request.Request(f'http://127.0.0.1:{port}/{route}',headers={'Authorization':'Bearer '+config['api_key']})
            with urllib.request.urlopen(req,timeout=3) as response: body=json.load(response)
            keys=('status','models','response_cache','audio_cache','tts_execution_concurrency','stt_execution_concurrency','stt_decode','stt_recent_timings','upstream_calls')
            item[route]={k:body[k] for k in keys if k in body}
        except Exception as e:item[route]={'error_type':type(e).__name__}
    result['providers'][role]=item
ids=subprocess.check_output(['docker','ps','-q','--filter','label=com.docker.compose.project=saisai3'],text=True).split()
allowed={'MODE','MQ_PREFIX','TTS_CACHE','TTS_WARM','RAG_CANDIDATE_CACHE','CHAT_PREFETCH','STT_PREFETCH','TTS_PREFETCH','LLM_BASE_URL','STT_URL','TTS_URL','RERANK_URL'}
for iid in ids:
    obj=json.loads(subprocess.check_output(['docker','inspect',iid]))[0]
    env=dict(s.split('=',1) for s in obj['Config']['Env'] if '=' in s)
    result['containers'].append({'name':obj['Name'].lstrip('/'),'settings':{k:v for k,v in env.items() if k in allowed}})
p=ROOT/'loadtest/results/scale-final-runtime.jsonl'
with p.open('a') as f:f.write(json.dumps(result)+'\n')
print(json.dumps({'providers':result['providers'],'containers':len(result['containers'])}))
