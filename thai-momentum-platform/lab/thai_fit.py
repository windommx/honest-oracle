#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thai_fit.py — ห้องสอบสัญญาณ (Evidence Lab) สำหรับหุ้นไทย — ฉบับ offline LAB KIT
=================================================================================
สอบสมมติฐาน 4 ข้อ (H1–H4) จากฐานข้อมูลจริง แล้วเขียน evidence_report.json
ด้วยนิยาม/เกณฑ์/verdict เดียวกับแพลตฟอร์มทุกข้อ (src/lib/research/thai-fit.ts —
POST /api/evidence/run) — รันบนข้อมูลชุดเดียวกันต้องได้ verdict เดียวกัน

  H1  โมเมนตัมระยะสั้น   — scan ทุกคู่ (form, hold): form [5,10,20,40,80,160,300],
                            hold [3,5,10,20] (form<=80) / [10] (form>80)
                            sig = pct_change(form) เฉพาะ liq5=1 และ close>1
                            fwd = ผลตอบแทน t→t+hold หักค่าเฉลี่ยตลาดรายวัน (เฉพาะ liq5=1)
                            IC = Spearman (ordinal rank) ต่อวัน ต้องมี >= 30 หุ้น
                            ICIR = mean/std (ddof=1) · t = ICIR·√n
                            PASS = มี cell form<=20 และ hold<=10 ที่ ICIR > 0.25
  H2  snap-back reversal  — z5 = z-score ของ pct_change(5) เทียบ rolling 250 วัน (valid >= 100)
                            turnPct = percentile ข้ามหุ้นของมูลค่าเฉลี่ย 20 วัน
                            flow = Σ sign(ret1)·val / Σ val (20 วัน)
                            สัญญาณ z5<=-2.5 และ turnPct>=0.60 และ flow<-0.20 และ liq5=1 และ close>1
                            จำลอง 5 แท่ง: stop -8% → revert z5>=-0.5 → ครบ 5 วัน; net หัก 1.1%
                            PASS = n>=10 และ winRate>0.53 และ edge (net − fwd5 control) > 0
  H3  turn-of-month       — ผลตอบแทนตลาดรายวัน (เฉลี่ยหุ้น liq5=1) ช่วง 3 วันทำการแรก/ท้ายของเดือน
                            เทียบวันที่เหลือด้วย Welch t — PASS = t > 2
  H4  โมเมนตัมระยะยาว     — PASS = ไม่มี cell form>=160 ที่ ICIR > 0.25 ("tf ยาวตายแล้ว")

การปรับให้เข้ากับเครื่อง local (เท่านั้น):
  - conn() ชี้ไป ../db/custom.db (resolve จาก __file__ ผ่าน pathlib) หรือ --db
  - อ่านตาราง "RawDaily" (case-sensitive) คอลัมน์ date,symbol,close,val,liq5

ใช้งาน:
  python thai_fit.py scan       # H1 + H4 (scan เดียวกัน)
  python thai_fit.py reversal   # H2 เท่านั้น
  python thai_fit.py tom        # H3 เท่านั้น
  python thai_fit.py all        # ครบ H1–H4 (apply_verdict.py รับเฉพาะรายงาน mode=all)

ผลลัพธ์: evidence_report.json เขียนไว้ข้างสคริปต์นี้เสมอ (รูปเดียวกับ ThaiFitReport ของแพลตฟอร์ม
+ paramsHash เดียวกับ ResearchRun kind 'thai_fit')
"""

import argparse
import hashlib
import json
import math
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

# ---------------------------------------------------------------- constants
LAB = Path(__file__).resolve().parent
DB_PATH = LAB.parent / "db" / "custom.db"          # ../db/custom.db เทียบกับ lab/
OUT_PATH = LAB / "evidence_report.json"

# ค่าคงที่เดียวกับ src/lib/research/thai-fit.ts (freeze ลง paramsHash)
FORMS_TH = [5, 10, 20, 40, 80, 160, 300]   # forms ของสัญญาณโมเมนตัม (วันทำการ)
HOLDS_SHORT = [3, 5, 10, 20]                # holds สำหรับ form <= 80
HOLDS_LONG = [10]                           # holds สำหรับ form > 80
COST_RT = 0.011            # ต้นทุน round-trip ของ H2 (1.1%)
MIN_CS_N = 30              # จำนวนหุ้นขั้นต่ำต่อวันที่ IC จะถูกนับ
Z_IN = -2.5                # H2: z5 <= -2.5
TURN_MIN = 0.6             # H2: turnover percentile >= 0.60
FLOW_MAX = -0.2            # H2: money-flow < -0.20
TOM_T = 2                  # H3: Welch t > 2
ICIR_MIN = 0.25            # H1/H4: ICIR (mean/std) > 0.25

# action ภาษาไทยต่อ verdict — ข้อความเดียวกับแพลตฟอร์ม
ACTIONS_TH = {
    "H1_PASS": "เปิด core สั้น (form<=20,hold<=10) ใน shadow",
    "H1_FAIL": "ลดน้ำหนักโมเมนตัมเหลือ flow-only",
    "H2_PASS": "เปิด snap-back engine shadow",
    "H2_FAIL": "park reversal module",
    "H3_PASS": "เปิด calendar overlay +0.15x",
    "H3_FAIL": "ปิด overlay",
    "H4_PASS": "คง tf ยาวเป็น regime indicator",
    "H4_FAIL": "สอบสวน tf ยาวใหม่ทันที",
}
MODES = ("all", "scan", "reversal", "tom")


# ---------------------------------------------------------------- rounding (Math.round ของ JS)
def _jround(x: float, digits: int) -> float:
    """ปัดแบบ JS Math.round(x·10^d)/10^d (ครึ่งหนึ่งปัดขึ้นเสมอ) — ให้เลขตรงกับแพลตฟอร์ม"""
    f = 10.0 ** digits
    return math.floor(x * f + 0.5) / f


def _mean(a) -> float:
    return float(sum(a) / len(a)) if len(a) else 0.0


def _var_d1(a) -> float:
    """sample variance (ddof=1) แบบ two-pass — n<2 → 0"""
    n = len(a)
    if n < 2:
        return 0.0
    m = sum(a) / n
    return float(sum((v - m) * (v - m) for v in a) / (n - 1))


# ---------------------------------------------------------------- db access
def conn(db_path: Path | None = None) -> sqlite3.Connection:
    """เชื่อมต่อ SQLite ของแพลตฟอร์ม (../db/custom.db เทียบจากโฟลเดอร์ lab/)"""
    path = Path(db_path) if db_path else DB_PATH
    if not path.exists():
        print(f"[ERROR] ไม่พบฐานข้อมูล: {path}", file=sys.stderr)
        print("        รันจากโฟลเดอร์ lab/ หรือใช้ --db ระบุ path ที่ถูกต้อง", file=sys.stderr)
        sys.exit(2)
    return sqlite3.connect(str(path))


def load_daily(db_path: Path | None = None) -> pd.DataFrame:
    """อ่านข้อมูลดิบรายวัน — คอลัมน์เดียวกับ RawDaily ของแพลตฟอร์ม"""
    cx = conn(db_path)
    try:
        df = pd.read_sql_query(
            'SELECT date, symbol, close, val, liq5 FROM "RawDaily"', cx
        )
    finally:
        cx.close()
    df["date"] = df["date"].astype(str)
    df["symbol"] = df["symbol"].astype(str)
    for col in ("close", "val", "liq5"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df.sort_values(["date", "symbol"]).reset_index(drop=True)


def load_pivots(df: pd.DataFrame) -> dict:
    """long → wide (index=date asc, columns=symbol asc) ของ close/val/liq — เหมือน buildPivots()
    close ที่ไม่ใช่ราคาจริง (<=0 / ไม่ finite) ถือเป็น "ไม่มีข้อมูล" กัน Infinity/NaN ไหลเข้าสถิติ"""
    close = df.pivot_table(index="date", columns="symbol", values="close", aggfunc="last")
    close = close.sort_index().sort_index(axis=1)
    close = close.where(np.isfinite(close) & (close > 0))
    val = df.pivot_table(index="date", columns="symbol", values="val", aggfunc="last")
    val = val.reindex(index=close.index, columns=close.columns)
    liq5 = df.pivot_table(index="date", columns="symbol", values="liq5", aggfunc="last")
    liq = liq5.reindex(index=close.index, columns=close.columns).eq(1)
    return {"dates": [str(d) for d in close.index], "close": close, "val": val, "liq": liq}


# ---------------------------------------------------------------- IC harness
def ic_per_date(sig: pd.DataFrame, fwd: pd.DataFrame) -> dict:
    """Spearman (ordinal rank, ties ตามลำดับหุ้น) ต่อวันบน intersection — วันที่มี < 30 หุ้นข้าม
    คืน {meanIC (4dp), ICIR (3dp = mean/std ddof=1), t (2dp = ICIR·√n), n}"""
    both = sig.notna() & fwd.notna()
    n_names = both.sum(axis=1)
    ra = sig.where(both).rank(axis=1, method="first")
    rb = fwd.where(both).rank(axis=1, method="first")
    da = ra.sub(ra.mean(axis=1), axis=0)
    db_ = rb.sub(rb.mean(axis=1), axis=0)
    cov = (da * db_).sum(axis=1)
    va = (da * da).sum(axis=1)
    vb = (db_ * db_).sum(axis=1)
    ok = (n_names >= MIN_CS_N) & (va > 1e-12) & (vb > 1e-12)
    ics = (cov[ok] / np.sqrt(va[ok] * vb[ok])).to_numpy(dtype=float)
    ics = ics[np.isfinite(ics)]
    n = int(len(ics))
    if n == 0:
        return {"meanIC": 0, "ICIR": 0, "t": 0, "n": 0}
    m = _mean(ics.tolist())
    sd = math.sqrt(_var_d1(ics.tolist()))
    icir = m / sd if sd > 1e-12 else 0.0
    return {"meanIC": _jround(m, 4), "ICIR": _jround(icir, 3), "t": _jround(icir * math.sqrt(n), 2), "n": n}


# ---------------------------------------------------------------- H1/H4 scan
def momentum_sig(piv: dict, form: int) -> pd.DataFrame:
    """sig = pct_change(form) โดย mask = liq && close > 1"""
    close = piv["close"]
    sig = close / close.shift(form) - 1.0
    return sig.where(piv["liq"] & (close > 1))


def fwd_demeaned(piv: dict, hold: int) -> pd.DataFrame:
    """ผลตอบแทน t → t+hold หักค่าเฉลี่ยตลาด (ทุกหุ้นที่มีราคา) ต่อวัน แล้ว mask ด้วย liq"""
    close = piv["close"]
    raw = close.shift(-hold) / close - 1.0
    return raw.sub(raw.mean(axis=1), axis=0).where(piv["liq"])


def scan_has_evidence(cells: list) -> bool:
    """scan มีหลักฐานจริงไหม — ต้องมีอย่างน้อย 1 cell ที่วัดได้ (n>0 วัน)
    (DB ว่าง / หุ้น liquid ไม่ถึง 30 ตัวทุกวัน → False: ห้าม auto-apply)"""
    return any(c.get("n", 0) > 0 for c in cells)


def scan(piv: dict) -> dict:
    """H1 pass = มี cell form<=20 && hold<=10 && ICIR>0.25
    H4 pass = ไม่มี cell form>=160 && ICIR>0.25 — และต้องมี long cell ที่วัดได้จริง (n>0): ไม่มีข้อมูล ≠ "ตายแล้ว"
    best = top-3 cell สายสั้นที่วัดได้จริงเรียงด้วย ICIR (เกณฑ์ใช้ ICIR ที่ปัดแล้ว ให้ตรงกับตาราง)"""
    if len(piv["dates"]) == 0:
        return {"cells": [], "h1Pass": False, "h4Pass": False, "best": [], "longCells": []}
    cells = []
    for form in FORMS_TH:
        sig = momentum_sig(piv, form)
        for hold in (HOLDS_SHORT if form <= 80 else HOLDS_LONG):
            cells.append({"form": form, "hold": hold, **ic_per_date(sig, fwd_demeaned(piv, hold))})
    short = [c for c in cells if c["form"] <= 20 and c["hold"] <= 10]
    h1_pass = any(c["ICIR"] > ICIR_MIN for c in short)
    long_measured = [c for c in cells if c["form"] >= 160 and c["n"] > 0]
    h4_pass = len(long_measured) > 0 and not any(c["ICIR"] > ICIR_MIN for c in long_measured)
    best = sorted([c for c in short if c["n"] > 0], key=lambda c: -c["ICIR"])[:3]  # sorted() เสถียร
    long_cells = [{"form": c["form"], "hold": c["hold"], "meanIC": c["meanIC"], "ICIR": c["ICIR"]}
                  for c in cells if c["form"] >= 160]
    return {"cells": cells, "h1Pass": bool(h1_pass), "h4Pass": bool(h4_pass),
            "best": best, "longCells": long_cells}


# ---------------------------------------------------------------- H2 reversal
def reversal(piv: dict) -> dict:
    """H2 snap-back — นิยามเดียวกับ reversal() ของแพลตฟอร์ม"""
    zero = {"pass": False, "n": 0, "winRate": 0, "avgNet": 0, "edgeVsCtrl": 0, "stopPct": 0}
    close, val, liq = piv["close"], piv["val"], piv["liq"]
    n_d = len(piv["dates"])
    if n_d == 0:
        return zero

    # z5: pct_change(5) เทียบ rolling 250 แถว (ยอม valid >= 100 เผื่อข้อมูลมีรู), ddof=1
    r5 = close / close.shift(5) - 1.0
    mu = r5.rolling(250, min_periods=100).mean()
    sd = r5.rolling(250, min_periods=100).std(ddof=1)
    z5 = ((r5 - mu) / sd).where(r5.notna() & (sd > 1e-12))

    # turnPct = percentile ข้ามหุ้นของมูลค่าเฉลี่ย 20 วัน (ต้องมีค่า >= 10 วัน)
    val_ma = val.rolling(20, min_periods=10).mean()
    turn_pct = val_ma.rank(axis=1, method="first", pct=True)

    # flow = Σ sign(ret1)·val / Σ val ใน 20 วัน (val ต้องมี >= 15 วัน และผลรวม > 0)
    sgn = np.sign(close / close.shift(1) - 1.0)
    num = (sgn * val).fillna(0.0).rolling(20, min_periods=1).sum()
    den = val.rolling(20, min_periods=15).sum()
    flow = (num / den).where(den > 0)

    # control = fwd5 ของ "ตลาด" วันสัญญาณ (เฉลี่ย fwd5 ของหุ้น liq วันเดียวกัน — กลับตัวแล้วชนะตลาดไหม)
    mkt_fwd5 = (close.shift(-5) / close - 1.0).where(liq).mean(axis=1).to_numpy(dtype=float)

    c_np = close.to_numpy(dtype=float)
    z_np = z5.to_numpy(dtype=float)
    cand = (liq & (close > 1) & (z5 <= Z_IN) & (turn_pct >= TURN_MIN) & (flow < FLOW_MAX)).to_numpy()

    nets: list[float] = []
    ctrls: list[float] = []
    stops = 0
    for i, j in zip(*np.nonzero(cand)):                     # เรียง (วัน, หุ้น) เหมือนลูปของแพลตฟอร์ม
        c = c_np[i, j]
        if i + 5 >= n_d:
            continue                                        # ต้องมีแท่งถัดไปครบ 5 แท่ง
        px = c_np[i + 1:i + 6, j]
        if not np.all(np.isfinite(px)):
            continue
        ctrl = mkt_fwd5[i]
        if not np.isfinite(ctrl):
            continue
        exit_px = px[4]
        reason = "time"
        for k in range(5):                                  # stop −8% ก่อน → z5 กลับ >= −0.5 → ครบ 5 วัน
            p = px[k]
            if p <= c * 0.92:
                exit_px, reason = p, "stop"
                break
            zk = z_np[i + 1 + k, j]
            if np.isfinite(zk) and zk >= -0.5:
                exit_px, reason = p, "revert"
                break
        nets.append(float(exit_px / c - 1.0 - COST_RT))
        ctrls.append(float(ctrl))
        if reason == "stop":
            stops += 1

    n = len(nets)
    if n == 0:
        return zero
    win_rate = _jround(sum(1 for v in nets if v > 0) / n, 4)
    avg_net = _jround(_mean(nets), 4)
    edge = _jround(_mean(nets) - _mean(ctrls), 4)
    stop_pct = _jround(stops / n, 4)
    ok = n >= 10 and win_rate > 0.53 and edge > 0            # เกณฑ์ใช้ค่าที่ปัดแล้ว (self-consistent)
    return {"pass": bool(ok), "n": n, "winRate": win_rate, "avgNet": avg_net,
            "edgeVsCtrl": edge, "stopPct": stop_pct}


# ---------------------------------------------------------------- H3 TOM
def tom(piv: dict) -> dict:
    """H3 — 3 วันทำการแรก/ท้ายของเดือน (YYYY-MM) เทียบวันที่เหลือ ด้วย Welch t — PASS เมื่อ t > 2
    เดือนแรก/เดือนสุดท้ายของตัวอย่างอาจไม่ครบเดือน → "3 วันแรก" ของเดือนแรกและ "3 วันท้าย"
    ของเดือนสุดท้ายระบุไม่ได้ — วันกำกวมเหล่านี้ไม่นับเข้ากลุ่มใด"""
    dates = piv["dates"]
    n_d = len(dates)
    if n_d == 0:
        return {"pass": False, "insideMean": 0, "outsideMean": 0, "t": 0, "nIn": 0}
    close = piv["close"]
    mkt = (close / close.shift(1) - 1.0).where(piv["liq"]).mean(axis=1).to_numpy(dtype=float)

    in_r: list[float] = []
    out_r: list[float] = []
    k = 0
    while k < n_d:
        month = dates[k][:7]
        e = k
        while e < n_d and dates[e][:7] == month:
            e += 1
        start_known = k > 0          # เดือนแรกของตัวอย่าง: ไม่รู้ว่าเริ่มวันทำการแรกของเดือนจริงไหม
        end_known = e < n_d          # เดือนสุดท้าย: เดือนอาจยังไม่จบ
        for idx in range(k, e):
            v = mkt[idx]
            if not np.isfinite(v):
                continue
            from_start, from_end = idx - k, e - 1 - idx
            if (start_known and from_start < 3) or (end_known and from_end < 3):
                in_r.append(float(v))
            elif from_start < 3 or from_end < 3:
                continue             # ขอบตัวอย่างที่ระบุตำแหน่งในเดือนไม่ได้
            else:
                out_r.append(float(v))
        k = e

    n_in, n_out = len(in_r), len(out_r)
    if n_in < 2 or n_out < 2:
        return {"pass": False, "insideMean": _jround(_mean(in_r) * 100, 3),
                "outsideMean": _jround(_mean(out_r) * 100, 3), "t": 0, "nIn": n_in}
    m_in, m_out = _mean(in_r), _mean(out_r)
    se = math.sqrt(_var_d1(in_r) / n_in + _var_d1(out_r) / n_out)
    t = (m_in - m_out) / se if se > 1e-12 else 0.0
    return {"pass": bool(_jround(t, 2) > TOM_T), "insideMean": _jround(m_in * 100, 3),
            "outsideMean": _jround(m_out * 100, 3), "t": _jround(t, 2), "nIn": n_in}


# ---------------------------------------------------------------- build report
def params_hash(mode: str) -> tuple[dict, str]:
    """paramsHash เดียวกับ ResearchRun kind 'thai_fit' (sha256 ของ JSON.stringify(params))"""
    # rules: 2 = control H2 เป็น fwd5 ของตลาด + TOM ไม่นับวันกำกวมขอบตัวอย่าง + H4 ต้องมี long cell ที่วัดได้
    params = {"mode": mode, "rules": 2, "forms": FORMS_TH, "holds": HOLDS_SHORT,
              "holdsLong": HOLDS_LONG, "minCsN": MIN_CS_N, "cost": COST_RT,
              "zIn": Z_IN, "turnMin": TURN_MIN, "flowMax": FLOW_MAX, "tomT": TOM_T}
    raw = json.dumps(params, separators=(",", ":"), ensure_ascii=False)
    return params, hashlib.sha256(raw.encode("utf-8")).hexdigest()


def run_thai_fit(df: pd.DataFrame, mode: str = "all") -> dict:
    """รันตาม mode (ส่วนที่ไม่รัน = null) → รายงานรูปเดียวกับ ThaiFitReport ของแพลตฟอร์ม"""
    if mode not in MODES:
        raise ValueError(f"mode ไม่ถูกต้อง: {mode}")
    piv = load_pivots(df)
    scan_res = scan(piv) if mode in ("all", "scan") else None
    h1 = {"pass": scan_res["h1Pass"], "best": scan_res["best"]} if scan_res else None
    h4 = {"pass": scan_res["h4Pass"], "longCells": scan_res["longCells"]} if scan_res else None
    h2 = reversal(piv) if mode in ("all", "reversal") else None
    h3 = tom(piv) if mode in ("all", "tom") else None

    actions: dict = {}
    vbits: list[str] = []
    for key, sec in (("H1", h1), ("H2", h2), ("H3", h3), ("H4", h4)):
        if sec is None:
            continue
        actions[key] = ACTIONS_TH[f"{key}_{'PASS' if sec['pass'] else 'FAIL'}"]
        vbits.append(f"{key}:{'PASS' if sec['pass'] else 'FAIL'}")

    params, phash = params_hash(mode)
    return {
        "ranAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "mode": mode,
        "h1": h1,
        "h2": h2,
        "h3": h3,
        "h4": h4,
        "scan": scan_res["cells"] if scan_res else [],
        "actions": actions,
        "verdict": " ".join(vbits),
        "params": params,
        "paramsHash": phash,
        "source": "db/custom.db :: table RawDaily (date,symbol,close,val,liq5)",
        "n_rows": int(len(df)),
        "n_symbols": int(df["symbol"].nunique()),
        "date_min": str(df["date"].min()),
        "date_max": str(df["date"].max()),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="ห้องสอบสัญญาณ H1–H4 สำหรับหุ้นไทย (LAB KIT)")
    ap.add_argument("cmd", choices=["scan", "reversal", "tom", "all"],
                    help="scan=H1+H4 | reversal=H2 | tom=H3 | all=ครบทุกข้อ")
    ap.add_argument("--db", default=None, help="path ฐานข้อมูล (default: ../db/custom.db)")
    args = ap.parse_args()

    df = load_daily(args.db)
    if df.empty:
        print("[ERROR] ตาราง \"RawDaily\" ว่าง — เติมข้อมูลก่อน (backfill)", file=sys.stderr)
        return 2
    print(f"โหลดข้อมูล {len(df):,} แถว | {df['symbol'].nunique()} หุ้น | "
          f"{df['date'].min()} → {df['date'].max()}")

    report = run_thai_fit(df, args.cmd)
    OUT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8")

    print(f"\n=== evidence_report.json → {OUT_PATH} ===")
    if report["h1"] is not None:
        b = report["h1"]["best"]
        top = f"best {b[0]['form']}/{b[0]['hold']} ICIR={b[0]['ICIR']}" if b else "ไม่มี cell ที่วัดได้"
        print(f"  H1: {'PASS' if report['h1']['pass'] else 'FAIL'}  (โมเมนตัมสั้น) {top}")
    if report["h2"] is not None:
        h2 = report["h2"]
        print(f"  H2: {'PASS' if h2['pass'] else 'FAIL'}  (snap-back) n={h2['n']} "
              f"winRate={h2['winRate']} edge={h2['edgeVsCtrl']}")
    if report["h3"] is not None:
        h3 = report["h3"]
        print(f"  H3: {'PASS' if h3['pass'] else 'FAIL'}  (turn-of-month) t={h3['t']} nIn={h3['nIn']}")
    if report["h4"] is not None:
        mx = max((c["ICIR"] for c in report["h4"]["longCells"]), default=None)
        print(f"  H4: {'PASS' if report['h4']['pass'] else 'FAIL'}  (tf ยาวตาย?) max long ICIR={mx}")
    print(f"  verdict: {report['verdict']}")
    for key, txt in report["actions"].items():
        print(f"  {key} → {txt}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
