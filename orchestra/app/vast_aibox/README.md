# Real speech/rerank adapter

FastAPI with bearer authentication. Public `/health`; authenticated
`/v1/audio/transcriptions`, `/v1/audio/speech`, `/v1/rerank`. MODELS=stt loads
faster-whisper large-v3; restart with WHISPER_MODEL=large-v3-turbo for the required
CER comparison. MODELS=tts,rerank loads openbmb/VoxCPM2 and
BAAI/bge-reranker-v2-m3. Semaphores4/2/4; one process per GPU.
VoxCPM has mutable batch1 autoregressive KV buffers. Admission/prefetch remains2;
execution of its single model is serialized for correctness. This is reported
as model execution concurrency1 and is part of the baseline capacity limitation.

VoxCPM2 reference is the authorized synthetic `voices/nongsai.wav`,10.894s
48kHz mono, and its transcript (not versioned: `voices/` is gitignored; copy the
user-provided `nongsai.wav`/`nongsai.txt` into `voices/` before deploying). The adapter uses the pinned official commit in UPSTREAM.json; PyPI1.5 was rejected for missing VoxCPM2Model. Startup requires VoxCPM2Model, CUDA and48kHz output. It passes reference/prompt paths per
request and does not memoize text, waveform or model results. Upstream API:
https://github.com/OpenBMB/VoxCPM#python-api . Model weights remain resident.
Runtime inspection must verify any internal model cache scope before declaring
all controllable caches disabled. TTS responses carry no-store, duration,
generation-seconds and RTF headers. No mock fallback exists in this adapter.

`python3 -m py_compile vast_aibox/server.py`; `bash -n vast_aibox/bootstrap.sh`.
GPU health and actual inference are separate prerequisites for AI measurement.

Transport uses temporary Cloudflare HTTPS for complete STT/TTS/rerank HTTP requests; bearer is checked by the adapter. LLM streaming stays on SSH. HTTP responses are no-store and observed CF-Cache-Status=DYNAMIC. Quick Tunnels have a200 in-flight request limit and are used for this benchmark, not as an availability guarantee. https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/

Readiness includes actual inference, sample-rate and model-class validation. Health alone cannot verify checkpoint/code compatibility. Old PyPI diagnostic audio is marked primary_eligible=false and excluded from all VoxCPM2 headline metrics.
