#!/usr/bin/env python3
"""Finite, supervised T23 deployment/load controller; always cleans up.

Heartbeat is coupled to this live process and the owning Codex PID/start ticks.
No detached unbounded heartbeat. Independent billing guard stops at $14.5; absolute cap $15.
"""
import datetime
import sys
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import threading
import time
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('budget',ROOT/'tools/vast-budget.py')
budget=importlib.util.module_from_spec(spec);spec.loader.exec_module(budget)
state=ROOT/'RUN/state'
state.mkdir(parents=True,exist_ok=True)
tag=os.environ.get('T23_RUN_TAG','r2')
prefix='T23-'+tag
start=time.time()
cutoff=datetime.datetime(2026,10,28,9,25,tzinfo=datetime.timezone.utc).timestamp()
# Finite worker lifetime, with cleanup starting five minutes before the 16:30 cutoff.
deadline=min(start+195*60,cutoff)
stop=threading.Event(); watchdog=None; registry_lock=threading.Lock()
# --resume-x2: adopt the live x2 set + independent watchdog of a superseded controller
# (handover keeps lease continuity); never creates instances.
resume='--resume-x2' in sys.argv
# --x4-chat: adopt the live x2 set after its four modes, then a chat-only x4 (adds llm-3/llm-4).
x4chat='--x4-chat' in sys.argv
resume=resume or x4chat


class Done(Exception):
    pass


class Adopted:
    def __init__(self,pid):
        self.pid=pid;self.ticks=lease_policy_ticks(pid)
    def poll(self):
        try:return None if lease_policy_ticks(self.pid)==self.ticks else 1
        except (FileNotFoundError,ProcessLookupError):return 1
    def terminate(self):
        if self.poll() is None:os.kill(self.pid,signal.SIGTERM)
    def wait(self,timeout=10):
        end=time.time()+timeout
        while self.poll() is None and time.time()<end:time.sleep(.2)


def lease_policy_ticks(pid):
    return Path(f'/proc/{int(pid)}/stat').read_text().split()[21]
result={'started_epoch':start,'deadline_epoch':deadline,'stage':'preflight','loads':[]}


def save():
    (state/'T23-controller.json').write_text(json.dumps(result,indent=2)+'\n')


lease_spec=importlib.util.spec_from_file_location('lease_policy',ROOT/'tools/vast-lease.py')
lease_policy=importlib.util.module_from_spec(lease_spec);lease_spec.loader.exec_module(lease_policy)
owner=lease_policy.owner


owner_pid,owner_ticks=owner()
controller_ticks=lease_policy.fingerprint(os.getpid())[0]
result.update(owner_pid=owner_pid,owner_start_ticks=owner_ticks,controller_pid=os.getpid())


def pulse():
    while not stop.is_set():
        try:
            ticks,_=lease_policy.fingerprint(owner_pid)
            if ticks!=owner_ticks or time.time()>=deadline:
                budget.write('vast-lease.json',{'stage':'controller-ended','expires_epoch':0})
                stop.set();return
            fresh=budget.read('vast-progress.json',{})
            if watchdog is not None and fresh.get('watchdog_pid')==watchdog.pid and time.time()-fresh.get('last_checked',0)>60:
                budget.write('vast-lease.json',{'stage':'watchdog-stale','expires_epoch':0});stop.set();return
            budget.write('vast-lease.json',{'stage':'T23-'+result['stage'],'expires_epoch':min(deadline,time.time()+300),
                'controller_pid':os.getpid(),'controller_start_ticks':controller_ticks,'owner_pid':owner_pid,'owner_start_ticks':owner_ticks,'deadline_epoch':deadline})
        except (FileNotFoundError,ProcessLookupError):
            budget.write('vast-lease.json',{'stage':'owner-ended','expires_epoch':0});stop.set();return
        stop.wait(30)


def call(argv,name,timeout=600,env=None):
    left=deadline-time.time()
    if left<=0:raise TimeoutError('Finite controller deadline reached')
    if watchdog is not None and watchdog.poll() is not None:
        raise RuntimeError('Independent budget watchdog exited before '+name)
    with (state/(name+'.log')).open('w') as log:
        child=subprocess.Popen(argv,cwd=ROOT,env=env,stdout=log,stderr=log,start_new_session=True)
        ticks=Path(f'/proc/{child.pid}/stat').read_text().split()[21]
        item={'pid':child.pid,'pgid':child.pid,'start_ticks':ticks,'started_epoch':time.time(),'log':name}
        with registry_lock:
            items=budget.read('vast-load-processes.json',[]);items.append(item);budget.write('vast-load-processes.json',items)
        child_deadline=time.time()+min(timeout,left)
        try:
            while child.poll() is None:
                fresh = budget.read('vast-progress.json', {})
                stale = watchdog is not None and time.time()-fresh.get('last_checked', 0)>60
                if stop.is_set() or stale or time.time()>=child_deadline or (watchdog is not None and watchdog.poll() is not None):
                    raise RuntimeError('Deadline/owner/watchdog stop during '+name)
                time.sleep(2)
            if child.returncode:raise RuntimeError(name+' failed: '+str(child.returncode))
        finally:
            if child.poll() is None:
                try:os.killpg(child.pid,signal.SIGTERM)
                except ProcessLookupError:pass
                try:child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid,signal.SIGKILL);child.wait()
            with registry_lock:
                items=budget.read('vast-load-processes.json',[])
                for entry in items:
                    if entry['pid']==child.pid and entry.get('start_ticks')==ticks:
                        entry.update(finished_epoch=time.time(),exit_code=child.returncode)
                budget.write('vast-load-processes.json',items)


def get(url,body=None,timeout=10):
    headers={}
    if body is not None:headers={'Content-Type':'application/json','Authorization':'Bearer '+runtime['api_key']}
    req=urllib.request.Request(url,data=json.dumps(body).encode() if body is not None else None,headers=headers)
    with urllib.request.urlopen(req,timeout=timeout) as response:return response.read(),dict(response.headers)


def deploy(*lanes):
    # One lane per GPU type: offers of one type are chosen sequentially (no duplicate
    # pick), while 5090 builds overlap with 4090 installs. Any lane failure aborts.
    errors=[]; first_up=threading.Event()
    def lane(roles,gated):
        try:
            if gated:
                # Do not pay for 4090s until the scarcer 5090 lane has a verified instance.
                while not first_up.wait(5):
                    if errors:return
            for role in roles:
                if errors:return
                call(['python3','tools/vast-create.py',role],prefix+'-create-'+role,timeout=720)
                call(['python3','tools/vast-provision.py',role],prefix+'-provision-'+role,timeout=300)
                with registry_lock:
                    result['last_provisioned']=role
                    result.setdefault('selected_offers',{})[role]=budget.read('vast-selected-'+role+'.json',{}).get('selected')
                    save()
                first_up.set()
        except BaseException as exc:errors.append(exc)
        finally:
            if not gated and errors:first_up.set()
    threads=[threading.Thread(target=lane,args=(list(roles),i>0)) for i,roles in enumerate(lanes)]
    for t in threads:t.start()
    for t in threads:t.join()
    if errors:raise errors[0]


def affordable(name,minutes):
    # Latest billing policy; project live burn plus five minutes of cleanup.
    progress=budget.bounded_call(budget.check,40,budget.kit.client(retry=1))
    projected=progress['actual_usd']+progress['burn_hr']*(minutes+5)/60
    result.setdefault('budget_gates',[]).append({'step':name,'actual_usd':progress['actual_usd'],'estimated_usd':progress['estimated_usd'],'burn_hr':progress['burn_hr'],'projected_usd':round(projected,5),'run':projected<14.4});save()
    return projected<14.4


def run_x4_chat():
    global deadline
    if '--x4-resume' in sys.argv:
        # Handover after llm-3/llm-4 were created+connected by a superseded x4 controller;
        # readiness gets a fresh window, the load itself stays capped at 20min.
        result['x4_decision']=budget.read('/root/runs/saisai/wt/T23/RUN/state/T23-controller-r7-x4-deploy.json',{}).get('x4_decision')
        result['stage']='x4-readiness';save()
        deadline=min(deadline,time.time()+33*60)
        return x4_ready_and_load()
    v=budget.kit.client(retry=1)
    # Chat mode never touches STT/TTS; release them (already measured) to save budget.
    for role in ('stt','tts'):
        subprocess.run(['python3','tools/vast-toolkit.py','destroy','--label','saisai-20261027-'+role,'--yes'],cwd=ROOT,
                       stdout=(state/(prefix+'-release-'+role+'.log')).open('w'),stderr=subprocess.STDOUT,timeout=120)
    os.environ.update(VAST_STAGE_ROLES='llm-1,llm-2,rerank',VAST_X4_ROLES='llm-3,llm-4',VAST_CONNECT_ROLES='llm-3,llm-4',VAST_SCALE='4')
    progress=budget.bounded_call(budget.check,40,v)
    selector_spec=importlib.util.spec_from_file_location('selector',ROOT/'tools/vast-select.py')
    selector=importlib.util.module_from_spec(selector_spec);selector_spec.loader.exec_module(selector)
    budget.bounded_call(selector.select,40,v,'RTX_5090',80,1.2,13.0)
    candidates=budget.read('vast-offers-RTX_5090.json',{}).get('offers',[])
    if len(candidates)<2:raise RuntimeError('Not enough distinct eligible LLM offers for x4 quote')
    rows,_=budget.bounded_call(budget.owned,40,v)
    kept=sum(float(r.get('dph_total') or 0) for r in rows)
    future=kept+float(candidates[0]['dph_total'])+float(candidates[1]['dph_total'])
    # Real kept burn + two fresh 5090 quotes over a 35min deploy+20min-load window, +$0.45 network/cleanup.
    projected=progress['actual_usd']+.45+future*35/60
    result['x4_decision']={'actual_usd':progress['actual_usd'],'kept_burn_hr':kept,'future_burn_hr':future,
        'quotes':[candidates[0],candidates[1]],'projected_usd_with_cleanup':round(projected,4)}
    if progress['actual_usd']>12.5 or projected>=14.4 or deadline-time.time()<35*60:
        result['x4_decision']['status']='SKIPPED';result['stage']='measured-x2-x4-skipped';save();return
    result['x4_decision']['status']='RUN';result['stage']='x4-deploy';result['x4_started_epoch']=time.time();save()
    deadline=min(deadline,time.time()+38*60)
    deploy(['llm-3','llm-4'])
    call(['python3','tools/vast-connect.py'],prefix+'-connect-x4',timeout=300)
    x4_ready_and_load()


def x4_ready_and_load():
    while True:
        try:
            for url in ('http://127.0.0.1:58089/health','http://127.0.0.1:58091/health'):get(url,timeout=3)
            break
        except Exception:
            if time.time()>deadline-21*60:raise TimeoutError('x4 LLM readiness left under 21min for the 20min load')
            time.sleep(10)
    global runtime
    runtime=json.loads((ROOT/'.vast-private/runtime.json').read_text())
    result['stage']='x4-stack';save()
    call(['python3','tools/vast-scale-stack.py','x4chat'],prefix+'-stack-x4chat',timeout=180)
    topology={'gpu_count':5,'llm5090':4,'stt4090':0,'tts4090':0,'rerank4090':1,'workers':{'chat':4,'stt':1,'tts':2},
        'note':'chat-only x4: STT/TTS GPUs released (unused by chat mode); x4 STT/TTS not measured',
        'prefetch':{'chat':4,'stt':4,'tts':2},'llm_max_concurrency_per_gpu':4,
        'selected_offers':{r:budget.read('vast-selected-'+r+'.json',{}).get('selected') for r in ('llm-1','llm-2','llm-3','llm-4','rerank')}}
    env=dict(os.environ,T23_RESOURCE_TOPOLOGY=json.dumps(topology),MODE='ai',MQ_PREFIX='T23_ai_',MQ_API='http://localhost:15672',TTS_CACHE='off',RAG_CANDIDATE_CACHE='off')
    result['stage']='x4-load-chat';save()
    cmd=['node','loadtest/run_load.mjs','--base','http://localhost:3600','--mode','chat','--users',os.environ.get('T23_X4_USERS','16,32,48,64,80'),
         '--stage-sec','120','--think-sec','30','--questions','rag770','--seed','20261027','--label','scale-x4','--stop-on-fail','--post']
    try:
        call(['python3','tools/vast-workload.py','--log',str(state/(prefix+'-load-x4.log')),'--',*cmd],prefix+'-workload-x4',timeout=20*60,env=env)
    except RuntimeError as exc:
        if ' failed: ' not in str(exc):raise
        result.setdefault('load_errors',{})['scale-x4']=str(exc)
    result['loads'].append('scale-x4');result['stage']='measured-x2-and-x4-chat';save()


if '--dry-run' in sys.argv:
    subprocess.run([sys.executable, 'tools/vast-lease-test.py'], check=True)
    subprocess.run([sys.executable, 'tools/vast-budget-test.py'], check=True)
    pulse_thread=threading.Thread(target=pulse,daemon=True);pulse_thread.start()
    for _ in range(100):
        if budget.read('vast-lease.json',{}).get('controller_pid')==os.getpid():break
        time.sleep(.01)
    assert lease_policy.valid(budget.read('vast-lease.json',{}),time.time())
    deadline=time.time()-1
    stop.wait(0.1)
    assert not lease_policy.valid(budget.read('vast-lease.json',{}),time.time()+301)
    stop.set()
    print(json.dumps({'dry_run':True,'owner_pid':owner_pid,'owner_start_ticks':owner_ticks,'hard_cutoff_epoch':cutoff,'no_sdk_or_rental':True}))
    sys.exit(0)

try:
    if deadline<=start:raise RuntimeError('User cutoff already reached')
    if resume:
        pulse_thread=threading.Thread(target=pulse,daemon=True);pulse_thread.start()
        watchdog=Adopted(budget.read('vast-progress.json',{})['watchdog_pid'])
        result.update(watchdog_pid=watchdog.pid,resumed_from=os.environ.get('T23_RESUMED_FROM'),selected_offers={r:budget.read('vast-selected-'+r+'.json',{}).get('selected') for r in ('llm-1','llm-2','stt','tts','rerank')});save()
    else:
      rows,total=budget.bounded_call(budget.owned,40,budget.kit.client(retry=1))
      if rows:raise RuntimeError('Reconcile existing instances before controller start')
      pulse_thread=threading.Thread(target=pulse,daemon=True);pulse_thread.start()
      with (state/(prefix+'-watchdog.log')).open('w') as log:
        watchdog=subprocess.Popen(['python3','tools/vast-budget.py','watch'],cwd=ROOT,stdout=log,stderr=log,start_new_session=True)
      result['watchdog_pid']=watchdog.pid;save()
      for _ in range(60):
        progress=budget.read('vast-progress.json',{})
        if progress.get('watchdog_pid')==watchdog.pid and time.time()-progress.get('last_checked',0)<60:break
        time.sleep(1)
      else:raise RuntimeError('Fresh watchdog not ready')
      result['stage']='x2-deploy';save()
      deploy(['llm-1','llm-2'],['stt','tts','rerank'])
      call(['python3','tools/vast-connect.py'],prefix+'-connect',timeout=300)
    if x4chat:
        run_x4_chat();raise Done
    result['stage']='x2-model-readiness';save()
    urls={'llm-1':'http://127.0.0.1:58081','llm-2':'http://127.0.0.1:58085',
          'stt':'http://127.0.0.1:58082','tts':'http://127.0.0.1:58083','rerank':'http://127.0.0.1:58086'}
    ready_deadline=min(deadline-15*60,start+65*60)
    while time.time()<ready_deadline:
        health={}
        for role,url in urls.items():
            try:
                raw,headers=get(url+'/health',timeout=3);health[role]=json.loads(raw)
            except Exception:health[role]=None
        result['health']=health;save()
        if all(health[k] for k in ('llm-1','llm-2','stt','rerank')):break
        if watchdog.poll() is not None or time.time()-budget.read('vast-progress.json',{}).get('last_checked',0)>60:
            raise RuntimeError('Independent watchdog stopped or stale during deployment')
        time.sleep(15)
    else:raise TimeoutError('Models not ready within finite setup deadline')
    runtime=json.loads((ROOT/'.vast-private/runtime.json').read_text())
    # Separate cold-generation proof; these requests are never counted as load.
    result['stage']='x2-provider-proof';save()
    proof={'health':result['health'],'speech':[]}
    call(['python3','tools/vast-scale-stack.py','x2'],prefix+'-stack-x2',timeout=180)
    for _ in range(60):
        try:
            raw,_=get('http://localhost:3600/api/health')
            if json.loads(raw).get('mode')=='ai':break
        except Exception:pass
        time.sleep(2)
    else:raise RuntimeError('AI web not ready')
    result['stage']='x2-load';save()
    topology={'gpu_count':5,'llm5090':2,'stt4090':1,'tts4090':1,'rerank4090':1,'workers':{'chat':2,'stt':1,'tts':2},'prefetch':{'chat':4,'stt':4,'tts':2},'llm_max_concurrency_per_gpu':4,'tts_execution_concurrency_per_gpu':1,'selected_offers':result.get('selected_offers',{}),'cache_audit':proof['health']}
    env=dict(os.environ,T23_RESOURCE_TOPOLOGY=json.dumps(topology),MODE='ai',MQ_PREFIX='T23_ai_',MQ_API='http://localhost:15672',TTS_CACHE='off',RAG_CANDIDATE_CACHE='off')
    def load(mode,label,users,minutes):
        if not affordable(label,minutes):return
        result['stage']='x2-load-'+mode;save()
        cmd=['node','loadtest/run_load.mjs','--base','http://localhost:3600','--mode',mode,'--users',users,
             '--stage-sec','120','--think-sec','30','--questions','rag770','--seed','20261027','--label',label,'--stop-on-fail','--post']
        try:
            call(['python3','tools/vast-workload.py','--log',str(state/(prefix+'-load-'+mode+'.log')),'--',*cmd],prefix+'-workload-'+mode,timeout=1500,env=env)
            result['loads'].append(label)
        except RuntimeError as exc:
            # Infrastructure stop (deadline/watchdog) propagates; a runner error is recorded and the next mode runs.
            if ' failed: ' not in str(exc):raise
            result.setdefault('load_errors',{})[label]=str(exc)
        save()
    # Ladders = base stage, 2xNbase, one above (mix/voice base 1, chat base 16); budget-limited.
    # T23_X2_MODES lets a resumed controller skip modes already measured on this x2 topology.
    modes=os.environ.get('T23_X2_MODES','chat,stt,tts,voice').split(',')
    if 'chat' in modes:load('chat','scale-x2-chat','1,2,4,8,16,32,48',14)
    if 'stt' in modes:load('stt','scale-x2-stt',os.environ.get('T23_STT_USERS','1,2,4,8,16,32,48'),14)
    result['stage']='x2-tts-readiness';save()
    while time.time()<min(deadline-20*60,start+65*60):
        try:
            raw,_=get(urls['tts']+'/health',timeout=3)
            proof['health']['tts']=json.loads(raw)
            break
        except Exception:time.sleep(10)
    else:raise TimeoutError('TTS setup did not finish within finite readiness budget')
    for _ in range(2):
        raw,headers=get(urls['tts']+'/v1/audio/speech',{'input':'สวัสดีค่ะ ยินดีต้อนรับสู่ใสใสกลาสแวร์ค่ะ','voice':'nongsai','language':'th'},timeout=150)
        if raw[:4]!=b'RIFF':raise RuntimeError('Provider proof did not produce WAV')
        proof['speech'].append({'bytes':len(raw),'cache_control':headers.get('Cache-Control'),'rtf':headers.get('X-RTF')})
    (ROOT/'loadtest/results/scale-x2-provider-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
    topology['cache_audit']=proof['health'];env['T23_RESOURCE_TOPOLOGY']=json.dumps(topology)
    if 'tts' in modes:load('tts','scale-x2-tts','1,2,4',6)
    if 'voice' in modes:load('voice','scale-x2-voice','1,2,4',6)
    cases=['C05','C08','C13','M01','M02','M03','M04','M05','M06','Q01','R01','T01','T02','V01','V02','V03']
    if os.environ.get('T23_AI16') == '1' and deadline-time.time()>3600 and affordable('x2-ai-rerun16',20):
        result['stage']='x2-ai-rerun16';save()
        try:
            call(['python3','tools/vast-workload.py','--cwd',str(ROOT/'e2e'),'--log',str(state/(prefix+'-ai16.log')),'--','npx','playwright','test',*[f'tests/{c}.spec.ts' for c in cases],'--workers=1','--reporter=json'],prefix+'-ai16-wrapper',timeout=1500,env=dict(env,SS_OUTPUT_DIR='test-results-ai-t23'))
            result['ai16_exit']=0
        except RuntimeError as exc:
            if 'failed: 1' not in str(exc):raise
            result['ai16_exit']=1
        save()
    if os.environ.get('T23_AI16') != '1': result['ai16_decision']='Optional rerun skipped to prioritize four requested load modes and x4 within total billing cap'
    progress=budget.bounded_call(budget.check,40,budget.kit.client(retry=1));result['cost_after_x2']=progress
    # Reserve the three additional GPU/network costs and a full 30min + cleanup.
    selector_spec=importlib.util.spec_from_file_location('selector',ROOT/'tools/vast-select.py')
    selector=importlib.util.module_from_spec(selector_spec);selector_spec.loader.exec_module(selector)
    v=budget.kit.client(retry=1)
    budget.bounded_call(selector.select,40,v,'RTX_5090',80,1.2,13.0)
    candidates=budget.read('vast-offers-RTX_5090.json',{}).get('offers',[])
    if len(candidates)<2:raise RuntimeError('Not enough distinct eligible LLM offers for x4 quote')
    mouth=budget.bounded_call(selector.select,40,v,'RTX_4090',50,.5,12.4)
    result['x4_offer_quotes']=[candidates[0],candidates[1],mouth]
    future_rate=sum(float(r['dph_total']) for r in result['x4_offer_quotes'])
    projected=progress['actual_usd']+.45+(progress['burn_hr']+future_rate)*40/60
    if progress['actual_usd']>12.5 or projected>=14.4 or deadline-time.time()<600:
        result['x4_decision']={'projected_usd_with_cleanup':projected,'status':'SKIPPED',
            'reason':'actual billing exceeds $12.5' if progress['actual_usd']>12.5 else 'projected cost exceeds $14.4 or less than 10min before cleanup'}
        result['stage']='measured-x2-x4-skipped';save()
    else:
        # Only load tests in x4; one finite 30min window includes adding GPUs.
        result['stage']='x4-deploy';result['x4_started_epoch']=time.time();save()
        deploy(['llm-3','llm-4'],['tts-2'])
        env4=dict(os.environ,VAST_SCALE='4')
        call(['python3','tools/vast-connect.py'],prefix+'-connect-x4',timeout=300,env=env4)
        extra=['http://127.0.0.1:58089/health','http://127.0.0.1:58091/health','http://127.0.0.1:58087/health']
        while time.time()<deadline-150:
            try:
                for url in extra:get(url,timeout=3)
                break
            except Exception:time.sleep(10)
        else:raise TimeoutError('x4 readiness exhausted its 30min window')
        call(['python3','tools/vast-scale-stack.py','x4'],prefix+'-stack-x4',timeout=180)
        topology.update(gpu_count=8,llm5090=4,tts4090=2,workers={'chat':4,'stt':2,'tts':4})
        topology['selected_offers']={role:budget.read('vast-selected-'+role+'.json',{}).get('selected') for role in ('llm-1','llm-2','llm-3','llm-4','stt','tts','tts-2','rerank')}
        env['T23_RESOURCE_TOPOLOGY']=json.dumps(topology)
        deadline=min(deadline,time.time()+20*60)
        cmd=['node','loadtest/run_load.mjs','--base','http://localhost:3600','--mode','chat','--users',os.environ.get('T23_X4_USERS','1,2,4,8,16,32,48,64,80'),
             '--stage-sec','120','--think-sec','30','--questions','rag770','--seed','20261027','--label','scale-x4','--stop-on-fail','--post']
        call(['python3','tools/vast-workload.py','--log',str(state/(prefix+'-load-x4.log')),'--',*cmd],prefix+'-workload-x4',timeout=1200,env=env)
        result['loads'].append('scale-x4');result['stage']='measured-x2-and-x4';save()
except Done:
    pass
except BaseException as exc:
    result['stage']='FAILED';result['failure']={'type':type(exc).__name__,'message':str(exc)};save()
finally:
    try:
        budget.bounded_call(budget.cleanup,40,budget.kit.client(retry=1))
        result['cleanup']=budget.read('vast-cleanup.json',{})
        # A second independent show_instances verification precedes guard shutdown.
        rows,total=budget.bounded_call(budget.owned,40,budget.kit.client(retry=1))
        result['cleanup_second_check']={'checked_epoch':time.time(),'task_instances':len(rows),'other_instances':total-len(rows)}
        if rows:raise RuntimeError('Cleanup second check failed')
        # Stop only helper PIDs opened and fingerprinted by this session's connector.
        helpers=budget.read('vast-local-processes.json',[])
        for item in helpers:
            if 'start_ticks' not in item or item.get('kind') not in ('tunnel','telemetry','gateway'):
                continue
            try:
                current=Path(f"/proc/{item['pid']}/stat").read_text().split()[21]
                if current==item['start_ticks']:
                    os.kill(item['pid'],signal.SIGTERM);item['stopped_epoch']=time.time()
            except (FileNotFoundError,ProcessLookupError):pass
        budget.write('vast-local-processes.json',helpers)
        if watchdog and watchdog.poll() is None:watchdog.terminate();watchdog.wait(timeout=10)
    except Exception as exc:
        result['cleanup_error_type']=type(exc).__name__
    if result.get('cleanup',{}).get('verified'):
        with (state/(prefix+'-mock-restore.log')).open('w') as log:
            result['mock_restore_exit']=subprocess.call(['python3','tools/vast-scale-stack.py','mock'],cwd=ROOT,stdout=log,stderr=log)
    stop.set()
    result['finished_epoch']=time.time();save()
print(json.dumps({'stage':result['stage'],'failure':result.get('failure'),'loads':result['loads'],'cleanup':result.get('cleanup')}))
