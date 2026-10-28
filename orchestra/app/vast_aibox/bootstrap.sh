#!/usr/bin/env bash
set -euo pipefail
echo $$ > /workspace/service.pid
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ffmpeg libsndfile1 git build-essential
python -m pip install 'brotli>=1.2'
if [[ "$MODELS" == stt ]]; then
  python -m pip install 'fastapi>=0.115,<1' 'uvicorn>=0.30,<1' python-multipart soundfile 'faster-whisper>=1.1,<2'
else
  python -m pip install 'fastapi>=0.115,<1' 'uvicorn>=0.30,<1' python-multipart soundfile 'sentence-transformers>=3,<6' sortedcontainers
  python -m pip install 'git+https://github.com/OpenBMB/VoxCPM.git@cce58a5b59303c9bd63d12f23afe6a49a4a80c59'
fi
cd /workspace
exec python /workspace/launch.py
