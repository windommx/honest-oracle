#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
apply_verdict.py — เปลี่ยนหลักฐานเป็นการตั้งค่า + บันทึก audit trail
=====================================================================
อ่าน evidence_report.json (ผล H1–H4 จาก `thai_fit.py all`) แล้วทำแบบเดียวกับ applyVerdict()
ของแพลตฟอร์ม (src/lib/config/thai-config.ts — POST /api/evidence/run mode 'all'):

  1. อัปเดต config/config_th.json — รูปเดียวกับค่า Setting key `config_th` ของแพลตฟอร์ม
     (camelCase: tfWeights/holdDefault/calendarOverlay/reversalEnabled/updatedBy/history)
     → ใช้ PUT /api/config/th ส่งค่าเดียวกันเข้าแพลตฟอร์มได้ตรง ๆ
     กติกา: reversalEnabled = H2 pass · calendarOverlay = H3 pass
            holdDefault = 5 (H1 pass) / 10 · tfWeights เอนสายสั้น (H1 pass) หรือสายยาว
            updatedBy = auto-verdict@<YYYY-MM-DD เวลาไทย> · history ต่อท้าย {ts, verdict, note}
  2. INSERT audit เข้าตาราง "Decision" ของ db/custom.db:
     question='Q_SIGNAL', target='config_th', action='auto-apply',
     conf=1.0, reason=JSON ของ actions, executed=1, source='system'
     (createdAt เป็น epoch ms แบบที่ Prisma เก็บ DateTime ใน SQLite)

ความปลอดภัย (เหมือนแพลตฟอร์ม): apply เฉพาะรายงาน mode='all' ที่ scan มีหลักฐานจริง
(อย่างน้อย 1 cell วัดได้ n>0) — ไม่งั้นคง config เดิมและไม่เขียน audit

ใช้งาน:  python apply_verdict.py [--db ../db/custom.db]
"""

import argparse
import json
import math
import sqlite3
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

LAB = Path(__file__).resolve().parent
REPORT_PATH = LAB / "evidence_report.json"
CONFIG_DIR = LAB / "config"
CONFIG_PATH = CONFIG_DIR / "config_th.json"
DB_PATH = LAB.parent / "db" / "custom.db"

TF_KEYS = ("5", "10", "20", "40", "80", "160", "300")
# ค่าเริ่มต้น — เดียวกับ DEFAULT_CONFIG ของ Setting key `config_th`
DEFAULT_CONFIG = {
    "tfWeights": {"5": 0.35, "10": 0.3, "20": 0.2, "40": 0.1, "80": 0.05, "160": 0, "300": 0},
    "holdDefault": 5,
    "calendarOverlay": False,
    "reversalEnabled": False,
    "updatedBy": "manual-init",
    "history": [],
}
TF_SHORT = {"5": 0.35, "10": 0.3, "20": 0.2, "40": 0.1, "80": 0.05, "160": 0, "300": 0}
TF_LONG = {"5": 0.15, "10": 0.15, "20": 0.1, "40": 0.1, "80": 0.05, "160": 0.2, "300": 0.25}
HISTORY_MAX = 200
BKK = timezone(timedelta(hours=7))   # ประเทศไทยไม่มี DST — UTC+7 ตายตัว (ไม่ต้องพึ่ง tzdata บน Windows)


def bangkok_date(now: datetime | None = None) -> str:
    """วันที่ตามเวลาตลาด (Asia/Bangkok) รูป YYYY-MM-DD — ไม่ขึ้นกับ TZ ของเครื่อง"""
    return (now or datetime.now(timezone.utc)).astimezone(BKK).strftime("%Y-%m-%d")


def _is_num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def merge_config(over) -> dict:
    """ผสม config ที่อ่านได้กับค่าเริ่มต้น — ค่าไหน type เพี้ยน/ผิดช่วงกลับไปใช้ default (เหมือน mergeConfig)"""
    cfg = json.loads(json.dumps(DEFAULT_CONFIG))
    if not isinstance(over, dict):
        return cfg
    tfw = over.get("tfWeights")
    if isinstance(tfw, dict):
        for k in TF_KEYS:
            v = tfw.get(k)
            if _is_num(v) and 0 <= v <= 1:
                cfg["tfWeights"][k] = v
    hd = over.get("holdDefault")
    if _is_num(hd) and float(hd).is_integer() and 1 <= hd <= 40:
        cfg["holdDefault"] = int(hd)
    for k in ("calendarOverlay", "reversalEnabled"):
        if isinstance(over.get(k), bool):
            cfg[k] = over[k]
    if isinstance(over.get("updatedBy"), str) and over["updatedBy"]:
        cfg["updatedBy"] = over["updatedBy"]
    if isinstance(over.get("history"), list):
        hist = []
        for h in over["history"]:
            if not isinstance(h, dict) or not _is_num(h.get("ts")):
                continue
            e = {"ts": h["ts"]}
            if isinstance(h.get("verdict"), dict):
                e["verdict"] = {k: v for k, v in h["verdict"].items() if isinstance(v, bool)}
            if isinstance(h.get("note"), str):
                e["note"] = h["note"]
            hist.append(e)
        cfg["history"] = hist
    return cfg


def load_report(path: Path = REPORT_PATH) -> dict:
    if not path.exists():
        print(f"[ERROR] ไม่พบ {path} — รัน `python thai_fit.py all` ก่อน", file=sys.stderr)
        sys.exit(2)
    try:
        rep = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"[ERROR] evidence_report.json เสียหาย: {exc}", file=sys.stderr)
        sys.exit(2)
    if not isinstance(rep, dict) or "mode" not in rep or "scan" not in rep:
        print("[ERROR] evidence_report.json เป็นรูปแบบเก่า/ไม่รู้จัก — รัน `python thai_fit.py all` ใหม่",
              file=sys.stderr)
        sys.exit(2)
    return rep


def _passed(rep: dict, key: str) -> bool:
    sec = rep.get(key)
    return bool(isinstance(sec, dict) and sec.get("pass"))


def apply_gate(rep: dict) -> str | None:
    """เหตุผลที่ "ไม่" apply (None = apply ได้) — กติกาเดียวกับ POST /api/evidence/run"""
    if rep.get("mode") != "all":
        return f"รายงาน mode={rep.get('mode')} — auto-apply เฉพาะ `thai_fit.py all`"
    if not any(isinstance(c, dict) and (c.get("n") or 0) > 0 for c in rep.get("scan") or []):
        return "ข้อมูลไม่พอทดสอบ H1/H4 (ไม่มีวันไหนมีหุ้น liquid ครบ 30 ตัว) — ไม่ auto-apply config (คงค่าเดิม)"
    return None


def build_next_config(rep: dict, current, today: str, now_s: int) -> dict:
    """config ถัดไปตาม verdict (applyVerdict + saveConfigTh ของแพลตฟอร์ม)"""
    cur = merge_config(current)
    h1 = _passed(rep, "h1")
    return {
        "tfWeights": {**cur["tfWeights"], **(TF_SHORT if h1 else TF_LONG)},
        "holdDefault": 5 if h1 else 10,
        "calendarOverlay": _passed(rep, "h3"),
        "reversalEnabled": _passed(rep, "h2"),
        "updatedBy": f"auto-verdict@{today}",
        "history": (cur["history"] + [{
            "ts": now_s,
            "verdict": {k.upper(): _passed(rep, k) for k in ("h1", "h2", "h3", "h4")},
            "note": "auto-apply จาก thai_fit verdict (H1-H4)",
        }])[-HISTORY_MAX:],
    }


def audit_decision(rep: dict, today: str, db_path: Path = DB_PATH) -> bool:
    """บันทึก audit เข้าตาราง Decision ของแพลตฟอร์ม (ถ้าเข้าถึง DB ได้) — คอลัมน์/รูปแบบเดียวกับ Prisma"""
    reason = json.dumps(rep.get("actions") or {}, ensure_ascii=False, separators=(",", ":"))
    try:
        # mode=rw: ไม่มีไฟล์ → error (ไม่สร้าง custom.db เปล่าทิ้งไว้)
        cx = sqlite3.connect(f"file:{Path(db_path).resolve().as_posix()}?mode=rw", uri=True)
    except sqlite3.Error as exc:
        print(f"  [WARN] เปิดฐานข้อมูลไม่ได้ ({db_path}): {exc} — ข้าม audit", file=sys.stderr)
        return False
    try:
        with cx:
            cx.execute(
                'INSERT INTO "Decision" (date, question, target, action, conf, reason, '
                'executed, source, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (today, "Q_SIGNAL", "config_th", "auto-apply", 1.0, reason, 1, "system",
                 int(time.time() * 1000)),
            )
        print(f"  audit → Decision: date={today} question=Q_SIGNAL executed=1")
        return True
    except sqlite3.Error as exc:
        # ไม่มีตาราง (เครื่อง offline แท้) → เตือนแต่ไม่ล้ม pipeline
        print(f"  [WARN] บันทึก audit ลง Decision ไม่ได้: {exc}", file=sys.stderr)
        return False
    finally:
        cx.close()


def main() -> int:
    ap = argparse.ArgumentParser(description="evidence_report.json → config/config_th.json + audit")
    ap.add_argument("--db", default=str(DB_PATH), help="ฐานข้อมูลสำหรับ audit (default: ../db/custom.db)")
    args = ap.parse_args()

    report = load_report()
    print("=== apply_verdict — หลักฐาน → การตั้งค่า ===")
    print(f"  report verdict : {report.get('verdict')} (mode={report.get('mode')}, ranAt={report.get('ranAt')})")

    why_not = apply_gate(report)
    if why_not:
        print(f"\n[NOTE] {why_not}")
        return 0

    current = None
    if CONFIG_PATH.exists():
        try:
            current = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print("[WARN] config_th.json เดิมเสียหาย → เริ่มจากค่าเริ่มต้น", file=sys.stderr)

    today = bangkok_date()
    nxt = build_next_config(report, current, today, int(time.time()))
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)   # สร้างโฟลเดอร์ config/ ถ้ายังไม่มี
    CONFIG_PATH.write_text(json.dumps(nxt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"  config         : {CONFIG_PATH}")
    print(f"  tfWeights      : {nxt['tfWeights']}")
    print(f"  holdDefault    : {nxt['holdDefault']}")
    print(f"  calendarOverlay / reversalEnabled : {nxt['calendarOverlay']} / {nxt['reversalEnabled']}")
    print(f"  updatedBy      : {nxt['updatedBy']} (history {len(nxt['history'])} รายการ)")
    audit_decision(report, today, Path(args.db))
    return 0


if __name__ == "__main__":
    sys.exit(main())
