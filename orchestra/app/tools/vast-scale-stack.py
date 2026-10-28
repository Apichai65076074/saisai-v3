#!/usr/bin/env python3
"""Exclusive saisai3 stack switch. No credentials in argv or logs."""
import argparse
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage', choices=['x2', 'x4', 'x4chat', 'mock', 'config'])
    args = parser.parse_args()
    env = dict(os.environ)
    env.update(DATABASE_URL='postgres://ss:ss@db:5432/saisai', AMQP_URL='amqp://guest:guest@rabbitmq:5672',
               EMBED_URL='http://embedder:80', WEB_PORT='3600', MQ_UI_PORT='15672',
               EVAL_TOKEN='ss-eval', ALLOW_TEST_RESET='1', RERANK='on',
               CHAT_PREFETCH='4', STT_PREFETCH='4', TTS_PREFETCH='2',
               RAG_CANDIDATE_CACHE='off', TTS_CACHE='off', TTS_WARM='0')
    if args.stage == 'mock':
        env['MQ_PREFIX'] = ''
        return subprocess.call(['bash', 'loadtest/compose_mock.sh', 'up', '-d', '--remove-orphans',
                                '--scale', 'chat-worker=2', '--scale', 'stt-worker=1', '--scale', 'tts-worker=1'], cwd=ROOT, env=env)
    if args.stage == 'x4chat':
        # Chat-only x4: add the two extra chat workers to the running x2 stack (web untouched).
        config = json.loads((ROOT/'.vast-private/runtime.json').read_text())
        env.update(MODE='ai', MQ_PREFIX='T23_ai_', LLM_API_KEY=config['api_key'], AIBOX_API_KEY=config['api_key'])
        return subprocess.call(['docker', 'compose', '--env-file', '.env.example', '-f', 'docker-compose.yml', '-f', 'docker-compose.ai.yml',
                                '--profile', 'scale-x4', 'up', '-d', '--no-deps', 'chat-worker-3', 'chat-worker-4'], cwd=ROOT, env=env)
    config = json.loads((ROOT/'.vast-private/runtime.json').read_text())
    env.update(MODE='ai', MQ_PREFIX='T23_ai_', LLM_API_KEY=config['api_key'], AIBOX_API_KEY=config['api_key'])
    cmd = ['docker', 'compose', '--env-file', '.env.example', '-f', 'docker-compose.yml', '-f', 'docker-compose.ai.yml',
           '--profile', 'scale-x4' if args.stage == 'x4' else 'scale-x2']
    if args.stage == 'config':
        return subprocess.call(cmd+['config', '--quiet'], cwd=ROOT, env=env)
    cmd += ['up', '-d', '--scale', 'chat-worker=1', '--scale', 'tts-worker=2', '--scale', 'stt-worker='+('2' if args.stage == 'x4' else '1')]
    services = ['web', 'chat-worker', 'chat-worker-2', 'stt-worker', 'tts-worker']
    if args.stage == 'x4':
        cmd += ['--scale', 'tts-worker-2=2']
        services += ['chat-worker-3', 'chat-worker-4', 'tts-worker-2']
    return subprocess.call(cmd+services, cwd=ROOT, env=env)

if __name__ == '__main__':
    raise SystemExit(main())
