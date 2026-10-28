## ORCHESTRATOR 22:57 — watchdog freshness failure
Independent inventory found 57981212 offline, central watchdog last_checked remained stale for multiple minutes. Orchestrator invoked label-scoped budget cleanup directly. BEFORE RENTING AGAIN: fix a hard wall-clock timeout around SDK inventory+billing check (not just request timeout which SDK may ignore). Watchdog must enforce <=60s freshness itself; controller must abort and cleanup if central last_checked>60s, even if watchdog PID is alive. Do not continue paid attempts with a live but stuck watchdog. Apply targeted test for blocked/hung billing, cleanup independent of hung check. Preserve honest evidence of failures.

## Orchestrator 22:45: recent offline/SSH failure
Avoid repeating unavailable/offline hosts. Track failed machine_id and offer IDs for this run, exclude failed hosts for new selection while respecting verified/reliability/price rules. Latest selections: [{"id": 47994460, "machine_id": 144978, "geolocation": "South Korea, KR"}, {"id": 48989562, "machine_id": 148838, "geolocation": "South Korea, KR"}]
Do not assume stale vast-progress ids imply live inventory; refresh budget/progress after verified cleanup. Retain exact failure evidence and continue only with feasible budget.

## Orchestrator controller review 22:21
Read tools/vast-scale-controller.py: x4_decision currently always SKIPPED even if estimated<10 and projected<12, due to old positive-baseline blocker. This contradicts the 21:35 authorization. Fix before reaching that decision: if budget permits, implement actual x4 additions + load-only <=30min; Nbase=0 suppresses ratio claim only, not authorized capacity measurement. Use freshly selected actual offer rates rather than max caps for stage feasibility; report conservative projected cost if skipping. Also preserve raw failed-stage load results and continue other requested modes if run_load exits nonzero solely because capacity criteria failed; distinguish failed measurement from infrastructure failure.

## Orchestrator follow-up after lease cleanup
Before any retry create, resolve controller lease expiry during long provision/build commands. Keep <=300s lease and $12 fail-closed budget guard; use a supervised controller heartbeat tied to live worker PID/start ticks and a finite deployment deadline, or ensure every long operation periodically heartbeats while its owning worker is live. Do not run a detached infinite heartbeat that defeats dead-worker cleanup. Orchestrator checks running state every loop and can maintain lease only while this worker is alive and making progress. New rental remains authorized within cumulative budget; do not end BLOCKED merely because first attempt lost its lease. First verify zero instances, reconcile settled spend, estimate remaining installation+measurement+cleanup costs honestly, then either retry feasible fresh x2 or stop with concrete budget evidence. Do not alter required tests/goldens.

# CURRENT ORCHESTRATOR UPDATE — 27/10 21:39 +07
User authorization 21:35 overrides old baseline-only/no-replacement/N=0 blockers. Proceed with the authorized fresh x2 topology; N=0 remains honest comparison provenance, not a reason to refuse authorized measurement.
T23 is exclusive=true in central tasks.json: use saisai3 Compose at :3600 as needed, then restore mock. Dev infra was intentionally shut down after export; use own exclusive Compose rather than assuming shared dev services.
Authoritative central RUN=/root/runs/saisai. Latest ledger is there; copies below are for reference. Budget/watchdog state must use absolute central RUN, preserve prior ended instances and settled charges. Reconcile live billing (worker obtained $5.088) before rental; combined $10 skip x4, $12 stop+destroy, x4 load only <=30min.
Authorized Windows TTS voices copied to this worktree voices/nongsai.wav and voices/nongsai.txt from app/voices; do not ask user again.
x2 = 5090 x2 LLM + 4090 STT + 4090 TTS + 4090 rerank. x4 adds 5090 x2 and 4090 TTS x1. Main load cache off including TTS, unique rag770. Current live independent check instance_count=0.
Old handoff below is historical; old instance IDs and watchdog PIDs are destroyed/dead. Do not renew old lease as evidence of a new live watchdog.

# T22 → T23 handoff (sanitized · no secrets) · 27/10/2026 14:31 +07

Baseline set kept (user rule: T23 adds ×2/×4 to THIS set, never rents a new set). Lease = handoff mode, **expires 10 min**
after T22's final heartbeat; if T23 has not renewed by then the watchdog destroys all three and verifies show_instances.

| role | label | instance | GPU | $/hr (GPU+disk) | created (+07) | local endpoint |
|---|---|---|---|---:|---|---|
| llm | saisai-20261027-llm | 57914113 | RTX 5090 · Qwen NInfer --max-concurrency 4 · history off | 0.53037 | 10:59:16 | SSH tunnel 127.0.0.1:58080 → gateway :58081 (compose `host.docker.internal:58081/v1`) |
| stt | saisai-20261027-stt | 57914254 | RTX 4090 · faster-whisper large-v3 | 0.41389 | 11:00:49 | Cloudflare quick tunnel HTTPS (URL only in .env.aibox) |
| tts | saisai-20261027-tts | 57914350 | RTX 4090 · VoxCPM2 git cce58a5 + bge-reranker-v2-m3 | 0.41389 | 11:01:37 | Cloudflare quick tunnel HTTPS (URL only in .env.aibox) |

- burn $1.35815/hr · billing actual $4.889 · conservative estimate $6.259 (incl. network reserve) · headroom to $12 = **$5.74** (T22+T23 combined)
- watchdog: PID 322880 (`tools/vast-budget.py watch`, every 30 s, billing + reserve, stops at $12 projected, fail-closed) · lease file `vast-lease.json`
- T23 must immediately: `python3 /root/runs/saisai/wt/T22/tools/vast-budget.py heartbeat --stage T23-<step>` (every ≤ 4 min; `--handoff` = 10 min) and run paid workloads via `tools/vast-workload.py`
- SSH: env name `VAST_SSH_KEY_FILE` only (toolkit reads it in-process); no other key. Credentials never in logs/git.
- local helper PIDs (tunnels/telemetry/gateway): `vast-local-processes.json` (entries without `stopped`)
- stack: `MQ_PREFIX=T22_ai_ MQ_UI_PORT=15673 docker compose -f docker-compose.yml -f docker-compose.ai.yml --env-file .env.example --env-file .env.vast --env-file .env.aibox up -d` (worktree T22) · chat/stt/tts worker 1/1/1 · prefetch 4/4/2 · cache off
- baseline results T23 can reuse (do not re-measure): loadtest/results/gpu-*-nocache*.json · U_chat 16 · U_stt 16 (r2) · U_tts 0 · U_voice 1 · mix scale-base 1 (r1) / 0 (r2)
- cleanup (all task instances, never other labels): `python3 /root/runs/saisai/wt/T22/tools/vast-budget.py cleanup` → `vast-cleanup.json` verified=true, then `python3 tools/vast-toolkit.py sweep --label-prefix saisai-20261027-` must list 0. T23 does the final destroy + verify 0.
