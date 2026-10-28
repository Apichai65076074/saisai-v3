"""Load private runtime config and CUDA library search path before Python imports."""
import glob
import json
import os
from pathlib import Path
import sys
import sysconfig

os.environ.update(json.loads(Path('/workspace/runtime-private.json').read_text()))
site = sysconfig.get_paths()['purelib']
paths = glob.glob(site+'/nvidia/*/lib') + [site+'/torch/lib', '/opt/conda/lib', '/usr/local/cuda/lib64']
os.environ['LD_LIBRARY_PATH'] = ':'.join(paths + [os.environ.get('LD_LIBRARY_PATH', '')])
Path('/workspace/service.pid').write_text(str(os.getpid()))
os.chdir('/workspace')
os.execv(sys.executable, [sys.executable, '-m', 'uvicorn', 'server:app', '--host', '0.0.0.0', '--port', '8000'])
