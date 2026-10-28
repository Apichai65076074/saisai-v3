#!/usr/bin/env python3
"""T22: markdown tables from loadtest/results/gpu-*.json + GPU telemetry CSV (no secrets). GPU200 per PROBLEM 9(ค)."""
import csv, json, math, sys
from datetime import datetime
from pathlib import Path
R = Path(__file__).resolve().parents[1] / 'results'
STATE = Path('/root/runs/saisai/state')
PRICE = {'llm': 0.53037, 'stt': 0.41389, 'tts': 0.41389}  # offer $/hr incl. disk (state/vast-offers-*.json)

def load(label):
    p = R / f'{label}.json'
    return json.loads(p.read_text()) if p.exists() else None

def ok_users(d):  # highest contiguous strict-pass stage; None when stage 1 fails
    best = None
    for s in d['stages']:
        if not s['pass_strict']: break
        best = s['users']
    return best

def table(label, title):
    d = load(label)
    if not d: return f'_{label}: not run_\n'
    c = d['config']
    out = [f'**{title}** · `{label}` · {c["started_at"]}–{c.get("finished_at")} · cache={c["cache"]} tts_cache={c["tts_cache"]} prefetch={c["prefetch"]} consumers={c["observed_consumers"]} questions={c["questions"]} seed={c["seed"]} unique={c["unique_questions"]} repeats={c["repeats"]} voice served/repeats={c["voice_questions"]["served"]}/{c["voice_questions"]["repeats"]}', '',
           '| users | n | err % | p50 s | p95 s | first audio p95 s | queue max C/S/T | publish/done | conservation | pass |', '|---:|---:|---:|---:|---:|---:|---|---|---|---|']
    for s in d['stages']:
        q, k = s['queue_max'], s['counts']
        fa = f'{s["first_audio_p95_ms"]/1000:.2f}' if s['first_audio_p95_ms'] else '–'
        out.append(f'| {s["users"]} | {s["n"]} | {100*s["error_rate"]:.2f} | {s["p50_ms"]/1000:.2f} | {s["p95_ms"]/1000:.2f} | {fa} | {q["chat"]}/{q["stt"]}/{q["tts"]} | {k["broker_chat_publish"]}/{k["chat_done"]} | {s["message_conservation"]} | {"ผ่าน" if s["pass_strict"] else "ไม่ผ่าน"} |')
    u = ok_users(d)
    out += ['', f'max_users_ok (strict, contiguous) = {u if u is not None else "unavailable (stage 1 failed)"} · stopped_on_failed_stage={c.get("stopped_on_failed_stage")}', '']
    return '\n'.join(out)

def gpu(role):
    p = STATE / f'vast-gpu-{role}.csv'
    rows = [r for r in csv.reader(p.open()) if len(r) == 6 and r[2].strip()[:1].isdigit()]
    used = [int(r[2].split()[0]) for r in rows]; util = [int(r[4].split()[0]) for r in rows]
    return f'{rows[0][1].strip()} · VRAM max {max(used)} / {rows[0][3].strip()} · util max {max(util)} % · samples {len(rows)}'

if __name__ == '__main__':
    for label, title in [('gpu-chat-nocache', 'chat r1 (GPU-1 5090 Qwen)'), ('gpu-stt-nocache', 'stt r1 (before health fix)'), ('gpu-stt-nocache-r2', 'stt r2 (primary)'),
                         ('gpu-tts-nocache', 'tts r1'), ('gpu-tts-nocache-rerank', 'tts + concurrent rerank (U_tts)'), ('gpu-voice-nocache', 'voice r1 (before 600-char cap)'),
                         ('gpu-voice-nocache-r2', 'voice r2 (primary)'), ('gpu-mix-scale-base-nocache', 'mix scale-base r1'), ('gpu-mix-scale-base-nocache-r2', 'mix scale-base r2'),
                         ('gpu-voice-tune-ttsprefetch1', 'SUPPLEMENTARY tuning TTS_PREFETCH=1 (voice)')]:
        print(table(label, title))
    for role in ('llm', 'stt', 'tts'): print(f'- {role}: {gpu(role)}')
    U = {'llm': ok_users(load('gpu-chat-nocache')), 'stt': ok_users(load('gpu-stt-nocache-r2')), 'tts': ok_users(load('gpu-tts-nocache-rerank'))}
    need = {'llm': 240, 'stt': 72, 'tts': 72}
    print('\n| role | GPU | users × share × 1.2 | measured U | GPU200 (estimate) | $/GPU/hr | $/hr |\n|---|---|---:|---:|---:|---:|---:|')
    total, missing = 0.0, False
    for role, name in [('llm', 'RTX 5090 Qwen'), ('stt', 'RTX 4090 Whisper large-v3'), ('tts', 'RTX 4090 VoxCPM2 + rerank')]:
        u = U[role]
        if not u:
            missing = True; print(f'| {role} | {name} | {need[role]} | unavailable (0) | unavailable | {PRICE[role]:.5f} | unavailable |'); continue
        n = math.ceil(need[role] / u); total += n * PRICE[role]
        print(f'| {role} | {name} | {need[role]} | {u} | ⌈{need[role]}/{u}⌉ = {n} | {PRICE[role]:.5f} | {n*PRICE[role]:.2f} |')
    print(f'| **รวม** | | | | | | **{"unavailable (TTS U=0); known part " if missing else ""}${total:.2f}/hr** |')
