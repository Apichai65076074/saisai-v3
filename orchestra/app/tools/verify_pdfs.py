"""ตรวจ PDF ที่ make_pdfs.py สร้าง เทียบกับ data/facts/*.json (ดึงข้อความด้วย pypdf)

ใช้:  py tools/verify_pdfs.py [--seed N]

ตรวจต่อเล่ม
1. จำนวนหน้าใน PDF = pages_planned
2. ภาษาไทยไม่เพี้ยน: ทุกข้อความในต้นฉบับของหน้านั้น (หัวข้อ ย่อหน้า fact เซลล์ตาราง เชิงอรรถ) หาเจอในข้อความที่ดึงจากหน้าเดียวกัน
   และไม่มีอักขระเสีย (U+FFFD · Private Use Area · (cid:)
3. ทุกหน้ามีคำว่า "ข้อมูลทดสอบ" + เลขหน้า
4. สุ่ม 3 facts ต่อเล่ม → evidence ทุกตัวต้องอยู่ในหน้าที่อ้าง fact นั้น (และตรวจครบทุก fact เป็นข้อมูลเสริม)
"""
from __future__ import annotations

import json
import random
import re
import sys
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
FACTS_DIR = ROOT / "data" / "facts"
PDF_DIR = ROOT / "docs" / "pdf"

_WS = re.compile(r"\s+")
_BAD = re.compile(r"[�-]|\(cid:\d+\)")


def norm(s: str) -> str:
    return _WS.sub("", s)


def cell_text(cell) -> str:
    return str(cell.get("text", "")) if isinstance(cell, dict) else str(cell)


def page_strings(book: dict, page: dict, tables: dict) -> list[str]:
    """ข้อความต้นฉบับทุกชิ้นที่ต้องปรากฏในหน้านี้"""
    facts = {f["id"]: f for f in book["facts"]}
    out: list[str] = []
    for b in page["blocks"]:
        t = b["t"]
        if t in ("h1", "h2", "p", "note"):
            out.append(b["text"])
        elif t == "cover":
            out += [book["title"], book.get("subtitle", "")] + b.get("lines", [])
        elif t == "facts":
            out += [facts[i]["statement"] for i in b["ids"]]
        elif t == "table":
            spec = {**tables[b["cont_of"]], **b} if "cont_of" in b else b
            if "id" in b:
                tables[b["id"]] = b
            out.append(spec["title"])
            for row in spec.get("head", []) + spec["rows"]:
                out += [cell_text(c) for c in row]
            out += b.get("notes", [])
    return [s for s in out if s.strip()]


def fact_pages(book: dict) -> dict[str, list[int]]:
    where: dict[str, list[int]] = {}
    for n, page in enumerate(book["pages"], start=1):
        for b in page["blocks"]:
            ids = b.get("ids", []) if b["t"] == "facts" else b.get("facts", [])
            for fid in ids:
                where.setdefault(fid, []).append(n)
    return where


def check_book(book: dict, rng: random.Random) -> dict:
    pdf = PDF_DIR / book["file"]
    res = {"doc": book["doc"], "plan": book["pages_planned"], "real": 0, "facts": len(book["facts"]), "errors": [], "sample": []}
    if not pdf.exists():
        res["errors"].append("ไม่พบไฟล์ PDF")
        return res
    reader = PdfReader(str(pdf))
    texts = [p.extract_text() or "" for p in reader.pages]
    res["real"] = len(texts)
    if res["real"] != res["plan"]:
        res["errors"].append(f"จำนวนหน้า {res['real']} ≠ แผน {res['plan']}")
    if len(book["pages"]) != len(texts):
        res["errors"].append("จำนวนหน้าใน JSON ไม่เท่า PDF")
        return res
    ntexts = [norm(t) for t in texts]

    # 2) ภาษาไทยไม่เพี้ยน
    tables: dict = {}
    missing = 0
    checked = 0
    for n, page in enumerate(book["pages"], start=1):
        bad = _BAD.findall(texts[n - 1])
        if bad:
            res["errors"].append(f"หน้า {n}: อักขระเสีย {bad[:3]}")
        for s in page_strings(book, page, tables):
            checked += 1
            if norm(s) not in ntexts[n - 1]:
                missing += 1
                if missing <= 5:
                    res["errors"].append(f"หน้า {n}: ดึงข้อความไม่ตรง «{s[:40]}»")
    res["strings"] = (checked - missing, checked)

    # 3) ท้ายกระดาษทุกหน้า
    total = len(texts)
    for n, t in enumerate(ntexts, start=1):
        if "ข้อมูลทดสอบ" not in t:
            res["errors"].append(f"หน้า {n}: ไม่มีคำว่า ข้อมูลทดสอบ")
        page_no = f"หน้า{n}/{total}" if book.get("lang", "th") == "th" else f"Page{n}of{total}"
        if page_no not in t:
            res["errors"].append(f"หน้า {n}: ไม่มีเลขหน้า")

    # 4) facts
    where = fact_pages(book)
    ids = [f["id"] for f in book["facts"]]
    if len(set(ids)) != len(ids):
        res["errors"].append("fact id ซ้ำ")
    unplaced = [i for i in ids if i not in where]
    if unplaced:
        res["errors"].append(f"fact ไม่ได้วางในหน้าใด: {unplaced[:5]}")
    facts = {f["id"]: f for f in book["facts"]}

    def found(fid: str) -> bool:
        pages = where.get(fid, [])
        hay = "".join(ntexts[p - 1] for p in pages)
        return bool(pages) and all(norm(e) in hay for e in facts[fid]["evidence"])

    for fid in rng.sample(ids, 3):
        ok = found(fid)
        res["sample"].append((fid, where.get(fid, []), ok))
        if not ok:
            res["errors"].append(f"สุ่ม {fid}: หา evidence ไม่เจอ")
    all_ok = [fid for fid in ids if found(fid)]
    res["all_facts"] = (len(all_ok), len(ids))
    if len(all_ok) != len(ids):
        bad = [fid for fid in ids if fid not in set(all_ok)]
        res["errors"].append(f"fact หา evidence ไม่เจอ {len(bad)} ข้อ เช่น {bad[:5]}")
    return res


def main(argv: list[str]) -> int:
    seed = int(argv[argv.index("--seed") + 1]) if "--seed" in argv else random.SystemRandom().randrange(1, 10**6)
    rng = random.Random(seed)
    books = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(FACTS_DIR.glob("SS-*.json"))]
    results = [check_book(b, rng) for b in books]
    print(f"สุ่มด้วย seed {seed}\n")
    print("| เล่ม | หน้า (แผน/จริง) | จำนวน facts | ข้อความตรง | facts พบ | สุ่ม 3 facts | ผลตรวจ |")
    print("|---|---|---|---|---|---|---|")
    tp = tr = tf = 0
    for r in results:
        tp, tr, tf = tp + r["plan"], tr + r["real"], tf + r["facts"]
        s_ok, s_all = r.get("strings", (0, 0))
        f_ok, f_all = r.get("all_facts", (0, 0))
        sample = " ".join(f"{fid}(น.{','.join(map(str, pg))}){'✓' if ok else '✗'}" for fid, pg, ok in r["sample"])
        verdict = "✅ ผ่าน" if not r["errors"] else "❌ " + "; ".join(r["errors"][:3])
        print(f"| {r['doc']} | {r['plan']}/{r['real']} | {r['facts']} | {s_ok}/{s_all} | {f_ok}/{f_all} | {sample} | {verdict} |")
    ok = all(not r["errors"] for r in results)
    print(f"| **รวม {len(results)} เล่ม** | **{tp}/{tr}** | **{tf}** | | | | {'✅ ผ่านทั้งหมด' if ok else '❌ มีเล่มไม่ผ่าน'} |")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
