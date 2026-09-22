# SET Sniper — ปรับใช้ Blueprint "ICT × Order Flow × AI Orchestration" บนแพลตฟอร์ม

> ต้นทาง: เอกสาร "SET Alpha-X / SET Sniper System" (ICT + Order Flow + Volume Profile + Circuit Breaker + Sector Rotation + Lead-Lag)
> สถานะ: โมดูลเต็มรูปที่แท็บ **Alpha & ความเสี่ยง → SET Sniper (ICT × Flow)** — API `GET /api/sniper`
> หลักการเดียวกับทั้งแพลตฟอร์ม: **ทุกชั้นต้องบอกความจริงของข้อมูลตัวเอง — สิ่งที่เป็น proxy ติดป้าย proxy สิ่งที่ยังไม่มีข้อมูลปิดไปพร้อมเหตุผล**

---

## 1. แผนที่ Blueprint → เอนจิน (อะไรถูกปรับใช้ที่ไหน)

| ชั้นในเอกสารต้นทาง | เอนจินจริงในระบบ | ข้อมูลที่ใช้ | สถานะ |
|---|---|---|---|
| STEP 1: ICT — Location (PDH/PDL, Key Levels) | `src/lib/sniper/structure.ts` → `keyLevels()` | OHLC รายวัน (RawDaily.open/high/low) | ✅ เต็มรูป |
| Liquidity Sweep (แทงทะลุ swing แล้วปิดกลับ) | `structure.ts` → `detectSweeps()` (5-แท่ง fractal + reclaim) | OHLC รายวัน | ✅ เต็มรูป (เวอร์ชันรายวัน) |
| FVG (Fair Value Gap) 3 แท่ง + mitigation | `structure.ts` → `detectFvgs()` | OHLC รายวัน | ✅ เต็มรูป |
| STEP 2: Volume Profile — POC / Value Area / HVN-LVN | `src/lib/sniper/value.ts` | มูลค่าซื้อขายรายวันถ่วงราคาแท่ง (60 แท่ง) | ⚠️ DAILY PROXY |
| STEP 3: Order Flow — Absorption / Delta | `src/lib/sniper/flow.ts` (effort-vs-result: valZ สูง + body สั้น + close แข็งแรง) | val + OHLC รายวัน | ⚠️ DAILY PROXY |
| Checklist 3 ชั้น (Location × Value × Behavior) | `src/lib/sniper/confluence.ts` — น้ำหนักลงทะเบียน 40/30/30 | ทั้งสามชั้น | ✅ เต็มรูป |
| Sector Rotation "จับผู้นำก่อนผู้ตาม" | `src/lib/sniper/rotation.ts` (ret20/ret60 + เงินไหล 5v20 + อันดับเร่ง) | RawDaily ทุกตัว + SymbolMeta | ⚠️ รายวัน (ไม่ใช่ GNN) |
| Derivative Lead-Lag (futures เป็นเรดาร์) | `src/lib/sniper/leadlag.ts` (lag-correlation 1–5 วันของ SPX/USDTHB/GOLD vs ตลาดไทย) | CrossAsset | ⚠️ PROXY (ไม่ใช่ Granger เต็ม) |
| Circuit Breaker 3 ระดับ | `src/lib/sniper/breaker.ts` | Trade paper log + Position + DQ + ตลาดวันเดียว | ✅ เต็มรูป (โหมด "แนะนำ") |
| Morning Brief / One-Glance Dashboard | การ์ด Daily Brief บนแท็บ + `/api/sniper` | รวมทุกชั้น | ✅ เต็มรูป |
| AI Orchestration (Skills 01–20 ทำเป็น pipeline) | ระบบมีอยู่แล้วในรูปของตัวเอง: Jev brain + Evidence Board + Shadow Lab + GTAA Macro Gate | — | ♻️ ใช้ของเดิมที่พิสูจน์แล้ว |
| Ghost Wall / Iceberg / Block Trade window / Delta แท้ / Sentiment Pantip | — | ต้องมี tick + Level-2 + social data | 🔒 ยังไม่เปิด (ดู §4) |

## 2. เกณฑ์ที่ลงทะเบียนล่วงหน้า (ไม่มีพารามิเตอร์แอบแฝง)

**Confluence 3 ชั้น** (คะแนน 0–100 ต่อชั้น, รวม = 0.40·Location + 0.30·Value + 0.30·Behavior):

- **Location** — sweep ใน 8 แท่งล่าสุด +30 · ราคาชิด Key Level (±2%) +25 · ติดโซน FVG ที่ยังไม่ mitigate +25 · ติดเลขสวย (±1%) +10
- **Value** — อยู่ใน Value Area +55 / เหนือ VA +40 / ใต้ VA +20 · ราคาใกล้ POC (±1.5%) +20 · ใกล้ HVN (±2%) +15 · ใกล้ LVN +10
- **Behavior** — absorption proxy (effort ≥1σ + body <35% + ปิดแข็งฝั่งใดฝั่งหนึ่ง) 60% + ความตื่นตัววอลุ่ม 40%
- **verdict**: รวม ≥ 65 = "สูง" · ≥ 45 = "กลาง" · อื่น ๆ = "ต่ำ" — แถวไหนไม่มี OHLC แสดง "—" และถือว่าชั้นนั้น = 0 (honest)

**Circuit Breaker** (ตามตาราง Protocol ของเอกสาร):

| ระดับ | ทริกเกอร์ | การกระทำที่ระบบแนะนำ |
|---|---|---|
| 🟢 0 ปกติ | ไม่มีสัญญาณใด | เดินตาม Checklist รายวัน |
| 🟡 1 Caution | ตลาดวันเดียว ≤ −2% · ไม้ปิดล่าสุดรวม ≤ −1.5% · win rate 10 ไม้ < 40% (≥8 ไม้) | ลดขนาดไม้ใหม่ 50% + ยืนยันเองทุกคำสั่ง |
| 🔴 2 Danger | ตลาดวันเดียว ≤ −3% · ไม้ปิดล่าสุดรวม ≤ −2.5% · DQ flags ≥ 3 | หยุดเปิดไม้ใหม่ + ลาก trailing stop ให้ใกล้ราคา |
| 🔴 3 Emergency | ตลาดวันเดียว ≤ −5% | แนะนำ FLATTEN ALL ผ่าน **Human Gate** |

> ข้อแตกต่างจากเอกสารต้นทางที่ตั้งใจ: ระบบนี้**ไม่สั่งขายเอง** — ปรัชญา default-deny ของแพลตฟอร์ม ทุกคำสั่งเงินจริง/พอร์ตกระดาษผ่านมนุษย์เสมอ

## 3. โครงสร้างไฟล์ + การขยายข้อมูล

```
src/lib/sniper/
  types.ts       ทุก interface ของโมดูล
  structure.ts   keyLevels · detectSweeps · detectFvgs (OHLC closed-form)
  value.ts       Volume Profile รายวัน (POC/VA 70%/HVN/LVN)
  flow.ts        Absorption proxy (effort-vs-result)
  confluence.ts  ชั้นตัดสิน 3 ชั้น + เหตุผลภาษาไทยทุกคะแนน
  rotation.ts    Sector rotation + ผู้นำ/ผู้ตาม
  leadlag.ts     Lag-correlation ข้ามสินทรัพย์ (SPX/USDTHB/GOLD)
  breaker.ts     Circuit Breaker 3 ระดับ
  report.ts      ประกอบรายงาน (cache ตาม dataKey ของระบบ)
src/app/api/sniper/route.ts    GET รายงานทั้งชุด
src/components/platform/tabs/sniper-tab.tsx   แท็บ UI ทั้งหมด
```

**การขยายสกีมา:** `RawDaily` เพิ่มคอลัมน์ `open/high/low` (nullable) — CSV เดิมที่ไม่มีคอลัมน์เหล่านี้ ingest ได้ปกติ (คงค่าเดิมไม่ลบ), CSV ที่มี `open,high,low` จะเปิดชั้น ICT/Value เต็มรูปทันที · demo seed สร้าง OHLC deterministic (open มี gap ข้ามคืน + wick จาก |gauss|)

## 4. สิ่งที่ตั้งใจไม่ทำตอนนี้ (และเงื่อนไขที่จะเปิด)

| ชั้น | เหตุผลที่ยังไม่เปิด | เปิดเมื่อไหร่ |
|---|---|---|
| Delta แท้ / Footprint / DOM heatmap | ต้องมี tick-by-tick trade + bid/ask — ข้อมูลรายวันทำจริงไม่ได้ ทำ proxy แล้วเท่านั้น | ingest tick data จาก broker API (เช่น Streaming/Settrade WS) |
| Ghost Wall (spoofing) / Iceberg Hunter | ต้องเห็น order book แบบ snapshot ต่อเนื่อง | เก็บ L2 snapshots ลง DB ก่อน (ตารางใหม่) |
| Block Trade window (16:30–16:40) / Big Lot | ไม่มีข้อมูล block trade ใน RawDaily | เพิ่ม source block-deal log |
| Sentiment Pantip/Twitter + Insider pattern | ต้องดึง social data นอกระบบ + NLP | เมื่อมี egress เสถียร + เก็บ corpus |
| RL parameter tuning / Genetic strategy evolution | ขัดหลัก "ห้าม auto-optimize โดยไม่ผ่าน evidence" — ระบบใช้ walk-forward + Evidence Board + apply-verdict แทน | เปิดเป็น "แล็บเงา" ใน Shadow Lab เมื่อมี track record |

## 5. ข้อจำกัด (พูดตรง ๆ)

- **ทุกชั้นของโมดูลนี้เป็น DAILY PROXY** — แม่นกว่าการเดา แต่เทียบ footprint ระดับ tick ไม่ได้ โดยเฉพาะ Behavior (absorption) ที่อ่าน "ทิศทางหยาบ" ได้อย่างเดียว
- Volume Profile กระจายน้ำหนักแท่งละ 3 ถัง (low/mid/high) — ไม่ใช่ volume-at-price จริง
- Sweep/FVG บนแท่งรายวันมี noise สูงกว่า intraday — ใช้ร่วมกับชั้น Value/Behavior เสมอ อย่าตัดสินจากชั้นเดียว
- Lead-lag ใช้ correlation (ไม่ใช่ Granger causality เต็ม) — correlation ไม่ใช่เหตุ-ผล ห้ามใช้ตัวเลขเดียวตัดสิน
- ข้อมูล demo (seed) เป็น synthetic ทั้งหมด — ตัวเลขบนจอพิสูจน์ว่า "ท่อถูก" ไม่ใช่ "edge มีจริง" ต้อง ingest CSV OHLC จริงจาก AmiBroker/broker ก่อนใช้ตัดสินใจ

## 6. วิธีใช้ตามพิธีรายวัน (จาก Operational Checklist ของเอกสาร — ปรับเข้าระบบ)

| เวลา | ทำอะไร | ที่ไหน |
|---|---|---|
| ก่อนตลาดเปิด | อ่าน Daily Brief (regime + GTAA + ผู้นำกลุ่ม + lead-lag) | แท็บ Sniper → การ์ด Daily Brief |
| ก่อนตลาดเปิด | เช็ค Circuit Breaker — ถ้าเกิน Level 1 ปรับขนาดไม้ตามคำแนะนำ | การ์ด Circuit Breaker |
| ระหว่างวัน | ดู Confluence Checklist — เฉพาะแถว "สูง" ที่มีเหตุผลครบ 3 ชั้น | ตาราง Confluence (กด chevron อ่านเหตุผล) |
| ระหว่างวัน | จับจังหวะจากร่องรอย — sweep แท่งล่าสุด / FVG ยังไม่ mitigate | การ์ดร่องรอยโครงสร้าง |
| หลังปิดตลาด | บันทึกบทเรียน + ให้ label สัญญาณ | Shadow Lab (EdgeLabel — พิธี 5 นาที) |

> หลักคิดจากเอกสารที่ยึดทั้งระบบ: **ICT บอก "ตรงไหน" → Value บอก "ตลาดยอมรับราคาไหน" → Order Flow บอก "เกิดอะไรขึ้นจริง" → AI/ระบบช่วยกรอง noise และคุมอารมณ์** — สุดท้าย "Stop Predicting, Start Reacting" ยังต้องมีมนุษย์ยืนยันทุกคำสั่ง (Human Gate)
