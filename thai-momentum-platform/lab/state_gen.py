#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
state_gen.py — สร้าง "state" ต่อหุ้นต่อวัน + ตัดสินด้วยกฎ deterministic (rule_engine)
====================================================================================
state = ภาพรวมทั้งหมดที่ Jev (LLM) ต้องเห็นก่อนตัดสินใจ — ไฟล์ชุดนี้เป็น "ครู"
(teacher) ของกระบวนการ: synthetic data จะถูกสร้างจาก rule_engine และโมเดลต้อง
เลียนแบบให้ได้ ≥97% (เกณฑ์ G1 ใน eval_harness.py)

โครงสร้างฟังก์ชัน (ตามสเปก):
  regime_gate()   — สถานะตลาดรวม: risk_on | neutral | risk_off
  level_status()  — ตำแหน่งราคาเทียบ pivot/support/resistance
  trigger_eval()  — เหตุการณ์ยิงสัญญาณ (breakout / pullback / stop / target / ...)
  risk_fields()   — ตัวเลขความเสี่ยง (R, rr, ระยะ stop, atr_pct)
  rule_engine()   — คำตอบมาตรฐาน {action, confidence, stop, target, reason_th, rules}
  build()         — ประกอบ state เต็มจากข้อมูลดิบ

กฎที่บังคับ (หมายเลขตามสเปก — แก้ไม่ได้ถ้าไม่ได้ preregister):
  S1  ไส้เทียนรวม <= 2×body จึงนับแท่ง momentum ที่สะอาด
  S2  ปิดใน 2/3 บนของช่วงแท่ง จึงนับว่าแข็งแรง
  S3  ATR > 6% ของราคา → แกว่งแรงเกิน งดเทรด
  R2.0  regime risk_off → ห้ามเปิดไม้ใหม่
  R3.1  เพิ่งโดน stop → freeze ห้ามกลับเข้าจนครบ 2 แท่ง (2 closes)
  R3.2  missed entry — ราคาวิ่งหนีไปแล้ว ห้ามไล่ รอ pullback
  R5.1  stop ต้องอยู่ห่างจากราคา <= 8% และ <= 2×ATR
  R5.2  RR (reward:risk) >= 2 เท่านั้น
  R6.1  day_pnl_R <= -2 → ล็อกไม่ให้เข้าไม้ใหม่ในวันนั้น

ใช้งาน:
  python state_gen.py --csv ohlc.csv --watchlist KCE,DELTA --date 2026-09-19
  python state_gen.py                       # ไม่ใส่ --csv → อ่านจาก ../db/custom.db
  ผลลัพธ์: states/<date>_<SYMBOL>.json
"""

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

LAB = Path(__file__).resolve().parent
DB_PATH = LAB.parent / "db" / "custom.db"
DEFAULT_OUT = LAB / "states"

# ---------------------------------------------------------------- ค่าคงที่ของกฎ
WICK_BODY_MAX = 2.0        # S1
CLOSE_POS_MIN = 2.0 / 3.0  # S2
ATR_PCT_MAX = 6.0          # S3 (%)
STOP_PCT_MAX = 0.08        # R5.1: ห่างสูงสุด 8%
STOP_ATR_MAX = 2.0         # R5.1: และไม่เกิน 2×ATR
RR_MIN = 2.0               # R5.2
DAY_R_LOCK = -2.0          # R6.1
FREEZE_CLOSES = 2          # R3.1
MISS_ATR = 0.5             # R3.2: วิ่งหนีเกิน 0.5×ATR ถือว่าพลาด
LEVEL_BAND_ATR = 0.25      # แถบรอบ support/resistance

ACTIONS = ["buy", "hold", "exit", "reduce", "wait"]

RULE_TEXT = {
    "S1": f"S1: ไส้เทียนรวม > {WICK_BODY_MAX:g}×body — แท่งไม่สะอาด",
    "S2": f"S2: ปิดต่ำกว่า {CLOSE_POS_MIN:.0f}/3 ของช่วงแท่ง — แรงไม่พอ",
    "S3": f"S3: ATR > {ATR_PCT_MAX:g}% ของราคา — ผันผวนเกิน",
    "R2.0": "R2.0: regime risk_off — ห้ามเปิดไม้ใหม่",
    "R3.1": f"R3.1: เพิ่งโดน stop — freeze {FREEZE_CLOSES} แท่ง",
    "R3.2": "R3.2: missed entry — ห้ามไล่ราคา รอ pullback",
    "R5.1": f"R5.1: stop ห่าง <= {STOP_PCT_MAX:.0%} และ <= {STOP_ATR_MAX:g}×ATR",
    "R5.2": f"R5.2: RR >= {RR_MIN:g} เท่านั้น",
    "R5.0": "R5.0: ราคาทะลุ stop — ออกตามวินัย ไม่มีข้อยกเว้น",
    "R5.3": "R5.3: ถึงเป้าหมาย — เก็บกำไร",
    "R6.1": f"R6.1: day_pnl_R <= {DAY_R_LOCK:g} — ล็อกไม่เข้าไม้ใหม่วันนี้",
}


# ---------------------------------------------------------------- บล็อกกลาง
def regime_gate(breadth: float, mkt_ret20: float, vol_pct: float) -> str:
    """สถานะตลาดรวม: breadth (0..1), ผลตอบแทน 20 วันของตลาด, ความผันผวน % รายวัน"""
    if breadth <= 0.45 or mkt_ret20 < -0.05 or vol_pct >= 2.0:
        return "risk_off"
    if breadth >= 0.55 and mkt_ret20 > -0.02 and vol_pct <= 1.2:
        return "risk_on"
    return "neutral"


def level_status(close: float, levels: dict, atr: float) -> str:
    """ตำแหน่งราคาเทียบโครงสร้าง: above/at_resistance | range | at/below_support"""
    band = LEVEL_BAND_ATR * atr
    sup, res = levels.get("support"), levels.get("resistance")
    if res is not None and close > res:
        return "above_resistance"
    if sup is not None and close < sup:
        return "below_support"
    if res is not None and close >= res - band:
        return "at_resistance"
    if sup is not None and close <= sup + band:
        return "at_support"
    return "range"


def candle_quality(bar: dict) -> dict:
    """คุณภาพแท่งล่าสุด: body/wick/close_pos + ผลตามกฎ S1/S2"""
    o, h, l, c = bar["o"], bar["h"], bar["l"], bar["c"]
    rng = max(h - l, 1e-9)
    body = abs(c - o)
    wick = (h - max(o, c)) + (min(o, c) - l)
    close_pos = (c - l) / rng
    s1 = wick <= WICK_BODY_MAX * max(body, 1e-9)
    s2 = close_pos >= CLOSE_POS_MIN
    return {"body": round(body, 4), "wick": round(wick, 4),
            "close_pos": round(close_pos, 4), "s1_pass": bool(s1),
            "s2_pass": bool(s2), "bullish": c > o}


def trigger_eval(state: dict) -> list[str]:
    """สแกนเหตุการณ์ที่ยิงใน state ปัจจุบัน"""
    trig: list[str] = []
    level, atr = state.get("level"), max(state.get("atr14") or 0.0, 1e-9)
    close = state["close"]
    levels = state.get("levels") or {}
    pos = state.get("open_pos")

    if level == "above_resistance":
        trig.append("breakout")
    if level == "at_support":
        q = candle_quality((state.get("bars") or [{}])[-1])
        if q["bullish"] and q["s2_pass"]:
            trig.append("pullback_hold")
    if level == "below_support":
        trig.append("breakdown")

    if pos:
        bars = state.get("bars") or []
        if bars:
            if bars[-1]["l"] <= pos.get("stop", -1e18):
                trig.append("stop_hit")
            if bars[-1]["h"] >= pos.get("target", 1e18):
                trig.append("target_hit")
    src = pos if pos else state.get("last_exit")   # freeze ใช้ได้ทั้งตอนถือ/หลังออก
    if src and src.get("just_stopped") and src.get("closes_since_stop", 99) < FREEZE_CLOSES:
        trig.append("freeze_active")
    if not pos:
        # missed entry: เคยมี trigger ใน 2 แท่งก่อน แต่ตอนนี้ราคาวิ่งหนีไปแล้ว
        res = levels.get("resistance")
        if res is not None and close > res + MISS_ATR * atr:
            trig.append("missed")

    if (state.get("day_pnl_R") or 0.0) <= DAY_R_LOCK:
        trig.append("day_locked")
    return trig


def risk_fields(state: dict) -> dict:
    """ตัวเลขความเสี่ยงที่ Jev ต้องเห็น (หน่วย R = ความเสี่ยงต่อไม้)"""
    close = state["close"]
    atr = max(state.get("atr14") or 0.0, 1e-9)
    out = {
        "atr": round(atr, 4),
        "atr_pct": round(atr / close * 100.0, 3),
        "stop_pct_cap": STOP_PCT_MAX,
        "stop_atr_cap": STOP_ATR_MAX,
        "rr_min": RR_MIN,
    }
    pos = state.get("open_pos")
    if pos:
        entry, stop = pos.get("entry"), pos.get("stop")
        if entry and stop and entry > stop:
            risk = entry - stop
            out["r_now"] = round((close - entry) / risk, 3)
            out["risk_per_share"] = round(risk, 4)
            out["rr_to_target"] = (
                round((pos.get("target") - entry) / risk, 3)
                if pos.get("target") else None
            )
        out["bars_held"] = pos.get("bars_held")
    return out


def rule_engine(state: dict) -> dict:
    """ครูตัดสินด้วยกฎ deterministic — คืน verdict รูปแบบเดียวกับ SCHEMA ของ LLM"""
    close = state["close"]
    atr = max(state.get("atr14") or 0.0, 1e-9)
    regime = state.get("regime", "neutral")
    levels = state.get("levels") or {}
    pos = state.get("open_pos")
    triggers = state.get("triggers") or []
    bars = state.get("bars") or []
    q = candle_quality(bars[-1]) if bars else candle_quality(
        {"o": close, "h": close, "l": close, "c": close})
    rules: list[str] = []
    reasons: list[str] = []

    # ---------- มีสถานะอยู่ → จัดการไม้ก่อนเสมอ ----------
    if pos:
        if "stop_hit" in triggers:
            rules.append("R5.0")
            reasons.append("ราคาแตะ stop — ออกทันทีตามวินัย ไม่ถือเพื่อหวังกลับตัว")
            return _v("exit", 0.95, None, None, rules, reasons)
        if "target_hit" in triggers:
            rules.append("R5.3")
            reasons.append("ราคาถึงเป้าหมาย — เก็บกำไร")
            return _v("exit", 0.9, None, None, rules, reasons)
        if regime == "risk_off":
            rules.append("R2.0")
            reasons.append("ตลาดรวม risk_off — ลดขนาดไม้เพื่อคุมความเสี่ยงระบบ")
            return _v("reduce", 0.8, pos.get("stop"), None, rules, reasons)
        reasons.append("ไม่มีเหตุให้ปรับ — ถือต่อตามแผนเดิม")
        return _v("hold", 0.8, pos.get("stop"), pos.get("target"), rules, reasons)

    # ---------- ไม่มีสถานะ → พิจารณาเข้าใหม่ ----------
    if "day_locked" in triggers:
        rules.append("R6.1")
        reasons.append(f"วันนี้ขาดทุนเกิน {DAY_R_LOCK:g}R — หยุดเทรดเหลือวัน")
        return _v("wait", 0.9, None, None, rules, reasons)
    if "freeze_active" in triggers:
        rules.append("R3.1")
        src = state.get("last_exit") or {}
        closes_left = FREEZE_CLOSES - int(src.get("closes_since_stop", FREEZE_CLOSES))
        reasons.append(f"เพิ่งโดน stop — รออีก {closes_left} แท่งจึงกลับเข้าได้")
        return _v("wait", 0.85, None, None, rules, reasons)
    if regime == "risk_off":
        rules.append("R2.0")
        reasons.append("regime risk_off — เฝ้าดูอย่างเดียว ไม่เปิดไม้ใหม่")
        return _v("wait", 0.85, None, None, rules, reasons)
    atr_pct = atr / close * 100.0
    if atr_pct > ATR_PCT_MAX:
        rules.append("S3")
        reasons.append(f"ATR {atr_pct:.1f}% สูงผิดปกติ — ความเสี่ยงต่อไม้ใหญ่เกิน")
        return _v("wait", 0.8, None, None, rules, reasons)

    # R3.2 ต้องตัดสินก่อน trigger สด — ราคาวิ่งหนีเกิน 0.5×ATR แล้วห้ามไล่
    if "missed" in triggers:
        rules.append("R3.2")
        reasons.append("ราคาวิ่งหนีจุดเข้าไปแล้ว — ห้ามไล่ รอ pullback รอบหน้า")
        return _v("wait", 0.85, None, None, rules, reasons)

    entry = close
    structural_stop = levels.get("support")
    stop = None
    if "breakout" in triggers or "pullback_hold" in triggers:
        # R5.1: clamp stop ให้อยู่ในเพดาน 8% และ 2×ATR เสมอ
        cand = (structural_stop - LEVEL_BAND_ATR * atr
                if structural_stop is not None else entry - 1.5 * atr)
        stop = max(cand, entry * (1.0 - STOP_PCT_MAX), entry - STOP_ATR_MAX * atr)
        risk = entry - stop
        if risk <= 0.0005 * entry:
            reasons.append("ระยะ stop แคบผิดปกติ (guard: ไม่มี R ที่มีความหมาย)")
            return _v("wait", 0.75, None, None, rules, reasons)
        target = levels.get("resistance")
        target = target if (target is not None and target > entry) else entry + 2.5 * risk
        rr = (target - entry) / risk
        if not (q["s1_pass"] and q["s2_pass"]):
            if not q["s1_pass"]:
                rules.append("S1")
                reasons.append(f"ไส้เทียน {q['wick']:.2f} > {WICK_BODY_MAX:g}×body — สัญญาณไม่สะอาด")
            if not q["s2_pass"]:
                rules.append("S2")
                reasons.append(f"ปิดที่ {q['close_pos']:.0%} ของแท่ง — แรงซื้อไม่พอ")
            return _v("wait", 0.75, None, None, rules, reasons)
        if rr < RR_MIN:
            rules.append("R5.2")
            reasons.append(f"RR {rr:.2f} < {RR_MIN:g} — เป้าใกล้เกิน ไม่คุ้มความเสี่ยง")
            return _v("wait", 0.8, round(stop, 4), None, rules, reasons)
        conf = 0.85 if regime == "risk_on" else 0.75
        trig_name = "breakout ทะลุแนวต้าน" if "breakout" in triggers else "pullback ย่อแล้วได้แนวรับ"
        reasons.append(f"{trig_name} + แท่งผ่าน S1/S2 + RR {rr:.2f} ผ่านเกณฑ์ → เข้าตามแผน")
        return _v("buy", conf, round(stop, 4), round(target, 4), rules, reasons)

    reasons.append("ไม่มี trigger — รอเหตุการณ์ที่ผ่านเกณฑ์ก่อน")
    return _v("wait", 0.8, None, None, rules, reasons)


def _v(action: str, conf: float, stop, target, rules: list, reasons: list) -> dict:
    return {
        "action": action,
        "confidence": round(float(conf), 3),
        "stop": stop,
        "target": target,
        "reason_th": " ".join(reasons),
        "rules": rules,
    }


# ---------------------------------------------------------------- build state
def compute_atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    """ATR แบบ Wilder (ewm alpha=1/n) จากคอลัมน์ h,l,c"""
    pc = df["c"].shift(1)
    tr = pd.concat([df["h"] - df["l"],
                    (df["h"] - pc).abs(),
                    (df["l"] - pc).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1.0 / n, adjust=False).mean()


def pivot_levels(prev_bar: dict) -> dict:
    """Pivot points คลาสสิกจากแท่งเมื่อวาน: P=(H+L+C)/3, S=2P−H, R=2P−L"""
    p = (prev_bar["h"] + prev_bar["l"] + prev_bar["c"]) / 3.0
    return {"pivot": round(p, 4),
            "support": round(2 * p - prev_bar["h"], 4),
            "resistance": round(2 * p - prev_bar["l"], 4)}


def market_context(df_all: pd.DataFrame, date: str) -> dict:
    """บริบทตลาดรวมของวันนั้น: breadth, mkt_ret20, vol_pct"""
    d = df_all[df_all["date"] <= date]
    close = d.pivot_table(index="date", columns="symbol", values="c", aggfunc="last").sort_index()
    if len(close) < 22:
        return {"breadth": 0.5, "mkt_ret20": 0.0, "vol_pct": 1.0}
    ret = close.pct_change(fill_method=None)
    ret20 = close / close.shift(20) - 1.0
    last = ret20.iloc[-1]
    breadth = float((last > 0).mean())
    mkt_ret20 = float(last.mean())
    mkt_daily = ret.mean(axis=1).dropna().tail(20)
    vol_pct = float(mkt_daily.std(ddof=1) * 100.0) if len(mkt_daily) > 2 else 1.0
    return {"breadth": round(breadth, 4), "mkt_ret20": round(mkt_ret20, 4),
            "vol_pct": round(vol_pct, 4)}


def build(symbol: str, df_sym: pd.DataFrame, mkt: dict, date: str,
          open_pos: dict | None = None, ctx: dict | None = None,
          levels_override: dict | None = None, source: str = "csv",
          synthetic_ohlc: bool = False) -> dict:
    """ประกอบ state เต็มของหุ้นหนึ่งตัว ณ วันที่กำหนด แล้วรัน rule_engine ให้เลย"""
    d = df_sym[df_sym["date"] <= date]
    if d.empty:
        raise ValueError(f"{symbol}: ไม่มีข้อมูลถึงวันที่ {date}")
    d = d.tail(30).reset_index(drop=True)
    d["atr14"] = compute_atr(d)
    last = d.iloc[-1]
    atr = float(last["atr14"]) if np.isfinite(last["atr14"]) else float(last["c"]) * 0.03

    levels = pivot_levels(d.iloc[-2].to_dict()) if len(d) >= 2 else \
        {"pivot": float(last["c"]), "support": float(last["c"]) - atr,
         "resistance": float(last["c"]) + atr}
    if levels_override:
        levels.update({k: v for k, v in levels_override.items() if v is not None})

    ctx = ctx or {}
    state = {
        "date": date,
        "symbol": symbol,
        "close": round(float(last["c"]), 4),
        "atr14": round(atr, 4),
        "day_pnl_R": float(ctx.get("day_pnl_R", 0.0)),
        "week_pnl_R": float(ctx.get("week_pnl_R", 0.0)),
        "loss_streak": int(ctx.get("loss_streak", 0)),
        "regime": regime_gate(mkt["breadth"], mkt["mkt_ret20"], mkt["vol_pct"]),
        "levels": levels,
        "bars": [{"o": round(float(r["o"]), 4), "h": round(float(r["h"]), 4),
                  "l": round(float(r["l"]), 4), "c": round(float(r["c"]), 4),
                  "v": float(r.get("v") or 0.0)}
                 for _, r in d.tail(3).iterrows()],
        "open_pos": open_pos,
        "meta": {"source": source, "synthetic_ohlc": synthetic_ohlc,
                 "breadth": mkt["breadth"], "mkt_ret20": mkt["mkt_ret20"],
                 "vol_pct": mkt["vol_pct"]},
    }
    state["level"] = level_status(state["close"], levels, atr)
    state["triggers"] = trigger_eval(state)
    state["risk"] = risk_fields(state)
    state["flags"] = (["synthetic_ohlc"] if synthetic_ohlc else []) + \
        [t for t in ("day_locked", "freeze_active", "missed") if t in state["triggers"]]
    state["verdict"] = rule_engine(state)
    return state


# ---------------------------------------------------------------- loaders
def load_csv(path: Path) -> pd.DataFrame:
    """อ่าน OHLC CSV: คอลัมน์ date,symbol,open,high,low,close[,volume]"""
    df = pd.read_csv(path)
    cols = {c.lower().strip(): c for c in df.columns}
    ren = {}
    for std in ("date", "symbol", "open", "high", "low", "close", "volume"):
        if std in cols:
            ren[cols[std]] = {"open": "o", "high": "h", "low": "l",
                              "close": "c", "volume": "v"}.get(std, std)
    df = df.rename(columns=ren)
    if "v" not in df.columns:
        df["v"] = 0.0
    if not {"date", "symbol", "o", "h", "l", "c"}.issubset(df.columns):
        raise SystemExit("CSV ต้องมีคอลัมน์ date,symbol,open,high,low,close")
    df["date"] = df["date"].astype(str)
    df["symbol"] = df["symbol"].astype(str).str.upper()
    return df.sort_values(["symbol", "date"]).reset_index(drop=True)


def load_db(db_path: Path | None = None) -> pd.DataFrame:
    """ไม่มี CSV → อ่าน close/val จาก RawDaily แล้วสังเคราะห์แท่งเทียนอย่างซื่อสัตย์
    (o = close เมื่อวาน, h/l = ขยาย 0.2% — ติด flag synthetic_ohlc ทุก state)"""
    path = Path(db_path) if db_path else DB_PATH
    if not path.exists():
        raise SystemExit(f"ไม่พบฐานข้อมูล {path} — ใช้ --csv แทน")
    with sqlite3.connect(str(path)) as cx:
        raw = pd.read_sql_query(
            'SELECT date, symbol, close, val FROM "RawDaily"', cx)
    raw["symbol"] = raw["symbol"].str.upper()
    raw = raw.sort_values(["symbol", "date"])
    g = raw.groupby("symbol")["close"]
    o = g.shift(1).fillna(raw["close"])
    hi = np.maximum(o, raw["close"]) * 1.002
    lo = np.minimum(o, raw["close"]) * 0.998
    out = pd.DataFrame({
        "date": raw["date"], "symbol": raw["symbol"],
        "o": o, "h": hi, "l": lo, "c": raw["close"], "v": raw["val"],
    })
    return out.reset_index(drop=True)


# ---------------------------------------------------------------- CLI
def main() -> int:
    ap = argparse.ArgumentParser(description="สร้าง state รายวัน + verdict จากกฎ")
    ap.add_argument("--csv", default=None, help="ไฟล์ OHLC (date,symbol,open,high,low,close,volume)")
    ap.add_argument("--watchlist", default=None, help="รายชื่อหุ้นคั่นด้วย comma (default: top มูลค่า)")
    ap.add_argument("--levels", default=None, help="JSON override levels {SYMBOL:{support,resistance,pivot}}")
    ap.add_argument("--date", default=None, help="วันที่ YYYY-MM-DD (default: วันล่าสุดในข้อมูล)")
    ap.add_argument("--context", default=str(LAB / "context.json"),
                    help="context.json (day_pnl_R/week_pnl_R/loss_streak)")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="โฟลเดอร์เขียน states/")
    ap.add_argument("--top", type=int, default=8, help="จำนวน top มูลค่า ถ้าไม่ระบุ watchlist")
    args = ap.parse_args()

    if args.csv:
        df = load_csv(Path(args.csv))
        source, synth = "csv", False
    else:
        df = load_db()
        source, synth = "db:RawDaily", True

    date = args.date or str(df["date"].max())
    if date not in set(df["date"]):
        print(f"[WARN] วันที่ {date} ไม่มีในข้อมูล — ใช้วันล่าสุดก่อนหน้าแทน")

    watch = [s.strip().upper() for s in args.watchlist.split(",") if s.strip()] \
        if args.watchlist else None
    if not watch:
        today = df[df["date"] == date]
        watch = list(today.sort_values("v", ascending=False)["symbol"].head(args.top))

    levels_all = {}
    if args.levels and Path(args.levels).exists():
        levels_all = json.loads(Path(args.levels).read_text(encoding="utf-8"))

    ctx = {}
    if Path(args.context).exists():
        ctx = json.loads(Path(args.context).read_text(encoding="utf-8"))

    mkt = market_context(df, date)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"=== state_gen @ {date} | regime inputs: {mkt} ===")
    written = []
    for sym in watch:
        d = df[(df["symbol"] == sym) & (df["date"] <= date)]
        if d.empty:
            print(f"  [ข้าม] {sym}: ไม่มีข้อมูล")
            continue
        st = build(sym, df, mkt, date, ctx=ctx,
                   levels_override=levels_all.get(sym), source=source,
                   synthetic_ohlc=synth)
        path = out_dir / f"{date}_{sym}.json"
        path.write_text(json.dumps(st, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8")
        written.append(path)
        v = st["verdict"]
        print(f"  {sym:<10} close={st['close']:<10} regime={st['regime']:<9} "
              f"level={st['level']:<17} triggers={','.join(st['triggers']) or '-':<24} "
              f"→ {v['action']:<6} conf={v['confidence']} {v['rules'] or ''}")

    print(f"\nเขียน {len(written)} state → {out_dir}")
    print("ต่อไป: python build_dataset.py / python nimble_runner.py --model <gguf>")
    return 0


if __name__ == "__main__":
    sys.exit(main())
