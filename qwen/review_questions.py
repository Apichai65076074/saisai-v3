"""ให้ Qwen ตรวจคำถามประเมิน RAG ใน gemini/rag-questions/*.jsonl แบบอิสระ

ใช้:
    py qwen/review_questions.py --limit 20     # รันทดลอง (เลือกกระจายทุก type/ทุกเล่ม)
    py qwen/review_questions.py                # รันทั้งหมด (ต่อจากจุดเดิมอัตโนมัติ)
    py qwen/review_questions.py --book SS-POLICY --workers 2
    py qwen/review_questions.py --canary       # สุ่ม 30 ข้อ ทำให้ผิดโดยตั้งใจ วัด % ที่จับได้ (เป้า ≥ 90%)
                                               # ผลแยกที่ qwen/review-canary/ ไม่ปนกับ qwen/review/
    py qwen/review_questions.py --strict-tokens  # ไม่เรียก API: ตัวเลข/รหัสรุ่น/สีใน answer ต้องอยู่ใน fact
                                                 # ตรวจ 770 ข้อ + 30 canary · ผลที่ qwen/review-strict/
    py qwen/review_questions.py --recheck FAQ-Q105   # ตรวจข้อที่ระบุซ้ำ (หลายข้อได้) เขียนทับเฉพาะบรรทัดนั้นใน qwen/review/

อ่าน QWEN_API_KEY, QWEN_BASE_URL, QWEN_MODEL จาก .env (ไม่ print ค่า key)
เรียก /chat/completions แบบ OpenAI-compatible ด้วย urllib · temperature 0 · พยายามปิด thinking (/no_think)

ผลบันทึกทีละข้อลง qwen/review/<เล่ม>.jsonl:
    {qid, book, type, ok, code, latency_s, prompt_tokens, completion_tokens, attempts, thinking}
code ∈ OK, WRONG_ANSWER, NOT_IN_FACT, AMBIGUOUS, ANSWERABLE, CJK_LEAK, BAD_JSON
ข้อที่เรียก API ไม่สำเร็จ (429/5xx/network ครบ retry) จะไม่ถูกบันทึก เพื่อให้รันรอบหน้าลองใหม่
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FACTS_DIR = ROOT / "data" / "facts"
QUESTIONS_DIR = ROOT / "gemini" / "rag-questions"
OUT_DIR = Path(__file__).resolve().parent / "review"
CANARY_DIR = Path(__file__).resolve().parent / "review-canary"

CODES = {"OK", "WRONG_ANSWER", "NOT_IN_FACT", "AMBIGUOUS", "ANSWERABLE"}
DETECTED = CODES - {"OK"}  # CJK_LEAK/BAD_JSON ไม่นับว่าจับได้
CANARY_N = 30
CANARY_FLIP = 10  # จำนวนข้อที่เปลี่ยนเป็น unanswerable ทั้งที่มีคำตอบจริง
CANARY_SEED = 20261024
CANARY_TARGET = 0.90
CJK = re.compile(r"[一-鿿]")
THINK = re.compile(r"<think>(.*?)</think>", re.S)
MAX_HTTP_RETRIES = 3
MAX_WORKERS = 4
TOP_K_SEARCH = 10

SYSTEM_PROMPT = """You are a strict, independent reviewer of a RAG evaluation dataset for a Thai B2B glass-bottle factory (SaiSai Glassware).
For each item you get a question, the reference answer, and FACTS (statements copied from the source PDFs).
Judge ONLY against the FACTS given. Do not use outside knowledge.

Pick exactly one code:
- OK: the question is clear, the facts fully support the reference answer.
- WRONG_ANSWER: the facts contradict the reference answer (wrong number, unit, condition, etc.).
- NOT_IN_FACT: the reference answer states things the facts do not support (added/invented details).
- AMBIGUOUS: the question is unclear or has more than one reasonable answer given the facts.
- ANSWERABLE: (only for type=unanswerable) the SEARCHED FACTS actually answer the question, so it is not unanswerable.
For type=unanswerable, the reference answer says the info is not in the documents; use OK if the searched facts do not answer the question.

Reply with ONE JSON object only, no markdown, no explanation, no Chinese characters:
{"qid": "<qid>", "ok": true|false, "code": "<CODE>"}
ok must be true only when code is OK."""


# ---------- .env / HTTP ----------

def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


class Client:
    def __init__(self, env: dict[str, str]):
        missing = [k for k in ("QWEN_API_KEY", "QWEN_BASE_URL", "QWEN_MODEL") if not env.get(k)]
        if missing:
            sys.exit(f"ขาดค่าใน .env: {', '.join(missing)}")
        self._key = env["QWEN_API_KEY"]
        base = env["QWEN_BASE_URL"].rstrip("/")
        self.url = base if base.endswith("/chat/completions") else base + "/chat/completions"
        self.model = env["QWEN_MODEL"]
        # พารามิเตอร์ปิด thinking: vLLM/SGLang ใช้ chat_template_kwargs · DashScope ใช้ enable_thinking
        # ถ้าเซิร์ฟเวอร์ปฏิเสธ (400) จะตัดทิ้งแล้วเหลือแค่ /no_think ในข้อความ
        self.extra = {"chat_template_kwargs": {"enable_thinking": False}, "enable_thinking": False}
        self._lock = threading.Lock()
        self.notes: list[str] = []

    def _post(self, body: dict) -> dict:
        req = urllib.request.Request(
            self.url,
            data=json.dumps(body).encode("utf-8"),
            # Cloudflare บล็อก User-Agent ค่าเริ่มต้นของ urllib (error 1010) จึงต้องตั้งเอง
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self._key}",
                     "User-Agent": "saisai-qwen-review/1.0", "Accept": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode("utf-8"))

    def chat(self, messages: list[dict]) -> dict:
        """เรียก API พร้อม retry/backoff เมื่อเจอ 429/5xx/network สูงสุด 3 ครั้ง"""
        for attempt in range(MAX_HTTP_RETRIES + 1):
            body = {"model": self.model, "messages": messages, "temperature": 0, "max_tokens": 300, **self.extra}
            try:
                return self._post(body)
            except urllib.error.HTTPError as e:
                detail = e.read().decode("utf-8", "replace")[:300]
                if e.code == 400 and self.extra:
                    with self._lock:
                        if self.extra:
                            self.extra = {}
                            self.notes.append(f"เซิร์ฟเวอร์ไม่รับพารามิเตอร์ปิด thinking (400) → ใช้แค่ /no_think: {detail}")
                    continue
                if (e.code == 429 or e.code >= 500) and attempt < MAX_HTTP_RETRIES:
                    retry_after = e.headers.get("Retry-After") if e.headers else None
                    wait = float(retry_after) if retry_after and retry_after.isdigit() else 2 ** (attempt + 1)
                    time.sleep(wait)
                    continue
                raise RuntimeError(f"HTTP {e.code}: {detail}") from None
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                if attempt < MAX_HTTP_RETRIES:
                    time.sleep(2 ** (attempt + 1))
                    continue
                raise RuntimeError(f"network: {e}") from None
        raise RuntimeError("HTTP retries exhausted")


# ---------- facts / search ----------

def load_facts() -> dict[str, dict]:
    facts: dict[str, dict] = {}
    for p in sorted(FACTS_DIR.glob("SS-*.json")):
        book = json.loads(p.read_text(encoding="utf-8"))
        for f in book["facts"]:
            facts[f["id"]] = {"book": book["doc"], **f}
    return facts


_ALNUM = re.compile(r"[a-z0-9][a-z0-9\-\.]*")
_NON_WORD = re.compile(r"[\s\?\!\.\,\;\:\"\'\(\)\[\]·/]+")


def grams(text: str) -> set[str]:
    """คำอังกฤษ/รหัส/ตัวเลข + char 3-gram ของข้อความไทย (ไทยไม่เว้นวรรค จึงใช้ n-gram แทนการตัดคำ)"""
    t = text.lower()
    out = {m.group(0).strip(".-") for m in _ALNUM.finditer(t)}
    thai = _NON_WORD.sub(" ", re.sub(r"[a-z0-9]", " ", t))
    for chunk in thai.split():
        out.update(chunk[i:i + 3] for i in range(len(chunk) - 2))
    return {g for g in out if len(g) >= 2}


class Searcher:
    def __init__(self, facts: dict[str, dict]):
        self.items = [(fid, grams(f["statement"] + " " + f.get("topic", ""))) for fid, f in facts.items()]
        df = Counter(g for _, gs in self.items for g in gs)
        n = len(self.items)
        self.idf = {g: math.log((n + 1) / (c + 0.5)) for g, c in df.items()}

    def search(self, question: str, k: int = TOP_K_SEARCH) -> list[str]:
        q = grams(question)
        scored = []
        for fid, gs in self.items:
            s = sum(self.idf[g] for g in q & gs)
            if s > 0:
                scored.append((s, fid))
        scored.sort(reverse=True)
        return [fid for _, fid in scored[:k]]


# ---------- review one question ----------

def build_prompt(q: dict, facts: dict[str, dict], searcher: Searcher) -> tuple[str, list[str]]:
    if q["type"] == "unanswerable":
        ids = searcher.search(q["question"])
        label = "SEARCHED FACTS (keyword search over all 7 books)"
    else:
        ids = q["fact_ids"]
        label = "FACTS (from fact_ids)"
    lines = []
    for fid in ids:
        f = facts.get(fid)
        lines.append(f"- [{fid} · {f['book']}] {f['statement']}" if f else f"- [{fid}] (fact id not found)")
    user = (
        f"qid: {q['qid']}\nbook: {q['book']}\ntype: {q['type']}\n"
        f"question: {q['question']}\nreference answer: {q['answer']}\n\n"
        f"{label}:\n" + ("\n".join(lines) if lines else "(none)") + "\n\nReply JSON only. /no_think"
    )
    return user, ids


def parse_reply(text: str, qid: str) -> dict | None:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    code = str(obj.get("code", "")).strip().upper()
    if obj.get("qid") != qid or code not in CODES or not isinstance(obj.get("ok"), bool):
        return None
    return {"ok": code == "OK", "code": code}


def review_one(q: dict, client: Client, facts: dict, searcher: Searcher) -> dict:
    user, ids = build_prompt(q, facts, searcher)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}]
    t0 = time.perf_counter()
    ptok = ctok = 0
    thinking = False
    result = None
    last_text = ""
    attempts = 0
    for attempts in (1, 2):  # ลองใหม่ 1 ครั้งเมื่อเจออักษรจีนหรือ JSON ผิด
        resp = client.chat(messages)
        usage = resp.get("usage") or {}
        ptok += usage.get("prompt_tokens", 0)
        ctok += usage.get("completion_tokens", 0)
        msg = (resp.get("choices") or [{}])[0].get("message") or {}
        content = msg.get("content") or ""
        think_parts = THINK.findall(content)
        if msg.get("reasoning_content") or any(p.strip() for p in think_parts):
            thinking = True
        text = THINK.sub("", content).strip()
        last_text = text
        if CJK.search(text):
            result = {"ok": False, "code": "CJK_LEAK"}
            continue
        parsed = parse_reply(text, q["qid"])
        if parsed is None:
            result = {"ok": False, "code": "BAD_JSON"}
            continue
        result = parsed
        break
    rec = {
        "qid": q["qid"], "book": q["book"], "type": q["type"], **result,
        "latency_s": round(time.perf_counter() - t0, 2),
        "prompt_tokens": ptok, "completion_tokens": ctok,
        "attempts": attempts, "thinking": thinking,
    }
    if q["type"] == "unanswerable":
        rec["searched_ids"] = ids
    if result["code"] in ("CJK_LEAK", "BAD_JSON"):
        rec["raw"] = last_text[:500]
    return rec


# ---------- main ----------

def load_questions(book_filter: str | None) -> list[dict]:
    qs = []
    for p in sorted(QUESTIONS_DIR.glob("*.jsonl")):
        if book_filter and p.stem != book_filter:
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            if line.strip():
                qs.append(json.loads(line))
    return qs


def load_records(out_dir: Path) -> list[dict]:
    recs = []
    for p in sorted(out_dir.glob("*.jsonl")):
        for line in p.read_text(encoding="utf-8").splitlines():
            try:
                recs.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return recs


def done_qids(out_dir: Path) -> set[str]:
    return {r["qid"] for r in load_records(out_dir) if "qid" in r}


# ---------- canary: ทำให้ผิดโดยตั้งใจ เพื่อวัดว่า Qwen จับได้กี่ % ----------

_NUM = re.compile(r"(?<![A-Za-z\d.,\-])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?!\d)")
_MODEL = re.compile(r"B-(100|150|250|500)")
MODEL_SWAP = {"100": "250", "150": "500", "250": "100", "500": "150"}
COLOR_SWAP = [("สีใส", "สีชา"), ("สีชา", "สีใส"), ("สีเขียว", "สีชา"),
              ("clear", "amber"), ("amber", "clear"), ("green", "amber")]


def mutate_number(ans: str, rng) -> str | None:
    nums = list(_NUM.finditer(ans))
    if not nums:
        return None
    m = rng.choice(nums)
    s = m.group(0)
    raw = s.replace(",", "")
    if "." in raw:
        dec = len(raw.split(".")[1])
        v = float(raw)
        nv = v + (0.3 if v < 10 else 5)
        new = f"{nv:,.{dec}f}" if "," in s else f"{nv:.{dec}f}"
    else:
        v = int(raw)
        nv = v + 1 if v < 10 else v * 2
        new = f"{nv:,}" if "," in s else str(nv)
    return ans[:m.start()] + new + ans[m.end():]


def mutate_model(ans: str, rng) -> str | None:
    m = _MODEL.search(ans)
    if not m:
        return None
    return ans.replace(m.group(0), "B-" + MODEL_SWAP[m.group(1)])


def mutate_color(ans: str, rng) -> str | None:
    for old, new in COLOR_SWAP:
        pat = re.compile(re.escape(old), re.I) if old.isascii() else re.compile(re.escape(old))
        if pat.search(ans):
            return pat.sub(new, ans)
    return None


MUTATORS = {"number": mutate_number, "model": mutate_model, "color": mutate_color}


def build_canary(questions: list[dict]) -> tuple[list[dict], dict[str, dict]]:
    """สุ่ม CANARY_N ข้อ (seed คงที่): CANARY_FLIP ข้อเปลี่ยนเป็น unanswerable ทั้งที่มีคำตอบ (คาดหวัง ANSWERABLE)
    ที่เหลือแก้ answer ให้ผิด วนแบบ number → model → color (คาดหวัง WRONG_ANSWER/NOT_IN_FACT)"""
    import random
    rng = random.Random(CANARY_SEED)
    pool = [q for q in questions if q["type"] != "unanswerable"]
    rng.shuffle(pool)
    picked: list[dict] = []
    meta: dict[str, dict] = {}
    direct = [q for q in pool if q["type"] == "direct"]
    for q in direct[:CANARY_FLIP]:
        en = q["book"] == "SS-FAQ-EN"
        bad = {**q, "type": "unanswerable", "fact_ids": [], "pages": [],
               "answer": "The documents do not contain this information." if en else "ไม่มีข้อมูลในเอกสาร"}
        picked.append(bad)
        meta[q["qid"]] = {"mutation": "flip_unanswerable", "expected": "ANSWERABLE",
                          "orig_type": q["type"], "orig_fact_ids": q["fact_ids"],
                          "orig_answer": q["answer"], "mutated_answer": bad["answer"]}
    # วนชนิดการแก้ทีละแบบ แต่ละรอบหยิบข้อถัดไปใน pool ที่แก้แบบนั้นได้ เพื่อให้สัดส่วนสมดุล
    kinds = list(MUTATORS)
    exhausted: set[str] = set()
    while len(picked) < CANARY_N and len(exhausted) < len(kinds):
        for kind in kinds:
            if len(picked) >= CANARY_N or kind in exhausted:
                continue
            for q in pool:
                if q["qid"] in meta:
                    continue
                new = MUTATORS[kind](q["answer"], rng)
                if new and new != q["answer"]:
                    picked.append({**q, "answer": new})
                    meta[q["qid"]] = {"mutation": kind, "expected": "WRONG_ANSWER|NOT_IN_FACT",
                                      "orig_type": q["type"], "orig_answer": q["answer"], "mutated_answer": new}
                    break
            else:
                exhausted.add(kind)
    return picked, meta


def canary_report(out_dir: Path) -> None:
    recs = load_records(out_dir)
    if not recs:
        return
    caught = [r for r in recs if r["code"] in DETECTED]
    pct = len(caught) / len(recs)
    print(f"\n===== CANARY (ทุกข้อใน {out_dir.relative_to(ROOT)}) =====")
    print(f"จับผิดได้ {len(caught)}/{len(recs)} = {pct:.0%} · เป้า ≥ {CANARY_TARGET:.0%} → "
          f"{'PASS' if pct >= CANARY_TARGET else 'FAIL'}")
    by_kind: dict[str, list[dict]] = defaultdict(list)
    for r in recs:
        by_kind[r["mutation"]].append(r)
    for kind, rs in sorted(by_kind.items()):
        c = sum(r["code"] in DETECTED for r in rs)
        codes = Counter(r["code"] for r in rs)
        print(f"  {kind:<18} {c}/{len(rs)}  ({' · '.join(f'{k} {v}' for k, v in codes.most_common())})")
    flips = by_kind.get("flip_unanswerable", [])
    if flips:
        exact = sum(r["code"] == "ANSWERABLE" for r in flips)
        hit = sum(r.get("found_fact", False) for r in flips)
        print(f"  flip_unanswerable ตอบ ANSWERABLE ตรงเป๊ะ {exact}/{len(flips)} · "
              f"ค้นเจอ fact เดิม {hit}/{len(flips)}")
    missed = [r for r in recs if r["code"] not in DETECTED]
    if missed:
        print("\nข้อที่ Qwen จับไม่ได้:")
        for r in sorted(missed, key=lambda r: r["qid"]):
            print(f"  {r['qid']} [{r['mutation']}] {r['code']}\n    เดิม: {r['orig_answer']}\n    แก้: {r['mutated_answer']}")


# ---------- strict-tokens: ตรวจตัวเลข/รหัสรุ่น/สี ใน answer เทียบ statement ของ fact_ids (ไม่เรียก API) ----------

STRICT_DIR = Path(__file__).resolve().parent / "review-strict"
_MODEL_CODE = re.compile(r"(?<![A-Za-z\d])B-?(\d{3})(?!\d)")
_P_CODE = re.compile(r"(?<![A-Za-z\d])P(\d{2})(?!\d)")
THAI_COLORS = ["ใส", "ชา", "เขียว", "ขาว", "ดำ", "น้ำตาล", "ฟ้า", "แดง"]
EN_COLORS = ["clear", "amber", "green", "white", "black", "brown", "blue", "red", "flint"]
# ฝั่ง answer จับสีไทยเฉพาะรูป "สีX" หรือ "B-xxx X" (กัน "ใส่" "ใสใส" "ชาสมุนไพร")
_ANS_THAI_COLOR = re.compile(r"(?:สี|B-\d{3}\s*)(" + "|".join(THAI_COLORS) + r")(?![่-๋])")
_EN_COLOR = re.compile(r"\b(" + "|".join(EN_COLORS) + r")\b", re.I)
_TONE = "[่-๋]"


def model_codes(text: str) -> Counter:
    c = Counter("B-" + m.group(1) for m in _MODEL_CODE.finditer(text))
    c.update("P" + m.group(1) for m in _P_CODE.finditer(text))
    return c


def numbers(text: str) -> set[str]:
    """ตัวเลขทั้งหมด (ตัดรหัสรุ่นออกก่อน) normalize: ตัดจุลภาค ศูนย์นำหน้า ศูนย์ท้ายทศนิยม → 2,400 = 2400 · 0.80 = 0.8"""
    from decimal import Decimal
    t = _P_CODE.sub(" ", _MODEL_CODE.sub(" ", text))
    out = set()
    for m in _NUM.finditer(t):
        d = Decimal(m.group(0).replace(",", ""))
        s = format(d.normalize(), "f")
        out.add(s)
    return out


def answer_colors(text: str) -> set[str]:
    out = {m.group(1) for m in _ANS_THAI_COLOR.finditer(text)}
    out.update(m.group(1).lower() for m in _EN_COLOR.finditer(text))
    return out


def color_in_fact(color: str, fact_text: str) -> bool:
    if color.isascii():
        return re.search(rf"\b{color}\b", fact_text, re.I) is not None
    # ถ้า fact เขียนสีในรูป "สีX"/"B-xxx X" ให้เทียบแบบเดียวกัน (กัน "ชา" ใน "ธรรมชาติ")
    strict = {m.group(1) for m in _ANS_THAI_COLOR.finditer(fact_text)}
    if strict:
        return color in strict
    # fact ไม่มีรูปแบบนั้น → ยอมรับคำสีเดี่ยว ๆ แต่ตัดชื่อบริษัท "ใสใส" และคำที่มีวรรณยุกต์ต่อท้าย (ใส่) ออก
    return re.search(rf"{color}(?!{_TONE})", fact_text.replace("ใสใส", " ")) is not None


def strict_check(answer: str, fact_ids: list[str], facts: dict[str, dict]) -> list[str]:
    """คืนรายการปัญหา (ว่าง = ผ่าน)"""
    fact_text = " ".join(facts[f]["statement"] for f in fact_ids if f in facts)
    issues = []
    missing_ids = [f for f in fact_ids if f not in facts]
    if missing_ids:
        issues.append(f"fact id ไม่มีจริง {missing_ids}")
    fnums = numbers(fact_text)
    for n in sorted(numbers(answer) - fnums):
        issues.append(f"ตัวเลข {n} ไม่อยู่ใน fact")
    acodes, fcodes = model_codes(answer), model_codes(fact_text)
    for code, cnt in sorted(acodes.items()):
        if code not in fcodes:
            issues.append(f"รหัส {code} ไม่อยู่ใน fact")
        elif cnt > fcodes[code]:
            issues.append(f"รหัส {code} ซ้ำ {cnt} ครั้ง แต่ fact มี {fcodes[code]}")
    for c in sorted(answer_colors(answer)):
        if not color_in_fact(c, fact_text):
            issues.append(f"สี {c} ไม่อยู่ใน fact")
    return issues


def run_strict(facts: dict[str, dict]) -> int:
    STRICT_DIR.mkdir(parents=True, exist_ok=True)
    questions = load_questions(None)

    # 1) ข้อจริงทั้งหมด (unanswerable ไม่มี fact_ids จึงข้าม)
    real = []
    for q in questions:
        if q["type"] == "unanswerable":
            continue
        issues = strict_check(q["answer"], q["fact_ids"], facts)
        real.append({"qid": q["qid"], "book": q["book"], "type": q["type"], "ok": not issues, "issues": issues})
    fails = [r for r in real if not r["ok"]]
    (STRICT_DIR / "real.jsonl").write_text(
        "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in real), encoding="utf-8")
    skipped = len(questions) - len(real)
    print(f"===== STRICT-TOKENS: ข้อจริง {len(questions)} ข้อ (ข้าม unanswerable {skipped}) =====")
    print(f"ผ่าน {len(real) - len(fails)}/{len(real)} · ไม่ผ่าน {len(fails)}")
    print("ไม่ผ่านตาม type:", " · ".join(f"{t} {c}" for t, c in Counter(r["type"] for r in fails).most_common()))
    print("ไม่ผ่านตามเล่ม:", " · ".join(f"{b} {c}" for b, c in Counter(r["book"] for r in fails).most_common()))
    qmap = {q["qid"]: q for q in questions}
    for r in fails:
        q = qmap[r["qid"]]
        print(f"  {r['qid']} [{r['type']}] {' ; '.join(r['issues'])}\n    A: {q['answer']}")

    # 2) canary 30 ข้อ (ใช้ fact_ids เดิมของข้อ · flip_unanswerable ไม่มี fact_ids ตรวจแบบนี้ไม่ได้)
    canary_qs, meta = build_canary(questions)
    orig_fids = {q["qid"]: q["fact_ids"] for q in questions}
    qwen = {r["qid"]: r for r in load_records(CANARY_DIR)}
    rows = []
    for q in canary_qs:
        m = meta[q["qid"]]
        if m["mutation"] == "flip_unanswerable":
            issues, applicable = [], False
        else:
            issues, applicable = strict_check(q["answer"], q["fact_ids"], facts), True
        orig_fail = bool(strict_check(m["orig_answer"], orig_fids[q["qid"]], facts))
        qr = qwen.get(q["qid"])
        rows.append({"qid": q["qid"], "mutation": m["mutation"], "strict_applicable": applicable,
                     "strict_caught": bool(issues), "issues": issues, "orig_also_fails": orig_fail,
                     "qwen_code": qr["code"] if qr else None,
                     "qwen_caught": (qr["code"] in DETECTED) if qr else None})
    (STRICT_DIR / "canary.jsonl").write_text(
        "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    n = len(rows)
    s_caught = [r for r in rows if r["strict_caught"]]
    print(f"\n===== STRICT-TOKENS: canary {n} ข้อ =====")
    print(f"strict จับได้ {len(s_caught)}/{n} (ใช้ได้กับ {sum(r['strict_applicable'] for r in rows)} ข้อ · "
          f"flip_unanswerable {n - sum(r['strict_applicable'] for r in rows)} ข้อต้องพึ่ง Qwen)")
    for kind in ("number", "model", "color", "flip_unanswerable"):
        rs = [r for r in rows if r["mutation"] == kind]
        if rs:
            print(f"  {kind:<18} strict {sum(r['strict_caught'] for r in rs)}/{len(rs)}")
    shaky = [r["qid"] for r in s_caught if r["orig_also_fails"]]
    if shaky:
        print(f"  ⚠ จับได้แต่คำตอบเดิมก็ไม่ผ่าน strict อยู่แล้ว (อาจจับเพราะเหตุอื่น): {', '.join(shaky)}")
    have_qwen = sum(r["qwen_code"] is not None for r in rows)
    if have_qwen == 0:
        print("ยังไม่มีผล Qwen canary (qwen/review-canary/ ว่าง) → รัน --canary ก่อนเพื่อดูผลรวม")
        print("ข้อที่ strict จับไม่ได้ (ต้องพึ่ง Qwen):",
              ", ".join(f"{r['qid']}[{r['mutation']}]" for r in rows if not r["strict_caught"]))
    else:
        both = [r for r in rows if r["strict_caught"] or r["qwen_caught"]]
        extra = [r for r in rows if r["strict_caught"] and r["qwen_caught"] is False]
        print(f"Qwen จับได้ {sum(bool(r['qwen_caught']) for r in rows)}/{n} (มีผล {have_qwen} ข้อ) · "
              f"strict จับเพิ่มจากที่ Qwen พลาด {len(extra)} ข้อ: {', '.join(r['qid'] for r in extra) or '-'}")
        print(f"รวม Qwen + strict: {len(both)}/{n} · เป้า {n}/{n} → {'PASS' if len(both) == n else 'FAIL'}")
        missed = [r for r in rows if r not in both]
        for r in missed:
            m = meta[r["qid"]]
            print(f"  พลาดทั้งคู่ {r['qid']} [{r['mutation']}] qwen={r['qwen_code']}\n"
                  f"    เดิม: {m['orig_answer']}\n    แก้: {m['mutated_answer']}")
    print(f"\nบันทึกผลที่ {STRICT_DIR.relative_to(ROOT)}/real.jsonl และ canary.jsonl")
    return 0


def recheck(qids: list[str], client: Client, facts: dict, searcher: Searcher) -> int:
    """ตรวจข้อที่ระบุซ้ำ แล้วเขียนทับเฉพาะบรรทัดของ qid นั้นใน qwen/review/<เล่ม>.jsonl (ไม่มีเดิม = ต่อท้าย)"""
    qmap = {q["qid"]: q for q in load_questions(None)}
    unknown = [qid for qid in qids if qid not in qmap]
    if unknown:
        print(f"ไม่พบ qid: {', '.join(unknown)}")
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    failed = 0
    for qid in qids:
        q = qmap[qid]
        try:
            rec = review_one(q, client, facts, searcher)
        except Exception as e:  # noqa: BLE001 — ไม่แตะไฟล์เดิมถ้าเรียก API ไม่สำเร็จ
            print(f"{qid} ERROR {e} (ไม่แก้ไฟล์)")
            failed += 1
            continue
        path = OUT_DIR / f"{q['book']}.jsonl"
        lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
        new_line = json.dumps(rec, ensure_ascii=False)
        old = None
        for i, line in enumerate(lines):
            try:
                if json.loads(line).get("qid") == qid:
                    old, lines[i] = json.loads(line), new_line
                    break
            except json.JSONDecodeError:
                continue
        else:
            lines.append(new_line)
        path.write_text("".join(l + "\n" for l in lines), encoding="utf-8")
        print(f"{qid} [{q['type']}]\n  Q: {q['question']}\n  A: {q['answer']}")
        print(f"  เดิม: {old['code'] if old else '(ไม่มี)'} → ใหม่: {rec['code']} · {rec['latency_s']}s · "
              f"{rec['prompt_tokens'] + rec['completion_tokens']} tok"
              f"{'  (retry)' if rec['attempts'] > 1 else ''}{'  [THINK]' if rec['thinking'] else ''}")
        if rec.get("searched_ids"):
            print(f"  searched: {', '.join(rec['searched_ids'])}")
        if rec.get("raw"):
            print(f"  raw: {rec['raw'][:200]}")
        print(f"  {'เขียนทับ' if old else 'ต่อท้าย'} {path.relative_to(ROOT)}")
    for note in client.notes:
        print("NOTE:", note)
    return 1 if failed else 0


def stratified(pending: list[dict], n: int) -> list[dict]:
    """เลือก n ข้อแบบวนทุก type และทุกเล่ม เพื่อให้รันทดลองเห็นภาพรวม"""
    by_type: dict[str, list[dict]] = defaultdict(list)
    for q in pending:
        by_type[q["type"]].append(q)
    per_book: Counter = Counter()
    picked = []
    while len(picked) < n and any(by_type.values()):
        for t in sorted(by_type):
            if by_type[t] and len(picked) < n:
                # เลือกข้อจากเล่มที่ถูกเลือกน้อยที่สุด เพื่อให้กระจายครบ 7 เล่ม
                q = min(by_type[t], key=lambda x: per_book[x["book"]])
                by_type[t].remove(q)
                per_book[q["book"]] += 1
                picked.append(q)
    return picked


def main() -> int:
    for s in (sys.stdout, sys.stderr):
        s.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="จำนวนข้อสูงสุดในรอบนี้ (0 = ทั้งหมด)")
    ap.add_argument("--book", help="ตรวจเฉพาะเล่ม เช่น SS-POLICY")
    ap.add_argument("--workers", type=int, default=MAX_WORKERS)
    ap.add_argument("--canary", action="store_true",
                    help=f"สุ่ม {CANARY_N} ข้อ (seed {CANARY_SEED}) ทำให้ผิดโดยตั้งใจ แล้ววัด %% ที่ Qwen จับได้ "
                         "· ผลเขียนที่ qwen/review-canary/")
    ap.add_argument("--strict-tokens", action="store_true",
                    help="ไม่เรียก API: ตัวเลข/รหัสรุ่น/สีใน answer ต้องอยู่ใน fact · รันกับ 770 ข้อ + 30 canary")
    ap.add_argument("--recheck", nargs="+", metavar="QID",
                    help="ตรวจข้อที่ระบุซ้ำ เขียนทับเฉพาะบรรทัดนั้นใน qwen/review/")
    args = ap.parse_args()
    workers = max(1, min(args.workers, MAX_WORKERS))
    if args.strict_tokens:
        return run_strict(load_facts())

    client = Client(load_env(ROOT / ".env"))
    facts = load_facts()
    searcher = Searcher(facts)
    if args.recheck:
        return recheck(args.recheck, client, facts, searcher)
    meta: dict[str, dict] = {}
    if args.canary:
        # canary สุ่มจากทุกเล่มเสมอ (ไม่ใช้ --book) เพื่อให้ชุดคงที่ตาม seed
        questions, meta = build_canary(load_questions(None))
        out_dir = CANARY_DIR
    else:
        questions = load_questions(args.book)
        out_dir = OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    done = done_qids(out_dir)
    pending = [q for q in questions if q["qid"] not in done]
    if args.canary:
        batch = pending[:args.limit] if args.limit else pending
    else:
        batch = stratified(pending, args.limit) if args.limit else pending
    print(f"model={client.model} · {'CANARY · ' if args.canary else ''}คำถาม {len(questions)} · "
          f"ตรวจแล้ว {len(questions) - len(pending)} · รอบนี้ {len(batch)} · workers {workers} · "
          f"ผลที่ {out_dir.relative_to(ROOT)}")
    if not batch:
        if args.canary:
            canary_report(out_dir)
        return 0

    write_lock = threading.Lock()
    results: list[dict] = []
    errors: list[tuple[str, str]] = []
    t_start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(review_one, q, client, facts, searcher): q for q in batch}
        for i, fut in enumerate(as_completed(futs), start=1):
            q = futs[fut]
            try:
                rec = fut.result()
            except Exception as e:  # noqa: BLE001 — เก็บไว้รายงาน ไม่บันทึกเพื่อให้รอบหน้าลองใหม่
                errors.append((q["qid"], str(e)))
                print(f"[{i}/{len(batch)}] {q['qid']:<11} ERROR {e}")
                continue
            if args.canary:
                m = meta[rec["qid"]]
                rec.update(m, caught=rec["code"] in DETECTED)
                if "orig_fact_ids" in m:
                    rec["found_fact"] = bool(set(m["orig_fact_ids"]) & set(rec.get("searched_ids", [])))
            with write_lock:
                with (out_dir / f"{rec['book']}.jsonl").open("a", encoding="utf-8") as f:
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            results.append(rec)
            print(f"[{i}/{len(batch)}] {rec['qid']:<11} {rec['type']:<12} {rec['code']:<12} "
                  f"{rec['latency_s']:>5.1f}s {rec['prompt_tokens'] + rec['completion_tokens']:>5} tok"
                  f"{'  (retry)' if rec['attempts'] > 1 else ''}{'  [THINK]' if rec['thinking'] else ''}")
    wall = time.perf_counter() - t_start

    print("\n===== สรุป =====")
    for note in client.notes:
        print("NOTE:", note)
    if not results:
        print(f"ไม่มีผลสำเร็จ · error {len(errors)} ข้อ")
        return 1
    n = len(results)
    codes = Counter(r["code"] for r in results)
    print("ผล:", " · ".join(f"{c} {k}" for c, k in codes.most_common()))
    lat = sum(r["latency_s"] for r in results) / n
    ptok = sum(r["prompt_tokens"] for r in results) / n
    ctok = sum(r["completion_tokens"] for r in results) / n
    thinking = sum(r["thinking"] for r in results)
    print(f"เวลาต่อข้อ (latency เฉลี่ย): {lat:.2f}s · wall {wall:.1f}s สำหรับ {n} ข้อ "
          f"= {wall / n:.2f}s/ข้อ ที่ {workers} workers")
    print(f"token ต่อข้อ: prompt {ptok:.0f} + completion {ctok:.0f} = {ptok + ctok:.0f}")
    print(f"thinking: {'ปิดได้ (ไม่พบ <think>/reasoning_content)' if thinking == 0 else f'ยังเปิดอยู่ {thinking}/{n} ข้อ — /no_think ไม่ได้ผล'}")
    total = len(questions)
    print(f"ประมาณการ {total} ข้อ: เวลา ~{wall / n * total / 60:.1f} นาที (workers {workers}) · "
          f"token ~{(ptok + ctok) * total:,.0f} (prompt {ptok * total:,.0f} + completion {ctok * total:,.0f})")
    if errors:
        print(f"ERROR {len(errors)} ข้อ (ไม่บันทึก รันใหม่จะลองซ้ำ):")
        for qid, e in errors:
            print(f"  {qid}: {e}")
    if args.canary:
        canary_report(out_dir)
        return 0
    flagged = [r for r in results if r["code"] != "OK"]
    if flagged:
        qmap = {q["qid"]: q for q in questions}
        print("\nข้อที่ไม่ OK:")
        for r in sorted(flagged, key=lambda r: r["qid"]):
            q = qmap[r["qid"]]
            print(f"  {r['qid']} [{r['type']}] {r['code']}\n    Q: {q['question']}\n    A: {q['answer']}")
            if r.get("raw"):
                print(f"    raw: {r['raw'][:200]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
