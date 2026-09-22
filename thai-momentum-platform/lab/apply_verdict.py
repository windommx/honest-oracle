#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
apply_verdict.py — เปลี่ยนหลักฐานเป็นการตั้งค่า + บันทึก audit trail
=====================================================================
อ่าน evidence_report.json (ผล H1–H4 จาก thai_fit.py) แล้ว:

  1. อัปเดต config/config_th.json — ไฟล์เดียวกับ Setting key `config_th`
     ของแพลตฟอร์ม (แสดงในแท็บ Evidence Board)
     - ยังไม่มีไฟล์ → สร้างโฟลเดอร์ config/ + เขียนค่าเริ่มต้นตามสเปก
     - มีอยู่แล้ว → push สำเนาเดิมเข้า history (เก็บย้อนหลังได้)
  2. INSERT audit เข้าตาราง "Decision" ของ db/custom.db:
     question='Q_SIGNAL', target='config_th', action='auto-apply',
     conf=1.0, reason=JSON ของ actions, executed=1, source='system'

ความปลอดภัย: apply เฉพาะเมื่อ report.approved = true (H4 ผ่าน + มี edge อย่างน้อย 1 ข้อ)
หากไม่อนุมัติ → คงค่าเดิม และบันทึก audit ที่ executed=0
"""

import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

LAB = Path(__file__).resolve().parent
REPORT_PATH = LAB / "evidence_report.json"
CONFIG_DIR = LAB / "config"
CONFIG_PATH = CONFIG_DIR / "config_th.json"
DB_PATH = LAB.parent / "db" / "custom.db"

# ค่าเริ่มต้นตามสเปก — เดียวกับ Setting key `config_th` ของแพลตฟอร์ม
DEFAULT_CONFIG = {
    "tf_weights": {"5": 0.35, "10": 0.30, "20": 0.20, "40": 0.10,
                   "80": 0.05, "160": 0, "300": 0},
    "hold_default": 5,
    "calendar_overlay": False,
    "reversal_enabled": False,
    "updated_by": "manual-init",
    "history": [],
}
HISTORY_CAP = 50


def load_report() -> dict:
    if not REPORT_PATH.exists():
        print(f"[ERROR] ไม่พบ {REPORT_PATH} — รัน `python thai_fit.py all` ก่อน",
              file=sys.stderr)
        sys.exit(2)
    try:
        return json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"[ERROR] evidence_report.json เสียหาย: {exc}", file=sys.stderr)
        sys.exit(2)


def build_next_config(report: dict, current: dict | None) -> tuple[dict, dict, bool]:
    """คืน (config ถัดไป, actions ที่ apply, executed_flag)"""
    base = dict(DEFAULT_CONFIG)
    if current:
        base.update(current)
        # history เก็บสำเนาสถานะเดิมไว้ก่อนแก้
        snapshot = {k: current.get(k) for k in
                    ("tf_weights", "hold_default", "calendar_overlay",
                     "reversal_enabled", "updated_by")}
        base["history"] = (current.get("history") or []) + [{
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "updated_by": current.get("updated_by", "unknown"),
            "snapshot": snapshot,
        }][-HISTORY_CAP:]

    approved = bool(report.get("approved"))
    actions = report.get("actions") or {}

    if approved:
        tfw = actions.get("tf_weights") or DEFAULT_CONFIG["tf_weights"]
        base["tf_weights"] = {str(k): v for k, v in tfw.items()}
        base["hold_default"] = int(actions.get("hold_default", DEFAULT_CONFIG["hold_default"]))
        base["calendar_overlay"] = bool(actions.get("calendar_overlay", False))
        base["reversal_enabled"] = bool(actions.get("reversal_enabled", False))
        base["updated_by"] = "evidence-apply"
        executed = 1
    else:
        # ไม่อนุมัติ → คงค่าเดิมทั้งหมด (ป้องกัน overfit)
        base.setdefault("updated_by", "manual-init")
        executed = 0

    base["history"] = base.get("history") or []
    return base, actions, executed


def audit_decision(report: dict, actions: dict, executed: int) -> None:
    """บันทึก audit เข้าตาราง Decision ของแพลตฟอร์ม (ถ้าเข้าถึง DB ได้)"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    reason = json.dumps({
        "actions": actions,
        "approved": bool(report.get("approved")),
        "verdict": report.get("verdict"),
        "report_generated_at": report.get("generated_at"),
    }, ensure_ascii=False)
    try:
        cx = sqlite3.connect(str(DB_PATH))
        with cx:
            cx.execute(
                'INSERT INTO "Decision" (date, question, target, action, conf, '
                'reason, executed, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                (today, "Q_SIGNAL", "config_th", "auto-apply", 1.0, reason,
                 executed, "system"),
            )
        cx.close()
        print(f"  audit → Decision: date={today} question=Q_SIGNAL executed={executed}")
    except sqlite3.Error as exc:
        # ไม่มี DB (เครื่อง offline แท้) → เตือนแต่ไม่ล้ม pipeline
        print(f"  [WARN] บันทึก audit ลง Decision ไม่ได้: {exc}", file=sys.stderr)


def main() -> int:
    report = load_report()

    current = None
    if CONFIG_PATH.exists():
        try:
            current = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print("[WARN] config_th.json เดิมเสียหาย → สร้างใหม่จากค่าเริ่มต้น",
                  file=sys.stderr)

    nxt, actions, executed = build_next_config(report, current)

    CONFIG_DIR.mkdir(parents=True, exist_ok=True)   # สร้างโฟลเดอร์ config/ ถ้ายังไม่มี
    CONFIG_PATH.write_text(json.dumps(nxt, ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")

    print("=== apply_verdict — หลักฐาน → การตั้งค่า ===")
    print(f"  report verdict : {report.get('verdict')} "
          f"(generated_at={report.get('generated_at')})")
    print(f"  config         : {CONFIG_PATH}")
    print(f"  tf_weights     : {nxt['tf_weights']}")
    print(f"  hold_default   : {nxt['hold_default']}")
    print(f"  calendar_overlay / reversal_enabled : "
          f"{nxt['calendar_overlay']} / {nxt['reversal_enabled']}")
    print(f"  updated_by     : {nxt['updated_by']} (history {len(nxt['history'])} รายการ)")

    audit_decision(report, actions, executed)

    if not executed:
        print("\n[NOTE] ไม่อนุมัติ (H4 meta-gate ไม่ผ่าน หรือไม่มี edge) → คง config เดิม")
    return 0


if __name__ == "__main__":
    sys.exit(main())
