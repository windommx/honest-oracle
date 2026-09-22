#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_set_feed.py — ดึงข้อมูลหุ้นไทยจริงจาก SET (www.set.or.th) ผ่านไลบรารี settfex แล้วส่งเข้าแพลตฟอร์ม
=====================================================================================================
ทำไมต้องรันบนเครื่องผู้ใช้: เว็บ SET มี bot protection (Incapsula) — settfex ใช้ curl_cffi ปลอมตัวเป็น
browser จึงผ่านได้ ส่วน server ของแพลตฟอร์ม (Node fetch) ผ่านไม่ได้ ตามที่บันทึกใน docs/research/market-feed.md

สิ่งที่ได้จาก SET โดยตรง (ต่างจาก Yahoo):
  - มูลค่าซื้อขายจริง (บาท) ต่อวัน  → liq5 / MFD / signed flow ของแพลตฟอร์มถูกต้องกว่า close×volume
  - องค์ประกอบดัชนี (SET50/SET100/…) + sector จริง → SymbolMeta ไม่ต้องเดา
  - ไม่มี open/high/low ย้อนหลัง (chart-quotation ให้ราคาปิดต่อวัน) → ใส่ --ohlc-from-yahoo เพื่อผสาน

ติดตั้ง (Python 3.11+):
  pip install "settfex>=0.24"        # ไม่ต้องใช้ key — ไลบรารี "ไม่เป็นทางการ" ใช้ endpoint ของเว็บ SET
  pip install yfinance               # ทางเลือก: ผสาน OHLC จาก Yahoo

ใช้:
  python fetch_set_feed.py --index SET50 --period 3Y --out ../data/feed/set50.csv
  python fetch_set_feed.py --symbols PTT,KBANK,CPALL --period 5Y --post http://localhost:3000 --replace-demo
  python fetch_set_feed.py --index SET100 --ohlc-from-yahoo --post http://localhost:3000

ผลลัพธ์:
  - CSV รูปแบบเดียวกับการ์ดนำเข้า: date,symbol,open,high,low,close,val  (+ ไฟล์ sectors .json ข้าง ๆ)
  - --post: ส่ง JSON เข้า POST /api/feed/ingest เป็นชุดละ 20,000 แถว (replaceDemo เฉพาะชุดแรก)

ธรรมเนียม: ทุกอย่างที่ไม่มีข้อมูล = ว่าง/None (ไม่เดาแทน) · สคริปต์พิมพ์รายงานรายตัวก่อนส่งเสมอ
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

# ---------- sector ของ SET → 13 กลุ่มของแพลตฟอร์ม (ตารางเดียวกับ src/lib/feed/universe.ts) ----------
SET_CODE_TO_TH = {
    "BANK": "Banking", "FIN": "Finance", "INSUR": "Finance",
    "ENERG": "Energy", "MINE": "Energy",
    "PROP": "Property", "CONS": "Construction", "CONMAT": "Construction",
    "COMM": "Commerce", "TOURISM": "Commerce", "FASHION": "Commerce", "HOME": "Commerce", "PROF": "Commerce",
    "ICT": "ICT", "ETRON": "Electronic", "TRANS": "Transport",
    "FOOD": "Food", "AGRI": "Food", "HELTH": "Health", "PERSON": "Health", "MEDIA": "Media",
    "PETRO": "Material", "PKG": "Material", "STEEL": "Material", "PAPER": "Material", "IMM": "Material", "AUTO": "Material",
}
_KEYWORDS = [
    (("bank",), "Banking"), (("insur", "financ", "securities"), "Finance"),
    (("energy", "mining", "utilit"), "Energy"), (("property",), "Property"), (("construction",), "Construction"),
    (("information", "communication"), "ICT"), (("electronic",), "Electronic"), (("transport", "logistic"), "Transport"),
    (("food", "beverage", "agri"), "Food"), (("health", "personal", "pharma"), "Health"), (("media", "publish"), "Media"),
    (("petrochem", "chemical", "packag", "steel", "metal", "paper", "industrial", "machinery", "automotive"), "Material"),
    (("commerce", "tourism", "leisure", "fashion", "home", "professional"), "Commerce"),
]


def to_th_sector(name: str | None) -> str:
    if not name:
        return "Unknown"
    raw = name.strip()
    if raw.upper() in SET_CODE_TO_TH:
        return SET_CODE_TO_TH[raw.upper()]
    s = raw.lower()
    if s == "ict":
        return "ICT"
    for keys, sector in _KEYWORDS:
        if any(k in s for k in keys):
            return sector
    return "Unknown"


def is_common_stock(symbol: str) -> bool:
    """ตัด warrant (-W1), foreign (-F), NVDR (-R), DW (ชื่อ+เลข+C/P) ออกแบบหยาบ — ไม่ใช่ความจริงถาวร"""
    if "-" in symbol:
        return False
    tail = symbol[-6:]
    return not (len(symbol) >= 8 and tail[:2].isdigit() and tail[-1] in ("C", "P"))


# ---------- ดึงข้อมูล ----------
async def build_universe(args, cfg):
    from settfex import get_stock_list

    if args.symbols:
        syms = [s.strip().upper().replace(".BK", "") for s in args.symbols.split(",") if s.strip()]
        sectors: dict[str, str] = {}
        try:  # เติม sector ให้ถ้าดึงรายชื่อได้
            lst = await get_stock_list(config=cfg, include_indices=False)
            known = {s.symbol.upper(): s for s in lst.security_symbols}
            sectors = {sym: to_th_sector(known[sym].sector or known[sym].industry) for sym in syms if sym in known}
        except Exception as e:  # noqa: BLE001
            print(f"⚠️ ดึงรายชื่อ/sector จาก SET ไม่ได้ ({e}) — ใช้ Unknown", file=sys.stderr)
        return syms, sectors

    lst = await get_stock_list(config=cfg, include_indices=(args.index != "ALL"))
    if args.index == "ALL":
        rows = [s for s in lst.filter_by_market("SET") if is_common_stock(s.symbol)]
    else:
        rows = [s for s in lst.filter_by_index(args.index) if is_common_stock(s.symbol)]
    syms = sorted({s.symbol.upper() for s in rows})
    sectors = {s.symbol.upper(): to_th_sector(s.sector or s.industry) for s in rows}
    return syms, sectors


async def fetch_symbol(sym: str, period: str, cfg):
    from settfex import get_chart_quotation

    cq = await get_chart_quotation(sym, period=period, accumulated=False, config=cfg)
    by_date: dict[str, dict] = {}
    for q in cq.quotations:
        if q.price is None or q.price <= 0:
            continue
        dt = q.local_datetime or q.quote_datetime
        d = dt.date().isoformat() if isinstance(dt, datetime) else str(dt)[:10]
        # ช่วง ≥ 1M แต่ละจุด = 1 วัน; ถ้ามีหลายจุดต่อวัน (intraday) เก็บจุดสุดท้ายของวัน
        by_date[d] = {
            "date": d,
            "symbol": sym,
            "close": float(q.price),
            "val": float(q.value) if q.value is not None else None,
            "volume": float(q.volume) if q.volume is not None else None,
        }
    return [by_date[d] for d in sorted(by_date)]


def merge_ohlc_from_yahoo(rows: list[dict], symbols: list[str], period: str) -> int:
    """เติม open/high/low จาก Yahoo (.BK) ให้แถวที่มีวันตรงกัน — คืนจำนวนแถวที่เติมได้"""
    try:
        import yfinance as yf  # type: ignore
    except ImportError:
        print("⚠️ ไม่มี yfinance — ข้ามการผสาน OHLC (pip install yfinance)", file=sys.stderr)
        return 0
    yperiod = {"1M": "1mo", "3M": "3mo", "6M": "6mo", "1Y": "1y", "3Y": "3y", "5Y": "5y", "MAX": "max"}.get(period, "3y")
    index: dict[tuple[str, str], dict] = {(r["symbol"], r["date"]): r for r in rows}
    filled = 0
    for sym in symbols:
        try:
            df = yf.download(f"{sym}.BK", period=yperiod, interval="1d", auto_adjust=False, progress=False)
        except Exception as e:  # noqa: BLE001
            print(f"  ⚠️ yahoo {sym}: {e}", file=sys.stderr)
            continue
        if df is None or df.empty:
            continue
        for ts, rec in df.iterrows():
            key = (sym, ts.strftime("%Y-%m-%d"))
            r = index.get(key)
            if not r:
                continue
            try:
                o, h, l = float(rec["Open"]), float(rec["High"]), float(rec["Low"])
            except (KeyError, TypeError, ValueError):
                continue
            if o > 0 and h > 0 and l > 0:
                r["open"], r["high"], r["low"] = o, h, l
                filled += 1
    return filled


# ---------- ส่งออก ----------
def write_csv(rows: list[dict], sectors: dict[str, str], out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "symbol", "open", "high", "low", "close", "val"])
        for r in rows:
            val = r.get("val")
            if val is None and r.get("volume"):
                val = r["close"] * r["volume"]  # ประมาณเมื่อ SET ไม่ให้มูลค่า (แจ้งในรายงาน)
            w.writerow([r["date"], r["symbol"], r.get("open", ""), r.get("high", ""), r.get("low", ""), r["close"], round(val or 0)])
    out.with_suffix(".sectors.json").write_text(json.dumps(sectors, ensure_ascii=False, indent=2), encoding="utf-8")


def post_rows(base: str, rows: list[dict], sectors: dict[str, str], replace_demo: bool, chunk: int = 20000) -> None:
    url = base.rstrip("/") + "/api/feed/ingest"
    for i in range(0, len(rows), chunk):
        body = {
            "source": "set",
            "rows": rows[i : i + chunk],
            "sectors": sectors,
            "replaceDemo": replace_demo and i == 0,
        }
        req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=600) as resp:  # noqa: S310
                j = json.loads(resp.read().decode("utf-8"))
                print(f"📥 ชุด {i // chunk + 1}: {j.get('message')}")
        except urllib.error.HTTPError as e:
            print(f"❌ ชุด {i // chunk + 1}: HTTP {e.code} {e.read().decode('utf-8', 'ignore')[:300]}", file=sys.stderr)
            sys.exit(2)


async def main_async(args) -> int:
    try:
        from settfex import FetcherConfig
    except ImportError:
        print("❌ ต้องติดตั้งก่อน: pip install \"settfex>=0.24\" (Python 3.11+)", file=sys.stderr)
        return 1
    cfg = FetcherConfig(rate_limit_delay=args.delay, max_retries=3)

    symbols, sectors = await build_universe(args, cfg)
    if not symbols:
        print("❌ ไม่มีรายชื่อหุ้น", file=sys.stderr)
        return 1
    print(f"🌐 SET (settfex) — {len(symbols)} ตัว · period {args.period}")

    rows: list[dict] = []
    ok = fail = 0
    for n, sym in enumerate(symbols, 1):
        try:
            r = await fetch_symbol(sym, args.period, cfg)
        except Exception as e:  # noqa: BLE001
            fail += 1
            print(f"  ❌ {sym}: {e}")
            continue
        if not r:
            fail += 1
            print(f"  ❌ {sym}: ไม่มีข้อมูล")
            continue
        ok += 1
        no_val = sum(1 for x in r if x["val"] is None)
        note = f" ⚠️ ไม่มีมูลค่า {no_val} วัน" if no_val else ""
        print(f"  ✅ {sym:8} {len(r):5} แท่ง {r[0]['date']} → {r[-1]['date']}{note}")
        rows.extend(r)
        if n % 25 == 0:
            print(f"  … {n}/{len(symbols)}")

    if not rows:
        print("❌ ไม่ได้ข้อมูลเลย — ตรวจอินเทอร์เน็ต/เวอร์ชัน settfex", file=sys.stderr)
        return 2

    if args.ohlc_from_yahoo:
        filled = merge_ohlc_from_yahoo(rows, [s for s in symbols], args.period)
        print(f"🔗 ผสาน OHLC จาก Yahoo ได้ {filled:,} แถว")

    print(f"รวม {ok} ตัวสำเร็จ · {fail} ล้มเหลว · {len(rows):,} แถว")
    out = Path(args.out) if args.out else Path(__file__).resolve().parent.parent / "data" / "feed" / f"set-{datetime.now():%Y%m%d}.csv"
    write_csv(rows, sectors, out)
    print(f"💾 {out} (+ {out.with_suffix('.sectors.json').name})")

    if args.post:
        post_rows(args.post, rows, sectors, args.replace_demo)
    else:
        print("ℹ️ ยังไม่ได้ส่งเข้าแพลตฟอร์ม — ใส่ --post http://localhost:3000 หรือนำเข้า CSV ผ่านการ์ดในแท็บข้อมูล")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser(description="ดึงข้อมูลหุ้นไทยจาก SET (settfex) → CSV / POST เข้าแพลตฟอร์ม")
    ap.add_argument("--index", default="SET50", help="SET50 | SET100 | SETHD | sSET | ALL (ค่าเริ่มต้น SET50)")
    ap.add_argument("--symbols", help="ระบุรายชื่อเอง คั่นด้วย , (ทับ --index)")
    ap.add_argument("--period", default="3Y", choices=["1M", "3M", "6M", "1Y", "3Y", "5Y", "MAX"])
    ap.add_argument("--out", help="ไฟล์ CSV ปลายทาง (ค่าเริ่มต้น data/feed/set-YYYYMMDD.csv)")
    ap.add_argument("--post", help="URL ของแพลตฟอร์ม เช่น http://localhost:3000 → POST /api/feed/ingest")
    ap.add_argument("--replace-demo", action="store_true", help="ล้างข้อมูล demo ก่อนนำเข้า (ชุดแรก)")
    ap.add_argument("--ohlc-from-yahoo", action="store_true", help="ผสาน open/high/low จาก Yahoo (.BK) ให้ SET Sniper")
    ap.add_argument("--delay", type=float, default=0.3, help="หน่วงระหว่าง request (วินาที) กัน rate limit")
    args = ap.parse_args()
    sys.exit(asyncio.run(main_async(args)))


if __name__ == "__main__":
    main()
