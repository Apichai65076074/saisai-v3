#!/usr/bin/env python3
"""สร้าง e2e/fixtures/SS-PROMO-NOV.pdf (1 หน้า · ฟอนต์ไทยฝัง) สำหรับ R07/Q03 (T12)
python3 workers/rag-worker/tools/make_promo_pdf.py [out.pdf] [font.ttf]
ฟอนต์: Waree/Garuda (fonts-tlwg) · ข้อความวางด้วย insert_text (ToUnicode ตรง)"""
import os
import sys

import pymupdf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'e2e/fixtures/SS-PROMO-NOV.pdf')
FONTS = [sys.argv[2]] if len(sys.argv) > 2 else [
    '/usr/share/fonts/truetype/tlwg/Waree.ttf',
    '/usr/share/fonts/truetype/tlwg/Garuda.ttf',
]
FONT = next((f for f in FONTS if os.path.exists(f)), None)
if not FONT:
    sys.exit('ไม่พบฟอนต์ไทย (ติดตั้ง fonts-tlwg-waree หรือส่ง path ฟอนต์)')

PROMO = 'โปรเดือนพฤศจิกายน: ออกแบบโลโก้ฟรี 1 แบบ สำหรับออเดอร์ที่พิมพ์โลโก้'
LINES = [  # (ข้อความ, ขนาด, สี)
    ('SaiSai · ใสใส', 22, (0.055, 0.486, 0.608)),
    ('SS-PROMO-NOV · โปรโมชันเดือนพฤศจิกายน 2026', 15, (0.043, 0.18, 0.247)),
    (PROMO, 14, (0, 0, 0)),
    ('เงื่อนไข: ใช้ได้กับออเดอร์ที่สั่งพิมพ์โลโก้ในเดือนพฤศจิกายน', 13, (0, 0, 0)),
    ('ราคาสินค้าและค่าพิมพ์โลโก้เป็นไปตามปกติ', 13, (0, 0, 0)),
]

doc = pymupdf.open()
page = doc.new_page(width=595, height=842)  # A4
# insert_text (ไม่ shape) → 1 glyph ต่อ 1 codepoint · ToUnicode ถูก (shaping ของ htmlbox ทำวรรณยุกต์หายเวลาอ่านกลับ)
y = 90
for text, size, color in LINES:
    page.insert_text((56, y), text, fontsize=size, fontname='th', fontfile=FONT, color=color)
    y += size * 2.2
doc.set_metadata({'title': 'SS-PROMO-NOV', 'author': 'SaiSai (test fixture)'})
os.makedirs(os.path.dirname(OUT), exist_ok=True)
doc.subset_fonts()
doc.save(OUT, garbage=4, deflate=True)

# ตรวจ: อ่านกลับด้วย PyMuPDF ต้องเจอประโยคโปรครบ · ฟอนต์ฝัง
txt = ' '.join(pymupdf.open(OUT)[0].get_text().split())
assert PROMO in txt, txt
fonts = pymupdf.open(OUT)[0].get_fonts()
assert fonts and all(f[1] != 'n/a' for f in fonts), fonts
print('ok', OUT, os.path.getsize(OUT), 'bytes', [f[3] for f in fonts])
