#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
context_updater.py — สรุปบริบทพอร์ตล่าสุดจาก journal → context.json
=====================================================================
journal.jsonl คือสมุดบันทึกเทรด/โน้ตของมนุษย์ (append-only) รูปแบบแถว:

  {"date":"2026-09-19","type":"trade","symbol":"KCE","r":0.8,"note":"...",
   "state":{...},"action":"buy","grade":"A"}      ← trade (มี r = ผลเป็นหน่วย R)
  {"date":"2026-09-19","type":"note","text":"ตลาด side-way"}   ← โน้ต (ไม่มี r)

context.json ที่ได้ (state_gen.py / nimble_runner ใช้ต่อ):
  day_pnl_R   — ผลรวม R ของวันนี้ (ถ้า <= -2 → กฎ R6.1 ล็อกไม้ใหม่)
  week_pnl_R  — ผลรวม R ของสัปดาห์ ISO นี้
  loss_streak — จำนวนไม้แพ้ติดกันล่าสุด (เรียงตามวัน)

ใช้งาน:  python context_updater.py [--date 2026-09-19]
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

LAB = Path(__file__).resolve().parent
DEFAULT_JOURNAL = LAB / "journal.jsonl"
DEFAULT_CONTEXT = LAB / "context.json"


def load_trades(journal_path: Path) -> list[dict]:
    """อ่านเฉพาะแถว type=trade ที่มี r (โน้ตไม่นับ)"""
    trades = []
    if not journal_path.exists():
        return trades
    with journal_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                print(f"[WARN] ข้ามบรรทัดเสีย: {line[:80]}", file=sys.stderr)
                continue
            if row.get("type") == "trade" and isinstance(row.get("r"), (int, float)):
                trades.append(row)
    trades.sort(key=lambda r: str(r.get("date", "")))
    return trades


def compute_context(trades: list[dict], date: str) -> dict:
    """คำนวณ day_pnl_R / week_pnl_R / loss_streak ณ วันที่กำหนด"""
    d0 = datetime.strptime(date, "%Y-%m-%d").date()
    iso_year, iso_week, _ = d0.isocalendar()

    day_pnl_R = 0.0
    week_pnl_R = 0.0
    last_trade_date = None
    dated: list[tuple[str, float]] = []

    for t in trades:
        td = str(t.get("date", ""))[:10]
        try:
            d = datetime.strptime(td, "%Y-%m-%d").date()
        except ValueError:
            continue
        if d > d0:
            continue                      # ไม่มองอนาคต
        r = float(t["r"])
        dated.append((td, r))
        last_trade_date = td
        if d == d0:
            day_pnl_R += r
        ty, tw, _ = d.isocalendar()
        if ty == iso_year and tw == iso_week:
            week_pnl_R += r

    # loss streak: นับไม้แพ้ (r<0) ติดกันจากล่าสุดย้อนหลัง
    loss_streak = 0
    for _, r in reversed(dated):
        if r < 0:
            loss_streak += 1
        else:
            break

    return {
        "date": date,
        "day_pnl_R": round(day_pnl_R, 3),
        "week_pnl_R": round(week_pnl_R, 3),
        "loss_streak": loss_streak,
        "last_trade_date": last_trade_date,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="journal.jsonl → context.json")
    ap.add_argument("--journal", default=str(DEFAULT_JOURNAL))
    ap.add_argument("--context", default=str(DEFAULT_CONTEXT))
    ap.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    help="วันที่สรุป (default: วันนี้)")
    args = ap.parse_args()

    journal_path, context_path = Path(args.journal), Path(args.context)
    trades = load_trades(journal_path)
    ctx = compute_context(trades, args.date)

    # คง key อื่น ๆ ที่มีอยู่เดิมใน context.json ไว้ (merge ไม่ทับหาย)
    if context_path.exists():
        try:
            old = json.loads(context_path.read_text(encoding="utf-8"))
            for k, v in old.items():
                ctx.setdefault(k, v)
        except json.JSONDecodeError:
            print("[WARN] context.json เดิมเสียหาย → เขียนใหม่", file=sys.stderr)
    ctx["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")

    context_path.write_text(json.dumps(ctx, ensure_ascii=False, indent=2) + "\n",
                            encoding="utf-8")

    print("=== context_updater ===")
    print(f"  journal      : {journal_path} ({len(trades)} trades)")
    print(f"  วันที่       : {ctx['date']}")
    print(f"  day_pnl_R    : {ctx['day_pnl_R']:+.2f}"
          + ("  ⚠️ <= -2 → R6.1 ล็อกไม้ใหม่วันนี้" if ctx["day_pnl_R"] <= -2.0 else ""))
    print(f"  week_pnl_R   : {ctx['week_pnl_R']:+.2f}")
    print(f"  loss_streak  : {ctx['loss_streak']}")
    print(f"  → {context_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
