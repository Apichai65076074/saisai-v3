#!/usr/bin/env python3
"""Copy and launch services, using only the toolkit-selected SSH key."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('toolkit', ROOT/'tools/vast-toolkit.py')
kit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kit)
role = sys.argv[1]
v = kit.client()
rows = kit.by_label(v, 'saisai-20261027-'+role)
if len(rows) != 1:
    raise SystemExit('Expected one instance for role')
iid = rows[0]['id']
env = dict(os.environ, VAST_LABEL_PREFIX='saisai-20261027-')


def call(action, *args):
    subprocess.run([sys.executable, str(ROOT/'tools/vast-toolkit.py'), action, '--id', str(iid), *args],
                   env=env, check=True)


if role.startswith('llm'):
    bootstrap = ROOT/'.vast-private/llm-bootstrap.sh'
    bootstrap.write_text((ROOT/'vast_llm/bootstrap.sh').read_text().replace('cmake --build build -j 6', 'cmake --build build --target ninfer-serve -j 6'))
    call('push', '--src', str(bootstrap), '--dst', '/workspace/bootstrap.sh')
    call('run', '--cmd', 'nohup bash /workspace/bootstrap.sh > /workspace/bootstrap.log 2>&1 < /dev/null & echo $! > /workspace/service.pid')
else:
    config = json.loads((ROOT/'.vast-private/runtime.json').read_text())
    runtime = {'AIBOX_API_KEY': config['api_key'], 'MODELS': 'stt' if role == 'stt' else 'rerank' if role == 'rerank' else 'tts',
               'WHISPER_MODEL': 'large-v3', 'HF_HUB_DISABLE_XET': '1'}
    private = ROOT/f'.vast-private/{role}.json'
    private.write_text(json.dumps(runtime))
    private.chmod(0o600)
    call('push', '--src', str(private), '--dst', '/workspace/runtime-private.json')
    call('push', '--src', str(ROOT/'vast_aibox/server.py'), '--dst', '/workspace/server.py')
    call('push', '--src', str(ROOT/'vast_aibox/launch.py'), '--dst', '/workspace/launch.py')
    bootstrap = ROOT/'vast_aibox/bootstrap.sh'
    if role == 'rerank':
        # Dedicated reranker needs no Whisper or VoxCPM package/model download.
        bootstrap = ROOT/'.vast-private/rerank-bootstrap.sh'
        bootstrap.write_text("#!/usr/bin/env bash\nset -euo pipefail\npython -m pip install 'fastapi>=0.115,<1' 'uvicorn>=0.30,<1' python-multipart soundfile 'sentence-transformers>=3,<6'\ncd /workspace\nexec python /workspace/launch.py\n")
    call('push', '--src', str(bootstrap), '--dst', '/workspace/bootstrap.sh')
    if role.startswith('tts'):
        call('push', '--src', str(ROOT/'voices'), '--dst', '/workspace/')
    # No credential in command arguments, shell environment output, or logs.
    command = "nohup python -c 'import json,os; os.environ.update(json.load(open(\"/workspace/runtime-private.json\"))); os.execv(\"/bin/bash\",[\"bash\",\"/workspace/bootstrap.sh\"])' > /workspace/bootstrap.log 2>&1 < /dev/null & echo $! > /workspace/service.pid"
    call('run', '--cmd', command)
print(json.dumps({'role': role, 'id': iid, 'bootstrap': 'started; health pending'}))
