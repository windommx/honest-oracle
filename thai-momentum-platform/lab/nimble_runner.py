#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
nimble_runner.py — ตัวกระทำเงา (Shadow Judge): ให้โมเดล LLM ตัดสิน state รายวัน
===============================================================================
โหลดโมเดลเล็ก (GGUF ผ่าน llama-cpp-python) ป้อน state JSON ทีละตัว แล้วบันทึก
คำตอบลง shadow_log.jsonl (≈ ตาราง ShadowLog ของแพลตฟอร์ม) เพื่อรอวัดผลจริง:

  - dedup ด้วย key = md5("<date>|<asset>")[:12] — state เดิมไม่ตัดสินซ้ำ
  - บังคับ grammar ผ่าน json_schema (SCHEMA ด้านล่าง)
  - conf < CONF_MIN (0.75) ยังบันทึก แต่ติด flag conf_pass=false
  - ถ้า import state_gen ได้ → คำนวณ rule_action เก็บไว้ด้วย
    (แท็บ Agreement ของ shadow_dash.py ใช้คู่นี้ทำ crosstab)

⚠️ ต้องติดตั้ง llama-cpp-python เฉพาะเครื่อง local เท่านั้น:
     pip install llama-cpp-python
   (บนเครื่อง sandbox ของแพลตฟอร์มไม่ต้องมี — สคริปต์อื่น import ค่าคงที่
    SYSTEM_PROMPT/SCHEMA ได้โดยไม่ล้ม)

ใช้งาน:
  python nimble_runner.py --model ./models/jev-nimble-core.gguf \
         --states states --date 2026-09-19
"""

import argparse
import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------- llama_cpp
try:
    from llama_cpp import Llama  # type: ignore
    HAS_LLAMA = True
except ImportError:                      # เครื่องที่ไม่ได้ลง → ยัง import ได้
    Llama = None
    HAS_LLAMA = False

LAB = Path(__file__).resolve().parent
DEFAULT_LOG = LAB / "shadow_log.jsonl"
CONF_MIN = 0.75                          # ต่ำกว่านี้ = ไม่ผ่านเกณฑ์ความมั่นใจ

# ---------------------------------------------------------------- prompt
SYSTEM_PROMPT = (
    "คุณคือ Jev — สมองตัดสินใจเทรดหุ้นไทย (paper mode) "
    "หน้าที่: อ่าน state JSON ของหุ้น 1 ตัว แล้วตัดสินใจตามวินัยของระบบ\n"
    "กติกาที่ต้องเคารพเสมอ: S1 ไส้เทียน<=2x body, S2 ปิดใน 2/3 บนของแท่ง, "
    "S3 ATR>6% งดเทรด, R2.0 regime risk_off ห้ามเปิดไม้, "
    "R3.1 โดน stop แล้ว freeze 2 แท่ง, R3.2 ราคาวิ่งหนีห้ามไล่, "
    "R5.1 stop ห่าง<=8% และ<=2xATR, R5.2 RR>=2, R5.0 แตะ stop ออกทันที, "
    "R5.3 ถึงเป้าเก็บกำไร, R6.1 day_pnl_R<=-2 ห้ามเข้าใหม่\n"
    "ตอบเฉพาะ JSON ตาม schema ที่กำหนด — ห้ามอธิบายอย่างอื่น"
)

# JSON schema ที่บังคับเอาต์พุต (json_schema ของ llama-cpp)
SCHEMA = {
    "type": "object",
    "properties": {
        "action": {"type": "string",
                   "enum": ["buy", "hold", "exit", "reduce", "wait"]},
        "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
        "stop": {"type": ["number", "null"]},
        "target": {"type": ["number", "null"]},
        "reason_th": {"type": "string"},
        "rules": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["action", "confidence", "reason_th"],
}

STATE_KEYS_REQUIRED = ("date", "symbol", "close", "regime", "levels")


# ---------------------------------------------------------------- helpers
def state_key(date: str, asset: str) -> str:
    """key สำหรับ dedup — md5('<date>|<asset>')[:12] ตามสเปก"""
    raw = f"{date}|{asset}".encode("utf-8")
    return hashlib.md5(raw).hexdigest()[:12]


def load_logged_keys(log_path: Path) -> set:
    """อ่าน key ที่เคย log แล้วทั้งหมด (กันตัดสินซ้ำข้ามรอบ)"""
    keys: set = set()
    if not log_path.exists():
        return keys
    with log_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                k = json.loads(line).get("key")
                if k:
                    keys.add(k)
            except json.JSONDecodeError:
                continue
    return keys


def collect_states(src: Path) -> list[Path]:
    """รับได้ทั้งไฟล์เดียวและโฟลเดอร์ states/ (เอาเฉพาะ *.json)"""
    if src.is_file():
        return [src]
    if src.is_dir():
        return sorted(src.glob("*.json"))
    raise SystemExit(f"ไม่พบ states ที่ {src}")


def rule_action_of(state: dict):
    """ถ้า import state_gen ได้ → ครูตัดสินซ้ำเพื่อเทียบ (แท็บ Agreement)"""
    try:
        from state_gen import rule_engine  # local import — ไม่บังคับตอนใช้จริง
        return rule_engine(state).get("action")
    except Exception:
        return None


# ---------------------------------------------------------------- judge
def judge_state(llm, state: dict, n_ctx: int = 4096) -> dict:
    """ถามโมเดล 1 state → parse + ตรวจ grammar → dict ผล"""
    user = json.dumps(state, ensure_ascii=False, sort_keys=True)
    t0 = time.time()
    grammar_valid = True
    try:
        resp = llm.create_chat_completion(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user},
            ],
            response_format={"type": "json_object", "schema": SCHEMA},
            max_tokens=256,
            temperature=0.1,
        )
        text = resp["choices"][0]["message"]["content"] or ""
        verdict = json.loads(text)
    except TypeError:
        # llama-cpp เวอร์ชันเก่าไม่มี response_format → ใช้ grammar ตรง ๆ
        try:
            from llama_cpp import LlamaGrammar  # type: ignore
            grammar = LlamaGrammar.from_json_schema(json.dumps(SCHEMA))
            out = llm(user, max_tokens=256, temperature=0.1, grammar=grammar,
                      stop=["<|im_end|>"])
            text = out["choices"][0]["text"]
            verdict = json.loads(text)
        except Exception:
            grammar_valid = False
            verdict = {"action": "wait", "confidence": 0.0,
                       "reason_th": "parse fail (grammar)", "rules": []}
    except Exception:
        grammar_valid = False
        verdict = {"action": "wait", "confidence": 0.0,
                   "reason_th": "parse fail (schema)", "rules": []}

    ok_keys = isinstance(verdict, dict) and "action" in verdict \
        and verdict.get("action") in ("buy", "hold", "exit", "reduce", "wait")
    grammar_valid = bool(grammar_valid and ok_keys)
    conf = float(verdict.get("confidence") or 0.0) if grammar_valid else 0.0
    return {
        "action": verdict.get("action") if grammar_valid else "wait",
        "confidence": round(min(max(conf, 0.0), 1.0), 3),
        "stop": verdict.get("stop"),
        "target": verdict.get("target"),
        "reason_th": str(verdict.get("reason_th", ""))[:500],
        "rules": verdict.get("rules") or [],
        "grammar_valid": grammar_valid,
        "latency_ms": int((time.time() - t0) * 1000),
    }


def append_log(log_path: Path, row: dict) -> None:
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")


# ---------------------------------------------------------------- main
def main() -> int:
    ap = argparse.ArgumentParser(description="Shadow judge — LLM ตัดสิน state แบบเงา")
    ap.add_argument("--model", required=True, help="path โมเดล GGUF เช่น ./models/jev-nimble-core.gguf")
    ap.add_argument("--states", default=str(LAB / "states"),
                    help="ไฟล์ state .json หรือโฟลเดอร์ (default: lab/states)")
    ap.add_argument("--log", default=str(DEFAULT_LOG), help="shadow_log.jsonl")
    ap.add_argument("--date", default=None, help="บังคับวันที่ใน log (default: ตาม state)")
    ap.add_argument("--n-ctx", type=int, default=4096)
    ap.add_argument("--limit", type=int, default=0, help="จำกัดจำนวน state (0=ทั้งหมด)")
    ap.add_argument("--force", action="store_true", help="ตัดสินซ้ำแม้ key เคย log แล้ว")
    args = ap.parse_args()

    if not HAS_LLAMA:
        print("[ERROR] ยังไม่ได้ติดตั้ง llama-cpp-python", file=sys.stderr)
        print("        ติดตั้งก่อนใช้งาน:  pip install llama-cpp-python", file=sys.stderr)
        print("        (หมายเหตุ: สคริปต์อื่นในชุด import SYSTEM_PROMPT/SCHEMA ได้โดยไม่ต้องมี)",
              file=sys.stderr)
        return 2
    model_path = Path(args.model)
    if not model_path.exists():
        print(f"[ERROR] ไม่พบโมเดล: {model_path}", file=sys.stderr)
        return 2

    log_path = Path(args.log)
    logged = load_logged_keys(log_path)
    state_files = collect_states(Path(args.states))
    if args.limit > 0:
        state_files = state_files[: args.limit]

    print(f"โหลดโมเดล {model_path.name} (n_ctx={args.n_ctx}) …")
    llm = Llama(model_path=str(model_path), n_ctx=args.n_ctx, verbose=False)

    n_new = n_skip = 0
    for path in state_files:
        try:
            state = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            print(f"  [ข้าม] {path.name}: {exc}")
            continue
        if not all(k in state for k in STATE_KEYS_REQUIRED):
            print(f"  [ข้าม] {path.name}: state ไม่ครบฟิลด์ {STATE_KEYS_REQUIRED}")
            continue

        date = args.date or state["date"]
        asset = state["symbol"]
        key = state_key(date, asset)
        if key in logged and not args.force:
            n_skip += 1
            continue

        res = judge_state(llm, state, args.n_ctx)
        row = {
            "key": key,
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "date": date,
            "asset": asset,
            "model_action": res["action"],
            "confidence": res["confidence"],
            "conf_pass": res["confidence"] >= CONF_MIN,
            "stop": res["stop"],
            "target": res["target"],
            "reason_th": res["reason_th"],
            "rules": res["rules"],
            "grammar_valid": res["grammar_valid"],
            "latency_ms": res["latency_ms"],
            "rule_action": rule_action_of(state),
            "state": state,
            "meta": {"model": model_path.name, "n_ctx": args.n_ctx,
                     "conf_min": CONF_MIN},
        }
        append_log(log_path, row)
        logged.add(key)
        n_new += 1
        agree = "==" if row["rule_action"] in (None, row["model_action"]) else "!="
        print(f"  {asset:<10} model={row['model_action']:<6} conf={row['confidence']:.2f} "
              f"{agree} rule={row['rule_action']} [{path.name}]")

    print(f"\nเสร็จ: ตัดสินใหม่ {n_new} state, ข้าม (dedup) {n_skip} → {log_path}")
    print("ต่อไป: python eval_harness.py / streamlit run shadow_dash.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
