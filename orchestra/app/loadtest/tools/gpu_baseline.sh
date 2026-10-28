#!/usr/bin/env bash
# T22 primary GPU baseline (cache off · prefetch 4/4/2 · worker 1/1/1 · rag770). Run via tools/vast-workload.py
# so the budget watchdog can stop it. Each mode stops at the first failing stage; unmeasured stages are not reported.
# env: MODES="chat stt" · MIX=0|1 · SUFFIX=-r2 (never overwrite a previous label) · EXTRA="--tts-with-rerank"
set -u
cd "$(dirname "$0")/../.."
for l in ${MODES:-chat stt tts voice}; do [ -e "loadtest/results/gpu-$l-nocache${SUFFIX:-}.json" ] && { echo "label exists: $l${SUFFIX:-}"; exit 2; }; done
SEED=${SEED:-20261027}
for mode in ${MODES:-chat stt tts voice}; do
  node loadtest/run_load.mjs --base http://localhost:3600 --mode "$mode" --users 1,2,4,8,16,32 \
    --stage-sec 120 --think-sec 30 --questions rag770 --seed "$SEED" --label "gpu-$mode-nocache${SUFFIX:-}" ${EXTRA:-} --stop-on-fail --post
  echo "mode $mode exit $?"
done
if [ "${MIX:-1}" = 1 ]; then
  node loadtest/run_load.mjs --base http://localhost:3600 --mode mix --users 1,2,4,8,12,16,24,32,48 \
    --stage-sec 120 --think-sec 30 --questions rag770 --seed "$SEED" --label "gpu-mix-scale-base-nocache${SUFFIX:-}" --stop-on-fail --post
  echo "mode mix exit $?"
fi
