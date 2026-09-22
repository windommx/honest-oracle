# แหล่งข้อมูลตลาด (Market Feed) — ผลสำรวจ การเลือก และวิธีต่อเข้าแพลตฟอร์ม

> ปัญหาตั้งต้น: ราคาหุ้นไทยในระบบทั้งหมดเป็น **ข้อมูลสังเคราะห์ (seed)** — 240 สัญลักษณ์สมมติ ไม่ใช่หุ้นจริง จึง "ไม่ตรงกับตลาด" โดยธรรมชาติ
> แหล่งข้อมูลจริงที่มีอยู่ก่อนหน้ามีเพียง GTAA (Yahoo adjclose 15 ETF สหรัฐ) และ `fetch:cross` (SPX/USDTHB/GOLD)
> เอกสารนี้สรุปว่าแหล่งไหนใช้ได้จริง ให้ข้อมูลอะไร มีข้อจำกัดอะไร และต่อเข้าระบบอย่างไร — สถานะ 22 ก.ย. 2026

## 1. สิ่งที่ทดสอบและค้นคว้า (พูดตรง ๆ)

- จาก sandbox ที่ใช้พัฒนา (proxy บล็อก egress) **ทุกโฮสต์ข้อมูลตลาดถูกปฏิเสธ** (Yahoo, set.or.th, settrade.com, Stooq, Twelve Data, EODHD, Alpha Vantage ตอบ 403) จึง **ไม่สามารถยืนยัน feed สด** จากที่นี่ได้ — โค้ดในเอกสารนี้ตรวจด้วย unit test บนตัวอย่างข้อมูลจริงรูปแบบเดียวกัน และต้องรันจริงบนเครื่องผู้ใช้ครั้งแรกแล้วดูรายงานรายตัว
- ที่ยืนยันได้จากซอร์สโค้ดของไลบรารี **settfex 0.24.1** (PyPI, 21 ก.ย. 2026): เว็บ SET มี bot protection (Incapsula/Imperva) — ไลบรารีต้องใช้ `curl_cffi` ปลอม TLS fingerprint เป็น Chrome + header เฉพาะ + cookie สุ่ม จึงผ่านได้ → `fetch` ธรรมดาของ Node จาก server แพลตฟอร์ม **ผ่านไม่ได้** เป็นเหตุผลที่ทาง SET ต้องรันเป็นสคริปต์ Python บนเครื่องผู้ใช้
- Yahoo chart API v8 (`query1.finance.yahoo.com/v8/finance/chart/PTT.BK`) เป็น endpoint เดียวกับที่โมดูล GTAA ใช้ดึงข้อมูลจริง 30 ปีสำเร็จจาก container ที่มีเน็ต (worklog Task 14-b) — ต้องส่ง `User-Agent` แบบ browser

## 2. ตารางเปรียบเทียบแหล่ง feed หุ้นไทย

| แหล่ง | ข้อมูลที่ได้ | มูลค่าซื้อขาย (val) | OHLC ย้อนหลัง | องค์ประกอบดัชนี/sector | ค่าใช้จ่าย | สถานะ | เรียกจาก server ได้? | คำแนะนำ |
|---|---|---|---|---|---|---|---|---|
| **Yahoo Finance (.BK)** | รายวัน 20+ ปี, adjclose | ≈ close×volume (ประมาณ) | ✅ | ❌ | ฟรี | ไม่เป็นทางการ, rate limit ต่อ IP | ✅ (fetch + UA) | **ทางเริ่มต้น** — กดจาก UI ได้ทันที |
| **SET (set.or.th) ผ่าน settfex** | ราคาปิด/volume/value รายวัน (period ถึง MAX), stock list, index composition, sector, sign (SP/XD…) | ✅ จริง (บาท) | ❌ (chart-quotation ให้ปิดต่อวัน) | ✅ | ฟรี | ไม่เป็นทางการ (endpoint ของเว็บ), ต้อง curl_cffi | ❌ (Incapsula) | **ทางที่แม่นเรื่องสภาพคล่อง** — รัน Python บนเครื่องผู้ใช้, ผสาน OHLC จาก Yahoo ได้ |
| **Settrade Open API** | SET + TFEX real-time และย้อนหลัง (candlestick), ส่งคำสั่งได้ | ✅ | ✅ | บางส่วน | ฟรีสำหรับลูกค้าโบรกเกอร์ที่รองรับ | **ทางการ** ต้อง app key | ✅ ถ้าใส่ credential บน server | **เป้าหมายระยะยาว** (เปิด TFEX ให้ Basis/Parity/VRP) — เทมเพลต `lab/fetch_settrade_feed.py` |
| SETSMART (SET Information Services) | ประวัติราคา/สถิติ/งบ ครบ ส่งออก CSV | ✅ | ✅ | ✅ | สมัครสมาชิก (มีค่าใช้จ่าย) | ทางการ | ❌ (เว็บ) | ส่งออก CSV → การ์ดนำเข้า CSV |
| Twelve Data (XBKK) | time series รายวัน/นาที | ตาม API | ✅ | ✅ | แผน Basic ฟรีมีแค่ trial symbols ต่างประเทศ — SET เต็มต้องแผนเสียเงิน | ทางการ (vendor) | ✅ (API key) | ถ้าต้องการ SLA และหลายตลาด |
| EODHD (`.BK`) | EOD OHLCV ปรับ split/dividend, fundamentals | ✅ | ✅ | ✅ | ฟรี 20 call/วัน, EOD plan ≈ €20/เดือน | ทางการ (vendor) | ✅ (API key) | ทางเลือกเสียเงินราคาถูกสุดที่ครอบ SET ทั้งตลาด |
| Alpha Vantage / Stooq / Marketstack | ครอบ SET ไม่ครบหรือไม่มี | — | — | — | — | — | — | ไม่แนะนำสำหรับหุ้นไทย |
| Scraping settrade.com (เช่น ThaiStock lib) | ราคา 6 เดือน | ✅ | ✅ | ❌ | ฟรี | ไม่เป็นทางการ, ไลบรารีไม่อัปเดต, เปราะบาง | ❌ | ไม่แนะนำ |
| AmiBroker export (ของเดิม) | ตามข้อมูลที่ผู้ใช้มี | ตาม feed ของ AmiBroker | ✅ | ❌ | ตาม feed เดิม | — | การ์ด CSV | ยังใช้ได้เหมือนเดิม |

ข้อสังเกตเรื่องความถูกต้อง:
- **val** ของแพลตฟอร์มคือมูลค่าซื้อขายบาท ใช้ใน liq5 (≥ 3 ล้าน/วัน 5 วัน), MFD, signed flow, Volume Profile — Yahoo ให้ volume (หุ้น) เท่านั้น ระบบจึงประมาณ `close × volume` (ต่างจากค่าจริงไม่กี่ % เพราะ SET นับ Σ ราคา×จำนวนทุก trade) ถ้าต้องการค่าจริงให้ใช้ทาง SET/Settrade
- **ปันผล/สปลิต**: Yahoo `close` ปรับสปลิตแล้วแต่ไม่ปรับปันผล; `adjclose` ปรับทั้งคู่ — ค่าเริ่มต้นของระบบใช้ adjusted (คูณ OHLC ด้วย adjclose/close รายวัน) เพื่อไม่ให้โมเมนตัมข้ามวัน XD กระโดด สลับเป็นราคาดิบได้ในการ์ด
- **volume ของ Yahoo สำหรับหุ้นไทย** มีรายงานปัญหาเป็นครั้งคราว (ดัชนี ^SET.BK แสดง volume 0; issue ใน yfinance) — quality gate ของ feed เตือนเมื่อมูลค่าเป็น 0 เกินครึ่งของวัน
- **ป้าย provenance**: ทุกการนำเข้ายิง `EventLog(kind=ingest, payload.source=yahoo|set|settrade|…)` → Flagship เปลี่ยนป้ายจาก SYNTHETIC เป็น REAL อัตโนมัติ

## 3. สถาปัตยกรรม feed ในแพลตฟอร์ม (สิ่งที่เพิ่มในรอบนี้)

```
แหล่งใด ๆ ──► rows {date,symbol,open?,high?,low?,close,val} ──► ingestFeed()
   │                                                              ├─ replaceDemo? → clearDemoMarketData()
   ├─ Yahoo (server)   src/lib/feed/yahoo.ts  ← POST /api/feed/fetch  ├─ ingestRows() (upsert · retN/liq5 · โผ Top-N)
   ├─ settfex (Python) lab/fetch_set_feed.py  ← POST /api/feed/ingest ├─ SymbolMeta (sector: ผู้ใช้ → universe → Unknown)
   ├─ Settrade (Python) lab/fetch_settrade_feed.py ← POST /api/feed/ingest └─ emitEvent("ingest", …, {source})
   └─ CLI              scripts/fetch-th.ts (Yahoo → DB หรือ CSV)
```

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/feed/universe.ts` | รายชื่อตั้งต้น 78 ตัว (SET50 + ขนาดกลาง) พร้อม sector · `parseSymbolList` · แผนที่ sector ของ SET → 13 กลุ่ม |
| `src/lib/feed/yahoo.ts` | `mapChartToRows` (pure) · `fetchYahooDaily` (query1→query2, retry 429) · `fetchYahooBatch` (เรียงคิว + รายงานรายตัว) |
| `src/lib/feed/quality.ts` | `assessSymbol` (ประวัติสั้น/กระโดด >35%/มูลค่า 0/วันซ้ำ) · `flagStale` |
| `src/lib/feed/rows.ts` | `normalizeFeedRows` — ตรวจแถว JSON จากสคริปต์ภายนอก |
| `src/lib/feed/ingest.ts` | `ingestFeed` · `clearDemoMarketData` |
| `src/lib/feed/sources.ts` | ทะเบียนแหล่ง + ป้ายความจริงของข้อมูล (แสดงบนการ์ดเสมอ) |
| `src/app/api/feed/*` | `GET /api/feed` · `POST /api/feed/fetch` · `POST /api/feed/ingest` |
| `src/components/platform/feed-card.tsx` | การ์ดในแท็บข้อมูล |
| `scripts/fetch-th.ts` | `bun run fetch:th` (cron ได้) |
| `lab/fetch_set_feed.py` · `lab/fetch_settrade_feed.py` | สคริปต์ Python (SET ผ่าน settfex / เทมเพลต Settrade) |
| `src/lib/feed/feed.test.ts` | `bun test src` — ส่วน pure ทั้งหมด |

## 4. วิธีใช้

### 4.1 Yahoo จาก UI (เร็วสุด)
แท็บ **ข้อมูล → ดึงข้อมูลจริงจาก feed** → เลือก preset SET50 หรือพิมพ์รายชื่อ → ช่วง 2 ปี → เปิด "ล้างข้อมูล demo ก่อน" (ครั้งแรก) → ดึงข้อมูล
ระบบดึงทีละตัว (เว้น 150 ms) 50 ตัว ≈ 1 นาที รวม ingest แล้วรายงานตัวที่ล้มเหลว/มีคำเตือน

### 4.2 Yahoo จาก CLI / cron
```bash
bun run fetch:th -- --symbols SET50 --range 2y --replace-demo   # ครั้งแรก
bun run fetch:th -- --symbols SET50 --range 6mo                 # อัปเดตรายวัน (upsert ทับวันเดิม)
bun run fetch:th -- --symbols @my-list.txt --csv data/feed/my.csv   # เขียน CSV อย่างเดียว
# crontab หลังตลาดปิด: 0 18 * * 1-5  cd /path/thai-momentum-platform && bun run fetch:th -- --symbols SET50 --range 6mo
```

### 4.3 SET ผ่าน settfex (มูลค่าซื้อขายจริง + องค์ประกอบดัชนี)
```bash
pip install "settfex>=0.24" yfinance          # Python 3.11+
cd thai-momentum-platform/lab
python fetch_set_feed.py --index SET50 --period 3Y --ohlc-from-yahoo --post http://localhost:3000 --replace-demo
```
- `--index ALL` ดึงหุ้นสามัญทั้ง SET (ตัด warrant/DW/NVDR แบบหยาบ) ใช้เวลานานตามจำนวนตัว (หน่วง 0.3 s/ตัว)
- ไม่ใส่ `--post` → ได้ CSV ที่ `data/feed/set-YYYYMMDD.csv` + `.sectors.json` นำเข้าผ่านการ์ด CSV ได้

### 4.4 Settrade Open API (ทางการ)
สมัครที่ developer.settrade.com/open-api (ต้องมีบัญชีกับโบรกเกอร์ที่รองรับ) → สร้าง app → ตั้ง env `SETTRADE_APP_ID / APP_SECRET / BROKER_ID / APP_CODE` → `pip install settrade-v2` →
`python lab/fetch_settrade_feed.py --symbols PTT,KBANK --limit 500 --post http://localhost:3000`
เทมเพลตยังไม่ได้ทดสอบกับบัญชีจริง: ถ้ารูปแบบ candlestick ของ SDK ต่างจากที่คาด สคริปต์พิมพ์คีย์ที่ได้จริงให้แก้ `to_rows()`

## 5. Quality gate และหลังนำเข้า
1. รายงานรายตัวก่อนเข้าฐาน: ไม่พบสัญลักษณ์ / ประวัติสั้น < 60 แท่ง / ราคากระโดด > 35% / มูลค่า 0 เกินครึ่ง / วันล่าสุดตามหลังชุด
2. DQ ของระบบ (`/api/dq`) ตรวจซ้ำ: แถวซ้ำ, ช่องว่างวันที่ > 5 วัน, กระโดด > 35%, ตัวกรองรั่ว
3. หลังนำเข้าข้อมูลจริงครั้งแรก ควรรันใหม่ตามลำดับ: Evidence Night (H1–H4) → `bun run ic` (IC harness) → CPCV → Bayes Stop backtest — ค่า verdict/policy เดิมทั้งหมดผูกกับข้อมูล seed และถูกล้างเมื่อเปิด "ล้างข้อมูล demo"

## 6. ข้อจำกัดและเงื่อนไขการใช้งาน
- Yahoo และ endpoint ของเว็บ SET เป็นบริการสาธารณะที่ **ไม่มีสัญญาบริการ** — ใช้เพื่อวิจัย/ส่วนตัว เคารพ rate limit และเงื่อนไขของผู้ให้บริการ ใช้เชิงพาณิชย์ควรใช้ SETSMART/Settrade/vendor ที่มีสัญญา
- รายชื่อตั้งต้นใน `universe.ts` เป็นภาพ ณ ครึ่งแรกปี 2026 — องค์ประกอบดัชนีเปลี่ยนทุกครึ่งปี ให้ใช้ `fetch_set_feed.py --index` ดึงสด หรือแก้รายชื่อเอง
- ระบบยังไม่มีตัวจัดการ corporate action เอง: อาศัย adjclose ของ Yahoo หรือราคาที่แหล่งปรับให้ — quality gate เตือนเมื่อพบกระโดด
- TFEX ยังไม่มีแหล่ง (FuturesDaily/OptionsDaily ว่าง) จนกว่าจะต่อ Settrade Open API

## 7. อ้างอิง
- settfex บน PyPI (0.24.1, 21 ก.ย. 2026): https://pypi.org/project/settfex/
- Settrade Open API: https://developer.settrade.com/open-api/ · บทความ Investic: https://medium.com/investic/เทรดหุ้นไทยผ่าน-settrade-open-api-ทำยังไง-b4f7cf541b7f
- SET Information Services (SETSMART): https://set.or.th/en/services/connectivity-and-data/data/web-based
- Twelve Data — Stock Exchange of Thailand (XBKK): https://twelvedata.com/exchanges/XBKK · แผนราคา: https://twelvedata.com/pricing
- EODHD — รายชื่อตลาด: https://eodhd.com/list-of-stock-markets · แผนราคา: https://eodhd.com/pricing
- yfinance issues เรื่องคุณภาพข้อมูล: https://github.com/ranaroussi/yfinance/issues/300 · https://github.com/ranaroussi/yfinance/issues/1610
- ThaiStock (scraping settrade.com): https://github.com/UncleEngineer/ThaiStock
