#!/usr/bin/env bash
# Append docker stats (CPU%) of the saisai3 containers every 5s as JSON lines until killed.
out=${1:?output.jsonl}
while true; do
  docker stats --no-stream --format '{"at":"'"$(date -Is)"'","name":"{{.Name}}","cpu":"{{.CPUPerc}}"}' $(docker ps -q --filter label=com.docker.compose.project=saisai3) >> "$out"
  sleep 5
done
