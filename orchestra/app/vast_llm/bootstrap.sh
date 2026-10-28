#!/usr/bin/env bash
set -euo pipefail
echo $$ > /workspace/service.pid
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y git ninja-build cmake g++ pkg-config python3-pip libavformat-dev libavcodec-dev libavutil-dev libswscale-dev libhwloc-dev liburing-dev libcurl4-openssl-dev
cd /workspace
git clone https://github.com/Neroued/ninfer.git
cd ninfer
git rev-parse HEAD > /workspace/ninfer-revision.txt
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build -j 6
python3 -m pip install --break-system-packages 'huggingface_hub[cli]'
hf download neroued/Qwen3.8-27B-nvfp4-NInfer qwen3_8_27b_nvfp4.ninfer --local-dir /workspace/models
./build/apps/ninfer-serve --help > /workspace/ninfer-help.txt 2>&1
grep -q -- '--no-prefix-reuse' /workspace/ninfer-help.txt
# Bind locally; authenticated access travels through the authorized SSH tunnel.
# No API key is placed in process argv. Ports are not exposed publicly.
exec ./build/apps/ninfer-serve /workspace/models/qwen3_8_27b_nvfp4.ninfer \
  --host 127.0.0.1 --port 8080 --model-id saisai-qwen \
  --max-concurrency 4 --max-context 16384 --kv-capacity 65536 --kv-dtype fp8 \
  --device-state-slots 0 --host-context-mib 0 --no-prefix-reuse --media-cache-mib 0 \
  --no-thinking --default-max-tokens 1024 \
  --request-log-jsonl /workspace/ninfer-requests.jsonl
