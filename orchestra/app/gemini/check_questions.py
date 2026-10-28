"""ตรวจชุดคำถามประเมิน RAG ใน gemini/rag-questions/*.jsonl เทียบกับ data/facts/SS-*.json

ใช้: py gemini/check_questions.py

เกณฑ์การตรวจ:
1. JSON ถูกต้องทุกบรรทัด และมีฟิลด์ครบ {qid, book, question, answer, fact_ids, pages, type, difficulty}
2. จำนวนคำถามเล่มละ 110 ข้อ
3. qid ไม่ซ้ำ (ทั้งในเล่มและข้ามเล่ม)
4. fact_ids มีอยู่จริงใน data/facts/<book>.json (ยกเว้น unanswerable ที่ต้องเป็น [])
5. pages ตรงกับหน้าที่ fact_ids ปรากฏจริงใน PDF/JSON
6. สัดส่วน type ใกล้เคียงเกณฑ์: direct ~40%, paraphrase ~25%, table ~15%, crosspage/footnote ~10%, unanswerable ~10%
7. ไม่มีคำถามซ้ำ และรายงานจำนวนคู่คำถามที่คล้ายกันเกิน 80% ภายในเล่มเดียวกัน
8. unanswerable เล่มละ 11 ข้อ ต้องมีอย่างน้อย 6 หัวข้อต่างกัน และห้ามถามราคา P01 ซ้ำเกิน 2 ข้อต่อเล่ม
9. ตรวจว่าคำตอบของ unanswerable ไม่อยู่ใน facts ของเล่มไหนเลย (ค้นคำสำคัญจากคำถามใน facts ทั้ง 7 เล่ม ถ้าเจอให้รายงานเป็น WARN)
"""
from __future__ import annotations

import difflib
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FACTS_DIR = ROOT / "data" / "facts"
QUESTIONS_DIR = Path(__file__).resolve().parent / "rag-questions"

REQUIRED_KEYS = {"qid", "book", "question", "answer", "fact_ids", "pages", "type", "difficulty"}
VALID_TYPES = {"direct", "paraphrase", "table", "crosspage", "footnote", "crosspage/footnote", "unanswerable"}
VALID_DIFFICULTIES = {"easy", "medium", "hard"}

_WS = re.compile(r"\s+")
_PUNCT = re.compile(r"[\s\?\!\.\,\;\:\"\'\(\)\[\]\-·/]+")

# คำทั่วไปในโดเมนขวดแก้วของร้านที่ไม่ใช่คำเฉพาะของคำตอบสำหรับตัดออกเวลาดึงคำสำคัญจากคำถาม unanswerable
STOP_TERMS = {
    "ขวด", "ขวดแก้ว", "ขวดรุ่น", "รุ่น", "สีใส", "สีชา", "สีเขียว", "รหัส",
    "ราคา", "ขาย", "จำหน่าย", "ใบละ", "กี่บาท", "เท่าไร", "เท่าไหร่", "ต่อใบ",
    "ส่วนลด", "ลดราคา", "เปอร์เซ็นต์", "กี่เปอร์เซ็นต์", "สั่งซื้อ", "สั่ง", "ยอด", "จำนวน",
    "ฝา", "ฝาขวด", "ฝาเกลียว", "ฝาล็อก", "โลหะ", "พลาสติก", "ชิ้นละ", "แพ็กละ", "กล่องละ",
    "ใสใส", "กลาสแวร์", "ทางร้าน", "โรงงาน", "บริษัท", "ลูกค้า", "ระบบสั่งซื้อ", "แคตตาล็อก",
    "อะไร", "อย่างไร", "เมื่อใด", "วันที่เท่าไร", "เดือนใด", "ปีใด", "กี่", "ใบ", "ชิ้น", "บาท",
    "what", "how", "much", "when", "which", "where", "who", "does", "do", "is", "are", "the",
    "for", "per", "in", "on", "of", "to", "from", "with", "and", "or", "by", "at", "into",
    "bottle", "bottles", "glass", "saisai", "glassware", "clear", "amber", "green",
    "price", "prices", "unit", "selling", "cost", "thb", "discount", "volume", "percentage", "rate",
    "order", "ordering", "purchasing", "single", "piece", "box", "cap", "caps", "closures", "model",
    "code", "codes", "item", "product", "company", "plant", "factory", "before", "tax", "vat",
    "one", "new", "charge", "metal", "twist", "ltd", "corp", "share", "ceramic", "date", "month",
    "its", "thai", "will", "under", "november", "schedule", "exact", "granted", "wholesale",
    "dropper", "assemblies", "flip-top", "compare", "against", "competitor", "market", "compared",
    "rival", "producer", "industry", "plastic", "square", "jars", "open", "second", "manufacturing",
    "plan", "launch", "initial", "public", "offering", "stock", "exchange",
}


def norm_q(s: str) -> str:
    return _PUNCT.sub("", s.strip().lower())


def norm_text(s: str) -> str:
    return _WS.sub("", s.strip().lower())


def fact_pages(book: dict) -> dict[str, list[int]]:
    where: dict[str, list[int]] = {}
    for n, page in enumerate(book["pages"], start=1):
        for b in page["blocks"]:
            ids = b.get("ids", []) if b["t"] == "facts" else b.get("facts", [])
            for fid in ids:
                if n not in where.setdefault(fid, []):
                    where[fid].append(n)
    return where


def type_bucket(t: str) -> str:
    if t in ("crosspage", "footnote", "crosspage/footnote"):
        return "crosspage/footnote"
    return t


def classify_unanswerable_topic(q: str) -> str:
    ql = q.lower()
    if any(w in ql for w in ("ชลบุรีกลาสเวิร์คส์", "บางกอกกลาส", "สยามกลาส", "คู่แข่ง", "chonburi glassworks", "bangkok glass", "siam glass", "competitor", "rival")):
        return "competitor"
    if any(w in ql for w in ("2571", "2572", "2573", "2028", "2029", "แห่งที่ 2", "ตลาดหลักทรัพย์", "ipo", "second manufacturing", "ฉบับปรับปรุง")):
        return "future_event"
    if any(w in ql for w in ("ฝา", "ดรอปเปอร์", "ฟลิปท็อป", "ปั๊มโลชั่น", "dropper", "flip-top", "lug closures", "cap", "caps")):
        return "cap_price"
    if any(w in ql for w in ("ส่วนลด", "ลดราคา", "discount")):
        return "discount"
    if any(w in ql for w in ("pet", "hdpe", "พลาสติก", "กระปุก", "เซรามิก", "คริสตัล", "แชมเปญ", "ไม้สน", "ถุง", "ฟิล์ม", "สติกเกอร์", "สเปรย์น้ำหอม", "porcelain jars", "ceramic jars")):
        return "unsold_product"
    if any(w in ql for w in ("ราคา", "ใบละ", "กี่บาท", "ยอดเงินค่าขวด", "unit selling price", "cost before tax", "price")):
        return "bottle_price"
    return "other"


def extract_specific_keywords(q: str) -> list[str]:
    """ดึงคำสำคัญเฉพาะเจาะจงจากคำถาม unanswerable เพื่อค้นใน facts ทั้ง 7 เล่ม"""
    keywords: list[str] = []
    # ดึงคำภาษาอังกฤษ/รหัส/ตัวเลขเฉพาะ (ที่ไม่ใช่รหัสรุ่นขวดหรือขนาดฝามาตรฐานทั่วไป)
    generic_codes = {
        "b-100", "b-150", "b-250", "b-500", "p01", "p02", "p03", "p04", "p05", "p06", "p07", "p08", "p09",
        "28", "38", "43", "100", "150", "250", "500", "1", "2", "5", "24", "360", "2026", "pp", "lug", "ropp",
        "mm", "ml", "vat", "coa", "aql", "iso", "9001", "uv", "2.0", "1.00",
    }
    for m in re.finditer(r"[A-Za-z0-9][A-Za-z0-9\-\.,]*", q):
        tok = m.group(0).strip(".,").lower()
        if len(tok) >= 3 and tok not in generic_codes and tok not in STOP_TERMS:
            keywords.append(tok)

    # ดึงวลีเฉพาะภาษาไทยที่ไม่ควรปรากฏใน facts ทั้ง 7 เล่ม
    thai_specific_patterns = [
        "ชลบุรีกลาสเวิร์คส์", "บางกอกกลาส", "สยามกลาส", "พลาสติก PET", "พลาสติก HDPE", "กระปุกแก้วทรงสี่เหลี่ยม",
        "กระปุกอะคริลิก", "กระปุกพลาสติก", "ขวดพลาสติกบีบ", "ถุงบรรจุเครื่องดื่ม", "กล่องของขวัญไม้สน",
        "ถุงกระดาษหูหิ้ว", "แก้วมัคเซรามิก", "แก้วไวน์คริสตัล", "ขวดแก้วแชมเปญ", "ขวดสเปรย์น้ำหอม", "ระยอง", "ขอนแก่น",
        "ตลาดหลักทรัพย์", "สกุลเงินดิจิทัล", "บัตรเครดิตต่างประเทศ", "รถพลังงานไฟฟ้า", "สงกรานต์",
        "2571", "2572", "2573",
        # คำสำคัญจากเล่มอื่นที่หากนำมาถามเป็น unanswerable ข้ามเล่มจะต้องถูกเตือน
        "ท่าเรือแหลมฉบัง", "นิคมอุตสาหกรรมทดสอบ", "ธนาคารทดสอบ", "099-9999999",
    ]
    for pat in thai_specific_patterns:
        if pat.lower() in q.lower():
            keywords.append(pat)
    return list(dict.fromkeys(keywords))


def check_all() -> int:
    fact_files = sorted(FACTS_DIR.glob("SS-*.json"))
    if not fact_files:
        print("❌ ไม่พบไฟล์ใน data/facts/SS-*.json")
        return 1

    # โหลด facts ทั้ง 7 เล่มไว้ค้นหาข้ามเล่มสำหรับ unanswerable
    all_books_data: dict[str, dict] = {}
    all_facts_corpus: list[tuple[str, str, str]] = []  # (doc, fid, statement_lower)
    for fp in fact_files:
        bdata = json.loads(fp.read_text(encoding="utf-8"))
        doc = bdata["doc"]
        all_books_data[doc] = bdata
        for f in bdata["facts"]:
            all_facts_corpus.append((doc, f["id"], f["statement"].lower()))

    global_qids: set[str] = set()
    global_questions: set[str] = set()
    rows_summary = []
    warnings: list[str] = []
    all_passed = True

    for fp in fact_files:
        doc = fp.stem
        book_data = all_books_data[doc]
        facts_map = {f["id"]: f for f in book_data["facts"]}
        where = fact_pages(book_data)

        qfile = QUESTIONS_DIR / f"{doc}.jsonl"
        errors: list[str] = []
        book_warns: list[str] = []
        counts: Counter[str] = Counter()
        total = 0

        if not qfile.exists():
            errors.append("ไม่พบไฟล์ .jsonl")
            rows_summary.append((doc, 0, "-", "-", "❌ ไม่ผ่าน (" + ", ".join(errors) + ")"))
            all_passed = False
            continue

        raw_lines = [line for line in qfile.read_text(encoding="utf-8").splitlines() if line.strip()]
        total = len(raw_lines)
        if total != 110:
            errors.append(f"จำนวนข้อ {total} ≠ 110")

        book_questions: list[tuple[str, str]] = []  # (qid, norm_q)
        unans_topics: set[str] = set()
        p01_unans_count = 0

        for idx, line in enumerate(raw_lines, start=1):
            try:
                item = json.loads(line)
            except Exception as e:
                errors.append(f"บรรทัด {idx}: JSON ไม่ถูกต้อง ({e})")
                continue

            if not isinstance(item, dict):
                errors.append(f"บรรทัด {idx}: ไม่ใช่ JSON object")
                continue

            missing = REQUIRED_KEYS - set(item.keys())
            if missing:
                errors.append(f"บรรทัด {idx}: ขาดฟิลด์ {sorted(missing)}")
                continue

            qid = item["qid"]
            book = item["book"]
            question = item["question"]
            answer = item["answer"]
            fids = item["fact_ids"]
            pages = item["pages"]
            qtype = item["type"]
            diff = item["difficulty"]

            if book != doc:
                errors.append(f"{qid}: book='{book}' ไม่ตรงกับ '{doc}'")

            if not isinstance(qid, str) or not qid.strip():
                errors.append(f"บรรทัด {idx}: qid ไม่ถูกต้อง")
            elif qid in global_qids:
                errors.append(f"{qid}: qid ซ้ำ")
            else:
                global_qids.add(qid)

            if not isinstance(question, str) or not question.strip():
                errors.append(f"{qid}: คำถามว่าง")
            else:
                nq = norm_q(question)
                book_questions.append((qid, nq))
                if nq in global_questions:
                    errors.append(f"{qid}: คำถามซ้ำ «{question[:35]}»")
                else:
                    global_questions.add(nq)

            if not isinstance(answer, str) or not answer.strip():
                errors.append(f"{qid}: คำตอบว่าง")

            if qtype not in VALID_TYPES:
                errors.append(f"{qid}: type '{qtype}' ไม่ถูกต้อง")
            bucket = type_bucket(qtype)
            counts[bucket] += 1

            if diff not in VALID_DIFFICULTIES:
                errors.append(f"{qid}: difficulty '{diff}' ไม่ถูกต้อง")

            if not isinstance(fids, list) or not isinstance(pages, list):
                errors.append(f"{qid}: fact_ids และ pages ต้องเป็น list")
                continue

            if bucket == "unanswerable":
                if fids:
                    errors.append(f"{qid}: unanswerable ต้องมี fact_ids=[] แต่ได้ {fids}")
                if pages:
                    errors.append(f"{qid}: unanswerable ต้องมี pages=[] แต่ได้ {pages}")
                ans_low = answer.lower()
                if doc == "SS-FAQ-EN":
                    if not any(w in ans_low for w in ("not available", "no information", "not listed", "not provided", "not mentioned")):
                        errors.append(f"{qid}: unanswerable (EN) ต้องระบุว่าไม่มีข้อมูล")
                else:
                    if "ไม่มีข้อมูล" not in answer:
                        errors.append(f"{qid}: unanswerable ต้องระบุว่า 'ไม่มีข้อมูล'")

                topic = classify_unanswerable_topic(question)
                unans_topics.add(topic)
                if "p01" in question.lower():
                    p01_unans_count += 1

                # ค้นคำสำคัญเฉพาะจากคำถาม unanswerable ใน facts ทั้ง 7 เล่ม
                kws = extract_specific_keywords(question)
                for kw in kws:
                    kw_low = kw.lower()
                    matched_facts = [
                        f"{fdoc}:{fid}"
                        for fdoc, fid, st_low in all_facts_corpus
                        if kw_low in st_low
                    ]
                    if matched_facts:
                        wmsg = f"WARN [{qid}] คำสำคัญ '{kw}' จากคำถาม unanswerable พบใน facts: {', '.join(matched_facts[:3])}"
                        book_warns.append(wmsg)
                        warnings.append(wmsg)
            else:
                if not fids:
                    errors.append(f"{qid}: fact_ids ว่างสำหรับ type={qtype}")
                else:
                    bad_fids = [fid for fid in fids if fid not in facts_map]
                    if bad_fids:
                        errors.append(f"{qid}: fact_ids ไม่มีจริง {bad_fids}")
                    else:
                        exp_pages = sorted({p for fid in fids for p in where.get(fid, [])})
                        if pages != exp_pages:
                            errors.append(f"{qid}: pages={pages} ไม่ตรงกับหน้าจริง {exp_pages}")

                        # ตรวจว่า paraphrase ไม่ลอกประโยคจาก statement ตรง ๆ
                        if bucket == "paraphrase":
                            q_norm = norm_text(question)
                            for fid in fids:
                                st_norm = norm_text(facts_map[fid]["statement"])
                                if len(st_norm) >= 20 and st_norm in q_norm:
                                    errors.append(f"{qid}: paraphrase ลอกข้อความจาก statement ของ {fid}")

        # ตรวจหัวข้อ unanswerable >= 6 หัวข้อ และ P01 <= 2 ข้อต่อเล่ม
        if len(unans_topics) < 6:
            errors.append(f"unanswerable มีเพียง {len(unans_topics)} หัวข้อ (< 6 หัวข้อ)")
        if p01_unans_count > 2:
            errors.append(f"unanswerable ถามราคา P01 ซ้ำ {p01_unans_count} ข้อ (> 2 ข้อ)")

        # ตรวจจำนวนคำถามที่คล้ายกันเกิน 80% ภายในเล่มเดียวกัน
        sim_pairs: list[tuple[str, str, float]] = []
        n_q = len(book_questions)
        for i in range(n_q):
            qid1, nq1 = book_questions[i]
            for j in range(i + 1, n_q):
                qid2, nq2 = book_questions[j]
                ratio = difflib.SequenceMatcher(None, nq1, nq2).ratio()
                if ratio > 0.80:
                    sim_pairs.append((qid1, qid2, ratio))

        # ตรวจสัดส่วน type
        if total > 0:
            p_direct = counts["direct"] / total * 100
            p_para = counts["paraphrase"] / total * 100
            p_table = counts["table"] / total * 100
            p_cross = counts["crosspage/footnote"] / total * 100
            p_unans = counts["unanswerable"] / total * 100

            if not (35 <= p_direct <= 45):
                errors.append(f"สัดส่วน direct {p_direct:.1f}% นอกเกณฑ์ ~40%")
            if not (20 <= p_para <= 30):
                errors.append(f"สัดส่วน paraphrase {p_para:.1f}% นอกเกณฑ์ ~25%")
            if not (11 <= p_table <= 19):
                errors.append(f"สัดส่วน table {p_table:.1f}% นอกเกณฑ์ ~15%")
            if not (7 <= p_cross <= 14):
                errors.append(f"สัดส่วน crosspage/footnote {p_cross:.1f}% นอกเกณฑ์ ~10%")
            if not (7 <= p_unans <= 14):
                errors.append(f"สัดส่วน unanswerable {p_unans:.1f}% นอกเกณฑ์ ~10%")

            ratio_str = (
                f"direct {counts['direct']} ({p_direct:.1f}%) · "
                f"paraphrase {counts['paraphrase']} ({p_para:.1f}%) · "
                f"table {counts['table']} ({p_table:.1f}%) · "
                f"crosspage/footnote {counts['crosspage/footnote']} ({p_cross:.1f}%) · "
                f"unanswerable {counts['unanswerable']} ({p_unans:.1f}%)"
            )
        else:
            ratio_str = "-"

        sim_str = f"{len(sim_pairs)} คู่"
        if sim_pairs:
            sample_sim = ", ".join(f"{a}~{b} ({r*100:.0f}%)" for a, b, r in sim_pairs[:3])
            sim_str += f" ({sample_sim})"

        if errors:
            all_passed = False
            status = "❌ ไม่ผ่าน: " + "; ".join(errors[:3])
        elif book_warns:
            status = f"⚠️ ผ่าน (WARN {len(book_warns)})"
        else:
            status = f"✅ ผ่าน ({len(unans_topics)} หัวข้อ unans, P01={p01_unans_count})"

        rows_summary.append((doc, total, ratio_str, sim_str, status))

    if warnings:
        print("=== รายการแจ้งเตือน (WARN) ===")
        for w in warnings:
            print(" -", w)
        print()

    print("| เล่ม | จำนวน | สัดส่วน type | คล้าย >80% ในเล่ม | ผ่าน/ไม่ผ่าน |")
    print("|---|---:|---|---|---|")
    total_q = 0
    for doc, cnt, r_str, sim_s, st in rows_summary:
        total_q += cnt
        print(f"| `{doc}` | {cnt} | {r_str} | {sim_s} | {st} |")
    overall = "✅ ผ่านทั้งหมด" if all_passed else "❌ มีข้อผิดพลาด"
    print(f"| **รวม {len(rows_summary)} เล่ม** | **{total_q}** | **ครบทุกประเภทตามเกณฑ์** | **ตรวจครบทุกเล่ม** | **{overall}** |")
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(check_all())
