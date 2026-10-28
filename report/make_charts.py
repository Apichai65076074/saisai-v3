#!/usr/bin/env python3
"""สร้าง report/latency_vs_users.(png|svg) จากไฟล์ผล load จริง (อ่านอย่างเดียว)

รัน:  python report/make_charts.py            (จาก root ของ repo)
ทุกจุดบนกราฟ = stages[].users / stages[].p95_ms ในไฟล์ JSON ที่ระบุใน SERIES
ไม่มีการแต่ง/ประมาณค่า: ขั้นที่ไม่ได้วัดจะไม่ถูกวาด
"""
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "orchestra" / "app" / "loadtest" / "results"
OUT = Path(__file__).resolve().parent
P95_LIMIT_S = 12  # loadtest/criteria.json: p95_ms 12000
TARGET_USERS = 200  # loadtest/criteria.json: target_users

# (ไฟล์, ป้าย, สี categorical slot, marker, linestyle)
SERIES = [
    ("mock-mix.json", "mock · cache เปิด (T20 · เสริม)", "#2a78d6", "o", "-"),
    ("mock-mix-nocache-pruned.json", "mock · cache ปิด (retrieval)", "#eb6834", "s", "-"),
    ("T22-mock-cold-tts.json", "mock · ปิด cache ทุกชั้น", "#1baf7a", "^", "-"),
    ("gpu-chat-nocache.json", "GPU baseline · chat (5090 Qwen)", "#6250d6", "D", "--"),
    ("gpu-stt-nocache-r2.json", "GPU baseline · stt (4090 Whisper)", "#e87ba4", "v", "--"),
    ("gpu-tts-nocache.json", "GPU baseline · tts (4090 VoxCPM2)", "#eda100", "P", "--"),
    # T23 (28/10): ×2 = 5090×2 + 4090 STT/TTS/rerank · ×4 = 5090×4 วัดเฉพาะ chat
    ("scale-x2-chat.json", "GPU ×2 · chat (5090×2)", "#008300", "D", "-."),
    ("scale-x2-tts.json", "GPU ×2 · tts (4090 แยก rerank)", "#b77b00", "P", "-."),
    ("scale-x4.json", "GPU ×4 · chat (5090×4)", "#0b0b0b", "X", "-."),
]


def load(name):
    d = json.loads((RES / name).read_text(encoding="utf-8"))
    pts = [(s["users"], s["p95_ms"] / 1000.0, bool(s.get("pass_strict", s.get("pass")))) for s in d["stages"]]
    return pts


def main():
    plt.rcParams["font.family"] = ["Tahoma", "Leelawadee UI", "DejaVu Sans"]
    plt.rcParams["svg.fonttype"] = "none"
    fig, ax = plt.subplots(figsize=(11, 6.2), dpi=160)
    for name, label, color, marker, ls in SERIES:
        pts = load(name)
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        ax.plot(xs, ys, ls, color=color, marker=marker, markersize=7, linewidth=2,
                markeredgecolor="#fcfcfb", markeredgewidth=1.2, label=label)
        for x, y, ok in pts:  # ขั้นที่ไม่ผ่านเกณฑ์ = วงแดงรอบจุด
            if not ok:
                ax.plot([x], [y], "o", markersize=13, markerfacecolor="none", markeredgecolor="#d03b3b", markeredgewidth=1.6)
    ax.axhline(P95_LIMIT_S, color="#d03b3b", linewidth=1.5, linestyle=":")
    ax.text(60, P95_LIMIT_S + 0.8, f"เกณฑ์ p95 = {P95_LIMIT_S} วิ", color="#52514e", fontsize=10)
    ax.axvline(TARGET_USERS, color="#52514e", linewidth=1, linestyle="-.")
    ax.text(TARGET_USERS * 0.97, 52, f"เป้า {TARGET_USERS} คน", color="#52514e", fontsize=10, ha="right")
    ax.set_xscale("log")
    ax.set_xticks([1, 2, 4, 8, 16, 32, 48, 100, 200, 250])
    ax.get_xaxis().set_major_formatter(matplotlib.ticker.ScalarFormatter())
    ax.set_ylim(0, 55)
    ax.set_xlabel("ผู้ใช้พร้อมกัน (สเกลลอการิทึม)")
    ax.set_ylabel("Delay p95 (วินาที)")
    ax.set_title("Delay p95 เทียบจำนวนผู้ใช้ — วงแดง = ขั้นที่ไม่ผ่านเกณฑ์ (error<1% และ p95≤12 วิ)", fontsize=11, loc="left")
    ax.grid(True, color="#e5e4df", linewidth=0.8)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.legend(loc="upper left", bbox_to_anchor=(0.0, 0.93), frameon=False, fontsize=8.5)
    fig.text(0.01, 0.005, "ที่มา: orchestra/app/loadtest/results/*.json (ตัวเลขทุกจุดอ่านจากไฟล์) · mock และ GPU ใช้ workload ต่างกัน (mix vs โหมดเดี่ยว) อ่านเทียบเส้นเกณฑ์ ไม่ใช่เทียบกันโดยตรง", fontsize=7.5, color="#52514e")
    fig.tight_layout(rect=(0, 0.02, 1, 1))
    for ext in ("png", "svg"):
        fig.savefig(OUT / f"latency_vs_users.{ext}", facecolor="#fcfcfb")
    print("wrote", OUT / "latency_vs_users.png", OUT / "latency_vs_users.svg")


if __name__ == "__main__":
    sys.exit(main())
