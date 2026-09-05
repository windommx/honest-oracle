# อัลกอริทึมหุ้นปันผล — ระบบที่มีหลักฐานรองรับ ผสมเป็นชิ้นที่รันได้จริง

ต่อจาก [`flow-reasoning-dividend-stocks.md`](./flow-reasoning-dividend-stocks.md) ซึ่งสรุปว่า
จาก Flow Reasoning Models เอามาใช้ได้เพียง *ประตูความมั่นคงของคำตัดสิน* บันทึกนี้ตอบคำถามถัดมา:
**มีระบบอะไรอีกที่สอดคล้องกันและดีกว่า แล้วผสมกันอย่างไรให้เป็นอัลกอริทึมที่ทำงานได้จริง**

โค้ดอยู่ที่ [`lib/dividend/`](../../lib/dividend/README.md) — pure TypeScript, deterministic, มี test 39 ข้อ
รวม integrity test ของ harness. Web-sourced September 2026; ตรวจลิงก์ซ้ำก่อนลงแรง.

> **นิยามของ "ทำงานได้จริง" ที่ใช้ในบันทึกนี้:** (1) รันได้จากงบการเงินจริงโดยไม่ต้องเชื่อใคร
> (2) ทุกกฎมีแหล่งอ้างอิงที่ *ทดสอบนอกตัวอย่าง* มาแล้วอย่างน้อยหนึ่งครั้ง (3) มี harness ที่พร้อม
> จะบอกว่า "ไม่มีสัญญาณ" — **ไม่ใช่** "รับประกันผลตอบแทน" ซึ่งไม่มีระบบไหนทำได้และเราไม่อ้าง.

---

## 1. ระบบที่ค้นพบ — ให้คะแนนตามหลักการแพลตฟอร์ม

| # | ระบบ | หลักฐาน | ใช้ใน `lib/dividend` เป็น | Tier | Fit |
|---|---|---|---|---|---|
| 1 | **Loss gate** — DeAngelo, DeAngelo & Skinner 1992 | 167 บริษัท NYSE ที่ขาดทุน: **50.9 % ตัดปันผล** vs **1.0 %** ในบริษัทที่ไม่ขาดทุน ([J. Finance](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1540-6261.1992.tb04685.x)) | hard gate `loss` | 1 | ✅ |
| 2 | **Earnings shortfall** — Daniel, Denis & Naveen 2008 | บริษัทที่กำไรไม่พอจ่ายปันผลตามคาด *แต่งกำไร* เพื่อไม่ต้องตัด → กำไรที่รายงานเชื่อไม่ได้ในจุดที่สำคัญที่สุด ([JAE](https://www.researchgate.net/publication/222700816_Do_Firms_Manage_Earnings_To_Meet_Dividend_Thresholds)) | gate `payout_eps_2y` / watch `earnings_shortfall` + เหตุผลที่ต้องมี Beneish | 1 | ✅ |
| 3 | **Coverage ratios** — CFA L2 / practitioner | FCF coverage จับปัญหาก่อน EPS coverage; payout > 100 % สองปีติด "แทบการันตีการตัด" ([CFA notes](https://analystprep.com/study-notes/cfa-level-2/analysis-of-dividend-safety/), [Equicurious](https://equicurious.com/learn/equities/equity-income-and-dividends/evaluating-payout-ratios-and-coverage)) | cells `payoutEps` `payoutFcf` `cashRunway` | 2 | ✅ |
| 4 | **Piotroski F-score** 2000 | 9 การเปรียบเทียบสองงบติดกัน; out-of-sample ใน [ออสเตรเลีย](https://www.researchgate.net/publication/301600517_The_Piotroski_F_-score_evidence_from_Australia) และ [จีน](https://open.uct.ac.za/bitstreams/610cf0a0-c620-4f89-bffc-c2b9b6396c1c/download) — ผลแตกต่างตามตลาด | watch gate `f_score` + ranking key อันดับแรก | 1 | ✅ |
| 5 | **Altman Z''** 1995 | สูตรเชิงเส้น 4 พจน์สำหรับ non-manufacturer / emerging markets ([LSEG](https://developers.lseg.com/en/article-catalog/article/Beneish-M-Score-and-Altman-Z-Score-for-analyzing-stock-returns-of-the-companies-listed-in-the-SP500)) | hard gate `altman_distress`, watch `altman_grey` | 2 | ✅ (สัมประสิทธิ์ fit บนบริษัทสหรัฐ — เปิดเผยไว้) |
| 6 | **Beneish M-score** 1999 | ตรวจจับกำไรที่ถูกแต่ง; เสถียรข้ามปีและ sector ยกเว้น financials/healthcare ([LSEG](https://developers.lseg.com/en/article-catalog/article/Beneish-M-Score-and-Altman-Z-Score-for-analyzing-stock-returns-of-the-companies-listed-in-the-SP500)) | flag `beneish` (สัญญา — ไม่ตัดสิน) | 3 | ✅ ในฐานะ flag |
| 7 | **Quality overlay on yield** — S&P DJI 2019 | กลยุทธ์ yield ล้วนแพ้; quality+yield ชนะ S&P 500 5.42 %/ปี ใน 20 ปี; "จ่ายแพงขึ้นเพื่อคุณภาพ" ([Indexology](https://www.indexologyblog.com/2019/01/16/combining-the-quality-factor-with-dividend-yield-a-study-of-sp-dji-dividend-strategies/), [LSEG](https://www.lseg.com/en/insights/ftse-russell/dividend-growth-quality-overlay-rationale-systemic-dividend-capture)) | **ลำดับ ranking**: quality ก่อน yield; yield เป็น tiebreak ท้ายสุด; flag `yield_trap` | 2 | ✅ |
| 8 | **Shareholder yield** — Faber 2013 | dividend + buyback + net-debt paydown ทำนายผลตอบแทน 5 ปีดีกว่า dividend yield โดยเฉพาะนอกสหรัฐ ([Faber](https://mebfaber.com/2022/01/24/shareholder-yield-in-sectors-and-industries/), [AAII](https://www.aaii.com/journal/article/282779-holistic-yield-investing-meb-fabers-unique-screening-approach)) | cell `shareholderYield` (รายงาน ยังไม่ใช้ตัดสิน — buyback ในไทยหายาก) | 2 | 🟡 |
| 9 | **SETHD / Aristocrats eligibility** | จ่ายต่อเนื่อง ≥ 3 ปี, payout ไม่ติดลบ, ใน SET100 ([SET](https://www.set.or.th/en/market/index/sethd/profile)) | watch gate `streak` | 1 | ✅ |
| 10 | **Renoise-CE stability** — FRM 2026 | ดูบันทึกก่อนหน้า | `stability-gate.ts` → avisaya | 1–2 | ✅ |
| 11 | **Walk-forward + purge/embargo, permutation, deflated Sharpe** — López de Prado | CV ธรรมดารั่ว label ข้ามเวลา; ต้องมี embargo และแก้ multiple testing ([GARP](https://www.garp.org/hubfs/Whitepapers/a1Z1W0000054x6lUAA.pdf), [Wikipedia](https://en.wikipedia.org/wiki/Purged_cross-validation)) | `validation.ts` ทั้งไฟล์ | — | ✅ |
| ✗ | **ML ทำนายการตัดปันผล** (RF / XGBoost) | งานที่พบเป็นการทำนาย *นโยบาย* ปันผล ไม่ใช่การตัด; ไม่มี precision/recall out-of-sample ที่เชื่อถือได้ ([ICMR](https://scholarhub.ui.ac.id/icmr/vol18/iss2/3/), [Springer](https://link.springer.com/chapter/10.1007/978-3-030-71869-5_2)) | ไม่ใช้ — จนกว่าจะชนะ rule set ใน harness | 4 | 🔴 ยังไม่มีหลักฐาน |
| ✗ | **LLM ให้คะแนนความปลอดภัยปันผล** | ทำซ้ำไม่ได้ สูตรซ่อน | ไม่ใช้ | 4 | 🔴 ผิดสัญญา epistemology |

**สิ่งที่ทุกระบบที่ ✅ มีร่วมกัน:** เป็นฟังก์ชันของ *ตัวเลขในงบการเงินสองงวดติดกัน* ทั้งหมด. นั่นคือเหตุผลที่มัน
ผสมกันได้โดยไม่ต้องคิดน้ำหนักขึ้นมาเอง — แต่ละตัวเป็นประตูหรือคีย์เรียงลำดับ ไม่ใช่พจน์ในสมการถ่วงน้ำหนัก.

## 2. อัลกอริทึมที่ผสมแล้ว

```
สำหรับแต่ละบริษัท (งบรายปี ≥ 2 ปี, ปีล่าสุด = ปีที่ประเมิน):

  1. CELLS       coverage · streak · epsVol · shareholderYield · F-score · Z'' · M     (cells / piotroski / altman / beneish)
  2. VERDICT     hard gates → at-risk        loss · payout>1 สองปี · FCF ไม่คลุม+runway<1 · Z''<1.1 · หนี้สูง+ดอกเบี้ยคลุมต่ำ
                 quality gates → watch       shortfall · payout>1 หนึ่งปี · F<5 · streak<3 · Z'' grey
                 flags (ไม่ตัดสิน)           Beneish M > −1.78 · yield trap · ช่องที่คำนวณไม่ได้ (avisaya)
  3. STABILITY   รบกวนงบปีล่าสุด k=8 ครั้ง (earnings ±epsVol[0.10,0.50], CFO ×1.5, หนี้ ±10 %, ราคา ±20 %,
                 ทุกครั้งที่ 4 = "หายไปหนึ่งไตรมาส" ×0.75) → นับว่า verdict คงเดิมกี่ครั้ง
                 agree/k < τ=0.75  →  final = avisaya  (ปฏิเสธ ไม่ใช่ลดคะแนน ไม่ใช่ restart)
  4. PORTFOLIO   คัดเฉพาะ final = sustain (watch ได้ถ้าเปิด) → เรียง lexicographic:
                 F-score ↓ · dividends/FCF ↑ · streak ↓ · dividend yield ↓ · ticker
                 → equal weight · cap ต่อ sector · จำนวนสูงสุด · rebalance ปีละครั้งหลังงบออก
  5. VALIDATION  label = DPS_{t+1} < DPS_t (เฉพาะบริษัทที่จ่ายอยู่) · walk-forward รายปี embargo 1 ปี
                 baselines: never-cut · loss-only · payout>1 · skill = ΔBalanced Accuracy
                 permutation test B=200 · adequateModelFound = ชนะทุก baseline AND p<0.05
```

ทุก threshold อยู่ใน `DEFAULT_POLICY` และถูก echo กลับมาใน output ทุกครั้ง; ทุกเหตุผลระบุกฎ ชั้นความรู้
สิ่งที่วัด และแหล่งอ้างอิง.

### ทำไมถึงไม่มี "คะแนนรวม"
คะแนนรวม = น้ำหนักที่ต้องมีคน *คิดขึ้น* แล้วซ่อนไว้ในสูตร. การเรียงแบบ lexicographic ใช้เฉพาะลำดับความสำคัญที่
หลักฐานบอก (quality ก่อน yield — S&P DJI) และผู้อ่านไล่ตรวจอันดับด้วยมือได้ทุกคู่.

### ทำไม stability gate ถึง "ปฏิเสธ" ไม่ใช่ "ลดอันดับ"
เพราะบริษัทที่ verdict พลิกไปมาตามสัญญาณรบกวนขนาดหนึ่งไตรมาสคือบริษัทที่ *เครื่องมือนี้ตอบไม่ได้*
ไม่ใช่บริษัทที่ "ปลอดภัย 60 %". ผลจริงจากตัวอย่างใน test: บริษัทที่ payout 0.98 และเงินสดบาง
ได้ verdict `sustain` แต่คงอยู่เพียง 1/8 ครั้ง → avisaya.

## 3. สิ่งที่ harness พิสูจน์แล้ว และสิ่งที่ยังไม่ได้พิสูจน์

รันบนจักรวาลสังเคราะห์ (`fixtures.ts` — ฝังกลไก: ขาดทุนหรือเงินสดไม่พอปีนี้ → ตัดปันผลปีหน้า, นโยบายปันผลหน่วง 1 ปีแบบ Lintner):

| ข้อพิสูจน์ | ผล |
|---|---|
| กฎที่ตรงกับกลไก (`loss-only`) ได้ skill > 0 และ p < 0.05 | ✅ harness จับสัญญาณจริงได้ |
| กฎกลับด้าน (`anti-loss`) ได้ skill < 0 | ✅ harness ลงโทษโมเดลผิด |
| label สุ่ม (noise = 1) → ไม่มีโมเดลไหนถูกประกาศว่าเพียงพอ | ✅ ไม่มี false discovery |
| composite verdict บนข้อมูลสังเคราะห์ vs `loss-only`, `payout>1` | **แพ้ — "no signal claimed"** และเป็นสิ่งที่ *ถูกต้อง*: กลไกที่ฝังคือ loss/coverage เอง ประตูเพิ่ม (Altman, leverage) มีแต่เพิ่ม false positive บน toy data |

บรรทัดสุดท้ายสำคัญที่สุด: ถ้าเราปรับ rule set ให้ชนะบน toy data ของตัวเอง นั่นคือ overfitting ต่อ generator.
**คุณค่าของ rule set ตัดสินได้จากงบจริงเท่านั้น** ผ่าน harness ตัวเดียวกัน.

## 4. ขั้นต่อไป — ตัวบล็อกคือข้อมูล ไม่ใช่โค้ด

1. **Loader งบรายปีจริง** → `AnnualRecord[]` (SET: งบการเงินจาก SETSMART/56-1; หรือ EODHD/สากล) รวมบริษัทที่ถูก delist กัน survivorship bias
2. รัน `benchmark(cases, verdictPredictor())` และ `benchmark(cases, verdictPredictor(policy, ["at-risk","watch"]))` — รายงาน precision/recall/BA ต่อปี ต่อ sector; base rate การตัดปันผลอยู่หลักไม่กี่ % นอกวิกฤต ต้องดู recall ไม่ใช่ accuracy
3. ถ้า `adequateModelFound=false` ต่อ `payout>1` → ใช้ `payout>1` + stability gate เป็น product ไปเลย (ระบบที่ง่ายกว่าและชนะคือระบบที่ถูก)
4. Ranking ของ portfolio ต้องผ่าน deflated Sharpe (ยังไม่ได้ implement) ก่อนอ้างผลตอบแทนใด ๆ
5. FlowDPO-style error mining (บันทึกก่อนหน้า ข้อ 4) เฉพาะเมื่อข้อ 2 ผ่านและมี error ที่ verdict `sustain` 8/8 แล้วตัดจริงมากพอ

## 5. ข้อจำกัดที่ต้องพูดกับผู้ใช้เสมอ

- ผลใน §1 เป็นตลาดสหรัฐ/ออสเตรเลีย/จีนเป็นหลัก; SET มีโครงสร้าง (family-controlled, payout สูงตามวัฒนธรรม) ที่อาจย้ายเกณฑ์
- Altman/Beneish ใช้กับธนาคารและประกันไม่ได้ (งบต่างโครงสร้าง) — ต้อง policy แยก sector
- "sustain" หมายถึง *ไม่พบเหตุให้เชื่อว่าจะตัดปันผลปีหน้าจากงบที่มี* ไม่ใช่คำแนะนำซื้อ และไม่พูดถึงราคาเลย
