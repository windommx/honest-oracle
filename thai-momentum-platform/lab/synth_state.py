#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
synth_state.py — เครื่องสร้าง state จำลอง + คำตอบจากครู (rule_engine)
=====================================================================
ทำหน้าที่เป็น "แหล่งข้อมูลฝึก" ของ LAB KIT: สุ่ม state ทั้งแบบปกติและแบบ
edge case 10 รูปแบบ แล้วให้ rule_engine (state_gen.py) ตัดสินเป็นคำตอบจริง
(teacher label) — โมเดลที่ฝึกต้องทำได้ตรงกับครู ≥97% (เกณฑ์ G1)

Edge case 10 แบบ (ครอบทุกกฎ):
  1. stop_hit_gap     — gap อ่อนทะลุ stop          → exit (R5.0)
  2. wick_trap        — ไส้เทียนยาวหลอก           → wait (S1)
  3. close_weak       — ทะลุแนวต้านแต่ปิดอ่อน      → wait (S2)
  4. day_locked       — ขาดทุนวันเกิน -2R          → wait (R6.1)
  5. freeze_active    — เพิ่งโดน stop ยังไม่ครบ 2 แท่ง → wait (R3.1)
  6. missed_run       — ราคาวิ่งหนีจุดเข้า          → wait (R3.2)
  7. rr_too_small     — เป้าใกล้เกิน RR<2           → wait (R5.2)
  8. vol_too_high     — ATR > 6% ของราคา           → wait (S3)
  9. target_hit       — ถึงเป้าหมาย                 → exit (R5.3)
 10. regime_flip      — ตลาดพลิกเป็น risk_off        → wait (R2.0)

ใช้งาน:
  from synth_state import StateGenerator, synth_state, gen_normal, gen_edge, generate_batch
  python synth_state.py        # เดโม seed=42
"""

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from state_gen import rule_engine  # noqa: E402  (ครูตัดสินด้วยกฎเดียวกัน)

EDGE_TYPES = [
    "stop_hit_gap", "wick_trap", "close_weak", "day_locked", "freeze_active",
    "missed_run", "rr_too_small", "vol_too_high", "target_hit", "regime_flip",
]
EDGE_WEIGHTS = {t: 0.10 for t in EDGE_TYPES}     # สุ่มเท่ากันทุกแบบ


class StateGenerator:
    """สุ่ม state + verdict จากครู — ทุกอย่าง deterministic ผ่าน seed"""

    def __init__(self, seed: int = 42):
        self.seed = int(seed)
        self._rng = np.random.default_rng(self.seed)
        self._n = 0

    # ---------------------------------------------------------- helpers
    def _next_seed(self) -> int:
        self._n += 1
        return int(self._rng.integers(0, 2**31 - 1)) + self._n

    def _bars(self, rng, close: float, clean: bool = True, wick_trap: bool = False,
              close_pos: float | None = None) -> list[dict]:
        """สร้างแท่งเทียน 3 แท่ง — ปรับคุณภาพตาม edge case"""
        bars = []
        for _ in range(3):
            body = float(rng.uniform(0.8, 2.2))
            up = bool(rng.random() < 0.6)
            o = close - body if up else close + body
            c = close if up else close
            c = close
            if close_pos is not None:
                # บังคับตำแหน่งปิดในแท่ง (S2)
                rng_len = body / max(close_pos, 0.05) if close_pos > 0 else body * 3
                h = o + (1.0 - close_pos) * rng_len
                l = o - close_pos * rng_len
            elif clean and not wick_trap:
                h, l = max(o, c) + 0.05 * body, min(o, c) - 0.05 * body
            else:  # wick_trap: ไส้รวม > 2×body
                h, l = max(o, c) + 1.5 * body, min(o, c) - 1.5 * body
            bars.append({"o": round(float(o), 3), "h": round(float(h), 3),
                         "l": round(float(l), 3), "c": round(float(c), 3),
                         "v": float(rng.uniform(1e5, 5e6))})
            close = c * float(rng.uniform(0.985, 1.015))
        return bars

    def _base_state(self, rng, close: float, regime: str = "risk_on") -> dict:
        atr = float(rng.uniform(0.01, 0.03)) * close
        levels = {"pivot": round(close * 0.995, 3),
                  "support": round(close * 0.97, 3),
                  "resistance": round(close * 1.06, 3)}
        st = {
            "date": f"2026-{int(rng.integers(1, 13)):02d}-{int(rng.integers(1, 29)):02d}",
            "symbol": f"S{int(rng.integers(100, 999))}",
            "close": round(float(close), 3),
            "atr14": round(atr, 4),
            "day_pnl_R": round(float(rng.uniform(-1.0, 1.2)), 3),
            "week_pnl_R": round(float(rng.uniform(-2.0, 2.5)), 3),
            "loss_streak": int(rng.integers(0, 2)),
            "regime": regime,
            "levels": levels,
            "bars": self._bars(rng, close),
            "open_pos": None,
            "meta": {"source": "synthetic", "synthetic_ohlc": False},
        }
        # แท่งสุดท้ายคือแท่งวันนี้ → ให้ราคาใกล้เคียง close ล่าสุด
        st["bars"][-1]["c"] = st["close"]
        return st

    # ---------------------------------------------------------- normal
    def gen_normal(self, seed: int | None = None) -> dict:
        """สถานการณ์ปกติ: มี trigger หรือไม่มี — ครูตัดสินตามกฎธรรมดา"""
        rng = np.random.default_rng(seed if seed is not None else self._next_seed())
        close = float(rng.uniform(20, 200))
        regime = str(rng.choice(["risk_on", "risk_on", "neutral", "risk_off"]))
        st = self._base_state(rng, close, regime)
        if rng.random() < 0.55:   # ยกให้เกิด breakout → ทดสอบทางเข้า
            st["levels"]["resistance"] = round(close * 0.995, 3)
            st["bars"][-1]["o"] = round(close * 0.98, 3)
            st["bars"][-1]["h"] = round(close * 1.005, 3)
            st["bars"][-1]["l"] = round(close * 0.978, 3)
            st["bars"][-1]["c"] = st["close"]
        elif rng.random() < 0.5:  # ยกให้ย่อเข้า support แล้วได้แนวรับ (pullback_hold)
            st["levels"]["support"] = round(close * 0.999, 3)
            st["bars"][-1]["o"] = round(close * 0.99, 3)
            st["bars"][-1]["h"] = round(close * 1.002, 3)
            st["bars"][-1]["l"] = round(close * 0.988, 3)
            st["bars"][-1]["c"] = st["close"]
        return self._finish(st)

    # ---------------------------------------------------------- edge cases
    def gen_edge(self, kind: str, seed: int | None = None) -> dict:
        rng = np.random.default_rng(seed if seed is not None else self._next_seed())
        close = float(rng.uniform(20, 200))
        st = self._base_state(rng, close, "risk_on")

        if kind == "stop_hit_gap":       # R5.0 → exit
            stop = round(close * 1.05, 3)          # gap อ่อนทะลุ stop
            st["open_pos"] = {"entry": round(close * 1.12, 3), "stop": stop,
                              "target": round(close * 1.30, 3), "bars_held": 3}
            st["bars"][-1] = {"o": round(close * 1.09, 3), "h": round(close * 1.09, 3),
                              "l": round(close * 0.99, 3), "c": st["close"], "v": 9e5}
            st["levels"]["support"] = round(close * 1.08, 3)
        elif kind == "wick_trap":       # S1 → wait (ไส้รวม 7.5% > 2×body 1%)
            st["levels"]["resistance"] = round(close * 0.995, 3)
            # fix atr กัน missed ยิงแย่งซีน: missed = close > res + 0.5×ATR → ATR 1.0% วางพอดีขอบ (res+0.5ATR = close)
            # ปัดเศษตัดสินแทน (~50% กลายเป็น R3.2) → ใช้ 1.2% ให้เหลือระยะ 0.1% เหนือ close เสมอ
            st["atr14"] = round(close * 0.012, 4)
            # body 0.01c, ไส้บน 0.025c + ไส้ล่าง 0.05c → wick 7.5% > 2×body ✓ แต่ close_pos 0.71 ✓
            st["bars"][-1] = {"o": round(close * 0.99, 3), "h": round(close * 1.025, 3),
                              "l": round(close * 0.94, 3), "c": st["close"], "v": 9e5}
        elif kind == "close_weak":       # S2 → wait (ทะลุแนวต้านแต่ปิดต่ำในแท่ง)
            st["levels"]["resistance"] = round(close * 0.995, 3)
            st["atr14"] = round(close * 0.012, 4)  # เหมือน wick_trap — ห่างขอบ missed (R3.2)
            # ไส้สะอาด (S1 ผ่าน) แต่ close_pos ≈ 0.29 < 2/3 → S2 ไม่ผ่านเฉพาะจุด
            st["bars"][-1] = {"o": round(close * 1.02, 3), "h": round(close * 1.025, 3),
                              "l": round(close * 0.99, 3), "c": st["close"], "v": 8e5}
        elif kind == "day_locked":       # R6.1 → wait
            st["day_pnl_R"] = round(float(rng.uniform(-3.5, -2.0)), 3)
        elif kind == "freeze_active":    # R3.1 → wait
            st["last_exit"] = {"just_stopped": True, "closes_since_stop": 1,
                               "reason": "stop"}
            st["levels"]["resistance"] = round(close * 0.995, 3)
        elif kind == "missed_run":       # R3.2 → wait
            st["levels"]["resistance"] = round(close - 3.0 * st["atr14"], 3)
        elif kind == "rr_too_small":     # R5.2 → wait (pullback ได้แนวรับ แต่เป้าใกล้ → RR 1.5)
            st["atr14"] = round(close * 0.01, 4)                  # fix atr → band 0.25%
            st["levels"]["support"] = round(close * 0.9985, 3)    # แนวรับชิด → at_support
            st["levels"]["resistance"] = round(close * 1.006, 3)  # เป้าหมายใกล้ → RR < 2
            st["bars"][-1] = {"o": round(close * 0.995, 3), "h": round(close * 1.002, 3),
                              "l": round(close * 0.993, 3), "c": st["close"], "v": 7e5}
        elif kind == "vol_too_high":     # S3 → wait
            st["atr14"] = round(close * 0.08, 4)                  # 8% ของราคา
            st["levels"]["resistance"] = round(close * 0.995, 3)
            st["bars"][-1]["o"] = round(close * 0.98, 3)
            st["bars"][-1]["h"] = round(close * 1.005, 3)
            st["bars"][-1]["l"] = round(close * 0.978, 3)
            st["bars"][-1]["c"] = st["close"]
        elif kind == "target_hit":       # R5.3 → exit
            st["open_pos"] = {"entry": round(close * 0.92, 3),
                              "stop": round(close * 0.88, 3),
                              "target": round(close * 0.995, 3), "bars_held": 5}
            st["bars"][-1]["h"] = round(close * 1.01, 3)
        elif kind == "regime_flip":      # R2.0 → wait/reduce
            st["regime"] = "risk_off"
            st["levels"]["resistance"] = round(close * 0.995, 3)
            st["bars"][-1]["o"] = round(close * 0.98, 3)
            st["bars"][-1]["h"] = round(close * 1.005, 3)
            st["bars"][-1]["l"] = round(close * 0.978, 3)
            st["bars"][-1]["c"] = st["close"]
        else:
            raise ValueError(f"unknown edge kind: {kind} (มี 10 แบบเท่านั้น)")
        return self._finish(st, edge=kind)

    # ---------------------------------------------------------- finish
    def _finish(self, st: dict, edge: str | None = None) -> dict:
        """คำนวณ level/triggers/risk แล้วให้ครู (rule_engine) ตัดสิน"""
        from state_gen import level_status, trigger_eval, risk_fields  # local import
        atr = max(st.get("atr14") or 0.0, 1e-9)
        st["level"] = level_status(st["close"], st["levels"], atr)
        st["triggers"] = trigger_eval(st)
        st["risk"] = risk_fields(st)
        st["flags"] = ([f"edge:{edge}"] if edge else []) + \
            [t for t in ("day_locked", "freeze_active", "missed") if t in st["triggers"]]
        st["verdict"] = rule_engine(st)
        if edge:
            st["meta"]["edge"] = edge
        return st

    # ---------------------------------------------------------- batch
    def generate_batch(self, n: int, edge_ratio: float = 0.30,
                       seed: int | None = None) -> list[dict]:
        """สุ่ม n ตัวอย่าง: (1-edge_ratio) ปกติ + edge_ratio แบบ edge case
        (แจกแจง edge ตาม EDGE_WEIGHTS — ตามสเปก 30%)"""
        rng = np.random.default_rng(seed if seed is not None else self.seed)
        n_edge = int(round(n * edge_ratio))
        kinds = rng.choice(EDGE_TYPES, size=n_edge, p=list(EDGE_WEIGHTS.values()))
        batch = [self.gen_edge(str(k)) for k in kinds]
        batch += [self.gen_normal() for _ in range(n - n_edge)]
        rng.shuffle(batch)
        return batch


# ---------------------------------------------------------------- convenience
def synth_state(seed: int | None = None, edge: str | None = None) -> dict:
    """สุ่ม 1 ตัวอย่าง → {"state": ..., "verdict": ...} (ใช้จาก build_dataset.py)"""
    g = StateGenerator(seed if seed is not None else 42)
    st = g.gen_edge(edge) if edge else g.gen_normal()
    return {"state": st, "verdict": st["verdict"]}


def gen_normal(seed: int | None = None) -> dict:
    """สุ่ม state ปกติ 1 ตัวอย่าง (มี verdict ฝังใน state แล้ว)"""
    return StateGenerator().gen_normal(seed)


def generate_batch(n: int, seed: int = 42, edge_ratio: float = 0.30) -> list[dict]:
    """ชุด n ตัวอย่างจาก seed เดียว (deterministic) — eval_harness.py ใช้ seed 123 / 789"""
    return StateGenerator(seed).generate_batch(n, edge_ratio=edge_ratio, seed=seed)


def gen_edge(kind: str, seed: int | None = None) -> dict:
    """สุ่ม state แบบ edge case ระบุชนิด (มี verdict ฝังใน state แล้ว)"""
    return StateGenerator().gen_edge(kind, seed)


# ---------------------------------------------------------------- demo
if __name__ == "__main__":
    gen = StateGenerator(seed=42)
    batch = gen.generate_batch(12, edge_ratio=0.30, seed=42)

    print("=== synth_state demo (seed=42, n=12, edge 30%) ===")
    edge_count, action_count = {}, {}
    for s in batch:
        v = s["verdict"]
        edge = s["meta"].get("edge", "-")
        edge_count[edge] = edge_count.get(edge, 0) + 1
        action_count[v["action"]] = action_count.get(v["action"], 0) + 1
        print(f"  {s['date']} {s['symbol']:<5} close={s['close']:<8} "
              f"edge={edge:<13} → {v['action']:<6} conf={v['confidence']} "
              f"{v['rules'] or ''}")
    print(f"\n  edge cases: {json.dumps(edge_count, ensure_ascii=False)}")
    print(f"  actions   : {json.dumps(action_count, ensure_ascii=False)}")
    print("\nเดโม seed=42 → ผลเดิมทุกครั้ง (deterministic) — ต่อด้วย build_dataset.py")
    sys.exit(0)
