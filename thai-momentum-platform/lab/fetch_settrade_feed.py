#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_settrade_feed.py — เทมเพลตดึงข้อมูลจาก Settrade Open API (ทางการ) → POST /api/feed/ingest
====================================================================================================
สถานะ: **เทมเพลต ยังไม่ได้ทดสอบกับบัญชีจริง** — ต้องมีบัญชี Settrade Open API กับโบรกเกอร์ที่รองรับ
(สมัคร/สร้าง app key ที่ developer.settrade.com/open-api) และติดตั้ง SDK:  pip install settrade-v2

สิ่งที่ต้องกรอก (อย่า commit ค่าจริง): SETTRADE_APP_ID, SETTRADE_APP_SECRET, SETTRADE_BROKER_ID, SETTRADE_APP_CODE
ตั้งเป็น environment variable แล้วรัน:
  python fetch_settrade_feed.py --symbols PTT,KBANK --limit 500 --post http://localhost:3000
เซิร์ฟเวอร์ตั้ง TMP_AUTH_PASSWORD ไว้: ตั้ง env TMP_API_TOKEN (ค่าเดียวกับฝั่งเซิร์ฟเวอร์) → สคริปต์ส่ง Authorization: Bearer ให้เอง

ทำไมแหล่งนี้คุ้มค่า: เป็นข้อมูลทางการทั้ง SET และ TFEX (S50 futures/options → ตาราง FuturesDaily/OptionsDaily
ที่โมดูล Basis/Parity/VRP รออยู่) — เมื่อทดสอบผ่านแล้วให้ย้ายเป็นแหล่งหลักแทน Yahoo/settfex

หมายเหตุการปรับโค้ด: ชื่อเมธอด/รูปแบบผลลัพธ์ของ SDK อาจต่างจากที่เขียนไว้ตามเวอร์ชัน —
ถ้ารูปแบบไม่ตรง สคริปต์จะพิมพ์คีย์ที่ได้จริงออกมาให้แก้ mapping ในฟังก์ชัน to_rows() (ไม่เดาแทน)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

# เวลาตลาดไทย (UTC+7 ไม่มี DST) — วันที่ของแท่งต้องไม่ขึ้นกับ timezone ของเครื่องที่รันสคริปต์
BKK = timezone(timedelta(hours=7), "Asia/Bangkok")
# ชื่อดัชนี ไม่ใช่หุ้น — ส่งเข้า --symbols จะได้แท่งของดัชนีปนเข้ามาเป็น "หุ้น"
INDEX_NAMES = {"SET", "SET50", "SET100", "SETHD", "SSET", "MAI", "SETESG", "SETCLMV", "SETWB"}


def api_headers() -> dict[str, str]:
    """header ของ POST เข้าแพลตฟอร์ม — แนบ Bearer token เมื่อเซิร์ฟเวอร์ตั้งรหัสผ่าน (env TMP_API_TOKEN ตรงกับฝั่งเซิร์ฟเวอร์)"""
    headers = {"Content-Type": "application/json"}
    token = os.environ.get("TMP_API_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def get_client():
    try:
        from settrade_v2 import Investor  # type: ignore
    except ImportError:
        print("❌ pip install settrade-v2 ก่อน", file=sys.stderr)
        sys.exit(1)
    need = ["SETTRADE_APP_ID", "SETTRADE_APP_SECRET", "SETTRADE_BROKER_ID", "SETTRADE_APP_CODE"]
    missing = [k for k in need if not os.environ.get(k)]
    if missing:
        print(f"❌ ตั้ง environment variable ก่อน: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)
    investor = Investor(
        app_id=os.environ["SETTRADE_APP_ID"],
        app_secret=os.environ["SETTRADE_APP_SECRET"],
        broker_id=os.environ["SETTRADE_BROKER_ID"],
        app_code=os.environ["SETTRADE_APP_CODE"],
        is_auto_queue=False,
    )
    return investor.MarketData()


def to_rows(symbol: str, candles) -> list[dict]:
    """
    แปลงผล get_candlestick → แถวของแพลตฟอร์ม
    รูปแบบที่คาดไว้ (เวอร์ชัน SDK ที่เคยเห็น): dict ของ list ขนานกัน
      {"time": [...epoch วินาที...], "open": [...], "high": [...], "low": [...], "close": [...], "volume": [...], "value": [...]}
    ถ้าไม่ตรง → พิมพ์คีย์แล้วหยุด เพื่อให้ผู้ใช้แก้ mapping ตามของจริง
    """
    if not isinstance(candles, dict) or "close" not in candles:
        print(f"⚠️ รูปแบบผลลัพธ์ของ {symbol} ไม่ตรงที่คาด — คีย์ที่ได้: {list(candles)[:20] if isinstance(candles, dict) else type(candles)}", file=sys.stderr)
        return []
    times = candles.get("time") or candles.get("datetime") or []
    rows = []

    def get(k: str, i: int):
        arr = candles.get(k)
        if not isinstance(arr, (list, tuple)) or i >= len(arr) or arr[i] is None:
            return None
        try:
            return float(arr[i])
        except (TypeError, ValueError):
            return None

    for i, t in enumerate(times):
        try:
            if isinstance(t, (int, float)):
                # epoch → วันที่ตามเวลาตลาดไทย (เดิม .astimezone() ใช้ TZ ของเครื่อง → เครื่องนอก UTC+7 ได้วันที่เลื่อน)
                d = datetime.fromtimestamp(float(t), tz=timezone.utc).astimezone(BKK).strftime("%Y-%m-%d")
            else:
                d = str(t)[:10]
            close = float(candles["close"][i])
        except (IndexError, TypeError, ValueError):
            continue
        if close <= 0:
            continue
        rows.append({
            "date": d,
            "symbol": symbol,
            "open": get("open", i), "high": get("high", i), "low": get("low", i),
            "close": close,
            "val": get("value", i),
            "volume": get("volume", i),
        })
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description="Settrade Open API → /api/feed/ingest (เทมเพลต)")
    ap.add_argument("--symbols", required=True, help="คั่นด้วย , เช่น PTT,KBANK,CPALL")
    ap.add_argument("--interval", default="1d")
    ap.add_argument("--limit", type=int, default=500, help="จำนวนแท่งย้อนหลังต่อตัว")
    ap.add_argument("--post", help="URL แพลตฟอร์ม เช่น http://localhost:3000")
    ap.add_argument("--replace-demo", action="store_true")
    args = ap.parse_args()

    mkt = get_client()
    all_rows: list[dict] = []
    for sym in [s.strip().upper() for s in args.symbols.split(",") if s.strip()]:
        if sym in INDEX_NAMES:
            print(f"  ⚠️ {sym}: เป็นชื่อดัชนี ไม่ใช่หุ้น — ข้าม (ใส่รายชื่อหุ้นเอง เช่น PTT,KBANK,CPALL)", file=sys.stderr)
            continue
        try:
            candles = mkt.get_candlestick(symbol=sym, interval=args.interval, limit=args.limit, normalized=True)
        except Exception as e:  # noqa: BLE001
            print(f"  ❌ {sym}: {e}")
            continue
        rows = to_rows(sym, candles)
        print(f"  {'✅' if rows else '❌'} {sym}: {len(rows)} แท่ง")
        all_rows.extend(rows)

    if not all_rows:
        print("❌ ไม่ได้ข้อมูล", file=sys.stderr)
        sys.exit(2)
    if not args.post:
        out = f"settrade-{datetime.now():%Y%m%d}.json"
        with open(out, "w", encoding="utf-8") as f:
            json.dump({"source": "settrade", "rows": all_rows}, f, ensure_ascii=False)
        auth = ' -H "Authorization: Bearer $TMP_API_TOKEN"' if os.environ.get("TMP_API_TOKEN", "").strip() else ""
        print(f"💾 {out} — ส่งด้วย --post หรือ curl -X POST {'{URL}'}/api/feed/ingest -H \"Content-Type: application/json\"{auth} -d @{out}")
        return
    url = args.post.rstrip("/") + "/api/feed/ingest"
    body = {"source": "settrade", "rows": all_rows, "replaceDemo": args.replace_demo}
    if args.replace_demo:
        # ใส่ --replace-demo เอง = ยืนยันการล้างข้อมูลเดิม (เซิร์ฟเวอร์สำรอง DB ไว้ที่ data/backups ก่อนลบ)
        body["confirm"] = "REPLACE"
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=api_headers())
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:  # noqa: S310
            print("📥", json.loads(resp.read().decode("utf-8")).get("message"))
    except urllib.error.HTTPError as e:
        print(f"❌ HTTP {e.code} {e.read().decode('utf-8', 'ignore')[:300]}", file=sys.stderr)
        if e.code in (401, 403):
            print("   ℹ️ เซิร์ฟเวอร์ตั้งรหัสผ่านไว้ — ตั้ง env TMP_API_TOKEN ให้ตรงกับฝั่งเซิร์ฟเวอร์แล้วรันใหม่", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
