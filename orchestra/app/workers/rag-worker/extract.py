#!/usr/bin/env python3
"""PDF → chunks สำหรับ RAG (T12) · PyMuPDF เท่านั้น (pypdf ทำสระ/วรรณยุกต์ไทยหาย)

ใช้:  python3 extract.py <file.pdf> [--pretty]      → JSON {pages, chunks:[{page, chunk_index, kind, content}]} ทาง stdout
      python3 extract.py - < file.pdf               (อ่าน PDF จาก stdin)

กติกา (PROBLEM 4.3 · สัญญากลางข้อ 8)
- ข้อความทั่วไป: chunk ~500 ตัวอักษร ซ้อน 80 · ต่อหน้า (page ของ chunk = หน้าที่ข้อความอยู่) · ขึ้น chunk ใหม่ที่หัวข้อ
  นำหน้าด้วย `[รหัสเอกสาร · หัวข้อ]` · ตัดหัว/ท้ายกระดาษที่ซ้ำทุกหน้า
- ตาราง: find_tables() ใช้แค่ "เรขาคณิต" (กรอบเซลล์ · เซลล์รวมมีกรอบใหญ่) แล้วดึงข้อความด้วย get_text(clip=…)
  (ข้อความจาก find_tables().extract() ทำสระไทยเลื่อน/หาย) → วางลง grid (เซลล์รวมเติมทุกช่องที่ครอบ)
  แถวหัว = แถวบนสุดที่ตัวอักษรเป็นตัวหนาทั้งแถว (1–3 ชั้น) → ชื่อคอลัมน์ `ชั้น1 > ชั้น2`
  1 chunk ตาราง = `[รหัสเอกสาร] <ชื่อตาราง>` + แถว `หัว: ค่า; …` (หลายแถวจนเต็ม ~500) + เชิงอรรถใต้ตาราง
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

import pymupdf

CHUNK = 500
OVERLAP = 80

# ---------------------------------------------------------------- ข้อความไทย
_THAI_MARK = set(chr(c) for c in [0x0E31, *range(0x0E34, 0x0E3B), *range(0x0E47, 0x0E4F)])
_THAI_BASE = re.compile(r"[ก-ะาำเ-ๆ]")
# glyph PUA ของฟอนต์ไทยบางตัว (Windows/Mac) → อักขระมาตรฐาน
_PUA = {
    0xF700: 0x0E10, 0xF701: 0x0E34, 0xF702: 0x0E35, 0xF703: 0x0E36, 0xF704: 0x0E37, 0xF705: 0x0E48,
    0xF706: 0x0E49, 0xF707: 0x0E4A, 0xF708: 0x0E4B, 0xF709: 0x0E4C, 0xF70A: 0x0E48, 0xF70B: 0x0E49,
    0xF70C: 0x0E4A, 0xF70D: 0x0E4B, 0xF70E: 0x0E4C, 0xF70F: 0x0E0D, 0xF710: 0x0E31, 0xF711: 0x0E4D,
    0xF712: 0x0E47, 0xF713: 0x0E48, 0xF714: 0x0E49, 0xF715: 0x0E4A, 0xF716: 0x0E4B, 0xF717: 0x0E4C,
    0xF718: 0x0E38, 0xF719: 0x0E39, 0xF71A: 0x0E3A,
}
_CTRL = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F�​﻿]")
_TONE = "่้๊๋"
_UPPER = "ัิีึื็ํ"


def clean(s: str) -> str:
    s = s.translate(_PUA)
    s = _CTRL.sub("", s)
    s = s.replace("ํา", "ำ")  # นิคหิต + า → ำ
    s = re.sub(r"[ \t]+([%s])" % "".join(_THAI_MARK), r"\1", s)  # ช่องว่างก่อนสระบน/ล่าง/วรรณยุกต์
    s = re.sub(r"([%s])([%s])" % (_TONE, _UPPER), r"\2\1", s)  # วรรณยุกต์ต้องอยู่หลังสระบน
    s = unicodedata.normalize("NFC", s)
    s = s.replace("‐", "-").replace("∙", "•")
    return s


def thai_problems(s: str) -> list[str]:
    """จุดที่สระ/วรรณยุกต์ลอย (ไม่มีพยัญชนะนำ) · อักขระเสีย · NUL"""
    out = []
    if "\x00" in s or "�" in s or re.search(r"[-]", s):
        out.append("bad-char")
    for i, ch in enumerate(s):
        if ch in _THAI_MARK:
            j = i - 1
            while j >= 0 and s[j] in _THAI_MARK:
                j -= 1
            if j < 0 or not _THAI_BASE.match(s[j]):
                out.append(f"floating {ch!r} @{i}")
    return out


def safe_cut(s: str, limit: int) -> int:
    """ตำแหน่งตัดที่ ≤ limit ไม่ตัดกลางกลุ่มอักษร · พยายามตัดที่ช่องว่าง/เครื่องหมาย"""
    if len(s) <= limit:
        return len(s)
    lo = int(limit * 0.6)
    for k in range(limit, lo, -1):
        if s[k - 1] in " \n·;,." and s[k] not in _THAI_MARK:
            return k
    k = limit
    while k > 1 and (s[k] in _THAI_MARK or s[k] in "ะาำๅ" or s[k - 1] in "เแโใไ"):
        k -= 1
    return k


def overlap_tail(s: str, n: int = OVERLAP) -> str:
    if len(s) <= n:
        return s
    k = len(s) - n
    # ขยับไปจุดเริ่มคำ/หลังช่องว่างที่ใกล้ที่สุด (ไม่เริ่มด้วยสระ/วรรณยุกต์)
    for j in range(k, min(len(s), k + 30)):
        if s[j - 1] == " ":
            return s[j:]
    while k < len(s) and (s[k] in _THAI_MARK or s[k] in "ะาำๅ" or s[k - 1] in "เแโใไ"):
        k += 1
    return s[k:]


def split_text(s: str, limit: int = CHUNK) -> list[str]:
    """ตัดข้อความยาวเป็นชิ้น ≤ limit ซ้อน OVERLAP"""
    parts, rest = [], s
    while len(rest) > limit:
        k = safe_cut(rest, limit)
        parts.append(rest[:k].strip())
        tail = overlap_tail(rest[:k])
        rest = (tail + rest[k:]) if len(tail) < k else rest[k:]
    if rest.strip():
        parts.append(rest.strip())
    return parts


# ---------------------------------------------------------------- อ่านหน้า
def norm_key(s: str) -> str:
    return re.sub(r"\d+", "#", re.sub(r"\s+", "", s))


def page_lines(page) -> list[dict]:
    out = []
    for b in page.get_text("dict")["blocks"]:
        for ln in b.get("lines", []):
            spans = [sp for sp in ln["spans"] if sp["text"].strip()]
            if not spans:
                continue
            text = clean("".join(sp["text"] for sp in ln["spans"])).strip()
            if not text:
                continue
            out.append({
                "text": text,
                "bbox": pymupdf.Rect(ln["bbox"]),
                "size": max(sp["size"] for sp in spans),
                "bold": all(("bold" in sp["font"].lower()) or (sp["flags"] & 16) for sp in spans),
            })
    out.sort(key=lambda l: (round(l["bbox"].y0 / 3), l["bbox"].x0))
    return out


def merge_lines(lines: list[dict]) -> list[dict]:
    """บรรทัดที่ y เดียวกัน (ต่างคอลัมน์ / span แยกกัน) → บรรทัดเดียว"""
    out: list[dict] = []
    for l in lines:
        if out and abs(out[-1]["bbox"].y0 - l["bbox"].y0) < 2.5 and abs(out[-1]["size"] - l["size"]) < 0.6 \
                and out[-1]["bold"] == l["bold"] and l["bbox"].x0 - out[-1]["bbox"].x1 < 40:
            out[-1] = {**out[-1], "text": out[-1]["text"] + " " + l["text"], "bbox": out[-1]["bbox"] | l["bbox"]}
        else:
            out.append(dict(l))
    return out


def running_keys(doc) -> set[str]:
    """ข้อความที่ซ้ำบนหน้ากระดาษ ≥ 60% ของหน้า (หัว/ท้ายกระดาษ · เลขหน้า)"""
    if doc.page_count < 3:
        return set()
    c: Counter = Counter()
    for p in doc:
        h = p.rect.height
        keys = {norm_key(l["text"]) for l in page_lines(p) if l["bbox"].y1 < h * 0.1 or l["bbox"].y0 > h * 0.9}
        c.update(keys)
    return {k for k, n in c.items() if n >= max(3, doc.page_count * 0.6)}


_NEW_PARA = re.compile(r"^(•|·|-|–|\d+(\.\d+)*[.)]\s|[ก-ฮ][.)]\s|ข้อ\s*\d|[¹²³⁴⁵*])")
_PAGE_NO = re.compile(r"^(หน้า|page)?\s*\d+\s*(/|of|จาก)\s*\d+$", re.I)


# ---------------------------------------------------------------- ตาราง
def _bounds(vals: list[float]) -> list[float]:
    vals = sorted(vals)
    out: list[float] = []
    for v in vals:
        if not out or v - out[-1] > 1.5:
            out.append(v)
    return out


def table_grid(page, tb, lines: list[dict]):
    """→ (grid[r][c] ข้อความ · header_rows) · เซลล์รวมเติมทุกช่องที่ครอบ"""
    cells = [pymupdf.Rect(c) for c in tb.cells if c]
    xs = _bounds([c.x0 for c in cells] + [c.x1 for c in cells])
    ys = _bounds([c.y0 for c in cells] + [c.y1 for c in cells])
    nr, nc = len(ys) - 1, len(xs) - 1
    if nr < 1 or nc < 1:
        return [], 0
    texts = {}
    grid = [["" for _ in range(nc)] for _ in range(nr)]
    owner = [[None for _ in range(nc)] for _ in range(nr)]
    for ci, c in enumerate(cells):
        t = texts.get(ci)
        if t is None:
            t = clean(page.get_text("text", clip=c)).strip()
            t = re.sub(r"\s*\n\s*", " ", t)
            texts[ci] = t
        for r in range(nr):
            ym = (ys[r] + ys[r + 1]) / 2
            if not (c.y0 - 0.5 <= ym <= c.y1 + 0.5):
                continue
            for k in range(nc):
                xm = (xs[k] + xs[k + 1]) / 2
                if c.x0 - 0.5 <= xm <= c.x1 + 0.5:
                    # กรอบเล็กกว่า (เซลล์จริง) ชนะกรอบใหญ่
                    prev = owner[r][k]
                    if prev is None or (c.width * c.height) < (cells[prev].width * cells[prev].height):
                        owner[r][k] = ci
                        grid[r][k] = t
    # แถวหัว = แถวบนสุดต่อเนื่องที่ทุกบรรทัดในแถวเป็นตัวหนา
    header_rows = 0
    for r in range(min(nr - 1, 3)):
        band = pymupdf.Rect(xs[0], ys[r], xs[-1], ys[r + 1])
        own = [l for l in lines if band.contains(l["bbox"].tl + (l["bbox"].br - l["bbox"].tl) * 0.5)]
        # เซลล์รวมแนวตั้งที่ข้อความอยู่ในแถวถัดไป: ดูข้อความของเซลล์จริงของแถวนี้
        row_cells = {owner[r][k] for k in range(nc) if owner[r][k] is not None}
        bold_ok = True
        for ci in row_cells:
            c = cells[ci]
            inside = [l for l in lines if c.contains(l["bbox"].tl + (l["bbox"].br - l["bbox"].tl) * 0.5)]
            if inside and not all(l["bold"] for l in inside):
                bold_ok = False
        if (own or row_cells) and bold_ok and any(grid[r]):
            header_rows = r + 1
        else:
            break
    if header_rows == 0 and nr > 1:
        header_rows = 1  # ไม่มีตัวหนา → ถือแถวแรกเป็นหัว
    return grid, header_rows


def column_names(grid, header_rows: int) -> list[str]:
    names = []
    for k in range(len(grid[0])):
        parts: list[str] = []
        for r in range(header_rows):
            t = grid[r][k]
            if t and (not parts or parts[-1] != t):
                parts.append(t)
        names.append(" > ".join(parts) or f"คอลัมน์ {k + 1}")
    return names


def row_texts(grid, header_rows: int) -> list[str]:
    names = column_names(grid, header_rows)
    rows = []
    for r in range(header_rows, len(grid)):
        cells = grid[r]
        if not any(cells):
            continue
        rows.append("; ".join(f"{names[k]}: {cells[k]}" for k in range(len(cells)) if cells[k]))
    return rows


# ---------------------------------------------------------------- เอกสาร
def extract(doc, filename: str) -> dict:
    code = Path(filename).stem
    skip = running_keys(doc)
    chunks: list[dict] = []
    h1 = h2 = ""
    body_size = None
    sizes = Counter()
    for p in doc:
        for l in page_lines(p):
            sizes[round(l["size"], 1)] += len(l["text"])
    if sizes:
        body_size = sizes.most_common(1)[0][0]

    def add(page_no: int, kind: str, content: str):
        content = content.strip()
        if content:
            chunks.append({"page": page_no, "kind": kind, "content": content})

    for pidx, page in enumerate(doc):
        pno = pidx + 1
        lines = [l for l in page_lines(page) if norm_key(l["text"]) not in skip and not _PAGE_NO.match(l["text"])]
        used = set()
        try:
            tables = page.find_tables().tables
        except Exception:  # noqa: BLE001 — หน้าเสีย → อ่านเป็นข้อความ
            tables = []
        table_items = []  # (y0, kind, payload)
        for tb in tables:
            box = pymupdf.Rect(tb.bbox)
            grid, hr = table_grid(page, tb, lines)
            if not grid or len(grid[0]) < 2 or len(grid) < 2:
                continue
            for i, l in enumerate(lines):
                if box.intersects(l["bbox"]) and (l["bbox"] & box).get_area() >= 0.5 * l["bbox"].get_area():
                    used.add(i)
            # ชื่อตาราง = บรรทัดตัวหนาที่อยู่ติดเหนือตาราง
            title = ""
            above = [(i, l) for i, l in enumerate(lines) if i not in used and l["bbox"].y1 <= box.y0 + 1 and box.y0 - l["bbox"].y1 < 30]
            if above:
                i, l = max(above, key=lambda t: t[1]["bbox"].y1)
                if l["bold"] or re.match(r"^(ตาราง|table)\s", l["text"], re.I):
                    title = l["text"]
                    used.add(i)
            # เชิงอรรถ/หมายเหตุ = บรรทัดตัวเล็กติดใต้ตาราง (หรือขึ้นต้น ¹ ² * หมายเหตุ)
            notes = []
            y = box.y1
            for i, l in sorted(((i, l) for i, l in enumerate(lines) if i not in used and l["bbox"].y0 >= box.y1 - 1),
                               key=lambda t: t[1]["bbox"].y0):
                if l["bbox"].y0 - y > 20:
                    break
                small = body_size is not None and l["size"] < body_size - 0.4 and not l["bold"]
                if small or re.match(r"^[¹²³⁴⁵*†]|^(หมายเหตุ|note)", l["text"], re.I):
                    notes.append(l["text"])
                    used.add(i)
                    y = l["bbox"].y1
                else:
                    break
            if not title:
                title = f"ตาราง (หน้า {pno})"
            table_items.append((box.y0, "table", (title, row_texts(grid, hr), notes, h1, h2)))

        # ข้อความทั่วไป: ย่อหน้าตามลำดับ y · หัวข้อ = ตัวหนาที่ใหญ่กว่าเนื้อหา
        # บรรทัดที่ตัดคำ (wrap) ของย่อหน้าเดียวกัน → รวมเป็นย่อหน้าเดียว (ไม่ให้ประโยคขาดกลาง chunk)
        flow = []
        for i, l in enumerate(lines):
            if i in used:
                continue
            if flow:
                p = flow[-1][2]
                gap = l["bbox"].y0 - p["bbox"].y1
                if (p["bold"] == l["bold"] and abs(p["size"] - l["size"]) < 0.3 and -1 < gap < 0.8 * l["size"]
                        and not _NEW_PARA.match(l["text"]) and l["bbox"].x0 >= p["bbox"].x0 - 2
                        and not (p["bold"] and body_size is not None and p["size"] >= body_size + 1)):
                    flow[-1] = (flow[-1][0], "line", {**p, "text": p["text"] + " " + l["text"], "bbox": p["bbox"] | l["bbox"]})
                    continue
            flow.append((l["bbox"].y0, "line", dict(l)))
        items = sorted(flow + table_items, key=lambda t: t[0])

        buf: list[str] = []

        def flush():
            nonlocal buf
            text = " ".join(buf).strip()
            buf = []
            if not text:
                return
            prefix = f"[{code}" + (f" · {h2 or h1}" if (h2 or h1) else "") + "] "
            for part in split_text(text, CHUNK):
                add(pno, "text", prefix + part)

        prev_y1 = None
        for _, kind, it in items:
            if kind == "table":
                if buf and len(buf) == 1 and buf[0] == (h2 or h1):
                    buf = []  # หัวข้อเดี่ยว ๆ ก่อนตาราง → ไปอยู่ในหัว chunk ตารางแทน
                flush()
                title, rows, notes, _h1, _h2 = it
                sec = h2 or h1
                head = f"[{code}" + (f" · {sec}" if sec and sec not in title else "") + f"] {title}"
                note_txt = "\n".join(notes)
                cur: list[str] = []
                for row in rows:
                    size = len(head) + sum(len(x) + 1 for x in cur) + len(row) + len(note_txt)
                    if cur and size > CHUNK + 150:
                        add(pno, "table", "\n".join([head, *cur] + ([note_txt] if note_txt else [])))
                        cur = []
                    cur.append(row)
                if cur or not rows:
                    add(pno, "table", "\n".join([head, *cur] + ([note_txt] if note_txt else [])))
                prev_y1 = None
                continue
            l = it
            is_heading = l["bold"] and body_size is not None and l["size"] >= body_size + 1 and len(l["text"]) < 120
            if is_heading:
                flush()
                if l["size"] >= body_size + 3:
                    h1, h2 = l["text"], ""
                else:
                    h2 = l["text"]
                buf.append(l["text"])
                prev_y1 = l["bbox"].y1
                continue
            # ย่อหน้าใหม่ (bullet) ไม่ต้อง flush — รวมได้จนเต็ม chunk
            if buf and sum(len(x) + 1 for x in buf) + len(l["text"]) > CHUNK:
                text = " ".join(buf)
                flush()
                buf = [overlap_tail(text)] if len(text) > OVERLAP else []
            buf.append(l["text"])
            prev_y1 = l["bbox"].y1
        flush()

    for i, c in enumerate(chunks):
        c["chunk_index"] = i
    return {"pages": doc.page_count, "chunks": chunks}


def extract_bytes(data: bytes, filename: str) -> dict:
    with pymupdf.open(stream=data, filetype="pdf") as doc:
        return extract(doc, filename)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    src = argv[1]
    name = argv[argv.index("--name") + 1] if "--name" in argv else (Path(src).name if src != "-" else "upload.pdf")
    data = sys.stdin.buffer.read() if src == "-" else Path(src).read_bytes()
    out = extract_bytes(data, name)
    json.dump(out, sys.stdout, ensure_ascii=False, indent=2 if "--pretty" in argv else None)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
