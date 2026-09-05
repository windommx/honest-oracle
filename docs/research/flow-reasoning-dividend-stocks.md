# Flow Reasoning Models → หุ้นปันผล: เอาแนวคิดไหนมาใช้ได้ และแนวคิดไหน *ห้าม* เอามาใช้

บันทึกวิจัยตอบคำถาม *"ศึกษาแนวคิด Flow Reasoning Models แล้วนำมาปรับใช้กับหุ้นปันผลได้หรือไม่"*
ให้คะแนนตามหลักการของแพลตฟอร์ม (deterministic · นับซ้ำได้ · ไม่พิมพ์คะแนนปลอม ·
ดู [`docs/epistemology.md`](../epistemology.md)) ในแบบเดียวกับ
[`applicable-tech.md`](./applicable-tech.md)

**ต้นทาง**
- เปเปอร์: *Flow Reasoning Models: Turning Flows Into Efficient Recurrent Reasoners*
  (Helbling et al., 2026) — [arXiv:2606.29150](https://arxiv.org/abs/2606.29150) ·
  [สรุปโดย arXiviq](https://arxiviq.substack.com/p/flow-reasoning-models-scaling-reasoning)
- บันทึกที่ผู้ใช้ส่งมา: [katgpt-rs · Research 369 — Renoise-CE Self-Verifier](https://github.com/katopz/katgpt-rs/blob/develop/.research/369_Flow_Reasoning_Models_Renoise_CE_Self_Verifier.md)
  (เป็นบันทึก *ภายใน* ของโปรเจกต์ Rust นั้น — ส่วนที่อ้าง "Plan 108/222, Research 344/366"
  คือแผนของเขาเอง ไม่เกี่ยวกับเรา)

> **คำตอบสั้น:** เอามาใช้ได้ **หนึ่งส่วน** คือ *กลไกตรวจสอบตัวเองด้วยการรบกวนแล้วแก้ใหม่*
> (perturb → re-resolve → วัด drift) ใช้เป็น **ประตูความมั่นคงของคำตัดสิน "ปันผลปลอดภัย"**
> ไม่ใช่เครื่องทำนายราคา. ส่วนที่ **ห้าม** เอามาใช้ตรง ๆ คือสมมติฐานแกนของเปเปอร์ที่ว่า
> *"เสถียร = ถูก"* — จริงใน Sudoku เพราะมีเฉลยเดียวและกฎบังคับ แต่ **เท็จในตลาดหุ้น**
> ซึ่งโมเดลสามารถ "มั่นใจอย่างเสถียรและผิด" ได้ (spurious attractor) โดยไม่มีกฎอะไรผลักมันออกมา.

---

## TL;DR — ตารางถ่ายโอนแนวคิด

| # | แนวคิดในเปเปอร์ | ทำงานได้เพราะ (ใน Sudoku) | เทียบเท่าในหุ้นปันผล | โอน | Fit | Effort |
|---|---|---|---|---|---|---|
| 1 | **Renoise-CE self-verifier** — รบกวนคำตอบที่เสร็จแล้วกลับไปที่ `t≈0.4` แล้วแก้ใหม่ วัดว่าวิ่งกลับมาที่เดิมไหม | เฉลยถูกมีเพียงหนึ่ง กฎแถว/คอลัมน์/กล่องบังคับให้คำตอบผิดไม่เสถียร | **Verdict-stability gate**: รบกวนอินพุตงบการเงิน (EPS/FCF ±20 %, ลบ 1 ไตรมาส) `k=8` ครั้ง แล้วนับว่าคำตัดสิน "ปันผลยั่งยืน" กลับมาเหมือนเดิมกี่ครั้ง | ✅ *ในฐานะ fragility test* | ✅ | S–M |
| 2 | **Verify-and-restart** (test-time scaling) — ไม่ผ่านเกณฑ์ `τ` ก็ทิ้งแล้วเริ่มใหม่ | มี verifier ที่ AUROC ≈ 1.0 | **Refuse instead of score**: ถ้า verdict ไม่เสถียร → รายงานเป็น *avisaya* (Tier 4, ปฏิเสธ) ไม่ใช่ปรับคะแนนลง | ✅ | ✅ ตรงกับ epistemology | S |
| 3 | **Self-conditioning fixed point** — ป้อน output รอบก่อนกลับเป็นอินพุต วนจนนิ่ง | ปัญหาเป็น constraint satisfaction | Iterated coverage model: growth ↔ payout ↔ reinvestment วนหา fixed point ของ "อัตราจ่ายที่ยั่งยืน" (sustainable payout = ROE-consistent) | 🟡 มีอยู่แล้วในการเงินคลาสสิก (sustainable growth `g = ROE × (1−payout)`) — ได้แค่ *กรอบคิด* ไม่ใช่ของใหม่ | 🟡 | S |
| 4 | **Attractor landscape** — เฉลยอยู่ในแอ่งเสถียร error state เป็นแอ่งปลอม | ภูมิประเทศ *นิ่ง* (stationary) | ภูมิประเทศตลาด *เคลื่อน* (non-stationary, adversarial) — แอ่งปีนี้ไม่ใช่แอ่งปีหน้า | ❌ อุปมาเท่านั้น ห้ามนำมาอ้างว่ามี "แอ่งราคาที่ถูกต้อง" | 🔴 | — |
| 5 | **Flow DPO บน self-mined errors** — คู่ (ถูก, ผิด) จาก error ที่โมเดลมั่นใจ จำกัด loss ที่ช่องที่ต่างกัน | มี label เฉลยตรวจได้ทันที | **Dividend-cut ground truth**: หุ้นที่โมเดลว่า "ปลอดภัย" แล้วปีถัดมา *ตัดปันผล* = high-confidence error → คู่ preference จำกัดที่ *ratio ที่พลาด* (wrong-cell mask) | 🟡 เป็นไปได้ แต่ต้องมีโมเดลที่เทรนได้ + ข้อมูลย้อนหลัง 10 ปี+ | 🟡 | L |
| 6 | **ผลลัพธ์** 36 % → 99 % ใน Sudoku | โดเมนสังเคราะห์ปิด | ไม่มีหลักฐานใด ๆ ในโดเมนการเงิน | ❌ ห้ามอ้างตัวเลข | 🔴 | — |

**ลำดับที่ควรทำ:** 1 → 2 (ประตูความมั่นคง + ปฏิเสธ) เป็น deterministic ทั้งคู่ ไม่ต้องเทรนอะไร
และเข้ากับ "counts, not a verdict" ของ Rush ตรง ๆ. ข้อ 5 ทำ *ต่อเมื่อ* ข้อ 1–2 ผ่าน
validation harness ของ [`omnisim/validation.py`](../../omnisim/validation.py) ก่อน.

---

## 1. เปเปอร์ทำอะไรจริง ๆ (ย่อให้พอใช้ตัดสินใจ)

1. **โมเดล flow แบบ discrete** เติมช่องว่างของโครงสร้าง (Sudoku 9×9, Zebra, Maze) ในการ denoise ครั้งเดียว
2. **Self-conditioning**: เอา logits ของรอบก่อนป้อนกลับเป็น input channel วนซ้ำ
   `z_{j+1} = D̂_t(x, z_j)` จนนิ่ง → single-shot Sudoku ~38 % → 97.8 % (บันทึก katgpt-rs)
3. **Fixed-Point Forcing** — เทรนบน state ที่เกิดจาก inference ของตัวเอง แก้ exposure bias
4. **Renoise-CE verifier** (หัวใจของบันทึก 369): เอาคำตอบที่เสร็จแล้ว *ใส่ noise กลับ* ถึง `t=0.40`
   แล้วให้โมเดลแก้ใหม่ วัด cross-entropy ของคำตอบเดิมภายใต้ distribution ใหม่.
   คำตอบถูกจะ "ดูดกลับ" มาที่เดิม (drift ต่ำ) คำตอบผิดจะลอยหนี → AUROC ≈ 1.0
   โดย **ไม่ต้องมี verifier ภายนอก, ไม่ต้องมี label**
5. **Verify-and-restart**: สร้าง → ตรวจด้วย renoise-CE (`k=8` draws) → รับถ้า drift < τ ไม่งั้นเริ่มใหม่
   จนหมด budget → Sudoku-Extreme 10.7 % → 98.6 %
6. **FlowDPO**: preference pairs จาก error ที่ตัวเองมั่นใจ จำกัด loss เฉพาะช่องที่ผิด → pass@1 35.8 % → 80.6 %

ผลทั้งหมดอยู่ใน **ปริศนาสังเคราะห์ที่มีเฉลยเดียวและตรวจได้**. ไม่มีการทดลองด้าน
การเงิน / อนุกรมเวลา / ข้อมูลจริงที่มี noise ใด ๆ ในเปเปอร์.

## 2. ทำไม "เสถียร = ถูก" จึงพังในตลาดหุ้น

Renoise-CE ใช้ได้เพราะ **โครงสร้างของปัญหา** ไม่ใช่เพราะความฉลาดของโมเดล:

| เงื่อนไขที่ renoise-CE ต้องการ | Sudoku | งบการเงิน / ความยั่งยืนปันผล | ราคาหุ้น / จังหวะซื้อขาย |
|---|---|---|---|
| มีเฉลยเดียว (unique solution) | ✅ | 🟡 "จ่ายต่อได้ไหมปีหน้า" มีคำตอบเดียว *ย้อนหลัง* แต่ไม่ใช่ล่วงหน้า | ❌ |
| มีกฎบังคับที่ทำให้คำตอบผิด *ไม่เสถียร* | ✅ แถว/คอลัมน์/กล่อง | 🟡 มีบางส่วน: อัตลักษณ์บัญชี (cash flow reconciles, dividend ≤ FCF + cash − debt service) | ❌ ไม่มีกฎที่ผลักราคาผิดออก |
| ภูมิประเทศนิ่ง (stationary) | ✅ | 🟡 เปลี่ยนช้า (ตามวัฏจักร) | ❌ non-stationary, adversarial |
| ตรวจ ground truth ได้ทันที | ✅ | 🟡 ต้องรอ 1 ปี | 🟡 ต้องรอ + มี survivorship/look-ahead bias |

สรุป: มีโดเมนย่อยเดียวที่ *พอ* จะเข้าเงื่อนไข คือ **ความยั่งยืนของปันผล (dividend
sustainability)** ซึ่งเป็นปัญหา "กึ่ง constraint satisfaction" บนงบการเงิน. **การทำนายราคาหรือจังหวะ
ไม่เข้าเงื่อนไขข้อไหนเลย** และการอ้างว่าแนวคิดนี้ช่วยเรื่องนั้นได้จะเป็นการพิมพ์ *saññā* ในชุดของ *paccakkha*
— สิ่งที่แพลตฟอร์มนี้สร้างมาเพื่อไม่ทำ.

## 3. สิ่งที่โอนได้จริง: "Verdict-Stability Gate" สำหรับปันผล

ตีความ renoise-CE ใหม่ให้ตรงประเภทความรู้ของเรา: มันคือ **การทดสอบความเปราะบางของคำตัดสิน
(fragility test)** ไม่ใช่เครื่องพิสูจน์ความถูกต้อง. ผลลัพธ์ที่รายงานได้จึงเป็น *จำนวนครั้ง* (Tier 1)
และ *อัตราส่วนที่เปิดเผยสูตร* (Tier 2) เท่านั้น.

### 3.1 "ตาราง" ของหุ้นปันผล (เทียบกับกริด Sudoku)

ช่องในกริด = ตัวเลขที่ **นับซ้ำได้จากงบการเงิน** (ไม่ใช่ความเห็นนักวิเคราะห์):

| ช่อง | นิยาม (สูตรเปิดเผย) | กฎบังคับ (constraint) |
|---|---|---|
| `payout_eps` | DPS / EPS | ≤ 1.0 ต่อเนื่อง; > 1.0 สองปีติด = สัญญาณตัดปันผลชั้นเลิศ ([Equicurious](https://equicurious.com/learn/equities/equity-income-and-dividends/evaluating-payout-ratios-and-coverage)) |
| `payout_fcf` | Dividends paid / Free cash flow | ≤ 1.0; FCF coverage จับปัญหาก่อน EPS coverage ([Equicurious FCF](https://www.equicurious.com/learn/equities/equity-income-and-dividends/free-cash-flow-tests-dividend-safety)) |
| `cash_runway` | (Cash + FCF − debt due) / Dividends paid | ≥ 1 |
| `net_debt_ebitda` | Net debt / EBITDA | เกณฑ์ตามอุตสาหกรรม (เปิดเผยค่าที่ใช้) |
| `interest_cov` | EBIT / Interest | ≥ เกณฑ์ที่เปิดเผย |
| `streak` | จำนวนปีที่ DPS ไม่ลด | นับตรง ๆ |
| `eps_vol` | std(EPS growth, 5 ปี) | ใช้เป็นขนาด noise ในข้อ 3.2 (ไม่ใช่ `t=0.40` ของเปเปอร์ — schedule นั้นเป็นของ flow model โดยเฉพาะ) |

คำตัดสิน `V ∈ {sustain, at-risk}` = ฟังก์ชัน deterministic ของช่องเหล่านี้ (rule set ที่เปิดเผยทั้งหมด)
หรือโมเดล logistic ที่ *fit บน train เท่านั้น* — งานวิจัยที่ใช้ logistic บน payout/coverage
รายงาน AUC > 0.75 ([arXiv:2404.16169](https://arxiv.org/html/2404.16169v1) ในบริบทใกล้เคียง)
ซึ่งเป็นเพดานที่ *ต่ำกว่า Sudoku มาก* และต้องบอกผู้ใช้ตรง ๆ.

### 3.2 อัลกอริทึม (พร้อมลงมือ, deterministic, seed คงที่)

```
input : cells c (ตารางข้อ 3.1), verdict fn V(c) -> {sustain, at-risk}
        k = 8 perturbation draws, seed s, threshold τ (เปิดเผย)
        noise schedule per cell: EPS ~ ±eps_vol, FCF ~ ±eps_vol×1.5,
                                 drop 1 quarter (mask), debt ±10 %
v0 = V(c)
agree = 0
for i in 1..k:
    c_i  = perturb(c, seed = s+i)          # renoise
    v_i  = V(c_i)                          # re-resolve ด้วย *ตัวเดียวกัน*
    agree += (v_i == v0)                   # drift วัดเป็น disagreement count
stability = agree / k                      # Tier 2: อัตราส่วนจากการนับ
report:
    "verdict v0 held under {agree}/{k} perturbations (schedule: …)"   # Tier 1 count
    if stability < τ:  -> avisaya  ("เครื่องมือนี้ตอบไม่ได้สำหรับหุ้นตัวนี้")   # ไม่พิมพ์คะแนน
```

สิ่งที่ **ต่างจากเปเปอร์อย่างตั้งใจ**:
- drift ไม่ใช่ cross-entropy บน logits แต่คือ *จำนวนครั้งที่ verdict พลิก* — เพราะเราต้องการ Tier 1
  ที่ผู้ใช้นับซ้ำได้เอง ไม่ใช่ตัวเลขทศนิยมที่ต้องเชื่อ
- verify-and-restart กลายเป็น **verify-and-refuse**: ไม่ผ่านก็ปฏิเสธ ไม่ "restart" หาคำตอบใหม่
  (การ restart จนกว่าจะเสถียรในตลาดคือ p-hacking ในเสื้อคลุมใหม่)
- ไม่มี `t=0.40`: ขนาด noise ผูกกับความผันผวนย้อนหลังของบริษัทนั้นเอง (`eps_vol`) — บันทึก
  katgpt-rs เองก็เตือนว่า schedule ต้องปรับตามโดเมน

### 3.3 สิ่งที่ *ได้* จากการโอนนี้ (เทียบกับ sensitivity analysis ธรรมดา)

ตรง ๆ คือมัน *เป็น* Monte-Carlo sensitivity analysis — ของที่นักวิเคราะห์ทำมานาน. สิ่งที่แนวคิด FRM
เพิ่มให้คือ **การใช้ความเสถียรเป็นเกณฑ์คัดเลือก/ปฏิเสธ** (selection gate) แทนที่จะรายงานเป็น
error bar ที่คนอ่านข้าม และการเขียนมันเป็น *ประตูอัตโนมัติ* ที่โมเดลต้องผ่านก่อนจะได้พูด.
ไม่มากกว่านั้น — และควรพูดกับผู้ใช้แบบนั้น.

## 4. ข้อ 5 (FlowDPO) — ทำได้ แต่เป็นงานใหญ่และต้องผ่านด่านก่อน

แนวคิด "ขุด error ที่โมเดลมั่นใจ แล้วสร้างคู่ preference จำกัดที่ช่องที่ผิด" แปลเป็นการเงินได้สวย:

- **ground truth** = เหตุการณ์ตัดปันผลจริง (dividend cut / omission) ปี t+1
- **high-confidence error** = หุ้นที่ verdict `sustain` เสถียร 8/8 แล้ว *ตัดปันผล* — นี่คือ
  spurious attractor ของจริง และเป็นข้อมูลที่มีค่าที่สุด
- **wrong-cell mask** = ratio ตัวไหนที่ "หลอก" ระบบ (มักเป็น EPS ดีแต่ FCF แย่ หรือหนี้ครบกำหนด)
- **DPO pair builder** มีอยู่แล้วใน [`omnisim/dpo_builder.py`](../../omnisim/dpo_builder.py)
  (direction-explicit: `prefer="stable"` ↔ ไม่ตัดปันผล) — reuse ได้ตรง ๆ ในระดับ data pipeline

แต่:
- ต้องมีโมเดลที่เทรนได้ (ตอนนี้ verdict fn เป็น rule set / logistic) และข้อมูลย้อนหลัง 10 ปี+
  หลายตลาด รวมหุ้นที่ถูก delist (กัน survivorship bias)
- base rate ของการตัดปันผลต่ำ (หลักไม่กี่ % ต่อปี นอกวิกฤต) → class imbalance, ต้องรายงาน
  precision/recall ไม่ใช่ accuracy
- **ด่านที่ต้องผ่านก่อน**: verdict fn ธรรมดาต้อง *ชนะ baseline* บน held-out ปีที่ไม่เห็นตอน fit
  ด้วย [`omnisim/validation.py`](../../omnisim/validation.py) (persistence = "จ่ายเท่าปีก่อน",
  rule เดียว = `payout_fcf > 1`) และผ่าน `benchmark_significance` — ถ้าได้ `adequate_model_found=False`
  ก็หยุดตรงนั้น ไม่มีอะไรจะเทรน

## 5. สิ่งที่ห้ามทำ (เพื่อไม่ให้ผิดสัญญา epistemology)

- ❌ พิมพ์ "Dividend Safety Score 82/100" — คะแนน Tier 4 ในชุด Tier 1 ตัวเดียวกับที่คู่แข่งด้านนิยายทำ
- ❌ ใช้ "attractor landscape" เป็น narrative ว่ามี "ราคาที่ถูกต้อง" ที่ตลาดจะวิ่งกลับไป
- ❌ อ้างตัวเลข 36 % → 99 % จากเปเปอร์ในบริบทการเงิน
- ❌ restart จนกว่าจะเสถียร (ข้อ 3.2) — ในตลาดนี่คือ multiple-testing bias
- ❌ ให้ LLM เป็น verdict fn โดยไม่เปิดเผยกฎ — ผลจะไม่ reproducible จึงไม่ใช่ Tier 2

## 6. ที่อยู่ในโค้ดถ้าจะทำ

| ชิ้น | ที่ | หมายเหตุ |
|---|---|---|
| Cells + verdict rule set (pure fn, ทดสอบด้วย vitest) | `lib/dividend/cells.ts`, `lib/dividend/verdict.ts` | ยังไม่มีโค้ดหุ้น/ปันผลใน repo เลย — เป็น track ใหม่ ไม่ใช่ส่วนของ Rush Engine หรือ Honest Oracle |
| Stability gate (ข้อ 3.2) | `lib/dividend/stability-gate.ts` | seeded PRNG แบบเดียวกับ `mulberry32` ใน `lib/honest-oracle/engine.ts` |
| Tier tagging ของทุก signal | reuse `lib/rush-engine/epistemics.ts` | นับ = Tier 1, stability ratio = Tier 2, avisaya เมื่อต่ำกว่า τ |
| Backtest / baseline / significance | `omnisim/validation.py` + loader ใหม่สำหรับ annual dividend series | ต้องมีข้อมูลจริงก่อน — Stage 2 ของ harness ยังว่างอยู่ |
| Error mining → DPO pairs (ข้อ 4) | `omnisim/dpo_builder.py` | ทำหลังผ่าน validation เท่านั้น |

**Effort รวมสำหรับข้อ 1–2 (ไม่รวมข้อมูล):** S–M — pure functions + tests หนึ่งวัน.
**ตัวบล็อกจริง:** ข้อมูลงบการเงินย้อนหลังที่สะอาด ไม่ใช่อัลกอริทึม.

---

*Web-sourced September 2026 — ลิงก์อยู่ที่แต่ละข้อ; ตรวจซ้ำก่อนลงแรง.*
