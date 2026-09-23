#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_dataset.py — รวม 4 แหล่งข้อมูล → train.jsonl / val.jsonl (ChatML)
=======================================================================
แหล่งข้อมูล (ตามสเปก 4 ทาง):

  1. synthetic   — 6,000 ตัวอย่างจาก StateGenerator + rule_engine (ครู)
                   → ลง train เสมอ (synthetic always in train)
  2. shadow      — shadow_log.jsonl (โมเดลตัดสินแบบเงา) ใช้เฉพาะแถวที่มี
                   rule_action (ครูเห็นด้วย) หรือ conf >= 0.75
  3. human       — labels.jsonl ที่มนุษย์ตรวจสอบ {date, state, action}
  4. journal     — journal.jsonl เกรด A (ไม้ชนะ = ตัวอย่างบวก) และ
                   เกรด C / r<0 (ตัวอย่างลบ — สอนว่า "ไม่ควรทำอะไร")

กติกาเขียนไฟล์:
  - dedup ด้วย md5(state+target) — ซ้ำเอาครั้งแรก
  - แบ่ง train/val แบบ TIME-BASED 80% (เรียงตามวันที่, ห้ามสุ่มข้ามเวลา
    กัน leakage) — synthetic ทั้งหมดอยู่ฝั่ง train
  - รูปแบบ ChatML (openai messages): system=SYSTEM_PROMPT, user=state,
    assistant=verdict JSON

ใช้งาน:  python build_dataset.py [--n-synth 6000]
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np

LAB = Path(__file__).resolve().parent
SHADOW_LOG = LAB / "shadow_log.jsonl"
LABELS = LAB / "labels.jsonl"
JOURNAL = LAB / "journal.jsonl"
TRAIN_OUT = LAB / "train.jsonl"
VAL_OUT = LAB / "val.jsonl"

N_SYNTH = 6000
TRAIN_RATIO = 0.80
CONF_MIN = 0.75

# ---------------------------------------------------------- synth_state import
try:
    from synth_state import StateGenerator, synth_state as _imported_synth_state
    HAS_SYNTH = True
except ImportError:                                     # pragma: no cover
    HAS_SYNTH = False
    _imported_synth_state = None


def _fallback_synth_state(seed: int | None = None) -> dict:
    """เครื่องกำเนิดสำรองขั้นต่ำ — ใช้เมื่อ import synth_state ไม่ได้
    (สุ่ม random-walk เล็ก ๆ + verdict อย่างง่าย พออ่าน/รันได้ด้วยตัวเอง)"""
    rng = np.random.default_rng(seed if seed is not None else 42)
    close = float(rng.uniform(20, 200))
    drift = float(rng.choice([-0.02, 0.0, 0.02]))
    atr = close * float(rng.uniform(0.01, 0.04))
    state = {
        "date": f"2026-{int(rng.integers(1, 13)):02d}-{int(rng.integers(1, 29)):02d}",
        "symbol": f"F{int(rng.integers(100, 999))}",
        "close": round(close, 3),
        "atr14": round(atr, 4),
        "day_pnl_R": round(float(rng.uniform(-1.5, 1.5)), 3),
        "week_pnl_R": round(float(rng.uniform(-2.0, 2.0)), 3),
        "loss_streak": int(rng.integers(0, 3)),
        "regime": str(rng.choice(["risk_on", "neutral", "risk_off"])),
        "levels": {"pivot": round(close * 0.995, 3),
                   "support": round(close * 0.96, 3),
                   "resistance": round(close * 1.05, 3)},
        "bars": [{"o": round(close * 0.99, 3), "h": round(close * 1.004, 3),
                  "l": round(close * 0.986, 3), "c": round(close, 3), "v": 1e6}],
        "open_pos": None,
        "meta": {"source": "synthetic-fallback", "synthetic_ohlc": False},
    }
    # verdict อย่างง่าย (ไม่เที่ยบ rule_engine เต็ม — เพียงพอสำหรับ smoke test)
    if state["regime"] == "risk_off" or state["day_pnl_R"] <= -2.0:
        verdict = {"action": "wait", "confidence": 0.85, "stop": None,
                   "target": None, "reason_th": "regime เสี่ยง/วันล็อก — ไม่เข้าไม้",
                   "rules": ["R2.0" if state["regime"] == "risk_off" else "R6.1"]}
    elif drift > 0:
        risk = 2.0 * atr
        verdict = {"action": "buy", "confidence": 0.8,
                   "stop": round(close - risk, 3),
                   "target": round(close + 2 * risk, 3),
                   "reason_th": "โมเมนตัมบวก โครงสร้างพอใช้ → เข้าตามแผน", "rules": ["R5.1", "R5.2"]}
    else:
        verdict = {"action": "wait", "confidence": 0.8, "stop": None,
                   "target": None, "reason_th": "ไม่มี trigger — รอก่อน", "rules": []}
    state["verdict"] = verdict
    return {"state": state, "verdict": verdict}


def synth_state(seed: int | None = None, edge: str | None = None) -> dict:
    """facade: ใช้ของ synth_state.py ถ้ามี — ถ้าไม่มีใช้ fallback ข้างบน
    + กันฟิลด์ขาด (ensure required keys) ทุกครั้ง"""
    if HAS_SYNTH:
        sample = _imported_synth_state(seed=seed, edge=edge)
    else:
        sample = _fallback_synth_state(seed)
    return {"state": _ensure_state_fields(sample.get("state") or {}),
            "verdict": sample.get("verdict") or {}}


def _ensure_state_fields(state: dict) -> dict:
    """เติมฟิลด์ที่ขาดด้วยค่าปลอดภัย — dataset ต้องมีโครงเดียวกันทั้งไฟล์"""
    defaults = {
        "date": "1970-01-01", "symbol": "UNK", "close": 0.0, "atr14": 0.0,
        "day_pnl_R": 0.0, "week_pnl_R": 0.0, "loss_streak": 0,
        "regime": "neutral",
        "levels": {"pivot": None, "support": None, "resistance": None},
        "bars": [], "open_pos": None,
        "meta": {"source": "patched", "synthetic_ohlc": False},
    }
    for k, v in defaults.items():
        if k not in state or state[k] is None:
            state[k] = v
    state.setdefault("level", "range")
    state.setdefault("triggers", [])
    state.setdefault("risk", {})
    state.setdefault("flags", [])
    return state


# ---------------------------------------------------------- ChatML
def chatml_record(state: dict, verdict: dict) -> dict:
    """รูปแบบ ChatML (openai messages) — system/user/assistant
    user = prompt_state(state): ตัด "verdict" ที่ state_gen/synth_state ฝังไว้ออก — เดิมคำตอบ
    assistant อยู่ใน prompt ทุกแถว (โมเดลเรียนแค่ลอก) และต้องตรงกับที่ nimble_runner ส่งตอนตัดสิน"""
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",
             "content": json.dumps(prompt_state(state), ensure_ascii=False, sort_keys=True)},
            {"role": "assistant",
             "content": json.dumps(verdict, ensure_ascii=False, sort_keys=True)},
        ]
    }


# SYSTEM_PROMPT มาจาก nimble_runner (ไม่ต้องลง llama-cpp — import ไม่ล้ม)
try:
    from nimble_runner import SYSTEM_PROMPT, SCHEMA, prompt_state  # noqa: F401
except ImportError:                                     # pragma: no cover
    SYSTEM_PROMPT = (
        "คุณคือ Jev — สมองตัดสินใจเทรดหุ้นไทย (paper mode) "
        "ตอบเฉพาะ JSON ตาม schema ที่กำหนด"
    )

    def prompt_state(state: dict) -> dict:
        """สำรอง: ตัดคำตอบครู (verdict) ออกจาก prompt"""
        return {k: v for k, v in state.items() if k != "verdict"}


def md5_dedup_key(state: dict, target_action: str) -> str:
    """dedup key = md5(state JSON + target action) — ตามสเปก"""
    raw = json.dumps({"s": state, "a": target_action},
                     ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.md5(raw).hexdigest()


def verdict_for(action: str, source: str, base: dict | None = None) -> dict:
    """ประกอบ verdict จาก action เป้าหมาย (คง stop/target/reason จาก base ถ้ามี)"""
    v = dict(base or {})
    v["action"] = action
    v.setdefault("confidence", 0.85)
    v.setdefault("stop", None)
    v.setdefault("target", None)
    v.setdefault("reason_th", f"คำตอบมาตรฐานจาก {source}")
    v.setdefault("rules", [])
    return v


# ---------------------------------------------------------- 4 sources
def source_synthetic(n: int, seed: int = 42) -> list[dict]:
    """1) synthetic n ตัวอย่าง (edge 30% ตาม EDGE_WEIGHTS) — split=train เสมอ"""
    if HAS_SYNTH:
        gen = StateGenerator(seed=seed)
        batch = gen.generate_batch(n, edge_ratio=0.30, seed=seed)
        return [(s, s["verdict"], "synthetic", "train") for s in batch]
    # fallback: สุ่มด้วย seed อนุพันธ์ → deterministic เหมือนกัน
    out = []
    for i in range(n):
        sample = _fallback_synth_state(seed=seed * 100_000 + i)
        sample["state"] = _ensure_state_fields(sample["state"])
        out.append((sample["state"], sample["verdict"], "synthetic", "train"))
    return out


def source_shadow() -> list[dict]:
    """2) shadow states — เฉพาะแถวที่ใช้เป็นครูได้ (rule ยืนยัน หรือ conf ผ่าน)"""
    out = []
    if not SHADOW_LOG.exists():
        return out
    with SHADOW_LOG.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            state = row.get("state")
            if not state:
                continue
            rule_action = row.get("rule_action")
            conf = float(row.get("confidence") or 0.0)
            if rule_action:
                target, base, src = rule_action, None, "shadow(rule)"
            elif conf >= CONF_MIN and row.get("grammar_valid"):
                target, base, src = row.get("model_action"), \
                    {"confidence": conf, "stop": row.get("stop"),
                     "target": row.get("target"),
                     "reason_th": row.get("reason_th", ""),
                     "rules": row.get("rules", [])}, "shadow(model)"
            else:
                continue        # ไม่มีครู + conf ต่ำ → ไม่สอนจากมัน
            out.append((_ensure_state_fields(state),
                        verdict_for(target, src, base), src,
                        str(row.get("date", "1970-01-01"))))
    return out


def source_human() -> list[dict]:
    """3) human labels — labels.jsonl: {date, state:{...}, action, note?}"""
    out = []
    if not LABELS.exists():
        return out
    with LABELS.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            state, action = row.get("state"), row.get("action")
            if not state or not action:
                continue
            out.append((_ensure_state_fields(state),
                        verdict_for(action, "human", {"confidence": 0.95}),
                        "human", str(row.get("date", "1970-01-01"))))
    return out


def source_journal() -> list[dict]:
    """4) journal เกรด A / C-negative — ไม้ชนะเป็นตัวอย่างบวก, ไม้แพ้สอนทางออก"""
    out = []
    if not JOURNAL.exists():
        return out
    with JOURNAL.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if row.get("type") != "trade":
                continue
            state, action = row.get("state"), row.get("action")
            if not state or not action:
                continue
            r = float(row.get("r") or 0.0)
            grade = str(row.get("grade") or ("A" if r >= 0 else "C"))
            if grade == "A" and r >= 0:
                target, src = action, "journal-A"          # ทำถูก → สอนซ้ำ
            elif grade == "C" or r < 0:
                # ตัวอย่างลบ: สอน action ที่ "ควรทำ" แทน — better_action ถ้าระบุ
                target = row.get("better_action") or "wait"
                src = "journal-C-neg"
            else:
                continue
            out.append((_ensure_state_fields(state),
                        verdict_for(target, src, {"confidence": 0.9}),
                        src, str(row.get("date", "1970-01-01"))))
    return out


# ---------------------------------------------------------- split + write
def time_based_split(rows: list[dict], ratio: float = TRAIN_RATIO):
    """แบ่งตามเวลา 80%: เรียงวันที่ไม่ซ้ำ → วันก้อนแรก 80% = train, ที่เหลือ = val"""
    dated = sorted([r for r in rows if r["date"] != "1970-01-01"],
                   key=lambda r: r["date"])
    undated = [r for r in rows if r["date"] == "1970-01-01"]
    dates = sorted({r["date"] for r in dated})
    cut = int(len(dates) * ratio)
    train_dates = set(dates[:cut])
    train = [r for r in dated if r["date"] in train_dates] + undated
    val = [r for r in dated if r["date"] not in train_dates]
    return train, val


def write_jsonl(path: Path, records: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as fh:
        for rec in records:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description="รวม 4 แหล่ง → train/val (ChatML)")
    ap.add_argument("--n-synth", type=int, default=N_SYNTH)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--no-synthetic", action="store_true",
                    help="ข้าม synthetic (ใช้เฉพาะข้อมูลจริง)")
    args = ap.parse_args()

    print("=== build_dataset — รวม 4 แหล่ง ===")
    all_rows = []

    # 1) synthetic → train เสมอ
    if not args.no_synthetic:
        synth = source_synthetic(args.n_synth, seed=args.seed)
        print(f"  1) synthetic   : {len(synth):,} ตัวอย่าง → train เสมอ")
        all_rows += synth
    else:
        print("  1) synthetic   : ข้าม (--no-synthetic)")

    # 2-4) ข้อมูลจริงแบบมีวันที่ → เข้าโรงหว่าน time split
    shadow = source_shadow()
    human = source_human()
    journal = source_journal()
    print(f"  2) shadow      : {len(shadow):,} (จาก {SHADOW_LOG.name})")
    print(f"  3) human labels: {len(human):,} (จาก {LABELS.name})")
    print(f"  4) journal     : {len(journal):,} (จาก {JOURNAL.name})")
    all_rows += shadow + human + journal

    # dedup ด้วย md5 — ซ้ำเอาครั้งแรก
    seen, deduped = set(), []
    for state, verdict, src, date in all_rows:
        key = md5_dedup_key(state, verdict["action"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append({"state": state, "verdict": verdict, "source": src,
                        "date": date})
    print(f"  dedup md5      : {len(all_rows):,} → {len(deduped):,} แถว "
          f"(ตัดซ้ำ {len(all_rows) - len(deduped):,})")

    # split: synthetic (date=1970 marker จาก source) อยู่ train เสมอ
    synth_rows = [r for r in deduped if r["source"] == "synthetic"]
    real_rows = [r for r in deduped if r["source"] != "synthetic"]
    train_real, val = time_based_split(real_rows)
    train = synth_rows + train_real

    write_jsonl(TRAIN_OUT, [chatml_record(r["state"], r["verdict"]) for r in train])
    write_jsonl(VAL_OUT, [chatml_record(r["state"], r["verdict"]) for r in val])

    print(f"\n  train.jsonl : {len(train):,} แถว "
          f"(synthetic {len(synth_rows):,} + จริง {len(train_real):,})")
    print(f"  val.jsonl   : {len(val):,} แถว (time-based 80/20 — synthetic ไม่หลุดเข้า val)")
    if len(val) == 0:
        print("  [WARN] val ว่าง — เพิ่ม shadow/human/journal ข้อมูลก่อน fine-tune จริง")
    print(f"\nต่อไป: fine-tune ด้วย lora_nimble_core.yaml แล้วประเมินด้วย eval_harness.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
