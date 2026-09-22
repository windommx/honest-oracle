# GTAA Rotation (Faber Aggressive) — เอนจินสากลตัวแรกที่ปรับเข้าแพลตฟอร์ม

> ต้นทาง: Mebane T. Faber, "A Quantitative Approach to Tactical Asset Allocation" (2007, อัปเดต 2013)
> สถานะในแพลตฟอร์ม: โมดูลเต็มรูป — engine + harness ความน่าเชื่อถือ + UI ที่แท็บ **Global Engines → GTAA Rotation (Faber)**
> ข้อมูล: **ราคาจริง Yahoo adjclose 30 ปี (1996-10 → ปัจจุบัน) 15 ตัว** พร้อม quality gate
> การเชื่อมโยง: **Macro Gate เชื่อมเข้า Command Center ของระบบหุ้นไทย** + **Tracking Log (DB)** บันทึกสัญญาณก่อนเกิดผล

---

## 1. กฎของระบบ (ทุกกฎเป็น config ไม่ใช่โค้ดแข็ง)

ทำงานวันทำการสุดท้ายของเดือน ลำดับเดียว:

1. **Absolute Trend Filter** — ราคาปิดเดือนต้องยืนเหนือ SMA-N เดือน (default 10) ของตัวเอง หลุดเส้น = เตะออก ส่วนเงินไปพักเงินสด
2. **Relative Momentum Ranking** — ผ่านเทรนด์เท่านั้น เรียงคะแนน = เฉลี่ยผลตอบแทน 1/3/6/12 เดือน (มีโหมด 12-1: เลื่อนจุดจบไป 1 เดือน ลด short-term reversal noise)
3. **Position Sizing** — ถือ Top-N (default 6) equal-weight ตัวละ 1/N · ถ้าผ่านไม่ครบ N ส่วนที่เหลือไปเงินสด

**นิวานซ์ที่ engine รองรับทั้งคู่:** "กรองก่อนจัดอันดับ" (`filter-then-rank`, แบบโพสต์) กับ "จัดอันดับก่อนแล้วตัดตัวหลุดเทรนด์" (`rank-then-filter`) ให้พอร์ตต่างกันจริงเมื่อตัวอันดับ 1 เพิ่งหลุดเทรนด์

**โหมดเงินสด (`cashMode`):**
- `tbill` — พัก BIL ตลอด (default)
- `trendedBond` — ไป IEF เมื่อ IEF ยืนเหนือ SMA-10 ของตัวเอง ไม่งั้นกลับ BIL (กัน "ถือบอนด์ดื้อ ๆ ตอนดอกเบี้ยขาขึ้น" = ซ้ำรอยตาราง FAIL แดง)

**การยกระดับที่มากับแผน:**
- `skipMonths: 1` = momentum 12-1
- `tranches: 1–4` = แบ่งเงินรีบาลานซ์ K งวดเหลื่อมกัน ลด timing luck ของวันสิ้นเดือน (backtester จำลองแบบเงิน 1/K ต่อ tranche รีบาลานซ์ทุก K เดือน)
- `costBps` — ต้นทุนต่อ turnover หนึ่งหน่วย (one-way) คิดทุกครั้งที่รีบาลานซ์

## 2. คณิตศาสตร์แกน (closed form ตรวจย้อนได้)

| สิ่ง | นิยาม |
|---|---|
| SMA-N | ค่าเฉลี่ยปิด N เดือนรวมเดือนปัจจุบัน |
| kM return | `c[t-skip] / c[t-skip-k] − 1` |
| Momentum score | เฉลี่ยของ r1, r3, r6, r12 |
| 12-1 | skip=1 → r12 = `c[t-1]/c[t-13] − 1` |
| ผลเดือนถัดไป | น้ำหนักที่ตัดสินใจที่ปิดเดือน t × ผลตอบแทนเดือน t→t+1 (**ไม่มี look-ahead**) |
| Turnover | Σ\|w_target − w_drifted\| ต่อการรีบาลานซ์ (drift ตามราคาระหว่างเดือน) |

## 3. Harness ความน่าเชื่อถือ (หัวใจของ "ขั้นถัดไป")

หลักเดียวกับทั้งแพลตฟอร์ม: **สร้างเครื่องมือวัดก่อน แล้วค่อยเพิ่มฟีเจอร์ที่ถูกวัดด้วยเครื่องมือนั้น**

- **Self-test 14 invariant (รันสดทุกครั้งที่เปิดแท็บ)** — ไม่มี look-ahead (1.01^n เป๊ะ) · SMA/12-1 ตรงคำตอบปิดรูป · หุ้นขาลง monotone ถูกเตะไปเงินสดทุกเดือน · crash→cash ทำ MaxDD ตื้นกว่าถือตายตัวชัดเจน · ต้นทุน monotonic · น้ำหนักรวม 100% ทุกเดือน · หน้าต่าง walk-forward ไม่ทับกัน · Monte Carlo deterministic ต่อ seed · cashMode trendedBond เดินถูกทางทั้งสองกรณี · universe 13 ตัวครบ · **คณิตเดือน (nextMonthLabel/monthDiff ข้ามปี) · Macro Gate stance ทั้ง 3 ระดับ · Tracking evaluation ตรงราคาปิดรูป + สัญญาณรอผลไม่ให้คะแนน**
- **Walk-forward** — grid {Top 3/6/9 × SMA 8/10/12}: เลือกผู้ชนะ in-sample 5 ปี วัดเฉพาะ out-of-sample 1 ปี เลื่อนทีละปี · เกณฑ์ตัดสินล่วงหน้า: **OOS degradation > 50% → หยุดจูน ใช้ค่าเปเปอร์ (Top 6, SMA 10)**
- **Monte Carlo 2 ชั้น** — block bootstrap (บล็อก 6 เดือน) บนผลจริงของกลยุทธ์ + synthetic seeds (จักรวาลใหม่ทั้งชุดต่อ seed, mulberry32) · รายงาน p5/p50/p95 ของ CAGR/MaxDD/Sharpe แทนตัวเลขเดี่ยว
- **Sensitivity grid 21 ช่อง** — ดูว่าช่องไหนชนะ "ทั้งกริด" (robust) ไม่ใช่ชนะจุดเดียว (overfit)

## 4. ผลบนข้อมูลจริง (Yahoo adjclose, 1997-11 → 2026-09, cost 10bps)

| | CAGR | MaxDD | Sharpe | Vol |
|---|---|---|---|---|
| **GTAA Top 6 · SMA 10** | **+6.5%** | **−16.9%** | **0.79** | +8.3% |
| SPY ถือตายตัว | +9.4% | −50.8% | 0.62 | — |
| GTAA Top 9 · SMA 10 (12-1) | +5.2% | **−14.9%** | **0.80** | +6.5% |

- Sensitivity บนข้อมูลจริงยืนยันข้อค้นพบเดิม: **Top N คือปุ่มเสี่ยงหลัก** (Top 3 Sharpe ~0.49 / DD −22% · Top 7–9 Sharpe 0.82–0.85 / DD −11…−16%) ส่วน SMA 8/10/12 ต่างกันน้อยมาก — **อย่าเสียเวลาจูนความยาว SMA**
- Walk-forward 23 หน้าต่าง: OOS degradation (median) ต่ำ, config ที่ถูกเลือกบ่อยสุด = Top 9 · SMA 12 — แต่หน้าต่างช่วง GFC (2007-12→2008-11) Sharpe หาย ~87% ตามสภาพตลาดจริง
- สัญญาณเดือนล่าสุดจากข้อมูลจริง: **พันธบัตร 4 ตัว (TLT/IEF/LQD/IGOV) สอบตกเทรนด์ทั้งกอง → ถูกเตะไปเงินสด** — เหมือนธีมในโพสต์ต้นทางเป๊ะ · ผู้นำ = DBC / EEM / MTUM / VTV / EFA / VBR

**การตีความที่ถูกต้อง:** จุดขายของระบบนี้ไม่ใช่ CAGR ชนะ buy&hold ในตลาดขาขึ้นยาว แต่คือ **DD ตื้นกว่า 3 เท่าและ Sharpe ดีกว่า** — เงินที่รอดจาก −51% ไม่ต้องทำ +104% เพื่อคืนทุน

## 5. สถาปัตยกรรมไฟล์

```
src/lib/gtaa/
  types.ts        types + DEFAULT config + sanitize + Macro/Tracking types
  math.ts         smaAt · retK · momentumScore · median/percentile · mulberry32
  defaults.ts     UNIVERSE_13 + BIL/SPY + ALLOWED + sanitizeConfig
  synthetic.ts    panel สังเคราะห์ deterministic ต่อ seed (regime switching)
  signals.ts      computeMonthSignals — filter→rank→Top-N→cash
  backtest.ts     backtestReturns (tranches + cost + drift) · runBacktest · slicePanel
  stats.ts        computeStats · equityCurve · drawdownSeries
  sensitivity.ts  grid Top N × SMA
  walkforward.ts  rolling IS 5y → OOS 1y + degradation verdict
  montecarlo.ts   blockBootstrap + syntheticSeeds
  quality.ts      quality gate (hole/nonpositive/jump/misaligned/short)
  selftest.ts     invariant suite 14 ข้อ
  macro.ts        Macro Gate — stance/เงินสด/SPY-vs-SMA/รอบถัดไป/staleness (pure)
  tracking.ts     evaluateTracking — ประเมิน snapshot ที่บันทึกไว้เทียบผลจริง (pure)
  store.ts        persist ลง DB (GtaaRun/GtaaSignal upsert) + EventLog hash chain
  data.ts         load/save panel.json + parser CSV wide/long
  fetcher.ts      Yahoo adjclose → Stooq(PoW) fallback
src/app/api/gtaa/  overview (macro+readiness) · run (persist) · snapshot (POST/DELETE) · history · data · fetch
scripts/gtaa.ts    CLI: fetch · run · macro · sensitivity · selftest · reset
src/components/platform/tabs/gtaa-tab.tsx     แท็บ UI ทั้งหมด (Tracking Log รวมอยู่)
src/components/platform/tabs/overview-tab.tsx การ์ด Global Regime บน Command Center
data/gtaa/panel.json                        ข้อมูลจริง snapshot (commit ได้ ตรวจย้อนได้)
```

## 6. ช่องทางข้อมูลจริง

1. **ปุ่ม "ดึงข้อมูลจริง" ในแท็บ** — เรียก `/api/gtaa/fetch` (Yahoo chart API adjclose รายเดือน 30 ปี, ส่ง User-Agent browser; ตัวใดตกไป fallback Stooq พร้อมแก้ PoW challenge แบบ browser) → ผ่าน quality gate → บันทึก `data/gtaa/panel.json`
2. **CLI บนเครื่องที่เน็ตปกติ** — `bun run gtaa -- fetch` → commit ไฟล์เข้า repo (snapshot ตรวจย้อนได้)
3. **อัปโหลด CSV** — รองรับ wide (`Date,VTV,MTUM,…`) และ long (`date,ticker,adjclose`) — ไม่ผ่าน gate = ไม่บันทึก (เหตุผลแสดงครบ)

**Quality gate (Step 0.2 ของแผน):** ห้ามรูกลางซีรีส์ · ราคา > 0 · กระโดด |ln(c/c_prev)| > 0.5 = แจ้ง split ที่ไม่ถูก adjust · เดือนล่าสุดต้องตรงกัน · ≥ 24 เดือนต่อตัว — `hole/nonpositive/jump` บล็อกการบันทึก, `misaligned/short` เตือน

## 7. ข้อจำกัด (พูดตรง ๆ)

- ตัวเลขในหน้านี้คำนวณจาก **adjclose ของ Yahoo** — Stooq ไม่ปรับปันผล (ถ้าใช้ Stooq โมเมนตัมบอนด์/REIT จะอ่านต่ำ) และ SMA บนราคาปรับปันผลกับราคาดิบให้สัญญาณต่างกันตรงเส้นคาบลูกคาบดอก
- MTUM เกิด 2013-05, DWAS 2012-08, IGOV 2009-02 — ก่อนหน้านั้นเป็น leading null และตัวนั้นแค่ไม่ถูกพิจารณา (ไม่มีการเดา)
- Backtest รายเดือน ไม่จำลอง slippage ระหว่างวัน / ภาษี / ส่วนต่าง NAV-market ของ ETF
- synthetic panel ใช้พิสูจน์ว่าท่อถูกเท่านั้น — ตัวเลขทุกอย่างบนหน้าจอตอนนี้อ้างข้อมูลจริง Yahoo
- sandbox/CI ที่บล็อก egress จะดึงเองไม่ได้ → ใช้ช่องทาง 2/3

## 8. การเชื่อมโยงข้ามระบบ (Macro Gate + Tracking Log) — ระดับที่ 3 ของโมดูล

### 8.1 Macro Gate — GTAA → Command Center ระบบหุ้นไทย

ทุกครั้งที่เปิดหน้า ภาพรวม `/api/overview` จะคำนวณ (จาก panel โดยตรง ไม่แตะ DB) และแสดงการ์ด **🌏 Global Regime** เคียงกับ Regime Composite ของระบบไทย:

| stance | เกณฑ์ (ลงทะเบียนล่วงหน้า — ไม่มีพารามิเตอร์แอบแฝง) |
|---|---|
| 🔴 `risk_off` | เงินสดของสัญญาณ default (Top 6 · SMA 10) **≥ 50%** **และ** SPY หลุด SMA 10 เดือน |
| 🟡 `caution` | เงินสด ≥ 50% **หรือ** SPY หลุดเส้น (เตือนช่องทางเดียว) |
| 🟢 `risk_on` | ทั้งสองปกติ |

การ์ดแสดง: stance + เหตุผลเต็ม · แถบเงินสด · SPY เทียบเส้น · จำนวนสอบตกเทรนด์ · ความสดข้อมูล (staleMonths) · **แถว "เห็นพ้อง/ขัดแย้งกับ regime ไทย"** (เปรียบเทียบกับ label ของ Regime Composite) · ปุ่มเปิดโมดูล

**หลักการสำคัญ:** นี่คือชั้น **เฝ้าดู (shadow)** — ระบบหุ้นไทย *ไม่* พึ่งพาโมดูลนี้ (GTAA ล้ม = การ์ดหาย ระบบหลักเดินต่อ) และ *ยังไม่* เขียนทับ gross budget จนกว่าจะสะสมหลักฐานพอ — ตรงธรรมเนียม "engine ต่างชาติต้องผ่านการทดสอบบนข้อมูลเราก่อน" ของแพลตฟอร์ม

### 8.2 Tracking Log — สัญญาณที่โกหกไม่ได้ (DB + EventLog)

ปัญหาเดิม: "สัญญาณ" แสดงบนจอแล้วหาย — ไม่มีทางพิสูจน์ภายหลังว่า "ตอนนั้นระบบบอกอะไร" วิธีแก้ = ตารางใน SQLite (`prisma/schema.prisma`):

- **`GtaaSignal`** — snapshot พอร์ตเป้าหมายที่บันทึก **ก่อนเดือนเริ่ม** (unique ต่อ `decisionMonth × configHash`, upsert ได้): decisionMonth/appliesMonth · cashPct/cashTicker · holdings JSON · failed JSON · benchPass · stance · dataSource · configHash (sha256 ของ config 10 ตัว)
- **`GtaaRun`** — ผลรันที่บันทึก (config + CAGR/DD/Sharpe + bench + quality) — config เดิม = ผลเดิมเสมอ (deterministic) จึงตรวจย้อนหลังได้ว่า "ตัวเลขที่เคยโชว์" คืออะไร
- ทุกการบันทึก/ลบ ยิง **EventLog (kind `gtaa`)** เข้า hash chain เดียวกับระบบหลัก — แอบแก้ย้อนหลังไม่ได้
- **การประเมินย้อนหลังอัตโนมัติ** (`tracking.ts`): เมื่อ panel มีข้อมูลเดือนถัดไปแล้ว snapshot แต่ละแถวได้ผลจริง `portfolio = Σ w·r` เทียบ SPY → delta, hit/miss · สัญญาณที่เดือนใช้ยังไม่ปิด = "รอผล" (ไม่ให้คะแนน)
- สรุป track record บนการ์ด: บันทึกกี่เดือน · ตรวจผลแล้วกี่รายการ · ชนะ SPY กี่ครั้ง (hit rate) · delta เฉลี่ยต่อเดือน

วิธีใช้ตามพิธี (Checklist ในแท็บมีรายการอัตโนมัติกำกับ): ปิดเดือน → อัปเดตข้อมูล → **กด "บันทึกสัญญาณเดือนนี้"** → สั่งเทรดตามพอร์ต → เดือนถัดไประบบให้คะแนนเอง

### 8.3 Readiness — ระดับความพร้อมของโมดูล (badge บนหัวแท็บ)

| ระดับ | เงื่อนไข (ลงทะเบียนล่วงหน้า) |
|---|---|
| 🟢 **CERTIFIED** | ข้อมูลจริง + quality PASS + self-test ผ่านทั้งหมด + มี snapshot สัญญาณใน tracking log ตรงเดือนปิดข้อมูลล่าสุด (มนุษย์กำลังใช้ตามพิธี) |
| 🔵 **VERIFIED** | ข้อมูลจริง + quality PASS + self-test ผ่าน |
| 🟡 **EXPERIMENTAL** | สังเคราะห์ / self-test ไม่ครบ / quality ไม่ผ่าน — ห้ามใช้ตัวเลขตัดสินใจจริง |

### 8.4 การทำงานอัตโนมัติท้ายเดือน (เครื่องผู้ใช้)

- **Staleness guard** — ข้อมูลจริงที่เกินรอบ (staleMonths > 0) มีแถบเตือนเหลืองบนหัวแท็บ + รายการอัตโนมัติใน Checklist ไม่เช็ค + CLI `macro` exit code 2
- **CLI สำหรับ cron บนเครื่องคุณ** — `bun run gtaa -- macro` พิมพ์ stance/เงินสด/พอร์ตเดือนหน้า/รอบถัดไป ตัวอย่าง crontab: `0 21 25-31 * 5` (วันศุกร์สุดท้ายของเดือน 21:00) → `cd repo && bun run gtaa -- fetch && bun run gtaa -- macro`
- sandbox ที่บล็อก egress ใช้ปุ่ม "ดึงข้อมูลจริง" ในแท็บแทน (ผ่าน server-side fetcher)

## 9. เชื่อมกับแพลตฟอร์มหลักอย่างไร

โมดูลนี้เติม "Global Engines" เป็นชั้นที่สองเคียง Imported Global Engines (บน Evidence Board ที่ทดสอบ factor สากลบน SET):
- ฝั่ง **หุ้นไทย** = cross-section momentum + flow features (งานเดิม)
- ฝั่ง **GTAA** = time-series rotation ระดับ asset class รายเดือน — ตอนนี้เชื่อมจริงแล้วผ่าน **Macro Gate** (§8.1): stance แสดงคู่กับ Regime Composite บน Command Center พร้อมแถวเห็นพ้อง/ขัดแย้ง และ **Tracking Log** (§8.2) ทำให้สัญญาณทุกดวงกลายเป็นหลักฐานที่ตรวจย้อนหลังได้
- ทั้งสองฝั่งใช้ธรรมเนียมเดียวกัน: เกณฑ์ลงทะเบียนล่วงหน้า · ผลลบแสดงตรง · ทุกการตัดสินใจต้องอ้าง harness · ขั้นถัดไป (เมื่อหลักฐานพอ): ผูก stance ของ GTAA เป็น input หนึ่งของ regime gate แบบมีน้ำหนัก + บันทึกอัตโนมัติท้ายเดือนจากฝั่ง server
