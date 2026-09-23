#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
preflight.py — ตรวจข้อมูลก่อนใช้งาน LAB KIT (Data Quality Gates)
=================================================================
อ่านตาราง "RawDaily" ของ db/custom.db แล้วตรวจ 6 เกณฑ์ตามสเปก:

  1. rows    >= 50,000 แถว        (ข้อมูลต้องเยอะพอสำหรับสถิติ)
  2. span    >= 3 ปี              (ครอบคลุมหลายรอบตลาด)
  3. symbols >= 150 ตัว           (universe กว้างพอสำหรับ cross-section)
  4. no dup  — ไม่มี (date,symbol) ซ้ำ
  5. close   — ค่า valid ทั้งหมด (ไม่ว่าง / > 0 / ไม่ extreme)
  6. days/yr >= 200 วัน/ปี         (ตลาดเปิดครบ ไม่มีหลุดช่วง)

ใช้งาน:
  python preflight.py                 # ตรวจ ../db/custom.db
  python preflight.py history.csv     # ตรวจไฟล์ CSV ก่อน backfill (date,symbol,close[,...])
  python preflight.py other.db        # ตรวจ SQLite ไฟล์อื่น

Exit code (คง semantics ตามสเปก):
  0 = ผ่านทั้งหมด
  1 = มีเกณฑ์ที่ไม่ผ่าน (ต้องแก้ข้อมูลก่อน)
  2 = ไม่พบฐานข้อมูล/ไฟล์ หรือตาราง/คอลัมน์ที่ต้องใช้
"""

import argparse
import csv
import re
import sqlite3
import sys
from pathlib import Path

LAB = Path(__file__).resolve().parent
DB_PATH = LAB.parent / "db" / "custom.db"

MIN_ROWS = 50_000
MIN_SPAN_YEARS = 3.0
MIN_SYMBOLS = 150
MIN_DAYS_PER_YEAR = 200
CLOSE_MAX_SANE = 1_000_000.0   # ราคาหุ้นไทยไม่ควรเกินนี้ (กันหน่วยผิด/หน่วยสตางค์)


def open_db(db_path: Path | None = None):
    path = Path(db_path) if db_path else DB_PATH
    if not path.exists():
        print(f"[ERROR] ไม่พบฐานข้อมูล: {path}", file=sys.stderr)
        return None
    try:
        cx = sqlite3.connect(str(path))
        cx.execute('SELECT 1 FROM "RawDaily" LIMIT 1')
    except sqlite3.Error as exc:
        print(f"[ERROR] เปิดตาราง \"RawDaily\" ไม่ได้: {exc}", file=sys.stderr)
        return None
    return cx


def _norm_date(s: str) -> str | None:
    """YYYY-MM-DD · YYYY/M/D · YYYYMMDD → YYYY-MM-DD (รูปที่แพลตฟอร์ม normalize ได้แน่นอน)"""
    t = s.strip()
    m = re.fullmatch(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", t)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    m = re.fullmatch(r"(\d{4})(\d{2})(\d{2})", t)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return None


def open_csv(csv_path: Path):
    """โหลด CSV (ต้องมี date,symbol,close) เข้า SQLite ในหน่วยความจำเป็นตาราง "RawDaily" — ตรวจด้วยเกณฑ์เดียวกัน"""
    if not csv_path.exists():
        print(f"[ERROR] ไม่พบไฟล์ CSV: {csv_path}", file=sys.stderr)
        return None
    with csv_path.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.reader(fh)
        header = [h.strip().lower() for h in next(reader, [])]
        need = ("date", "symbol", "close")
        if any(c not in header for c in need):
            print(f"[ERROR] CSV ต้องมีคอลัมน์ date, symbol, close (พบ: {', '.join(header) or '—'})",
                  file=sys.stderr)
            return None
        i_d, i_s, i_c = (header.index(c) for c in need)
        rows, bad_date = [], 0
        for parts in reader:
            if not parts or all(not p.strip() for p in parts):
                continue
            d = _norm_date(parts[i_d]) if len(parts) > i_d else None
            sym = parts[i_s].strip().upper() if len(parts) > i_s else ""
            if not d or not sym:
                bad_date += 1
                continue
            try:
                close = float(parts[i_c]) if len(parts) > i_c else None
            except ValueError:
                close = None                              # นับเป็น "close ว่าง" ในเกณฑ์ข้อ 5
            rows.append((d, sym, close))
    cx = sqlite3.connect(":memory:")
    cx.execute('CREATE TABLE "RawDaily" (date TEXT, symbol TEXT, close REAL)')
    cx.executemany('INSERT INTO "RawDaily" (date, symbol, close) VALUES (?, ?, ?)', rows)
    note = f" (ข้าม {bad_date} แถวที่วันที่/ชื่อหุ้นอ่านไม่ได้)" if bad_date else ""
    print(f"อ่าน CSV {csv_path.name}: {len(rows):,} แถว{note}")
    return cx


def run_preflight(cx: sqlite3.Connection) -> list[dict]:
    """คืนรายการผลตรวจทีละเกณฑ์ [{name, ok, detail}]"""
    checks: list[dict] = []

    cur = cx.execute(
        'SELECT COUNT(*), MIN(date), MAX(date), COUNT(DISTINCT symbol) FROM "RawDaily"'
    )
    n_rows, d_min, d_max, n_symbols = cur.fetchone()
    n_rows = int(n_rows or 0)
    n_symbols = int(n_symbols or 0)

    # 1) จำนวนแถว
    checks.append({
        "name": "rows",
        "ok": n_rows >= MIN_ROWS,
        "detail": f"{n_rows:,} แถว (เกณฑ์ >= {MIN_ROWS:,})",
    })

    # 2) ช่วงเวลา >= 3 ปี
    span_years = 0.0
    if d_min and d_max:
        from datetime import date
        y0, m0, dd0 = (int(x) for x in d_min.split("-"))
        y1, m1, dd1 = (int(x) for x in d_max.split("-"))
        span_days = (date(y1, m1, dd1) - date(y0, m0, dd0)).days
        span_years = span_days / 365.25
    checks.append({
        "name": "span",
        "ok": span_years >= MIN_SPAN_YEARS,
        "detail": f"{d_min} → {d_max} = {span_years:.2f} ปี (เกณฑ์ >= {MIN_SPAN_YEARS:.0f} ปี)",
    })

    # 3) จำนวนหุ้น
    checks.append({
        "name": "symbols",
        "ok": n_symbols >= MIN_SYMBOLS,
        "detail": f"{n_symbols} หุ้น (เกณฑ์ >= {MIN_SYMBOLS})",
    })

    # 4) duplicate (date, symbol)
    n_dup = int(cx.execute(
        'SELECT COUNT(*) FROM (SELECT date, symbol, COUNT(*) c FROM "RawDaily" '
        'GROUP BY date, symbol HAVING c > 1)'
    ).fetchone()[0])
    checks.append({
        "name": "no_dup",
        "ok": n_dup == 0,
        "detail": f"คีย์ (date,symbol) ซ้ำ {n_dup} กลุ่ม (เกณฑ์ = 0)",
    })

    # 5) ราคา close ต้อง valid
    n_null, n_bad = cx.execute(
        'SELECT '
        '  SUM(CASE WHEN close IS NULL THEN 1 ELSE 0 END), '
        '  SUM(CASE WHEN close IS NOT NULL AND (close <= 0 OR close >= ?) '
        '      THEN 1 ELSE 0 END) '
        'FROM "RawDaily"',
        (CLOSE_MAX_SANE,),
    ).fetchone()
    n_null, n_bad = int(n_null or 0), int(n_bad or 0)
    checks.append({
        "name": "close_valid",
        "ok": n_null == 0 and n_bad == 0,
        "detail": f"close ว่าง {n_null} แถว, ค่าผิดปกติ (<=0 หรือ >= {CLOSE_MAX_SANE:,.0f}) {n_bad} แถว",
    })

    # 6) วันซื้อขายเฉลี่ยต่อปี
    n_dates = int(cx.execute('SELECT COUNT(DISTINCT date) FROM "RawDaily"').fetchone()[0])
    days_per_year = (n_dates / span_years) if span_years > 0 else 0.0
    checks.append({
        "name": "days_per_year",
        "ok": days_per_year >= MIN_DAYS_PER_YEAR,
        "detail": f"วันซื้อขาย {n_dates:,} วัน ≈ {days_per_year:.0f} วัน/ปี (เกณฑ์ >= {MIN_DAYS_PER_YEAR})",
    })

    return checks


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="ตรวจข้อมูลก่อนใช้ LAB KIT (6 เกณฑ์)")
    ap.add_argument("source", nargs="?", default=None,
                    help="ไฟล์ CSV (date,symbol,close[,...]) หรือ SQLite (default: ../db/custom.db)")
    args = ap.parse_args(argv)
    src = Path(args.source) if args.source else None
    cx = open_csv(src) if src is not None and src.suffix.lower() == ".csv" else open_db(src)
    if cx is None:
        return 2
    try:
        checks = run_preflight(cx)
    finally:
        cx.close()

    print("=== Preflight — ตรวจข้อมูลก่อนใช้ LAB KIT ===")
    all_ok = True
    for c in checks:
        mark = "✓ ผ่าน" if c["ok"] else "✗ ไม่ผ่าน"
        if not c["ok"]:
            all_ok = False
        print(f"  [{mark}] {c['name']:<14} {c['detail']}")

    if all_ok:
        print("\nผลสรุป: ข้อมูลพร้อมใช้ — รันต่อด้วย thai_fit.py all ได้เลย")
        return 0
    print("\nผลสรุป: ยังไม่ผ่านทุกเกณฑ์ — เติม/แก้ข้อมูล (backfill) ก่อนใช้งานจริง")
    return 1


if __name__ == "__main__":
    sys.exit(main())
