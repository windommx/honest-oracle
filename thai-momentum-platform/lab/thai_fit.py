#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thai_fit.py — ห้องสอบสัญญาณ (Evidence Lab) สำหรับหุ้นไทย — ฉบับ offline LAB KIT
=================================================================================
สอบสมมติฐาน 4 ข้อ (H1–H4) จากฐานข้อมูลจริง แล้วเขียน evidence_report.json
(ไฟล์เดียวกับที่ /api/evidence ของแพลตฟอร์มนำไปแสดงในแท็บ Evidence Board)

  H1  horizon scan        — โมเมนตัมแบบ multi-timeframe ผ่านเกณฑ์ ICIR > 0.25
  H2  snap-back reversal  — หุ้น liq5=1 ที่ z5 <= -2.5 + flow < -0.20 แล้วเด้งกลับ
                            (turn >= 0.60) ภายใน 5 วัน
  H3  turn-of-month       — ผลตอบแทนตลาดช่วงวันที่ t > 2 ของเดือน ต่างจากช่วงต้นเดือน
                            อย่างมีนัยสำคัญ (t-stat > 2)
  H4  meta-gate           — คะแนนรวม weighted-rank ตาม tf_weights ต้องมี ICIR > 0.25
                            จึง "อนุมัติ" actions ทั้งชุดไป apply จริง

การปรับให้เข้ากับแพลตฟอร์ม (เท่านั้น — คณิตศาสตร์ตามสเปกเดิมทุกตัวเลข):
  - conn() ชี้ไป ../db/custom.db (resolve จาก __file__ ผ่าน pathlib)
  - อ่านตาราง "RawDaily" (case-sensitive) คอลัมน์ date,symbol,close,val,liq5

ใช้งาน:
  python thai_fit.py scan       # H1 เท่านั้น
  python thai_fit.py reversal   # H2 เท่านั้น
  python thai_fit.py tom        # H3 เท่านั้น
  python thai_fit.py all        # ครบ H1–H4 + actions (แนะนำ)

ผลลัพธ์: evidence_report.json เขียนไว้ข้างสคริปต์นี้เสมอ
"""

import argparse
import json
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

COST_RT = 0.011            # ต้นทุน round-trip ต่อไม้ (1.1%) — คงค่าตามสเปก
Z5_MAX = -2.5              # H2: ยิ่งลึกยิ่ง overreact — z5 <= -2.5
TURN_MIN = 0.60            # H2: อัตราเด้งกลับสำเร็จ >= 0.60
FLOW_MIN = -0.20           # H2: money-flow ratio < -0.20 (ขายล้าง)
TOM_T_MIN = 2.0            # H3: t-stat ของช่วง turn-of-month (วันที่ t > 2 ของเดือน)
ICIR_MIN = 0.25            # H1/H4: เกณฑ์คุณภาพสัญญาณ — ICIR > 0.25

TFS = [5, 10, 20, 40, 80, 160, 300]                # timeframes ตามสเปก
BASE_TF_WEIGHTS = {5: 0.35, 10: 0.30, 20: 0.20, 40: 0.10, 80: 0.05, 160: 0, 300: 0}
HOLD_DEFAULT = 5            # ถือฐาน 5 วัน (ตัวเลขจาก config_th)

MIN_NAMES_PER_DAY = 10     # จำนวนหุ้นขั้นต่ำต่อวันเพื่อคำนวณ cross-sectional IC
MIN_IC_DAYS = 60           # จำนวนวันสังเกตขั้นต่ำของ H1 ต่อ timeframe
MIN_H2_CASES = 50          # จำนวนเคส setup ขั้นต่ำของ H2
MIN_H3_DAYS = 100          # จำนวนวันในหน้าต่าง TOM ขั้นต่ำของ H3
MIN_H4_DAYS = 120          # จำนวนวันสังเกตขั้นต่ำของ H4

# แผน actions → ข้อความไทยที่โชว์บน Evidence Board (คง mapping ตามสเปก)
ACTIONS_TH = {
    "H1_pass": "โปรโมตน้ำหนักเฉพาะ timeframe ที่ผ่านเกณฑ์ (ICIR>0.25) และตั้ง hold ตาม horizon ที่ดีที่สุด",
    "H1_fail": "คงน้ำหนักเดิม — ยังไม่มีหลักฐานเพียงพอสำหรับโมเมนตัม multi-timeframe",
    "H2_pass": "เปิดสัญญาณ snap-back reversal เฉพาะหุ้นสภาพคล่อง (liq5=1) ที่ย่อลึก z5<=-2.5",
    "H2_fail": "ปิดสัญญาณ reversal (reversal_enabled=false) — อัตราเด้งหรือ edge ยังไม่ผ่านเกณฑ์",
    "H3_pass": "เปิด calendar overlay ช่วง turn-of-month (วันที่ t>2 ของเดือน)",
    "H3_fail": "ไม่ปรับตามปฏิทิน (calendar_overlay=false)",
    "H4_pass": "meta-gate ผ่าน — อนุมัติ actions ทั้งชุดไป apply ใน config_th",
    "H4_fail": "meta-gate ไม่ผ่าน — คง config เดิมทั้งหมด (ป้องกัน overfitting)",
}


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
    with conn(db_path) as cx:
        df = pd.read_sql_query(
            'SELECT date, symbol, close, val, liq5 FROM "RawDaily"', cx
        )
    df["date"] = df["date"].astype(str)
    df["symbol"] = df["symbol"].astype(str).str.upper()
    for col in ("close", "val", "liq5"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df.sort_values(["symbol", "date"]).reset_index(drop=True)


def to_wide(df: pd.DataFrame, col: str) -> pd.DataFrame:
    """แปลง long → wide (index=date, columns=symbol) พร้อมเรียงวันตามลำดับเวลา"""
    w = df.pivot_table(index="date", columns="symbol", values=col, aggfunc="last")
    w = w.sort_index()
    w.index = pd.to_datetime(w.index)
    return w.sort_index()


# ---------------------------------------------------------------- statistics
def daily_spearman_ic(a: pd.DataFrame, b: pd.DataFrame,
                      min_names: int = MIN_NAMES_PER_DAY) -> pd.Series:
    """Spearman IC รายวัน (cross-sectional) ระหว่าง wide-frame สองตัว"""
    common = a.notna() & b.notna()
    ra = a.where(common).rank(axis=1)
    rb = b.where(common).rank(axis=1)
    n = common.sum(axis=1)
    ra_c = ra.sub(ra.mean(axis=1), axis=0)
    rb_c = rb.sub(rb.mean(axis=1), axis=0)
    cov = (ra_c * rb_c).sum(axis=1)
    den = np.sqrt((ra_c ** 2).sum(axis=1) * (rb_c ** 2).sum(axis=1))
    den = den.replace(0, np.nan)
    ic = cov / den
    ic[n < min_names] = np.nan
    return ic.dropna()


def icir_stats(ic: pd.Series) -> dict:
    """สรุป IC series → {n, mean_ic, icir (t-stat)}"""
    if len(ic) == 0:
        return {"n": 0, "mean_ic": None, "icir": None}
    mean = float(ic.mean())
    sd = float(ic.std(ddof=1))
    icir = mean / sd * np.sqrt(len(ic)) if sd and sd > 0 else 0.0
    return {"n": int(len(ic)), "mean_ic": round(mean, 6), "icir": round(float(icir), 4)}


def fwd_return(close: pd.DataFrame, hold: int) -> pd.DataFrame:
    """ผลตอบแทนล่วงหน้า hold วันต่อหุ้น (forward-looking สำหรับการสอบเท่านั้น)"""
    return close.shift(-hold) / close - 1.0


# ---------------------------------------------------------------- H1 scan
def run_h1(close: pd.DataFrame, hold: int) -> dict:
    """H1 — horizon scan: โมเมนตัมแต่ละ timeframe มี IC คาดการณ์จริงไหม"""
    per_tf = []
    for tf in TFS:
        mom = close / close.shift(tf) - 1.0
        fwd = fwd_return(close, hold)
        st = icir_stats(daily_spearman_ic(mom, fwd))
        ok = (
            st["n"] >= MIN_IC_DAYS
            and st["mean_ic"] is not None and st["mean_ic"] > 0
            and st["icir"] is not None and st["icir"] > ICIR_MIN
        )
        per_tf.append({"tf": tf, **st, "pass": bool(ok)})

    passing = [r["tf"] for r in per_tf if r["pass"]]
    best = max(per_tf, key=lambda r: (r["icir"] or -9e9)) if per_tf else None

    # actions: กระจายน้ำหนักใหม่เฉพาะ tf ที่ผ่าน (renormalize จาก BASE_TF_WEIGHTS)
    proposed = {tf: 0 for tf in TFS}
    if passing:
        raw = {tf: BASE_TF_WEIGHTS[tf] for tf in passing}
        total = sum(raw.values()) or 1.0
        for tf, w in raw.items():
            proposed[tf] = round(w / total, 4)

    return {
        "name": "H1 horizon scan (multi-timeframe momentum)",
        "hold": hold,
        "per_tf": per_tf,
        "passing_tfs": passing,
        "best_tf": best["tf"] if best else None,
        "best_icir": best["icir"] if best else None,
        "pass": bool(passing),
        "rule": f"ICIR>{ICIR_MIN} และ mean IC>0 และ n>={MIN_IC_DAYS} วัน",
        "action": ACTIONS_TH["H1_pass"] if passing else ACTIONS_TH["H1_fail"],
        "proposed_tf_weights": proposed,
        "proposed_hold": int(best["tf"]) if (best and best["pass"]) else HOLD_DEFAULT,
    }


# ---------------------------------------------------------------- H2 reversal
def run_h2(close: pd.DataFrame, val: pd.DataFrame, liq: pd.DataFrame,
           hold: int = 5) -> dict:
    """H2 — snap-back reversal: ย่อลึก + เงินไหลออก + สภาพคล่องดี → เด้งกลับไหม"""
    ma5 = close.rolling(5, min_periods=5).mean()
    sd5 = close.rolling(5, min_periods=5).std(ddof=1)
    z5 = (close - ma5) / sd5.replace(0, np.nan)

    ret1 = close.pct_change(fill_method=None)
    flow_num = (np.sign(ret1) * val).rolling(20, min_periods=20).sum()
    flow_den = val.rolling(20, min_periods=20).sum()
    flow = flow_num / flow_den.replace(0, np.nan)

    setup = (z5 <= Z5_MAX) & (flow < FLOW_MIN) & (liq == 1)
    fwd = fwd_return(close, hold)

    m = setup.to_numpy()
    f = fwd.to_numpy()
    sel = m & np.isfinite(f)
    n_setup = int(sel.sum())

    # baseline เทียบกับหุ้นสภาพคล่องดีทั่วไป (ไม่อยู่ใน setup) เพื่อวัด edge จริง
    liq_np = (liq == 1).to_numpy()
    base_sel = liq_np & np.isfinite(f) & ~m
    mean_fwd = float(f[sel].mean()) if n_setup else None
    baseline = float(f[base_sel].mean()) if base_sel.any() else None

    turn = float((f[sel] > 0).mean()) if n_setup else None
    net = (mean_fwd - COST_RT) if mean_fwd is not None else None

    ok = bool(
        n_setup >= MIN_H2_CASES
        and turn is not None and turn >= TURN_MIN
        and net is not None and net > 0
    )
    return {
        "name": "H2 snap-back reversal (z5 + flow + liquidity)",
        "setup_rule": f"z5<={Z5_MAX} และ flow<{FLOW_MIN} และ liq5=1",
        "n_setup": n_setup,
        "turn_rate": round(turn, 4) if turn is not None else None,
        "mean_fwd5": round(mean_fwd, 6) if mean_fwd is not None else None,
        "baseline_fwd5": round(baseline, 6) if baseline is not None else None,
        "net_after_cost": round(net, 6) if net is not None else None,
        "cost_rt": COST_RT,
        "pass": ok,
        "rule": f"n>={MIN_H2_CASES} และ turn>={TURN_MIN} และ กำไรสุทธิหลังต้นทุน >0",
        "action": ACTIONS_TH["H2_pass"] if ok else ACTIONS_TH["H2_fail"],
        "proposed_reversal_enabled": ok,
    }


# ---------------------------------------------------------------- H3 TOM
def run_h3(close: pd.DataFrame) -> dict:
    """H3 — turn-of-month: ตลาดช่วงวันที่ t>2 ของเดือน (หลังผันผวนต้นเดือน) ดีกว่าไหม"""
    mkt_ret = close.pct_change(fill_method=None).mean(axis=1).dropna()
    df = mkt_ret.rename("ret").reset_index()
    df.columns = ["date", "ret"]
    df["month"] = df["date"].dt.strftime("%Y-%m")
    df["t"] = df.groupby("month").cumcount() + 1          # วันที่ t ภายในเดือน (จริง)
    in_win = df[df["t"] > 2]["ret"].to_numpy()            # TOM window: t > 2
    out_win = df[df["t"] <= 2]["ret"].to_numpy()          # ต้นเดือน (วันที่ 1-2)

    a, b = in_win[np.isfinite(in_win)], out_win[np.isfinite(out_win)]
    if len(a) > 2 and len(b) > 2:
        m1, m2 = a.mean(), b.mean()
        v1, v2 = a.var(ddof=1), b.var(ddof=1)
        den = np.sqrt(v1 / len(a) + v2 / len(b))
        t_stat = float((m1 - m2) / den) if den and den > 0 else 0.0
    else:
        t_stat = 0.0

    ok = bool(len(a) >= MIN_H3_DAYS and t_stat > TOM_T_MIN)
    return {
        "name": "H3 turn-of-month (วันที่ t>2 ของเดือน)",
        "n_days_in": int(len(a)),
        "n_days_out": int(len(b)),
        "mean_in": round(float(a.mean()), 6) if len(a) else None,
        "mean_out": round(float(b.mean()), 6) if len(b) else None,
        "t_stat": round(t_stat, 4),
        "pass": ok,
        "rule": f"t-stat>{TOM_T_MIN} และ n(หน้าต่าง TOM)>={MIN_H3_DAYS} วัน",
        "action": ACTIONS_TH["H3_pass"] if ok else ACTIONS_TH["H3_fail"],
        "proposed_calendar_overlay": ok,
    }


# ---------------------------------------------------------------- H4 meta
def run_h4(close: pd.DataFrame, weights: dict, hold: int) -> dict:
    """H4 — meta-gate: คะแนนรวม weighted-rank ต้องมี ICIR>0.25 จึงอนุมัติ actions"""
    score = None
    total_w = 0.0
    for tf, w in weights.items():
        if w and w > 0:
            rk = (close / close.shift(tf) - 1.0).rank(axis=1, pct=True)
            score = rk * w if score is None else score + rk * w
            total_w += w
    if score is None or total_w == 0:
        return {
            "name": "H4 meta-gate (weighted composite)",
            "n": 0, "icir": None, "mean_ic": None, "pass": False,
            "rule": f"ICIR>{ICIR_MIN} และ n>={MIN_H4_DAYS} วัน",
            "action": ACTIONS_TH["H4_fail"],
        }
    score = score / total_w
    st = icir_stats(daily_spearman_ic(score, fwd_return(close, hold)))
    ok = bool(
        st["n"] >= MIN_H4_DAYS
        and st["mean_ic"] is not None and st["mean_ic"] > 0
        and st["icir"] is not None and st["icir"] > ICIR_MIN
    )
    return {
        "name": "H4 meta-gate (weighted composite)",
        **st,
        "pass": ok,
        "rule": f"ICIR>{ICIR_MIN} และ n>={MIN_H4_DAYS} วัน",
        "action": ACTIONS_TH["H4_pass"] if ok else ACTIONS_TH["H4_fail"],
    }


# ---------------------------------------------------------------- build report
def compute_section(section: str, df: pd.DataFrame, hold: int,
                    weights: dict | None = None) -> dict:
    """คำนวณเฉพาะ section เดียว (ใช้กับ CLI ย่อย scan/reversal/tom)"""
    close = to_wide(df, "close")
    if section == "H1":
        return run_h1(close, hold)
    if section == "H2":
        return run_h2(close, to_wide(df, "val"), to_wide(df, "liq5"), hold=5)
    if section == "H3":
        return run_h3(close)
    if section == "H4":
        w = weights or BASE_TF_WEIGHTS
        return run_h4(close, w, hold)
    raise ValueError(f"unknown section {section}")


def build_report(df: pd.DataFrame, hold: int, prev: dict | None = None) -> dict:
    """รันครบ H1→H4 แล้วประกอบ actions ตามหลักฐาน (H4 เป็นด่านอนุมัติสุดท้าย)"""
    h1 = run_h1(to_wide(df, "close"), hold)
    h2 = run_h2(to_wide(df, "close"), to_wide(df, "val"), to_wide(df, "liq5"), hold=5)
    h3 = run_h3(to_wide(df, "close"))
    h4 = run_h4(to_wide(df, "close"), h1["proposed_tf_weights"], h1["proposed_hold"])

    any_edge = h1["pass"] or h2["pass"] or h3["pass"]
    approved = bool(h4["pass"] and any_edge)

    if approved:
        actions = {
            "tf_weights": h1["proposed_tf_weights"],
            "hold_default": h1["proposed_hold"],
            "calendar_overlay": h3["proposed_calendar_overlay"],
            "reversal_enabled": h2["proposed_reversal_enabled"],
        }
    else:
        # ไม่ผ่าน meta-gate → คงค่าเริ่มต้น (ความปลอดภัยเหนือกำไร)
        actions = {
            "tf_weights": dict(BASE_TF_WEIGHTS),
            "hold_default": HOLD_DEFAULT,
            "calendar_overlay": False,
            "reversal_enabled": False,
        }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "db/custom.db :: table RawDaily (date,symbol,close,val,liq5)",
        "n_rows": int(len(df)),
        "n_symbols": int(df["symbol"].nunique()),
        "date_min": str(df["date"].min()),
        "date_max": str(df["date"].max()),
        "cost_rt": COST_RT,
        "H1": h1,
        "H2": h2,
        "H3": h3,
        "H4": h4,
        "approved": approved,
        "verdict": "APPROVED" if approved else "NOT-APPROVED",
        "actions": actions,
        "actions_th": [h1["action"], h2["action"], h3["action"], h4["action"]],
    }


def merge_section(prev: dict, section: str, result: dict) -> dict:
    """รัน CLI ย่อย → merge เฉพาะ section ทับ report เดิม (คงส่วนอื่นไว้)"""
    out = dict(prev) if prev else {}
    out[section] = result
    out["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="ห้องสอบสัญญาณ H1–H4 สำหรับหุ้นไทย (LAB KIT)")
    ap.add_argument("cmd", choices=["scan", "reversal", "tom", "all"],
                    help="scan=H1 | reversal=H2 | tom=H3 | all=ครบทุกข้อ")
    ap.add_argument("--db", default=None, help="path ฐานข้อมูล (default: ../db/custom.db)")
    ap.add_argument("--hold", type=int, default=HOLD_DEFAULT, help="horizon ถือ (วัน) ของ H1")
    args = ap.parse_args()

    df = load_daily(args.db)
    if df.empty:
        print("[ERROR] ตาราง \"RawDaily\" ว่าง — เติมข้อมูลก่อน (backfill)", file=sys.stderr)
        return 2
    print(f"โหลดข้อมูล {len(df):,} แถว | {df['symbol'].nunique()} หุ้น | "
          f"{df['date'].min()} → {df['date'].max()}")

    prev = None
    if OUT_PATH.exists():
        try:
            prev = json.loads(OUT_PATH.read_text(encoding="utf-8"))
        except Exception:
            prev = None

    if args.cmd == "all":
        report = build_report(df, args.hold, prev)
    else:
        section = {"scan": "H1", "reversal": "H2", "tom": "H3"}[args.cmd]
        result = compute_section(section, df, args.hold,
                                 weights=(prev or {}).get("actions", {}).get("tf_weights"))
        report = merge_section(prev, section, result)

    OUT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8")

    print(f"\n=== evidence_report.json → {OUT_PATH} ===")
    for key in ("H1", "H2", "H3", "H4"):
        sec = report.get(key)
        if isinstance(sec, dict):
            mark = "PASS" if sec.get("pass") else "FAIL"
            extra = sec.get("icir", sec.get("t_stat", sec.get("turn_rate")))
            print(f"  {key}: {mark}  ({sec.get('name')}) metric={extra}")
    if args.cmd == "all":
        print(f"  verdict: {report['verdict']}")
        print(f"  actions: {json.dumps(report['actions'], ensure_ascii=False)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
