#!/usr/bin/env bash
set -euo pipefail
cd /workspace
python - <<'PY'
from pathlib import Path
import urllib.request
p = Path('/workspace/cloudflared')
if not p.exists():
    urllib.request.urlretrieve('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64', p)
p.chmod(0o700)
PY
./cloudflared --version > /workspace/cloudflared-version.txt
nohup ./cloudflared tunnel --no-autoupdate --protocol http2 --url http://127.0.0.1:8000 > /workspace/cloudflared.log 2>&1 < /dev/null &
echo $! > /workspace/cloudflared.pid
