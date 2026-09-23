# ระเบียบวิธีวิจัย (Research Methodology) — Thai Momentum Platform

> ฉบับ 2026-09-23 · ขอบเขต: กติกาทุกข้อที่ตัดสินว่า "ผลลัพธ์ไหนเชื่อได้" ตั้งแต่ข้อมูล → สัญญาณ → backtest → การตัดสินใจของ Jev (paper)
> หลักการแม่บท 4 ข้อ (ใช้ตัดสินทุกกติกาในเอกสารนี้):
>
> 1. **ลงทะเบียนก่อนเห็นผล** — เกณฑ์ผ่าน/ไม่ผ่าน เขียนเป็นโค้ด/ค่าคงที่ก่อนรัน เปลี่ยนเงียบ ๆ ไม่ได้
> 2. **คำตัดสินซื่อตรง** — วัดไม่ได้ = `null`/INFO พร้อมเหตุผล ห้ามแต่งตัวเลข (รวมถึง "เครดิต" ที่ไม่มีหลักฐาน)
> 3. **backtest ต้องทำเหมือน live** — วิธีเติมราคา วันออก ต้นทุน ต้องเป็นนิยามเดียวกัน ถ้าต่างต้องเขียนไว้ว่าต่างอย่างไร
> 4. **human gate ปฏิเสธเป็นค่าเริ่มต้น** — ระบบเสนอ คนอนุมัติ (paper mode เท่านั้น)
>
> แต่ละกติกามี: **กติกา** · **เหตุผล** · **อ้างอิง** · **เปลี่ยนเมื่อ 2026-09-23** · (ถ้ามี) ไฟล์/เทสต์/หลักฐานบนสำเนา fixture

---

## สารบัญ

- **ส่วน A — กติกาแกนที่มีอยู่แล้ว**: A1 pre-registration · A2 CPCV purge/embargo · A3 เกณฑ์ IC/โปรโมต/adoption · A4 ต้นทุน+slippage · A5 T+1 fill · A6 การันตีไม่มองอนาคต
- **ส่วน B — 8 การตัดสินใจเชิงระเบียบวิธีเมื่อ 2026-09-23**: B1 stop fill เมื่อราคา gap · B2 หุ้นหยุดซื้อขาย/เพิกถอน · B3 time exit ใน Jev live · B4 ถังหุ้นไม่รู้ sector · B5 Flagship G3 เมื่อมี ≤ 2 กลุ่ม · B6 เกณฑ์นัยสำคัญ lead-lag · B7 เครื่องหมายสัญญาณ Frog-in-the-Pan · B8 trigger T1 ของ Shadow Lab
- **ส่วน C — ส่วนต่างที่รู้แล้วและยังไม่แก้** (เขียนไว้เพื่อไม่ให้ใครเข้าใจผิด)
- **ภาคผนวก — วิธีทำซ้ำหลักฐาน**

---

## ส่วน A — กติกาแกน

### A1. Pre-registration (ล็อกกติกาการทดลองก่อนเห็นผล)

- **กติกา**: `POST /api/research/prereg` freeze พารามิเตอร์ trial (k, hold, stop, maxPos, cost, cost grid, bootstrap N/seed, hitGate, CPCV groups/purge) เป็น sha256 (`src/lib/research/prereg.ts`) — ล็อกแล้วส่งกติกาอื่นมา = **409** · ส่งกติกาเดิมซ้ำ = idempotent (ไม่เลื่อน `frozenAt`) · จะเปลี่ยนต้อง `reset` ซึ่งลง EventLog (audit เห็นว่าเริ่มการทดลองใหม่) · verdict ทุกครั้งผูก `paramsHash`
- เกณฑ์อื่นที่ลงทะเบียนเป็นค่าคงที่ในโค้ด: adoption ของ Bayes stop (A3), เกณฑ์ promote สัญญาณ (A3), น้ำหนัก ReliabilityScore 35/25/15/15/10 ของ Flagship, น้ำหนัก Confluence 40/30/30, เกณฑ์ H1–H4
- **เหตุผล**: การลองหลายชุดแล้วเลือกชุดที่ดีที่สุดหลังเห็นผล = backtest overfitting — Sharpe ในตัวอย่างสูงขึ้นตามจำนวนครั้งที่ลอง แม้ไม่มี edge จริง
- **อ้างอิง**: Bailey, Borwein, López de Prado & Zhu (2014) "Pseudo-Mathematics and Financial Charlatanism", *Notices of the AMS* 61(5) · Harvey, Liu & Zhu (2016) "…and the Cross-Section of Expected Returns", *RFS* 29(1)
- **เปลี่ยนเมื่อ 2026-09-23**: ไม่เปลี่ยนกลไก · ทุกกฎใหม่ในส่วน B เป็นค่าคงที่ที่มีชื่อ (`NO_PRICE_EXIT_DAYS`, `DAILY_PATH_COVERAGE`, `GATE.blockSectorBottom`, เกณฑ์ `2/√n`, …) ที่มาจากสเปกของงานหรือเหตุผลเชิงโครงสร้าง — ไม่มีค่าไหนจูนจากผลบน fixture · ตัวเลขในส่วน B เป็นผลที่ตามมา ไม่ใช่เหตุผลในการเลือกกฎ (สถิติฐานเทียบของ B7 เพิ่มหลังเห็นผล แต่เป็นรายงานเท่านั้น ไม่แตะเกณฑ์)

### A2. CPCV — Combinatorial Purged Cross-Validation

- **กติกา** (`src/lib/research/cpcv.ts`): แบ่งวันเป็น N = 6 กลุ่มต่อเนื่อง เลือก k = 2 เป็น test ทุก combination (15 paths) · **purge** = ตัดแถว train ที่ label (horizon = hold) ซ้อนทับช่วง test ทั้งก่อนและหลัง test (ค่าเริ่มต้น purge = hold = 8) · **embargo** = กักเพิ่มหลัง test round(hold/2) = 4 วัน · ค่าเศษปัดขึ้น · meta-model ผ่านเมื่อ hit > 0.55 อย่างเสถียรข้าม paths และมี L−S gap เชิงเศรษฐกิจ · panel < 200 แถว = ไม่รัน (INFO ไม่ใช่ FAIL)
- walk-forward ของ Bayes stop ใช้หลักเดียวกัน: refit ทุก 60 วันทำการ จากเทรดที่ **ปิด** ก่อน `R − 10` วัน (embargo 10) เท่านั้น
- **เหตุผล**: label ของหุ้นวันที่ d ใช้ราคาถึง d+hold — ถ้าไม่ purge/embargo แถว train ที่อยู่ติด test จะ "รู้" ผลของช่วง test (label leakage) ทำให้ hit สูงเกินจริง · CPCV ให้ "การกระจาย" ของผลแทนตัวเลขเดียว
- **อ้างอิง**: López de Prado (2018) *Advances in Financial Machine Learning*, Wiley — บทที่ 7 (purged k-fold, embargo) และ 12 (CPCV)
- **เปลี่ยนเมื่อ 2026-09-23**: ไม่เปลี่ยน

### A3. เกณฑ์ IC / promote / adoption (ลงทะเบียนล่วงหน้าทั้งหมด)

| ที่ใช้ | เกณฑ์ผ่าน | ไฟล์ |
|---|---|---|
| promote สัญญาณเข้า Jev (IC harness) | \|meanIC\| > 0.02 · \|ICIR\| > 0.25 · n ≥ 120 วัน · เครื่องหมายตรงสมมติฐาน | `src/lib/momentum/signals/engine.ts` (`promote`) |
| Global engines (alpha แบบ cross-section) | PASS: ICIR ≥ 0.25 · meanIC ≥ 0.02 · t ≥ 2 · WEAK: ICIR ≥ 0.15 · t ≥ 1.5 · n = 0 → **INFO** (ไม่ใช่ FAIL จากเลข 0 ปลอม) | `src/lib/research/global-engines/types.ts` |
| Evidence H1/H4 (thai_fit) | H1: มี cell form ≤ 20, hold ≤ 10 ที่ ICIR > 0.25 · H4: ไม่มี cell form ≥ 160 ที่ ICIR > 0.25 | `src/lib/research/thai-fit.ts` |
| A/B shadow v2 vs lite | paired n ≥ 100 และ meanDiff > 0 หลังหัก 55bps ต่อรอบ | `src/app/api/signals/ab/route.ts` |
| Bayes stop adoption | Sharpe_arm > Sharpe_fixed + 0.2 · MaxDD แย่กว่า fixed ไม่เกิน 2pp · n ≥ 100 · arm มี stopNow (มี refit แล้ว) | `src/app/api/stops/route.ts` |
| Profit Engine verdict | 7 เกณฑ์ (edge เหนือ naive, CAGR > 0, MaxDD > −25%, Sharpe > 0.6, เทรด ≥ 100, winrate > 48%, CPCV ผ่าน) · GO = ผ่าน ≥ 5 และ bootstrap 5th pct > 0 · WEAK = ผ่าน ≥ 5 แต่ bootstrap ไม่แน่น หรือผ่าน 4 · อื่น ๆ NO-GO | `src/lib/research/profit-engine.ts` |

- IC = Spearman รายวันระหว่างสัญญาณกับผลตอบแทนล่วงหน้าแบบ demean ตลาด (≥ 30 หุ้นต่อวัน) · ICIR = mean/sd (ddof = 1) · t = ICIR·√n
- **เหตุผล**: IC/IR คือมาตรวัดทักษะเชิงพยากรณ์ที่ไม่ขึ้นกับการจัดพอร์ต · เกณฑ์ t ≥ 2 เป็นเกณฑ์ "ทดสอบครั้งเดียว" — เมื่อสแกนหลาย engine/หลาย hold ความเสี่ยงบวกลวงสูงขึ้น (Harvey-Liu-Zhu เสนอ t > 3) จึงบังคับ ICIR และ meanIC คู่กัน และ `bestIc` ข้าม hold ที่วัดไม่ได้
- **อ้างอิง**: Grinold & Kahn (2000) *Active Portfolio Management* (2nd ed.) · Harvey, Liu & Zhu (2016)
- **เปลี่ยนเมื่อ 2026-09-23**: ไม่เปลี่ยนเกณฑ์ใด · Frog-in-the-Pan เพิ่มสถิติ "ฐานเทียบโมเมนตัมดิบ" (รายงานเท่านั้น ไม่แตะเกณฑ์ verdict — ดู B7) · walk-forward ของ Bayes stop เปลี่ยนวิธีเติมราคา (B1) ซึ่งเปลี่ยน "ตัวเลขที่เข้าเกณฑ์" ไม่ใช่ตัวเกณฑ์

### A4. ต้นทุนธุรกรรมและ slippage

- **กติกา**: commission 30bps + slippage 40bps **ต่อขา** (`TH_STRATEGY.costBps` + `slipBpsBase`) = 70bps/ขา = 1.4% round-trip — ใช้ตรงกันใน runBacktest (หักทั้งในผลเทรดและ equity รายวัน), walk-forward ของ stop (`COST_LEG`), E[R|s] (สาขา stop หัก cost round-trip), และ Trade ที่ Jev บันทึก (`persistClosedTrade`) · Profit Engine กวาด commission 25/100/200bps โดยตรึง slippage 40bps · A/B shadow หัก 55bps ต่อรอบ · `TH_RISK.maxParticipation` = 4% ของ ADV เป็นเพดานขนาดไม้ที่ระบุไว้
- **เหตุผล**: SET นอก SET100 spread กว้าง — anomaly ที่ดูดีก่อนต้นทุนจำนวนมากหายหลังต้นทุน · หักต้นทุนเท่ากันทุกชั้นทำให้เทียบ arm/เอนจินกันได้ตรง
- **อ้างอิง**: Novy-Marx & Velikov (2016) "A Taxonomy of Anomalies and Their Trading Costs", *RFS* 29(1)
- **เปลี่ยนเมื่อ 2026-09-23**: ไม่เปลี่ยนอัตรา · การบังคับปิดหุ้นหยุดซื้อขาย (B2) และ time exit (B3) หักต้นทุนขาออกเหมือน exit อื่น

### A5. T+1 fill

- **กติกา**: backtest — สัญญาณที่ปิดวัน d ซื้อที่ **ราคาปิดวัน d+1** (`runBacktest` ขั้น 1 · ไม่มีราคาวัน d+1 = ข้าม ไม่เลื่อนวัน) · IC วัด close(d) → close(d+hold) ตามปฏิทินตลาด (หุ้นไม่มีราคาวันปลายทาง = ไม่มีผลตอบแทน ไม่เลื่อนแถว) · Signals v2 / crossZ ใช้ข้อมูลที่ "รู้แล้ว" ณ วันตัดสินเท่านั้น
- **Jev live (paper) — T+1 เหมือน backtest** (`src/lib/jev/fills.ts`, `src/lib/jev/fill-rules.ts`):
  1. **ส่งคำสั่ง ไม่ใช่ซื้อ**: ซื้ออัตโนมัติ (risk_on / reversal) และการอนุมัติ Q_ENTRY buy ของมนุษย์ ไม่สร้าง Position — ลงคิว `Setting.jev_pending_fills` (ไม่แก้ schema) พร้อม symbol · slots · stop % และตัวคูณ vol ของวันตัดสิน · ที่มา (auto/human/reversal) · วันตัดสินใจ · **`afterDate` = วันข้อมูลล่าสุดที่รู้ตอนสั่ง** (auto = วันตัดสินใจ · มนุษย์ = วันล่าสุดของ pivot ตอนกดอนุมัติ) · gate id · เหตุผลเดิม · Decision วันตัดสินใจ = `buy` **executed=false** ลงท้าย `รอเติมราคาปิดวันทำการถัดไป (T+1)`
  2. **เติม**: ตอนเริ่มทุกรอบ `POST /api/jev/run` (สายพาน `scripts/daily.ts` เรียกใน process) ที่ **ราคาปิดของวันแรกใน pivot ที่หลัง `afterDate` อย่างเคร่งครัด** (ปฏิทินข้อมูลเดียวกับ backtest) → Position (entryDate/entryPx = วัน/ราคาเติม · stop = ราคาเติม × (1 − stop% × ตัวคูณ)) + Decision `Q_ENTRY` action **`fill`** executed (date = วันเติม · เหตุผล "เติม T+1 ที่ราคาปิด … ของการตัดสินใจวันที่ …") + EventLog `jev_fill` · อนุมัติเย็นวันเดียวกัน = เติมวันถัดไป · อนุมัติหลังข้อมูลวันถัดไปเข้าแล้ว = เติมวันถัดจากนั้น
  3. **ยกเลิก (ไม่แต่งราคา ไม่เลื่อนวัน)**: หุ้นไม่มีราคาวันเติม (พัก/หยุดซื้อขาย) — ตรง backtest ที่ข้าม pending ไม่มีราคา · ตรวจ sector/slot ซ้ำกับพอร์ต ณ ตอนเติม (exit ของรอบก่อนออกไปแล้ว · ไม้ที่เติมก่อนในรอบเดียวกันนับด้วย) แล้วไม่ผ่าน (ลดขนาดได้ตามกติกาเดียวกับตอนตัดสินใจ) · มีสถานะหุ้นนั้นอยู่แล้ว · ยุคข้อมูลเปลี่ยน (seed/ล้าง demo) → Decision `cancel` พร้อมเหตุผลไทย (ยุคเปลี่ยน = EventLog อย่างเดียว)
  4. คำสั่งที่ยังรอเติม = ภาระผูกพันในงบ slots / sector layer / กันซื้อซ้ำของรอบตัดสินใจ แต่ **ไม่ใช่สถานะ** (ไม่ประเมิน exit · ไม่นับใน exposure/P&L/NAV) · แท็บ Jev/พอร์ตแสดงแยก + preview วัน/ราคาที่จะเติม (GET อ่านอย่างเดียว)
  5. idempotent: รันซ้ำบนข้อมูลเดิมไม่เติม/ส่งซ้ำ (คำสั่งถูกลบหลังเติม · สร้าง Position ก่อน Decision ที่มีแท็กคำสั่ง → พังกลางทาง รอบถัดไปปิดคำสั่งโดยไม่ซื้อซ้ำ · mutex ในโปรเซส + compare-and-swap บนแถว Setting)
  6. **exit ไม่เปลี่ยน**: T+0 ที่ราคาปิดของวันที่ทริกเกอร์ (เหมือน stop/time exit ของ backtest — B1–B3) · exit ที่มนุษย์อนุมัติบันทึก Trade (`persistClosedTrade`) ก่อนลบ Position แล้ว (เดิมลบเฉย ๆ — Bayes stop/track record ไม่เห็นเทรดที่มนุษย์ปิด)
  7. **track record**: ledger ใช้แถว `fill` (= Position.entryDate) เป็นไม้เข้า → NAV คิดราคาเข้า = ราคาปิดวันเติม ไม่มี exposure/ต้นทุนในวันสัญญาณ · แถว `buy` executed=true ก่อนวันนี้ (T+0) ยังนับตามวันของมัน · นับ `queuedOrders`/`cancelledOrders` แยกจาก "รอ human gate"
- **เหตุผล**: สัญญาณจากราคาปิดวัน d ไม่สามารถซื้อที่ราคาปิดวัน d เดียวกันได้จริง (ตลาดปิดไปแล้ว — Jev รันหลังข้อมูล EOD เข้า) · ราคาที่ track record ใช้ต้องเป็นราคาที่ซื้อได้จริงหลังเห็นสัญญาณ ไม่งั้นผล paper 6–12 เดือนมองโลกสวยกว่า backtest ที่ใช้ตัดสินกลยุทธ์ (หลักการ 3)
- **อ้างอิง**: หลักมาตรฐานของ event study/backtest — López de Prado (2018) บทที่ 11 (backtesting pitfalls)
- **เปลี่ยนเมื่อ 2026-09-23**: backtest ไม่เปลี่ยน · **Jev live เปลี่ยนจาก T+0 เป็น T+1** (ส่วนต่าง C1 ปิดแล้ว) · แก้พ่วง: guard "รันไปแล้ว" ของ `/api/jev/run` ไม่นับ Decision ของมนุษย์/แถวเติม — เดิมอนุมัติ gate หลังข้อมูลวันใหม่เข้า (Decision ของมนุษย์ลงวันนั้น) ทำให้รอบของวันนั้นถูกข้ามทั้งรอบ
- **เทสต์**: `src/lib/jev/fills.db.test.ts` (route จริง 3 วันทำการบน SQLite ชั่วคราว — ล้มบน HEAD 15/16; ข้อที่ผ่านคือเงื่อนไขตั้งต้นของฉาก) · `src/lib/jev/fills.test.ts` (วันเติม/ยกเลิก/sector/ยุคข้อมูล — pure) · `src/lib/track/track.test.ts` (ledger/NAV ใช้วัน/ราคาเติม — ล้มบน HEAD 2/2) · `src/lib/jev/run.db.test.ts` (ไม่มี Position ลงวันสัญญาณ)
- **หลักฐาน (สำเนา fixture · route จริงใน process)**

| | HEAD (T+0) | ใหม่ (T+1) |
|---|---|---|
| demo 2 วันติดกัน (21 → 22 ก.ย. 2026, risk_on) | 21: ซื้อ szw / svr / ksu ที่ราคาปิด 21 (28.159 / 298.273 / 319.393) · 22: szw ออก ret −5.94% · ซื้อ ctk/pb ที่ราคาปิด 22 | 21: 3 คำสั่งเข้าคิว ไม่มี Position · 22: เติมที่ราคาปิด 22 (26.88 / 307.703 / 325.422) · ctk/pb เข้าคิว (เติมวันทำการถัดไป) |
| demo track record | NAV 21 = 0.9976 · exposure 34.3% (ไม้เข้าวันสัญญาณ) | NAV 21 = 1.0000 · exposure 0% · ไม้เข้า 22 |
| feed: อนุมัติ gate BA เย็นวันที่ 21 | Position ทันทีที่ 107.75 (ราคาปิด 21 ที่รู้แล้ว) | คำสั่งรอ · รอบ 22 เติมที่ 108.66 |
| feed: อนุมัติ BA หลังข้อมูล 22 เข้า (ก่อนรอบ 22) | เข้า 108.66 ทันที **และรอบ 22 ถูกข้าม** ("รันไปแล้ว" · Q_REGIME มีแค่ 21) | รอบ 22 รันปกติ (gate ใหม่ 3) · BA รอเติมวันทำการหลัง 22 |
| demo: มนุษย์อนุมัติ exit ddn | ลบ Position · ไม่มี Trade | Trade ddn 17 → 22 ก.ย. 108.23 → 110.988 ret +1.15% hold 3 |
| empty | Jev 400 "ยังไม่มีข้อมูล snapshot" | เหมือนเดิม · GET /api/portfolio, /api/jev/pending คืน `pendingFills: []` / `fills: []` |

### A6. การันตีไม่มองอนาคต (no look-ahead)

| จุด | กลไกกัน look-ahead |
|---|---|
| ฟีเจอร์ meta-model | ใช้ข้อมูลถึงวัน i เท่านั้น (`src/lib/research/features.ts`) + CPCV purge/embargo (A2) |
| crossZ (SPX/USDTHB/GOLD) | ใช้ค่าที่ลงวันที่ **ก่อน** วัน SET นั้น (ราคาปิดสหรัฐฯ ของวัน d ออกหลังตลาดไทยปิด) — `signals/io.ts buildCrossZ` |
| vol-managed | น้ำหนักวัน k ใช้ σ̂ ถึงวัน k−1 |
| GTAA | สัญญาณเดือน t ใช้ข้อมูล ≤ ปิดเดือน t |
| Bayes stop walk-forward | posterior ของ refit R ใช้เทรดที่ปิด ≤ R − 10 วัน · path ผูกกับ "วันที่" ไม่ใช่ตำแหน่งใน array (path บางไม่ถูกเลื่อนมาเป็นราคาวันถัดจากวันเข้า) |
| regime/calendar ของ Jev | ใช้วันเดียวกับ decisions (`latest` = วันล่าสุดที่มี snapshot) |
| forward return ของ IC | ปฏิทินตลาดรวม ไม่ใช่ "แถวถัดไปของหุ้นตัวนั้น" |

- **เปลี่ยนเมื่อ 2026-09-23**: เพิ่ม 2 ข้อ — (1) posterior ของ stop **ไม่ให้เครดิต stop** กับเทรดที่ไม่มี path รายวัน (ไม่รู้ว่าราคาผ่านระดับ stop "เมื่อไร" = การสมมติว่าขายได้ที่ −s ก่อนวันออกคือการใช้ข้อมูลที่ไม่มี) (2) ราคาที่ใช้บังคับปิดหุ้นหยุดซื้อขายคือราคาปิดล่าสุดที่ **มีอยู่แล้ว** ณ วันตัดสิน ไม่ใช่ราคาที่มาทีหลัง

---

## ส่วน B — การตัดสินใจเชิงระเบียบวิธี 2026-09-23

### B1. Stop fill เมื่อราคา gap (backtest + walk-forward ของ Bayes stop)

**ปัญหาเดิม**: `simulateArm` (walk-forward 3 arms) บันทึกเทรดที่ถูก stop ว่าขายได้ที่ `1 − s` พอดี แม้ราคาปิดวันแรกที่ทะลุ stop จะต่ำกว่านั้นมาก และ `buildPosterior` ใช้ `−s − cost` เป็นผลของสาขา stop ทุกเทรด ขณะที่ Jev live ปิดที่ **ราคาปิด** (paper) → การจำลองมองโลกสวยกว่า live · ยิ่งแย่กับ path บาง (fixture demo เก็บแค่วันเข้า+วันออก และ MAE = ขาดทุนตอนจบ): ทุกไม้ขาดทุนเกิน s ถูก "ตัดที่ −s" ฟรี ๆ → demo adopt stop 1–1.5%

**กติกาใหม่**
1. **walk-forward (`simulateArm`)** — `fill = "close"` (ค่าเริ่มต้น): ถูก stop ในวันแรกที่ราคาปิด ≤ 1 − s (กันเศษ float ที่ขอบ) และขายที่ **ราคาปิดวันนั้น** (≤ 1 − s เสมอ) ทั้งในผลเทรดและบัญชีรายวัน · `fill = "level"` = สมมติเดิม เก็บไว้เทียบในงานวิจัยเท่านั้น (`runStopArms({ fill: "level" })`)
2. **E[R|s] (`buildPosterior`)** — สาขา stop ของเทรดที่มี **path รายวัน** ใช้ราคาปิดวันแรกที่ทะลุ s จริง − cost (`firstBreachCloses`) · เทรดที่ **ไม่มี path รายวัน** (ครอบวันที่มีราคาจริง < 80% — `DAILY_PATH_COVERAGE`, ตรวจกับปฏิทิน pivot ใน `loadClosedTrades`) ได้ `EV_hold(b)` ในสาขา stop = **ไม่ให้เครดิต ไม่ลงโทษ** (นับไว้ใน `nNoPathEvidence`) · ทุกเทรดไม่มี path → เส้น E[R|s] แบนเท่า `evNoStop` (บวกลำดับเดียวกันจึงเท่ากันเป๊ะ) → `sOpt = null` · ใช้กับทั้ง T และ R method (P(b) ของทั้งสองวิธีถ่วงต่อเทรด)
3. **bin ของ MAE/dd/ราคาทะลุ/liveExit** ใช้ `binIndex` ตัวเดียว (floor + กันเศษ float: 1 − 0.9 = 0.0999…98 ต้องได้ bin 10 เหมือน MAE 0.1) → "ถึง bin k" ⇔ "stop ที่ s_k ทำงาน" สอดคล้องกันทุกจุด
4. **runBacktest** ขายที่ราคาปิดวันทะลุอยู่แล้ว (`pxn ≤ stop` → exitPx = pxn) — ตรวจแล้ว **ไม่ต้องแก้** ล็อกด้วยเทสต์ gap −30%

**เหตุผล**: stop ของระบบตัดสินจากราคาปิดและ Jev ปิด paper ที่ราคาปิด — ผลของ stop ในงานวิจัยต้องเป็นผลที่ live ทำได้จริง (หลักการ 3) · กับ path บาง ไม่มีข้อมูลว่า stop จะทำงานวันไหน/ราคาเท่าไร การใส่ −s คือการแต่งเครดิต (หลักการ 2) · สาขา stop ในกรอบ Zambelli เป็น "ผลตอบแทนของกฎ" ไม่ใช่ค่าประมาณ จึงแทนด้วยผลจริงของกฎเมื่อมี path ได้ตรงตามโครงสร้างเดิม

**อ้างอิง**: กรอบ Bayesian stop-loss แบบ Zambelli ที่ระบบใช้ (MAE bins → P(L|b) → EV_hold → argmax E[R|s]; ดูหัวไฟล์ `src/lib/momentum/stops/bayes.ts`) · แนวคิด MAE: Sweeney (1997) *Maximum Adverse Excursion* (Wiley)

**ไฟล์**: `src/lib/momentum/stops/bayes.ts` · `src/lib/momentum/stops/engine.ts` · `src/app/api/stops/route.ts` (ข้อความอธิบายเมื่อ s* = "—")
**เทสต์**: `src/lib/momentum/stops/stops.test.ts` (+7 ใหม่, แก้ 3 ข้อที่ล็อกพฤติกรรมเก่า — ล้มบน HEAD 9/17) · `src/lib/momentum/engine.exits.test.ts` (gap −30% ใน runBacktest — ผ่านบน HEAD อยู่แล้ว = ล็อกพฤติกรรม)

**หลักฐาน (สำเนา fixture — GET /api/stops แล้วรัน Jev 2 วันทำการติดกัน 2026-09-21/22)**

| | HEAD (level fill) | ใหม่ (close fill) |
|---|---|---|
| demo: policy ที่ adopt | **bayesT** (Sharpe 2.51 vs fixed 0.65, Δ +1.86) | **fixed10** (ทุก arm Sharpe 0.11, Δ 0.00) |
| demo: s*T / s*R / s_live | 1.0% / 1.5% / 0.9% | null / null / — (315/315 เทรดไม่มี path รายวัน) |
| demo: arm fixed10 เอง | Sharpe 0.65, MaxDD −19.1% (ไม้ขาดทุนเกิน 10% ถูกตัดที่ −10% ฟรี) | Sharpe 0.11, MaxDD −25.9% (ผลจริงของเทรด) |
| demo Jev วัน 1 | exit 2 (anan dd 2.2%, pws dd 3.9% "≥ s_live 0.9%") | exit 0 |
| demo Jev วัน 2 | exit 1 (szw ซื้อวันก่อน ออกที่ dd 4.5%) · ซื้อ 2 | exit 1 (anan ret −7.9% ≤ −6% กฎ legacy) · ซื้อ 0 (slot เต็ม) |
| `fill: "level"` ในโค้ดใหม่ | — | ได้ตัวเลขเท่า HEAD เป๊ะ (Sharpe 0.65 / 2.51 / 2.36) = ต่างกันเพราะสมมติการเติมราคาล้วน ๆ |
| DB seed ใหม่ (400 วัน × 120 หุ้น, 213 เทรด path รายวันครบ) | adopt **bayesR** s* 1.5% (Sharpe 0.92 vs −0.19, Δ +1.11) | คง **fixed10** (bayesR −0.38 vs −0.56, Δ +0.18 < 0.2) · s*T = null · s*R = 1.5% (E[R|s*] −2.63% แทน −1.33%) |

### B2. หุ้นหยุดซื้อขาย / เพิกถอน (ไม่มีราคา)

**ปัญหาเดิม**: ทั้ง runBacktest และ Jev live ถือหุ้นที่ไม่มีราคาไปตลอดกาล — backtest ข้ามวันที่ไม่มีราคา (ช่อง maxPos ถูกกินตลอด) · Jev ตอบ hold และ `persistClosedTrade` ไม่บันทึกเทรดเมื่อไม่มีราคาวันออก

**กติกาใหม่**: ไม่มีราคาติดกัน **`NO_PRICE_EXIT_DAYS = 10` วันทำการ** (นับตามปฏิทินข้อมูลของระบบ = วันที่ใน RawDaily) → บังคับปิดที่ **ราคาปิดล่าสุดที่มี** เหตุผลขึ้นต้น `"หยุดซื้อขาย/ไม่มีราคา N วัน — ปิดที่ราคาล่าสุดที่มี"`
- **backtest**: ปิด ณ วันที่ 10 ที่ `p.prev` (mark-to-market ถึงราคานั้นแล้ว วันนั้นเหลือแค่ต้นทุนขาออก) · แถวเทรดมี `delisted: true` + `note` · reason ยังเป็น `"time"` เพราะ `TradeRow.reason` ใน contracts มีแค่ `"stop" | "time"` (ข้อเสนอแก้ contracts อยู่ใน crossSlice) · `BacktestFull.delistExits` นับทั้งชุด
- **live Jev**: Q_EXIT `exit` conf 0.85 (ผ่าน Q_EXIT 0.75 → ลงมือจริงแบบ paper เหมือน exit legacy อื่น) · Trade บันทึก `exit = วันที่ตัดสิน` (เงินถูกล็อกถึงวันนี้) `exitPx = ราคาปิดล่าสุดที่มี` (`persistClosedTrade(..., { fillAtLastKnown: true })`) · ไม่รู้ราคาล่าสุด (ไม่เคยมีราคา) → hold ไม่แต่งราคา · หยุดพักสั้นกว่า 10 วัน → เหมือนเดิม (รอราคากลับมา; backtest ออกวันแรกที่มีราคาเมื่อครบ hold)

**เหตุผล**: สถานะที่ขายไม่ได้แต่ค้างในพอร์ตทำให้ทั้ง exposure และผลตอบแทนเพี้ยน (ช่องถูกกิน ไม่มีเทรดปิดให้ posterior เรียนรู้ = survivorship) · 10 วันทำการ ≈ 2 สัปดาห์ ยาวกว่าวันหยุดยาวสุดของ SET (≤ 4 วันทำการ — `SET_MAX_HOLIDAY_RUN`) มากพอจะไม่ตัดหุ้นที่แค่หยุดพักชั่วคราว
**ข้อควรระวัง (ซื่อตรง)**: ราคาปิดล่าสุด **ไม่ใช่** ค่าอนุรักษ์นิยมเมื่อหุ้นถูกเพิกถอนเพราะปัญหาฐานะ — งานของ Shumway (1997) พบว่าผลตอบแทนวันเพิกถอนแบบ performance-related เฉลี่ยติดลบหนัก (ราว −30% ใน CRSP) และการละผลนี้ทำให้ผลตอบแทนสูงเกินจริง · ระบบยังไม่มีข้อมูลเหตุผลการหยุดซื้อขาย (SP/DL) จึงใช้ราคาล่าสุดตามกติกาที่กำหนด และติดธง `delisted` ให้กรอง/ปรับ haircut ภายหลังได้ (ส่วน C3)
**อ้างอิง**: Shumway (1997) "The Delisting Bias in CRSP Data", *Journal of Finance* 52(1)

**ไฟล์**: `src/lib/momentum/engine.ts` · `src/lib/jev/exit.ts` · `src/app/api/jev/run/route.ts` · `src/lib/momentum/stops/engine.ts` (`persistClosedTrade`)
**เทสต์**: `src/lib/jev/exit.test.ts` (ล้มบน HEAD) · `src/lib/jev/run.db.test.ts` + `run.db-harness.ts` (route จริง 2 วันติดกันบน SQLite ชั่วคราว — ล้มบน HEAD 3/4) · `src/lib/momentum/engine.exits.test.ts` (ล้มบน HEAD 2/3)

**หลักฐาน**
- backtest บนสำเนา feed (k = 1/2/3, พารามิเตอร์ค่าเริ่มต้น): **เทรดที่ได้รับผลกระทบ 0** — BJC ติดโผครั้งสุดท้าย 2026-07-23 และไม่มีสถานะใดค้างตอนหยุดซื้อขาย 2026-08-10 · สถิติเท่าเดิมทุกตัว (เช่น k = 3: 397 เทรด, CAGR −24.09%) · demo: 0 (ไม่มีหุ้นหยุดซื้อขาย)
- live what-if บนสำเนา feed (ใส่สถานะ paper BJC เข้า 2026-08-05 @99.35 แล้วรัน Jev วัน 2026-09-22): HEAD → hold ค้าง ไม่มี Trade · ใหม่ → exit `หยุดซื้อขาย/ไม่มีราคา 30 วัน — ปิดที่ราคาล่าสุดที่มี (2026-08-10 ราคา 97.70 ret=-1.7%)` · Trade exitPx 97.70, ret −3.06% หลังต้นทุน, holdDays 33

### B3. Time exit ใน Jev live

**ปัญหาเดิม**: backtest ออกเมื่อครบ `hold` แต่ live เขียน hold ไว้แค่ใน reason ของ entry (ส่วนต่างที่บันทึกใน worklog 9-c) → สถานะ live ถือยาวกว่าที่ backtest วัดผล

**กติกาใหม่** (`applyTimeExit`): ถือครบ `TH.holdDefault` วันทำการ (config-as-data จาก `getConfigTh()`; นับ index วันล่าสุด − index วันเข้า ในปฏิทินข้อมูล = `i − ei ≥ hold` ของ runBacktest) → Q_EXIT `exit` conf 0.85 เหตุผล `"ครบกำหนดถือ N วัน (time exit)"` + เก็บเหตุผลของกฎเดิมไว้ท้ายข้อความ
- **ลำดับความสำคัญ**: ใช้ **หลัง** กฎอื่นทั้งหมด — การตัดสินที่เป็น exit อยู่แล้ว (Bayes stop / stop ที่บันทึก / กำไรใหญ่ / −6%) คงเหตุผลเดิม (stop มาก่อน time — ลำดับเดียวกับ runBacktest) · Bayes `hold`/`tighten` ที่ครบกำหนด → exit (Bayes stop ทำหน้าที่ "ตัดเทรดให้สั้นลง" เท่านั้น ไม่ยืดเกินแผน — ตรงกับ walk-forward ที่ stop ซ้อนบนเทรดที่มีวันออกตามแผนอยู่แล้ว) · ไม่มีราคาวันนี้ → ยังออกไม่ได้ (รอราคา หรือกฎ B2)
- human gate ของ entry ไม่เปลี่ยน · exit แบบนี้ execute ใน paper mode เหมือน exit legacy อื่น (ไม่ต้องอนุมัติ — เป็นการลดความเสี่ยง)

**เหตุผล**: หลักการ 3 — ผลตอบแทนที่ใช้ตัดสินกลยุทธ์ (backtest) วัดจากการถือ `hold` วัน live ต้องทำเหมือนกัน ไม่งั้นผล live กับผลวิจัยเป็นคนละกลยุทธ์
**อ้างอิง**: Jegadeesh & Titman (1993) "Returns to Buying Winners and Selling Losers", *JF* 48(1) — โมเมนตัมเป็นกลยุทธ์ "ถือช่วงเวลากำหนด" (formation/holding period)

**ไฟล์**: `src/lib/jev/exit.ts` · `src/app/api/jev/run/route.ts` (message แยกนับ `(time N · หยุดซื้อขาย M)` + EventLog `timeExit/noPriceExit`)
**เทสต์**: `src/lib/jev/exit.test.ts` (precedence, ข้อมูลไม่ครบ) · `src/lib/jev/run.db.test.ts` (วัน 1: AGED ถือ 6 วัน → time exit; EDGE ถือ 4 → คงไว้ · วัน 2: EDGE ครบ 5 → time exit · รันซ้ำวันเดิม idempotent)

**หลักฐาน**: demo 2 วันติดกัน: 0 time exit (สถานะเข้า 2026-09-17 ถือ 2–3 วัน < 5) · what-if บนสำเนา demo (ย้อนวันเข้าของสถานะทั้ง 5 ตัวเป็น 2026-09-15 = 5 วันทำการ): HEAD exit 0 · ใหม่ exit 5 (kmg/ddn/anan/mvc/pws "ครบกำหนดถือ 5 วัน (time exit) · กฎเดิม: hold")

### B4. หุ้นไม่รู้ sector (Unknown)

**ปัญหาเดิม**: หุ้นที่ไม่มีใน SymbolMeta ทุกตัวรวมเป็น sector "Unknown" เดียว → cap จำนวนชื่อ ≤ 3 ต่อ sector ทำให้ทั้งพอร์ตถือหุ้นไม่รู้ sector ได้แค่ 3 ตัว (และ cap น้ำหนัก 30% ตัดตัวที่ 3 ขึ้นไป)

**กติกาใหม่**: cap ต่อ sector (จำนวนชื่อ/น้ำหนัก) คิด **ถังละตัว** — `capBucketOf()` คืน `"Unknown:SYM"` · รายงาน exposure ยังรวมเป็นแถว `"Unknown"` แถวเดียว โดย `breached` ของแถวนี้ = มีหุ้นไม่รู้ sector ตัวใดตัวหนึ่งเกิน cap (เกณฑ์เดียวกับที่ gate จริง) · ไม่สังกัดกลุ่มใหญ่ · `TH_HARD_REJECT_UNKNOWN = true` ยังตัดทิ้งทั้งหมดเหมือนเดิม
**เหตุผล**: "ไม่รู้" ไม่ใช่หลักฐานว่าอยู่ sector เดียวกัน — การ pool ข้อมูลที่ไม่มีสร้างความกระจุกปลอม (หลักการ 2) · ความเสี่ยงที่เหลือ (หุ้นไม่รู้ sector อาจอยู่กลุ่มเดียวกันจริง) แก้ที่ต้นเหตุคือเติม SymbolMeta (feed ใส่ sector จริงให้แล้ว) หรือเปิด hard reject
**ไฟล์/เทสต์**: `src/lib/risk/sector.ts` · `src/lib/risk/sector.unknown.test.ts` (ล้มบน HEAD 4/6)
**หลักฐาน**: fixture ทั้งสองไม่มีหุ้นไม่รู้ sector (demo 240/240, feed 78/78 มีแผนที่) → ผลบน fixture ไม่เปลี่ยน · เทสต์: 4 ตัวไม่รู้ sector บนพอร์ตว่าง HEAD รับ 3 ตัด 1 → ใหม่รับครบ 4

### B5. Flagship G3 เมื่อข้อมูลมี ≤ 2 กลุ่ม

**ปัญหาเดิม**: `sectorCut = nSectors − 2` → เมื่อมี ≤ 2 กลุ่ม ทุกหุ้น (รวมกลุ่มอันดับ 1) ถูก veto ที่ G3
**กติกาใหม่**: ตัด 2 กลุ่มท้ายเฉพาะเมื่อ `nSectors > 2` (`sectorBottomVeto` — เงื่อนไขเดียวกับตัวกรอง sector ของ Jev: `nSec > 2 && rank > nSec − 2`) · ≤ 2 กลุ่ม → G3 ไม่ตัด และเขียน note ว่า "ด่าน G3 จึงไม่คัดออกรอบนี้" (ไม่ให้เข้าใจว่าผ่านเพราะกลุ่มแข็งแรง)
**เหตุผล**: เกณฑ์ "2 กลุ่มท้าย" มีความหมายเมื่อมีกลุ่มให้เทียบ — ข้อมูลกลุ่มน้อยเป็นข้อจำกัดของข้อมูล ไม่ใช่สัญญาณลบของหุ้น · สายพาน Flagship กับ Jev ต้องใช้นิยามเดียวกัน
**ไฟล์/เทสต์**: `src/lib/flagship/funnel.ts` · `src/lib/flagship/g3.test.ts` (ล้มบน HEAD 3/3)
**หลักฐาน**: fixture จริงมี 13 กลุ่ม → เท่าเดิม (demo G3 33→32, feed 22→21, อันดับ 1–10 เหมือนเดิมทุกตัว) · what-if สำเนา feed ที่ remap SymbolMeta เหลือ 2 กลุ่ม: HEAD G3 24→**0** อันดับว่าง · ใหม่ G3 24→24 อันดับ 10 ตัว (Tier A 6)

### B6. เกณฑ์นัยสำคัญของ lead-lag

**ปัญหาเดิม**: ป้าย `leads` + "ใช้เป็นเรดาร์ก่อนเปิดตลาดได้" ขึ้นได้ด้วย r เท่าไรก็ได้ (feed: SPX r = 0.065, USDTHB r = 0.032 ก็ติดป้าย)
**กติกาใหม่**: `leads` ต้องผ่านครบ — lag ≥ 1 · |r_lag| > 1.1·|r_0| · **|r_lag| ≥ 2/√n** (n = จำนวนคู่ที่ lag นั้น; `corrSignificanceFloor`) · ไม่ผ่านนัยสำคัญ → note `"ยังไม่มีนัยสำคัญ (|r| < 2/√n: …, n=…)"` และไม่ใช้เป็นเรดาร์ · ความสัมพันธ์วันเดียวกัน (`lags`) ใช้เกณฑ์เดียวกันกับ r_0 ไม่ผ่าน → `flat` · note ระบุ n และเกณฑ์ทุกแถว
**เหตุผล**: ภายใต้ H0 ρ = 0 ค่า se(r) ≈ 1/√n → |r| ≥ 2/√n ≈ นัยสำคัญ 95% สองทาง · ข้อจำกัด: สแกน 5 lag = ทดสอบหลายครั้ง (โอกาสเจอ lead ปลอมสูงกว่า 5%) — เกณฑ์ 1.1·|r_0| กรองอีกชั้น และเป็นสหสัมพันธ์ไม่ใช่เหตุ-ผล (note บอกเสมอ)
**อ้างอิง**: Fisher (1915/1921) การแจกแจงของสัมประสิทธิ์สหสัมพันธ์ตัวอย่าง (se ≈ 1/√n เมื่อ ρ = 0) · Harvey, Liu & Zhu (2016) เรื่องการทดสอบหลายครั้ง
**ไฟล์/เทสต์**: `src/lib/sniper/leadlag.ts` (ปรับ lookup เป็น Map O(n) ความหมายเดิม) · `src/lib/sniper/leadlag.test.ts` (ล้มบน HEAD 4/4)
**หลักฐาน**: feed — SPX `leads`→`flat` (lag 2 r 0.065 < 0.090, n 499) · USDTHB `leads`→`flat` (r 0.032) · GOLD คง `leads` (lag 3 r 0.107 ≥ 0.090) · demo เท่าเดิม (`lags` ทั้ง 3, |r| 0.15–0.43 ≫ 0.088)

### B7. เครื่องหมายสัญญาณ Frog-in-the-Pan

**ปัญหาเดิม**: signal = −ID ตรง ๆ — ID ของ DGW ต่ำ (ต่อเนื่อง) ทั้งผู้ชนะ **และผู้แพ้** ต่อเนื่อง จึงได้คะแนนสูงเท่ากัน (สัญญาณ "ไม่แยกทิศ") ทั้งที่ DGW พบว่าผู้แพ้แบบต่อเนื่องไปต่อ **แย่ที่สุด**
**กติกาใหม่**: `ID = sign(PRET) × (%วันลง − %วันขึ้น)` ในหน้าต่าง 20 วัน (ตามต้นฉบับ) · continuity `c = (1 − ID)/2 ∈ [0, 1]` (การแปลงเชิงเส้นของ −ID) · **signal = sign(PRET) × c** → ผู้ชนะต่อเนื่อง (+1) > ผู้ชนะ discrete > 0 > ผู้แพ้ discrete > ผู้แพ้ต่อเนื่อง (−1) · ภายในฝั่งผู้ชนะ อันดับ = อันดับตาม −ID ตรงตามต้นฉบับ · PRET = 0 → 0
- เลือกแบบนี้แทน `sign(PRET)·(−ID)` (= %ขึ้น − %ลง) เพราะแบบหลังกลับทิศโมเมนตัมในหุ้นกลุ่ม discrete (ผู้ชนะ discrete ได้คะแนนติดลบต่ำกว่าผู้แพ้ discrete) ซึ่ง DGW ไม่ได้อ้าง — DGW พบว่าโมเมนตัมในกลุ่ม discrete "อ่อนลง" ไม่ใช่ "กลับทิศ"
- เพิ่มสถิติ **ฐานเทียบโมเมนตัมดิบ** (PRET 20 วัน mask เดียวกัน ที่ hold เดียวกับ FIP): `momICIR`, `fipVsMomICIR` และข้อความใน verdictWhy — เพื่อให้เห็นว่า PASS มาจาก continuity จริงหรือแค่เครื่องหมายโมเมนตัม (รายงานเท่านั้น เกณฑ์ verdict เดิม)
**อ้างอิง**: Da, Gurun & Warachka (2014) "Frog in the Pan: Continuous Information and Momentum", *RFS* 27(7)
**ไฟล์/เทสต์**: `src/lib/research/global-engines/frog-in-pan.ts` · `frog-in-pan.test.ts` (ซีรีส์ขึ้นต่อเนื่อง vs ลงต่อเนื่อง vs discrete — ล้มบน HEAD 6/7)
**หลักฐาน (GET /api/engines/global)**: feed FAIL (ICIR 0.026, t 0.58) → **PASS** (ICIR 0.348, t 7.62, hold 20) · ฐานโมเมนตัมดิบ ICIR 0.152 → ส่วนเพิ่มจาก continuity **+0.196** · demo PASS 0.257 → PASS 0.863 แต่ฐานโมเมนตัมดิบ 0.922 → ส่วนเพิ่ม **−0.059** ("ยังไม่ดีกว่าโมเมนตัมธรรมดา" — ข้อมูลจำลองไม่มีผล continuity) · engine อื่น 8 ตัวเท่าเดิม

### B8. Trigger T1 ของ Shadow Lab

**ปัญหาเดิม** (`panel-state.ts`): `wick_ratio = ret1 ≤ −0.02 && close > prev·0.995 ? 2.5 : 1.2` — สองเงื่อนไขเป็นไปไม่ได้พร้อมกัน (ret1 ≤ −2% ⇒ close ≤ 0.98·prev) → wick_ratio = 1.2 เสมอ และ T1 (ต้อง wick ≥ 2) ไม่เคยเกิด
**เจตนาที่อนุมาน**: คอมเมนต์ระบุ "proxy จาก 2 แท่งล่าสุด" และ T1 = แท่งปฏิเสธราคาต่ำ (ไส้ล่างยาว + ปิดส่วนบนของช่วง: `wick ≥ 2 && close_pos ≥ 0.67` — สอดคล้อง edge case `news_day_high_vol`/`spoof_zone` ใน `synth-state.ts` ที่ให้ T1 คู่กับไส้ยาว) · เมื่อไม่มี OHLC "ไส้" จึงต้องมาจากแท่งก่อนหน้าที่ลงไปทดสอบโซน
**กติกาใหม่** (`triggerProxy`): `wick_ratio = 2.5` เมื่อ **แท่งก่อนหน้าลง ≥ 2% (ret2 ≤ −0.02)** และวันนี้ยืนเหนือ 0.995× ราคาปิดแท่งนั้น (ไม่ไหลต่อ) · T1 = wick 2.5 **และ** close_pos ≥ 0.67 (ret1 ≥ +4.25% ตาม proxy close_pos = 0.5 + 4·ret1) · T2 เดิมคงอยู่ (ขึ้น > 3% หลังวันลง) และเช็กหลัง T1 (T1 เข้มกว่า: ลงลึกกว่า + ปิดแรงกว่า)
**เหตุผล**: แก้ให้ตรงเจตนาด้วยการเปลี่ยนน้อยที่สุด (ข้อแรกใช้ผลตอบแทนแท่งก่อนหน้า) โดยไม่เปลี่ยนนิยาม close_pos ที่ rule engine และ Nimble เห็นร่วมกัน (กัน train/serve skew) · `lab/state_gen.py` ใช้ OHLC จริง + กฎ S1–S3 คนละเครื่องยนต์ (ดู `lab/README.md`) ไม่มีสูตรคู่ที่ต้องแก้ตาม
**ไฟล์/เทสต์**: `src/lib/lab/panel-state.ts` · `src/lib/lab/panel-state.test.ts` (ซีรีส์ −3% → +5% ได้ T1 — ล้มบน HEAD 5/5 · ซีรีส์ −3% → +0.5% ได้ไส้แต่ไม่ T1 · −3% → −1% ไม่มีไส้)
**หลักฐาน (ย้อนหลัง 120 วันทำการ)**: demo T1 0 → **235** (T2 967 → 732, ไส้ 2.5: 0 → 1,964 จาก 16,550 state) · feed T1 0 → **51** (T2 347 → 296, ไส้: 0 → 790 จาก 8,607) · วันล่าสุด demo T1 3 ตัว feed 0

---

## ส่วน C — ส่วนต่างที่รู้แล้วและยังไม่แก้

- **C1. ~~T+0 ใน Jev live (paper)~~ — ปิดแล้ว 2026-09-23 (A5)**: เดิม Jev ตัดสินหลังตลาดปิดวัน d และบันทึกราคาเข้าที่ราคาปิดวัน d เดียวกัน (ทั้งซื้ออัตโนมัติ และมนุษย์อนุมัติเย็นวันเดียวกัน) ขณะที่ backtest เข้าที่ราคาปิด d+1 · ตอนนี้ entry live ทุกทางเป็นคำสั่งในคิว เติมที่ราคาปิดวันทำการแรกหลัง `afterDate` · exit ทั้งสองฝั่งยังใช้ราคาปิดของวันตัดสิน (ตรงกัน) · ส่วนต่างที่ยังเหลือของเรื่องนี้อยู่ที่ C7–C8
- **C7. ขั้นตรวจตอนเติมของ live เข้มกว่า backtest**: live ตรวจ sector layer (ชื่อ/น้ำหนัก sector/กลุ่ม) + งบ slots ของรอบที่สั่ง แล้วอาจลดขนาดหรือยกเลิก ขณะที่ runBacktest ตรวจแค่ `maxPos` ตอนเติม (ไม่มี sector layer และขนาดคงที่) — ผล live จึงอาจมีไม้น้อยกว่า/เล็กกว่า backtest ในช่วงที่ sector กระจุก
- **C8. เวลาที่บันทึกการเติม**: Position ของคำสั่งที่ถึงวันเติมแล้วถูกเขียนตอนเริ่มรอบ Jev ถัดไป (GET อ่านอย่างเดียว แสดง preview วัน/ราคาที่จะเติม) — วัน/ราคาเติมไม่ขึ้นกับเวลาที่เขียน (กำหนดจาก `afterDate`) แต่ track snapshot ของวันที่ยังไม่ได้เขียนจะไม่มีไม้ใหม่ และกลายเป็น `navSuperseded` เมื่อแถว `fill` ของวันนั้นเข้ามา (ไม่ใช่ `navMismatches`) · ถ้าเว้นหลายวันไม่รัน Jev คำสั่งยังเติมที่วันแรกหลัง `afterDate` แต่ exit ของวันที่ไม่ได้รันจะถูกประเมินในรอบที่รันจริง (เหมือนสถานะอื่น)
- **C2. MAE จากราคาปิด**: ยังไม่มี high/low รายวันครบทุกหุ้น MAE จึงต่ำกว่าความแรง intraday จริง — `liveBackstop = 0.85·s*` เป็นกันชนชั่วคราว
- **C3. ราคาบังคับปิดของหุ้นเพิกถอน**: ใช้ราคาปิดล่าสุด (B2) ซึ่งสูงเกินจริงถ้าเพิกถอนเพราะฐานะ (Shumway 1997) — แถวเทรดติด `delisted` ไว้แล้วเพื่อทำ sensitivity/haircut เมื่อมีข้อมูลเหตุผลการหยุดซื้อขาย
- **C4. holdDefault ใช้กับทุกสถานะ**: Position ไม่เก็บที่มา (lite/reversal) — reversal มี hold ของตัวเองใน reason JSON (= 5 เท่ากับค่าเริ่มต้นปัจจุบัน) · สถานะที่เปิดก่อน 2026-09-23 และถือเกิน holdDefault แล้ว จะถูก time exit ในรอบแรกที่รัน
- **C5. lead-lag ทดสอบหลาย lag**: เกณฑ์ 2/√n ต่อ lag ไม่ได้ปรับ multiple testing (ดู B6)
- **C6. DB demo ที่มากับโปรเจกต์มี path เทรดแบบบาง**: seed ปัจจุบันเก็บ path รายวันแล้ว — seed ใหม่ (หรือเทรดจริงของ Jev) จะให้ posterior ของ stop ใช้ราคาปิดวันทะลุได้เต็มที่

---

## ภาคผนวก — วิธีทำซ้ำหลักฐาน

1. คัดลอก fixture เป็นไฟล์ชั่วคราว (ห้ามเขียน `db/custom.db` และ `/tmp/fixtures/*.db`) แล้วรันใน subprocess ที่ตั้ง `DATABASE_URL=file:<สำเนา>` และตรวจ `PRAGMA database_list` ก่อนเขียน (แบบเดียวกับ `src/lib/momentum/core.db-harness.ts`)
2. เรียก handler ของ route ตรง ๆ: `GET /api/stops` → `POST /api/jev/run` (ถอดแถว RawDaily/Snapshot ของวันสุดท้ายออกก่อนเพื่อรันวันก่อนหน้า แล้วใส่กลับ + `markDataChanged()` เพื่อรันวันถัดไป) · `GET /api/flagship` · `GET /api/engines/global`
3. เปรียบเทียบวิธีเติมราคา: `runStopArms({ fill: "level" })` (สมมติเดิม) vs ค่าเริ่มต้น · `buildPosterior(trades, { fill })`
4. เทสต์: `bun test src` — ชุดที่เพิ่มในรอบนี้: `stops.test.ts`, `jev/exit.test.ts`, `jev/run.db.test.ts`, `momentum/engine.exits.test.ts`, `risk/sector.unknown.test.ts`, `flagship/g3.test.ts`, `sniper/leadlag.test.ts`, `global-engines/frog-in-pan.test.ts`, `lab/panel-state.test.ts`, `jev/fills.test.ts`, `jev/fills.db.test.ts` (T+1 — A5)
5. T+1 (A5): ถอดวันสุดท้ายของสำเนา fixture → `POST /api/jev/run` (วัน d1) → [อนุมัติ gate แรกด้วย `POST /api/jev/pending`] → ใส่แถววันสุดท้ายกลับ + `markDataChanged()` → `GET /api/portfolio` (preview) → `POST /api/jev/run` (วัน d2) → `buildTrackRecord()` — เทียบ Position.entryDate/entryPx กับราคาปิด d1/d2
