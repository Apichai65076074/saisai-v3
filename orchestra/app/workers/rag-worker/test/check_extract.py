#!/usr/bin/env python3
"""ตรวจ extract.py กับต้นฉบับ data/facts/*.json (ไม่ต้องใช้ DB/embedder)

python3 workers/rag-worker/test/check_extract.py      → exit 0 = ผ่าน
- ทุกข้อความต้นฉบับของหน้า (หัวข้อ ย่อหน้า fact เซลล์ตาราง เชิงอรรถ) อยู่ใน chunk ของหน้าเดียวกัน (เทียบแบบไม่สนช่องว่าง)
- ทุก chunk: ไม่มี NUL/อักขระเสีย/สระลอย · มี page
- ตาราง LOG-026: chunk ที่มี B-500 + 24 มีชื่อตาราง + หัว 2 ชั้น "กล่อง > ใบ/กล่อง"
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent.parent
sys.path.insert(0, str(HERE.parent))
import pymupdf  # noqa: E402
import extract  # noqa: E402

WS = re.compile(r"\s+")


def norm(s):
    return WS.sub("", s)


def cell(c):
    return str(c.get("text", "")) if isinstance(c, dict) else str(c)


def page_strings(book, page, tables):
    facts = {f["id"]: f for f in book["facts"]}
    out = []
    for b in page["blocks"]:
        t = b["t"]
        if t in ("h1", "h2", "p", "note"):
            out.append(b["text"])
        elif t == "facts":
            out += [facts[i]["statement"] for i in b["ids"]]
        elif t == "table":
            spec = {**tables[b["cont_of"]], **b} if "cont_of" in b else b
            if "id" in b:
                tables[b["id"]] = b
            for row in spec.get("head", []) + spec["rows"]:
                out += [cell(c) for c in row]
            out += b.get("notes", [])
    return [s for s in out if s.strip()]


def main():
    bad = 0
    total_chunks = 0
    for fj in sorted((ROOT / "data" / "facts").glob("*.json")):
        book = json.loads(fj.read_text("utf-8"))
        pdf = ROOT / "docs" / "pdf" / book["file"]
        with pymupdf.open(pdf) as doc:
            out = extract.extract(doc, book["file"])
        chunks = out["chunks"]
        total_chunks += len(chunks)
        by_page = {}
        for c in chunks:
            assert c["page"] >= 1, c
            by_page.setdefault(c["page"], "")
            by_page[c["page"]] += norm(c["content"])
            probs = extract.thai_problems(c["content"])
            if probs:
                bad += 1
                print(f"  THAI {book['file']} p{c['page']}: {probs[:3]} :: {c['content'][:80]}")
        missing = []
        tables = {}
        for n, page in enumerate(book["pages"], start=1):
            for s in page_strings(book, page, tables):
                if norm(s) not in by_page.get(n, ""):
                    missing.append((n, s))
        maxlen = max(len(c["content"]) for c in chunks)
        print(f"{book['file']}: pages={out['pages']} chunks={len(chunks)} max_len={maxlen} missing={len(missing)}")
        for n, s in missing[:8]:
            print(f"  MISSING p{n}: {s[:90]}")
        bad += len(missing)
        if out["pages"] != book["pages_planned"]:
            print("  PAGE COUNT MISMATCH")
            bad += 1
        if book["file"] == "SS-LOGISTICS.pdf":
            hit = [c for c in chunks if c["kind"] == "table" and "B-500" in c["content"] and "ใบ/กล่อง: 24" in c["content"]]
            ok = hit and all("ตาราง 1.1" in c["content"] and "กล่อง > ใบ/กล่อง" in c["content"] for c in hit)
            print(f"  LOG-026 table chunk: {'OK' if ok else 'FAIL'}")
            if hit:
                print("   ", hit[0]["content"].replace("\n", "\n    "))
            bad += 0 if ok else 1
    print(f"total chunks={total_chunks} problems={bad}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
