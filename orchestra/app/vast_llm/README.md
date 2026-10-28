# T22 Qwen deployment

RTX5090, NInfer source build, Qwen3.8-27B NVFP4. `bootstrap.sh` records the
exact runtime revision and help output remotely before serving. Upstream:
https://github.com/Neroued/ninfer and its docs/serving.md. No binary distribution
is assumed. CUDA13.0 devel Ubuntu24.04 provides the sm_120a build toolchain.

Primary: max-concurrency4, context16384, shared KV65536, FP8 KV, no thinking,
no speculative backend. `--no-prefix-reuse` disables cross-request history
reads/writes; `--media-cache-mib 0` disables media retention. Only Chat Completions
is used; the Responses object store is not used. Tokenizer/model weights, CUDA
graphs and OS pages are not response reuse. Runtime command/help and repeated
requests with zero cached-token counters must be retained before a primary claim.

Remote LLM binds localhost8080. The designated SSH key forwards to localhost58080;
`tools/vast-gateway.py` supplies bearer authentication and streaming on58081.
Endpoint examples in reports use placeholders; credentials are generated into
ignored mode600 files and are never printed.

Run `python3 tools/vast-budget-test.py`; inspect SDK drift, voice and registered
SSH key first. All state paths are absolute `/root/runs/saisai/state/vast-*`.
Start `tools/vast-budget.py watch` in a detached process **before** create; renew
the controller lease every <300s. Handoff is at most600s. At projected/actual$12,
expired lease or unavailable billing, the guard destroys this run's labels and
verifies absence. `python3 tools/vast-budget.py cleanup` performs explicit cleanup.
The watchdog must remain alive until the last cleanup verification.

Create each role with `python3 tools/vast-create.py llm|stt|tts`, then provision
with `python3 tools/vast-provision.py ROLE`. This never creates a replacement set.
Offers are sorted by total hourly GPU+disk rate and saved before creation.
The shared$12 stop threshold includes T22/T23 labels and a$0.50 network reserve
per instance plus conservative time accrual, reconciled against billing API.
Actual network charges exceeding reserves supersede the conservative estimate.
