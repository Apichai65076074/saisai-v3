"""สร้าง PDF ความรู้ร้านใสใส จาก data/facts/*.json → docs/pdf/<file>

ใช้:  py tools/make_pdfs.py            (ทุกเล่ม)
      py tools/make_pdfs.py SS-POLICY  (เฉพาะเล่ม)

เนื้อหาทั้งหมดอยู่ใน JSON (โครงหน้าแต่ละหน้ากำหนดไว้ใน "pages") — โค้ดนี้ทำแค่จัดหน้า
- ฝังฟอนต์ Tahoma (C:\\Windows\\Fonts) · ข้อความเป็น text ดึงออกได้
- ทุกหน้ามีท้ายกระดาษ "ข้อมูลทดสอบ · ร้านสมมติ" + เลขหน้า
- จำนวนหน้าต้องเท่า pages_planned · เนื้อหาล้นหน้า = error (ไม่ตัดเงียบ)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent
FACTS_DIR = ROOT / "data" / "facts"
OUT_DIR = ROOT / "docs" / "pdf"
FONT_DIR = Path("C:/Windows/Fonts")

pdfmetrics.registerFont(TTFont("Th", str(FONT_DIR / "tahoma.ttf")))
pdfmetrics.registerFont(TTFont("ThB", str(FONT_DIR / "tahomabd.ttf")))

PAGE_W, PAGE_H = A4
M_LEFT, M_RIGHT = 56, 56
TOP = PAGE_H - 70          # ใต้หัวกระดาษ
BOTTOM = 62                # เหนือท้ายกระดาษ
WIDTH = PAGE_W - M_LEFT - M_RIGHT

INK = HexColor("#1f2933")
MUTED = HexColor("#5f6b7a")
ACCENT = HexColor("#0b6e8a")
HEAD_BG = HexColor("#dcecf1")
HEAD_BG2 = HexColor("#eef6f8")
NOTE_BG = HexColor("#fff6e0")
NOTE_BORDER = HexColor("#e0b84c")
RULE = HexColor("#9aa5b1")

FOOTER = {
    "th": ("ข้อมูลทดสอบ · ร้านสมมติ", "หน้า {n} / {total}"),
    "en": ("ข้อมูลทดสอบ · ร้านสมมติ · Test data · fictitious shop", "Page {n} of {total}"),
}
COMPANY = {
    "th": "บจก. ใสใส กลาสแวร์ (ร้านสมมติ)",
    "en": "SaiSai Glassware Co., Ltd. (fictitious)",
}
TOC_TITLE = {"th": "สารบัญ", "en": "Contents"}
CONT = {"th": " (ต่อ)", "en": " (continued)"}


class LayoutError(Exception):
    pass


# ------------------------------------------------------------------ ตัดบรรทัดภาษาไทย
# สระบน/ล่าง วรรณยุกต์ ไม้หันอากาศ ฯลฯ ต้องติดพยัญชนะตัวหน้า · สระหน้า (เ แ โ ใ ไ) ต้องติดตัวถัดไป
_COMBINING = set("\u0e31\u0e33\u0e34\u0e35\u0e36\u0e37\u0e38\u0e39\u0e3a\u0e47\u0e48\u0e49\u0e4a\u0e4b\u0e4c\u0e4d\u0e4e")
_LEADING = set("\u0e40\u0e41\u0e42\u0e43\u0e44")


def clusters(word: str) -> list[str]:
    out: list[str] = []
    pending = ""
    for ch in word:
        if ch in _COMBINING and out and not pending:
            out[-1] += ch
        elif ch in _LEADING:
            pending += ch
        else:
            out.append(pending + ch)
            pending = ""
    if pending:
        out.append(pending)
    return out


def text_w(s: str, font: str, size: float) -> float:
    return pdfmetrics.stringWidth(s, font, size)


# ------------------------------------------------------------------ วาดข้อความไทย (ไม่มี shaping engine)
# Tahoma วางวรรณยุกต์ที่ระดับล่างเสมอ → ถ้าตามหลังสระบนหรือนำหน้า ำ จะทับกัน จึงยกขึ้นด้วย text rise (Ts)
# พยัญชนะหางสูง (ป ฝ ฟ ฬ) เลื่อนเครื่องหมายบนไปซ้ายด้วย char space (Tc) · ลำดับอักขระใน PDF ยังเป็นลำดับตรรกะ → ดึงข้อความได้ตรง
_UPPER = set("ัิีึื็ํ")
_TONE = set("่้๊๋์")
_ABOVE = _UPPER | _TONE
_BELOW = set("ฺุู")
_ASCENDER = set("ปฝฟฬ")
RISE, SHIFT = 0.24, 0.11


def check_glyphs(s: str, font: str) -> None:
    cmap = pdfmetrics.getFont(font).face.charToGlyph
    missing = sorted({ch for ch in s if ord(ch) not in cmap})
    if missing:
        raise LayoutError(f"ฟอนต์ {font} ไม่มีอักขระ {missing} ใน «{s[:40]}»")


def draw_text(c, x: float, y: float, s: str, font: str, size: float, align: str = "left") -> None:
    check_glyphs(s, font)
    if align == "center":
        x -= text_w(s, font, size) / 2
    elif align == "right":
        x -= text_w(s, font, size)
    t = c.beginText(x, y)
    t.setFont(font, size)
    buf = ""
    i, n = 0, len(s)
    while i < n:
        ch = s[i]
        if ch in _ASCENDER and i + 1 < n and s[i + 1] in _ABOVE:
            j = i + 1
            while j < n and (s[j] in _ABOVE or s[j] in _BELOW):
                j += 1
            if buf:
                t.textOut(buf)
                buf = ""
            d = SHIFT * size
            t.setCharSpace(-d)
            t.textOut(ch)
            t.setCharSpace(0)
            marks = s[i + 1:j]
            for k, mk in enumerate(marks):
                up = mk in _TONE and k > 0 and marks[k - 1] in _UPPER
                if up:
                    t.setRise(RISE * size)
                if k == len(marks) - 1:
                    t.setCharSpace(d)
                t.textOut(mk)
                if up:
                    t.setRise(0)
            t.setCharSpace(0)
            i = j
            continue
        if ch in _TONE and ((i > 0 and s[i - 1] in _UPPER) or (i + 1 < n and s[i + 1] == "ำ")):
            if buf:
                t.textOut(buf)
                buf = ""
            t.setRise(RISE * size)
            t.textOut(ch)
            t.setRise(0)
            i += 1
            continue
        buf += ch
        i += 1
    if buf:
        t.textOut(buf)
    c.drawText(t)


def wrap(text: str, font: str, size: float, width: float) -> list[str]:
    """ตัดคำที่ช่องว่าง · คำยาวเกินบรรทัดตัดตามกลุ่มอักษร (ไม่แยกสระ/วรรณยุกต์จากพยัญชนะ)"""
    lines: list[str] = []
    for para in str(text).split("\n"):
        words = para.split(" ")
        cur = ""
        for w in words:
            cand = w if not cur else cur + " " + w
            if text_w(cand, font, size) <= width:
                cur = cand
                continue
            if cur:
                lines.append(cur)
                cur = ""
            if text_w(w, font, size) <= width:
                cur = w
                continue
            for c in clusters(w):
                if text_w(cur + c, font, size) <= width:
                    cur += c
                else:
                    lines.append(cur)
                    cur = c
        lines.append(cur)
    return lines


# ------------------------------------------------------------------ ผู้จัดหน้า
class Renderer:
    def __init__(self, book: dict):
        self.book = book
        self.lang = book.get("lang", "th")
        self.facts = {f["id"]: f for f in book["facts"]}
        self.tables: dict[str, dict] = {}
        self.total = len(book["pages"])
        self.toc = self._toc_entries()
        self._font = ("Th", 10)

    def _toc_entries(self) -> list[tuple[str, int]]:
        out = []
        for i, page in enumerate(self.book["pages"], start=1):
            for b in page["blocks"]:
                if b["t"] == "h1":
                    out.append((b["text"], i))
        return out

    # -------------------------------------------------------------- วาดข้อความ (ผ่าน draw_text)
    def _sf(self, c, font, size):
        self._font = (font, size)
        c.setFont(font, size)

    def _ds(self, c, x, y, s):
        draw_text(c, x, y, s, *self._font)

    def _drs(self, c, x, y, s):
        draw_text(c, x, y, s, *self._font, align="right")

    def _dcs(self, c, x, y, s):
        draw_text(c, x, y, s, *self._font, align="center")

    # -------------------------------------------------------------- ส่วนประกอบหน้า
    def chrome(self, c: canvas.Canvas, n: int) -> None:
        c.setStrokeColor(RULE)
        c.setLineWidth(0.6)
        if n > 1:
            self._sf(c, "Th", 8.5)
            c.setFillColor(MUTED)
            self._ds(c, M_LEFT, PAGE_H - 44, COMPANY[self.lang])
            self._drs(c, PAGE_W - M_RIGHT, PAGE_H - 44, f"{self.book['file']} · {self.book['title']}")
            c.line(M_LEFT, PAGE_H - 52, PAGE_W - M_RIGHT, PAGE_H - 52)
        c.line(M_LEFT, 44, PAGE_W - M_RIGHT, 44)
        left, right = FOOTER[self.lang]
        self._sf(c, "Th", 8.5)
        c.setFillColor(MUTED)
        self._ds(c, M_LEFT, 31, left)
        self._drs(c, PAGE_W - M_RIGHT, 31, f"{self.book['file']} · " + right.format(n=n, total=self.total))
        c.setFillColor(INK)

    def need(self, y: float, h: float, where: str) -> None:
        if y - h < BOTTOM - 0.01:
            raise LayoutError(f"{self.book['doc']} {where}: เนื้อหาล้นหน้า (ขาดอีก {h - (y - BOTTOM):.0f} pt)")

    def lines(self, c, y, text, font, size, lead, indent=0.0, color=INK, where="", first_prefix=None) -> float:
        width = WIDTH - indent
        ls = wrap(text, font, size, width - (text_w(first_prefix, font, size) if first_prefix else 0))
        self.need(y, lead * len(ls), where)
        self._sf(c, font, size)
        c.setFillColor(color)
        for i, ln in enumerate(ls):
            y -= lead
            x = M_LEFT + indent
            if first_prefix:
                if i == 0:
                    self._ds(c, x, y, first_prefix)
                x += text_w(first_prefix, font, size)
            self._ds(c, x, y, ln)
        c.setFillColor(INK)
        return y

    # -------------------------------------------------------------- บล็อก
    def block(self, c, y: float, b: dict, where: str) -> float:
        t = b["t"]
        if t == "cover":
            return self.cover(c, y, b, where)
        if t == "toc":
            return self.toc_block(c, y, where)
        if t == "h1":
            self.need(y, 40, where)
            y -= 12
            y = self.lines(c, y, b["text"], "ThB", 15, 22, color=ACCENT, where=where)
            c.setStrokeColor(ACCENT)
            c.setLineWidth(1)
            c.line(M_LEFT, y - 5, M_LEFT + 60, y - 5)
            return y - 10
        if t == "h2":
            self.need(y, 30, where)
            y -= 6
            return self.lines(c, y, b["text"], "ThB", 11.5, 18, where=where) - 3
        if t == "p":
            return self.lines(c, y, b["text"], "Th", 10, 16, where=where) - 5
        if t == "facts":
            style = b.get("style", "bullet")
            for k, fid in enumerate(b["ids"], start=1):
                if fid not in self.facts:
                    raise LayoutError(f"{self.book['doc']} {where}: ไม่พบ fact {fid}")
                s = self.facts[fid]["statement"]
                if style == "para":
                    y = self.lines(c, y, s, "Th", 10, 16, where=where) - 4
                else:
                    prefix = f"{k}. " if style == "num" else "•  "
                    y = self.lines(c, y, s, "Th", 10, 16, indent=10, where=where, first_prefix=prefix) - 2
            return y - 4
        if t == "note":
            ls = wrap(b["text"], "Th", 9.5, WIDTH - 20)
            h = 15 * len(ls) + 12
            self.need(y, h + 6, where)
            y -= 4
            c.setFillColor(NOTE_BG)
            c.setStrokeColor(NOTE_BORDER)
            c.setLineWidth(0.8)
            c.rect(M_LEFT, y - h, WIDTH, h, stroke=1, fill=1)
            c.setFillColor(INK)
            self._sf(c, "Th", 9.5)
            yy = y - 6
            for ln in ls:
                yy -= 15
                self._ds(c, M_LEFT + 10, yy + 3, ln)
            return y - h - 8
        if t == "table":
            return self.table(c, y, b, where)
        if t == "space":
            return y - float(b.get("h", 10))
        raise LayoutError(f"{self.book['doc']} {where}: ไม่รู้จักบล็อก {t}")

    def cover(self, c, y, b, where) -> float:
        bk = self.book
        c.setFillColor(ACCENT)
        c.rect(0, PAGE_H - 230, PAGE_W, 230, stroke=0, fill=1)
        c.setFillColor(HexColor("#ffffff"))
        self._sf(c, "ThB", 12)
        self._ds(c, M_LEFT, PAGE_H - 80, COMPANY[self.lang])
        self._sf(c, "ThB", 26)
        self._ds(c, M_LEFT, PAGE_H - 140, bk["title"])
        self._sf(c, "Th", 13)
        self._ds(c, M_LEFT, PAGE_H - 170, bk.get("subtitle", ""))
        self._sf(c, "Th", 10)
        self._ds(c, M_LEFT, PAGE_H - 200, f"{bk['file']} · {bk.get('version', '')}")
        c.setFillColor(INK)
        y = PAGE_H - 270
        for ln in b.get("lines", []):
            y = self.lines(c, y, ln, "Th", 11, 19, where=where) - 6
        return y

    def toc_block(self, c, y, where) -> float:
        self.need(y, 40 + 20 * len(self.toc), where)
        y -= 12
        y = self.lines(c, y, TOC_TITLE[self.lang], "ThB", 15, 22, color=ACCENT, where=where) - 10
        self._sf(c, "Th", 10.5)
        for title, page in self.toc:
            y -= 19
            self._ds(c, M_LEFT + 6, y, title)
            num = str(page)
            self._drs(c, PAGE_W - M_RIGHT, y, num)
            x0 = M_LEFT + 12 + text_w(title, "Th", 10.5)
            x1 = PAGE_W - M_RIGHT - text_w(num, "Th", 10.5) - 6
            c.setFillColor(RULE)
            dot = x0
            while dot < x1:
                self._ds(c, dot, y, ".")
                dot += 4
            c.setFillColor(INK)
        return y - 10

    # -------------------------------------------------------------- ตาราง (หัวหลายชั้น · เซลล์รวม · ข้ามหน้า)
    def table(self, c, y, b, where) -> float:
        if "cont_of" in b:
            base = self.tables[b["cont_of"]]
            spec = {**base, **{k: v for k, v in b.items() if k not in ("t", "cont_of")}}
            spec["title"] = base["title"] + CONT[self.lang]
            spec.setdefault("notes", [])
            if "notes" not in b:
                spec["notes"] = []
        else:
            spec = b
            if "id" in b:
                self.tables[b["id"]] = b
        cols = spec["cols"]
        tot = float(sum(cols))
        widths = [WIDTH * w / tot for w in cols]
        size, lead, pad = spec.get("size", 9), spec.get("lead", 13), 4

        y = self.lines(c, y - 2, spec["title"], "ThB", 10, 15, color=ACCENT, where=where) - 4
        head = [self._norm_row(r) for r in spec.get("head", [])]
        body = [self._norm_row(r) for r in spec["rows"]]
        grid_rows = head + body
        n_head = len(head)
        placed = self._place(grid_rows, len(widths), where)
        # ความสูงแถว
        heights = [0.0] * len(grid_rows)
        for (r, col, cell) in placed:
            w = sum(widths[col:col + cell["cs"]]) - 2 * pad
            font = "ThB" if r < n_head or cell.get("b") else "Th"
            need = lead * len(wrap(cell["text"], font, size, w)) + 2 * pad - 2
            if cell["rs"] == 1:
                heights[r] = max(heights[r], need)
        for (r, col, cell) in placed:
            if cell["rs"] > 1:
                w = sum(widths[col:col + cell["cs"]]) - 2 * pad
                need = lead * len(wrap(cell["text"], "Th", size, w)) + 2 * pad - 2
                have = sum(heights[r:r + cell["rs"]])
                if need > have:
                    heights[r + cell["rs"] - 1] += need - have
        total_h = sum(heights)
        self.need(y, total_h, where + f" ตาราง {spec['title']}")
        tops = [y]
        for h in heights:
            tops.append(tops[-1] - h)
        c.setLineWidth(0.5)
        c.setStrokeColor(RULE)
        for (r, col, cell) in placed:
            x = M_LEFT + sum(widths[:col])
            w = sum(widths[col:col + cell["cs"]])
            top = tops[r]
            bot = tops[r + cell["rs"]]
            is_head = r < n_head or cell.get("hdr")
            if is_head:
                c.setFillColor(HEAD_BG if r < n_head else HEAD_BG2)
                c.rect(x, bot, w, top - bot, stroke=1, fill=1)
            else:
                c.rect(x, bot, w, top - bot, stroke=1, fill=0)
            font = "ThB" if r < n_head or cell.get("b") else "Th"
            ls = wrap(cell["text"], font, size, w - 2 * pad)
            block_h = lead * len(ls)
            yy = top - pad - (((top - bot) - 2 * pad - block_h) / 2 if cell["rs"] > 1 or r < n_head else 0)
            c.setFillColor(INK)
            self._sf(c, font, size)
            align = cell.get("align", "center" if r < n_head else "left")
            for ln in ls:
                yy -= lead
                if align == "center":
                    self._dcs(c, x + w / 2, yy + 3, ln)
                elif align == "right":
                    self._drs(c, x + w - pad, yy + 3, ln)
                else:
                    self._ds(c, x + pad, yy + 3, ln)
        y = tops[-1] - 4
        for note in spec.get("notes", []):
            y = self.lines(c, y, note, "Th", 8.5, 13, color=MUTED, where=where)
        return y - 10

    @staticmethod
    def _norm_row(row: list) -> list[dict]:
        out = []
        for cell in row:
            if isinstance(cell, dict):
                d = dict(cell)
                d["text"] = str(d.get("text", ""))
                d.setdefault("cs", 1)
                d.setdefault("rs", 1)
            else:
                d = {"text": str(cell), "cs": 1, "rs": 1}
            out.append(d)
        return out

    def _place(self, rows: list[list[dict]], ncols: int, where: str) -> list[tuple[int, int, dict]]:
        taken = [[False] * ncols for _ in rows]
        placed = []
        for r, row in enumerate(rows):
            col = 0
            for cell in row:
                while col < ncols and taken[r][col]:
                    col += 1
                if col + cell["cs"] > ncols or r + cell["rs"] > len(rows):
                    raise LayoutError(f"{self.book['doc']} {where}: ตารางเกินขอบ แถว {r + 1}")
                for rr in range(r, r + cell["rs"]):
                    for cc in range(col, col + cell["cs"]):
                        taken[rr][cc] = True
                placed.append((r, col, cell))
                col += cell["cs"]
            if not all(taken[r]):
                raise LayoutError(f"{self.book['doc']} {where}: ตารางแถว {r + 1} มีช่องไม่ครบ")
        return placed

    # -------------------------------------------------------------- ทั้งเล่ม
    def render(self, out: Path) -> int:
        bk = self.book
        if self.total != bk["pages_planned"]:
            raise LayoutError(f"{bk['doc']}: กำหนดหน้าไว้ {self.total} หน้า แต่แผน {bk['pages_planned']} หน้า")
        c = canvas.Canvas(str(out), pagesize=A4)
        c.setTitle(f"{bk['title']} ({bk['file']})")
        c.setAuthor(COMPANY[self.lang])
        c.setSubject("ข้อมูลทดสอบ · ร้านสมมติ")
        for n, page in enumerate(bk["pages"], start=1):
            self.chrome(c, n)
            y = TOP
            for i, b in enumerate(page["blocks"]):
                y = self.block(c, y, b, f"หน้า {n} บล็อก {i + 1}")
            c.showPage()
        c.save()
        return self.total


def main(argv: list[str]) -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    wanted = set(argv)
    files = sorted(FACTS_DIR.glob("SS-*.json"))
    if not files:
        print("ไม่พบ data/facts/SS-*.json")
        return 1
    failed = 0
    for path in files:
        book = json.loads(path.read_text(encoding="utf-8"))
        if wanted and book["doc"] not in wanted:
            continue
        try:
            n = Renderer(book).render(OUT_DIR / book["file"])
            print(f"OK   {book['file']:<22} {n:>3} หน้า  {len(book['facts']):>4} facts")
        except LayoutError as e:
            failed += 1
            print(f"FAIL {e}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
