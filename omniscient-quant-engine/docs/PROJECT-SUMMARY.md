# Omniscient Quant Engine — สรุปโปรเจกต์ (สถาปัตยกรรม · ไทม์ไลน์ · ผลลัพธ์ · การบูรณะ)

จัดทำ 28 ก.ย. 2569 จาก workspace ต้นฉบับที่อัปโหลด (`workspace-bfbb4bbb-….tar`) — git repository ของโปรเจกต์บน container ของ z.ai (path `/home/z/my-project`, ผู้ commit `Z User <z@container>`, 8 commit ระหว่าง 27–28 ก.ย. 2569, HEAD `a3d421b`) พร้อม `worklog.md` 328 บรรทัดที่บันทึกทุก task

---

## 1. โปรเจกต์นี้คืออะไร

**เป้าหมาย (จากหัว worklog):** สร้าง SaaS "Omniscient Quant Engine" — Full-Cycle Multi-View Quant Platform 7 ชั้น (L0 Data/PIT QC → L1 Single-View → L2 Dependence Manifold → L3 Multi-View Factor Integration → L4 Prediction → L5 Risk/Sizing → L6 5-Gate Execution + Journal) พร้อมเอนจินตัดสินใจแบบ convergent-evidence, walk-forward backtest, gate attribution และ LLM audit loop — เป็นเว็บหน้าเดียว (`/`) ภาษาไทย บน Next.js 16 + Prisma/SQLite + shadcn/ui

**หลักการที่ยึดทั้งระบบ:**
- **Convergent evidence** — สัญญาณเกิดเมื่อหลักฐานหลายสายบรรจบ (5 gates · 13 evidence strands) ไม่ใช่ตัวชี้วัดเดี่ยว
- **Point-in-time** — งบการเงิน join ด้วย `announceDate` (ประกาศจริง = สิ้นงวด + 45 วัน) กัน look-ahead bias
- **Out-of-sample เท่านั้นที่นับ** — walk-forward แบบ purged + embargo 5 วัน; metrics ขั้นสูง (Sortino/Calmar/PF/expectancy) ยึดจาก walk-forward
- **Risk of Ruin ก่อนผลตอบแทน** — Monte Carlo ruin, defense-in-depth 5 ชั้น, Kelly-Vol sizing ที่มี edgeGuard, Risk MDX 7 มิติสั่งลด/ห้ามเปิดไม้
- **โมเดลต้องรู้ว่าตัวเองตายเมื่อไหร่** — death conditions 5 ข้อ + model registry (ACTIVE/PROBATION/DEAD)
- **LLM เรียบเรียง ไม่ตัดสินใจ** — ทุก prompt ล็อกกับ evidence JSON ที่ระบบคำนวณแล้ว; MIXED ต้องปฏิเสธการลงมือ
- **ป้ายความจริงของข้อมูล** — ข้อมูลจำลอง (seed 20250902) ติดป้าย "จำลองเพื่อสาธิต · ไม่ใช่คำแนะนำการลงทุน" ทุกหน้า

**ขนาดของโค้ด (ไม่รวม shadcn/ui):** TypeScript ~15,500 บรรทัด — engine ~4,500 (`src/lib/quant/**`), UI ~9,000 (`components/**`, `app/page.tsx`), API 15 เส้น

**Stack:** Next.js 16.1 · React 19 · TypeScript 5 · Prisma 6 (SQLite `db/custom.db`) · Tailwind 4 · shadcn/ui · Recharts · Bun · `z-ai-web-dev-sdk` (LLM ของต้นฉบับ)

---

## 2. โครงสร้างระบบ

### 2.1 มุมมอง 20 มุมมอง (จาก `src/app/page.tsx`) — ขอบเขตหุ้นไทย (SET/mai) เท่านั้น

| กลุ่ม | มุมมอง |
|---|---|
| ศูนย์ควบคุม | **Command Center** (หน้าแรก) · **กระบวนการทำงาน** (Task 23: วงจรประจำวัน — ข้อมูล → ล็อกกติกา → สัญญาณ → บันทึกลง Journal ก่อนตลาดเปิด → โบรกเกอร์กระดาษ → หลักฐาน forward เทียบการเล่นซ้ำย้อนหลัง · ตัวตั้งเวลา `OQE_CYCLE_AUTO` + `scripts/daily-cycle.ts`) · **Terminal** (Market Intelligence: watchlist + กราฟเทียน + AI panel) |
| จักรวาลหลัก | ภาพรวม (KPI + Signal of the Day + 7-Layer map + Decision Board 22 ตัว) · **หลอมรวม** (synthesis 13 สาย) · **Deep Research** (Task 19: รายงานเชิงลึกรายหุ้น 12 หัวข้อจากทุกชั้น รวมจังหวะของหุ้น + Markdown/PDF + เรียบเรียงด้วย LLM) |
| วิเคราะห์ | Multi-View (factors F1–F4, variance decomposition, enrichment, bipartite, volcano, PCA, trajectories) · Dependence (Θ chart, KDE, 22×22 Θ heatmap, decouple) · Decision (5-Gate checklist + trade plan + gate ribbon) · **เงินไหลนักลงทุน** (Task 18: SET 4 ประเภทนักลงทุน · NVDR + short sale รายหุ้น · Flow Index 6/36 เดือน) · **จังหวะตลาด** (Task 20: หุ้นเคลื่อนพร้อมกัน + breadth · ฤดูกาลวัน×เดือน + FDR · สัดส่วนมูลค่ารายหมวด + N_eff · แผนที่วัน PCA + k-means · ด่านที่บล็อกสัญญาณรายเดือน) |
| ความเสี่ยง | Risk & Sizing (CVaR calculator, MC histogram, L-VaR, circuit breakers) · **Meta-Risk (L∞)** · **Apex (L7)** |
| MY LAB | Backtest & Journal (metrics + equity + attribution + calibration + CRUD) · **Atlas พฤติกรรมระบบ** (Task 22: วิจัยเอนจินแบบ 360° 6 มุม — แผนที่สถานะตลาด · จังหวะเวลา · สัญญาณพร้อมกัน · ส่วนผสมกำไร/ขาดทุน · ไม้เริ่ม/จบ + กติกาออกทางเลือก · AUC + ปรับคันโยก walk-forward · ข้อเสนอจากผลที่ผ่าน q < 0.1 เท่านั้น) · **เป้าหมายชนะ 80%** (Task 24: กริดกติกาออก 252 แบบเทียบการสุ่มเข้าที่ใช้กติกาออกเดียวกัน · ช่วงค้นหา/ช่วงทดสอบ + embargo · cluster-robust t + BH-FDR · จำนวนไม้ forward ที่ต้องใช้ · แผน 6 ขั้นพร้อมสถานะ) · **ทดสอบเดินหน้า (Walk-forward)** (Task 25: แนวคิด PyBroker — หน้าต่าง train → test · 4 วิธีเลือกกติกาออกรวม SL/TP จาก MAE/MFE · เทียบการสุ่มเข้า · bootstrap · ตารางไม้ + MAE/MFE · กับดัก 9 ข้อ · ส่ง CSV + สคริปต์ให้ PyBroker ตรวจซ้ำ) · **สแกน Neotic 3D** (Task 26: ชุดสัญญาณที่สองจาก scanner ของผู้ใช้ — RS Rank ตัดขวาง · โซน B · กำไรโต QoQ/YoY ตามวันประกาศ · ปริมาณ ≥ 2.5× · กรวยเงื่อนไข · ความพร้อมของข้อมูล · ผลเทียบการสุ่มเข้า · เดินหน้าจูน 4 เกณฑ์ · MAE/MFE · สะพาน PyBroker) · AI Auditor |

### 2.2 API 15 เส้น ณ Task 15 (App Router, ไม่ใช้ server action) — เส้นที่เพิ่มภายหลัง (rules, data, audit-log, meta, research, flows) ดูตาราง API ใน README

`/api/health` (ใหม่) · `/api` · `/api/system` · `/api/board` · `/api/decision/[symbol]` · `/api/analytics/factors` · `/api/analytics/dependence` · `/api/backtest` · `/api/journal` · `/api/audit` · `/api/synthesis/[symbol]` · `/api/meta-risk/[symbol]` · `/api/apex/[symbol]` · `/api/market/quotes` · `/api/market/series/[symbol]` · `/api/analyst/[symbol]`

### 2.3 ฐานข้อมูล 7 model (Prisma) และจำนวนแถวใน snapshot ที่แนบมา

| model | หน้าที่ | แถว |
|---|---|---|
| Stock | 22 หุ้น (symbol, sector, theme, beta) | 22 |
| Price | OHLCV รายวัน | 16,500 |
| FundFlow | net flow รายวัน (ล้านบาท) | 16,500 |
| Fundamental | งบ PIT (announceDate, period, pe/pb/roe/de/revG/profit) | 198 |
| JournalEntry | trade journal (แผน/สถานะ/P&L) | 4 |
| SynthesisReport | รายงานหลอมรวม append-only (strands + dossier + narrative) | 4 |
| AuditReport | รายงาน LLM auditor | 1 |

`.env` ต้นฉบับมีตัวแปรเดียวคือ `DATABASE_URL` (path absolute ใน container) → แทนด้วย `.env.example`

---

## 3. ไทม์ไลน์การพัฒนา (8 commit, เวลา UTC)

commit message ทุกอันเป็น UUID ที่แพลตฟอร์มสร้างอัตโนมัติ เนื้องานอ่านจาก `worklog.md`

| # | เวลา | commit | งานที่ทำ (Task ใน worklog) |
|---|---|---|---|
| 1 | 09-27 21:35 | `d52da61` | Initial commit ของ template z.ai |
| 2 | 09-27 23:50 | `8ab3e57` | **Task 0 → 1-4 → 6-a → 6-b/7/8:** schema 6 model, quant core (rng/stats/market), engine ทั้ง 7 ชั้น, API 8 เส้น, chart 7 ตัว, หน้า 7 แท็บ, AI Auditor, E2E ผ่าน agent browser |
| 3 | 09-28 01:00 | `141ba52` | **Task 9:** หลอมรวม — synthesis 11 สาย + SynthesisReport + `/api/synthesis` + แท็บที่ 8 |
| 4 | 09-28 01:35 | `044ffb4` | **Task 10:** Meta-Risk L∞ — ruin math, MC risk of ruin, defense 5 ชั้น, reflexivity, death conditions, checklist 12 ข้อ + metrics Sortino/Calmar/PF/expectancy |
| 5 | 09-28 02:42 | `d2e64dc` | **Task 11 (+11-b):** Apex L7 — Kelly-Vol sizing, microstructure (CLV/Roll/Amihud/mirage/exit complexity/Knight), crisis MC 6 สถานการณ์, model registry 11 โมเดล; synthesis 11 → 13 สาย |
| 6 | 09-28 04:30 | `3881f94` | **Task 12 (+3-a/3-b/3-c):** Market Intelligence Terminal — engine/terminal.ts, `/api/market/*`, `/api/analyst`, sidebar/topbar/chips/watchlist/price-chart/ai-panel, page.tsx เป็น shell ใหม่ + ⌘K |
| 7 | 09-28 05:48 | `76012d6` | **Task 13 (+13-a/13-b):** Design system "Institutional Quant Terminal" (primitives 11 ตัว, globals.css) + **Command Center** เป็นหน้าแรก; แก้ bug สเกล marketChg1d |
| 8 | 09-28 07:15 | `a3d421b` | **Task 14:** Risk MDX 7 มิติ (LIQUIDITY/BEHAVIORAL เน้น) + Antifragility Index ใน Meta-Risk = **HEAD** |

รูปแบบการทำงาน: orchestrator แตกงานให้ sub-agent (frontend-styling-expert) ขนาน ทุกตัวเขียน Work Log + Stage Summary ลง `worklog.md` และตรวจด้วย tsc / eslint / agent-browser (desktop 1440 + mobile 390) ทุกครั้ง

---

## 4. รายละเอียดแต่ละชั้น

### L0 ข้อมูล (`market.ts`, `engine/panel.ts`)
- generator deterministic (mulberry32 + Box-Muller + Student-t) 22 หุ้น × 750 วัน: SET index proxy ตาม regime script (SIDEWAYS → CRISIS → RECOVERY → BULL → CRISIS → RECOVERY → BULL), sector factor + idiosyncratic + fat-tail jumps, TSE "Solar Big-Lot" story event ที่ 82% ของไทม์ไลน์, OHLCV, งบ PIT รายไตรมาส, fund flows
- panel ในหน่วยความจำ (cache ตาม data version): ret5/21, vol21, RSI14, volRatio, OBV slope, distHigh, ma20Gap, flow5, Θ (Clayton จาก Kendall τ หน้าต่าง 60 วัน) + thetaZ (120 วัน) + LTD + decouple flag, z-score ตัดขวางทุกฟีเจอร์, market factors F_stress / F_momentum / F_flow
- seed ลง DB อัตโนมัติเมื่อ API แรกถูกเรียก (`ensureSeeded`) · วันที่ของ series/terminal anchor กับวันสุดท้ายใน DB (bug ที่ Task 12 พบและแก้)

### L2/L3 วิเคราะห์ (`factors.ts`, `volcano.ts`, `api.ts`)
- PCA (Jacobi) 4 factors ตั้งชื่อจาก anchor (Market Beta/Momentum, Risk/Stress, Flow/Recovery, Value) + "Idiosyncratic Story" จาก concentration, variance decomposition ต่อมุมมอง, hypergeometric enrichment + Jaccard dedup, bipartite hubs, PCA outliers
- volcano: 22 หุ้น × 16 ฟีเจอร์ = 352 จุด (MWU risk-on vs risk-off, BH-FDR q, Cohen's d)
- Θ matrix 22×22 + PSI drift ต่อหุ้น

### L4/L5 ทำนาย + ความเสี่ยง (`backtest.ts`, `risk.ts`)
- walk-forward: train 252 → embargo 5 → test 21, logistic regression (GD) → P(up 1d), signal = ทุก gate ผ่าน && P > 0.55; gate attribution = MWU ของ forward return เมื่อ gate ผ่าน vs ตก → SPEAKS_TRUTH / NOISE / INSUFFICIENT; calibration buckets; metrics hit rate, Sharpe, MaxDD, Sortino, Calmar, PF, expectancy
- risk: Monte Carlo Student-t(4) 20,000 paths → VaR95/99, CVaR97.5, hard stop (99% 1-day loss), structural stop (swing low), size = RiskBudget / CVaR

### L6 5 Gates (`gates.ts`)
G1 Regime (F_stress < 0.8 + momentum slope 42d) · G2 Dependence (decoupled หรือ LTD < 0.35) · G3 Technical (Wyckoff-lite phase ≥ 4 + volume confirm + ไม่มี OBV divergence) · G4 Risk (size ≥ 8%) · G5 Execution (RSI ≤ 80) → ENTRY_PULLBACK (ผ่านครบ) / ENTRY_MOMENTUM (ผ่าน G1–G4 + breakout 20d high + OBV) / NO_TRADE พร้อม trade plan (entry zone, trigger, stops, size, CVaR, kill switch, เหตุผลไทยทุก gate)

### หลอมรวม (`synthesis.ts`)
13 สาย: G1 REGIME .9 · G2 DEPENDENCE .7 · G3 TECHNICAL .9 · G4 RISK .6 · G5 EXECUTION .4 · ML_PROB .8 · FLOW .6 · VALUATION .5 · FACTOR · FUNDAMENTAL · HUB .3 · REFLEXIVITY .65 · MICROSTRUCTURE .55 — น้ำหนักหั่นครึ่งถ้า gate ไม่ SPEAKS_TRUTH ใน attribution → คะแนน −100…+100 + agreement → STRONG_LONG ≥ 55 & agree ≥ .6 / LEAN_LONG ≥ 25 / MIXED / LEAN_SHORT / STRONG_SHORT + strength/weakness top-3, kill switches, roadmap, `renderReport()` plain text

### Meta-Risk L∞ (`meta-risk.ts`, `mdx.ts`)
recoveryNeeded (−50% → +100%) + ruin table · simRuin MC 3,000 paths × 48 ไม้/ปี fixed vs drawdown-scaled · defense 5 ชั้น · reflexivity 5 เฟส · death conditions 5 · checklist 12 · absorbing barrier · **Risk MDX 7 มิติ** (MARKET .12, LIQUIDITY .20, BEHAVIORAL .18, MODEL .15, CONCENTRATION .12, TAIL .15, EXECUTION .08 → composite + override OK < 50 / HALF 50–74 / ZERO ≥ 75) · **Antifragility Index** 5 องค์ประกอบ

### Apex L7 (`apex.ts`, `micro.ts`)
Kelly-Vol sizing (f* = p − (1−p)/R จาก walk-forward, ครึ่ง Kelly, vol target 20%, DD throttle, Knight haircut, edgeGuard) → ขนาดสุดท้าย = min(Kelly, CVaR budget, 25%) **× คำสั่ง Risk MDX** (เพิ่มในรอบบูรณะ) · microstructure (CLV, Roll spread, Amihud, big-lot, volume mirage, exit complexity 0–100, slippage, Knight RISK/UNCERTAINTY) · crisis stress test 6 สถานการณ์ (GAP −5/−8/−12, DROUGHT, CRASH_20 MC 1,200 paths, REFLEX) → survival 0–100 · model registry 11 โมเดล · execution adapter

### Terminal + Command Center (`terminal.ts`, `components/terminal/*`, `components/dashboard/*`)
quotes 22 ตัว (sparkline 30 จุด), series 1D/1W + EMA/SMA/BB/Donchian/VWAP/MACD + swing pivots + S/R 90 วัน, AI panel (แผน 5 gates + indicators + brief กฎเกณฑ์ + synthesis ล่าสุด + แชท LLM), Command Center (hero regime + 3 gauges + breadth, สุขภาพเอนจิน 6 KPI, quick pick + กราฟ, โอกาสวันนี้, equity curve, sector heat)

---

## 5. ตัวเลขผลลัพธ์ที่ worklog บันทึกไว้ (ข้อมูลจำลอง seed 20250902)

| หัวข้อ | ผลที่บันทึก |
|---|---|
| Backtest walk-forward | 73 สัญญาณ · hit rate 61.6% · Sharpe 0.73 · G1 edge +0.294 (p ≈ 0) SPEAKS_TRUTH · G3 edge +0.105 (p 0.045) |
| Factors | F2 = Idiosyncratic Story (TSE 22.4%) · volcano 163 significant / 352 · PCA outliers TSE + ADVANC |
| หลอมรวม | TSE MIXED +6 → +14 (13 สาย) · INTUCH LEAN_LONG +36 → +39 · SCB LEAN_LONG +45 (decoupled, ทุก gate ผ่าน) |
| Meta-Risk | SCB P(ruin50) 0% · Sortino 1.19 / Calmar 0.95 / PF 1.56 / expectancy +1.107% · checklist 10/12 · TSE MDX 43 (LIQUIDITY 60, EXECUTION 72) · SCB MDX 32 · AF 95 ANTIFRAGILE |
| Apex | SCB spread 0 bps · exit 0/100 · slippage 0.013% · CVaR จำกัดที่ 12.7% · survival 100 · TSE spread 252 bps · exit 40/100 · slippage 1.286% · final 5.0% · registry 6 ACTIVE / 1 PROBATION / 4 DEAD · systemHealth 52–55 |
| AI Auditor (LLM จริงบน z.ai) | root cause = gate noise G2/G4/G5 · riskAdjustment 0.7 · confidence 0.8 |
| สแกน Neotic 3D (Task 26) | ข้อมูลสาธิตไม่มีสัญญาณเลย: วัน-หุ้น 10,956 → RS ≥ 80 2,490 → โซน B 860 → เขียวราว 150 → ปริมาณ ≥ 2.5× 0 (ปริมาณจำลอง 99% ต่ำกว่า 1.51× · สูงสุด 3.19×) · กลไก 4 ชั้นทดสอบด้วยชุดจำลองที่เติมวันปริมาณพุ่ง · PyBroker 2.0.1 ไม้ 14 = 14 ชนะสุทธิเท่ากัน (ตรงทุกช่อง 10/14) |
| ทดสอบเดินหน้า (Task 25) | นอกตัวอย่าง 4 หน้าต่าง: ทุกวิธีแย่กว่าการสุ่มเข้าในสัปดาห์เดียวกัน (−1.3 ถึง −2.9 จุด/ไม้) · จูนกำไรสูงสุด +0.94% → −0.11% ต่อไม้ (WFE −0.11) · จูนอัตราชนะได้ 81% แต่สุ่มชนะ 92% · E-ratio 1.22 vs สุ่ม 1.32 · PyBroker 2.0.1 เล่นซ้ำได้ไม้/อัตราชนะเท่ากัน (ตรงทุกช่อง 84/89) |
| เป้าหมายชนะ 80% (Task 24) | 11/252 config ชนะ ≥ 80% ในช่วงค้นหา (ผลสุทธิ > 0 ทั้ง 11) แต่การสุ่มเข้าด้วยกติกาออกเดียวกันชนะ 68–75% · ตัวที่ใกล้ที่สุด 0.33R/stop 2×/10 วัน ชนะ 84.3% เหนือการสุ่ม +16.2 จุด (p 0.034) แต่ q 0.96 หลังนับ 252 แบบ → ยังไม่มีหลักฐาน · พิสูจน์ต้องใช้ 136 ไม้ forward (≈ 4.2 ปี) · กติกาที่ล็อก (2R/1×/5 วัน) ชนะ 45.1% เทียบสุ่ม 48.1% |
| Atlas พฤติกรรมระบบ (Task 22) | AUC ของ P(up) นอกตัวอย่าง 0.511 [0.481, 0.538] (ไม่ต่างจากโยนเหรียญ) · ไม่มีคันโยกใดผ่าน BH q < 0.1 · ไม่ใช้ G4 / เฉพาะ risk-on ไม่เปลี่ยนสัญญาณเลย · stop 20% ของไม้ = 67% ของขาดทุน · เพื่อนบ้านบนแผนที่ ρ 0.03 (p 0.74) |

worklog ย้ำเสมอว่าตัวเลขจากข้อมูลจำลองพิสูจน์ว่า "ท่อถูก" ไม่ใช่ "edge มีจริง" — ค่าจริงในเครื่องคุณจะต่างเล็กน้อยเพราะ generator anchor วันทำการล่าสุดของวันที่ seed

---

## 6. รอบบูรณะ (Task 15 ใน `worklog.md`) — จาก workspace เป็นแอปที่ "เสร็จ"

| ด้าน | ต้นฉบับ | หลังบูรณะ |
|---|---|---|
| เกตคุณภาพ | `typescript.ignoreBuildErrors: true`, ไม่มี test, ไม่มี CI | `bun run verify` = typecheck · lint · test (65 test) · test:ops (3) · build · smoke ×2 (24 route) — CI `.github/workflows/omniscient-quant-engine.yml` รันชุดเดียวกัน + `bun audit --audit-level=critical` |
| Build | Next เดา root เป็น repo → standalone ไปโผล่ที่ `.next/standalone/omniscient-quant-engine/` และหยิบ `middleware.ts` ของแอปหลักมาด้วย | `outputFileTracingRoot` + `turbopack.root` ล็อกที่โฟลเดอร์แอป · `bun run start` รันด้วย node |
| LLM | `z-ai-web-dev-sdk` ผูกกับ `.z-ai-config` ของ container — นอกนั้นทุกปุ่ม AI ล้ม 500 | `src/lib/llm.ts`: OpenAI-compatible ผ่าน env / z-ai เมื่อพบ config / ไม่มี → 503 พร้อมวิธีตั้งค่า · `/api/health` รายงาน |
| ความปลอดภัย | ไม่มี — ใครเข้าถึงพอร์ตได้ก็รีเซ็ตข้อมูล/เผาโควตา LLM ได้ | `src/proxy.ts` + `src/lib/security/`: โหมด local (loopback เท่านั้น) / auth (Basic + Bearer), CSRF, rate limit, brute-force limit, security headers + CSP, ไม่มี X-Powered-By |
| Risk MDX override | แสดงผลอย่างเดียวใน Meta-Risk (worklog Task 14 ระบุเป็น follow-up) | บังคับที่ Apex: finalSize = min(Kelly, CVaR, 25) × {OK 1, HALF 0.5, ZERO 0} + แสดงใน waterfall/verdict/execution |
| Ops | `.zscripts` ของ z.ai, Caddyfile | `/api/health`, `/api` index, Dockerfile + compose + entrypoint (seed volume), `.env.example`, README, PROJECT-SUMMARY |
| Prisma log | พิมพ์ทุก query ตลอดเวลา | เฉพาะ `OQE_DB_LOG=1` |

สิ่งที่ **ตั้งใจไม่เปลี่ยน:** เอนจินคำนวณทุกชั้น, prompt ของ LLM, UI ทุกแท็บ, schema · dependency เปลี่ยน 3 จุดเท่านั้น: registry host ใน `bun.lock` (`.com` → `.org` registry เดียวกัน), Next 16.1.3 → 16.3.6 + eslint-config-next (แพตช์ advisory critical 2 รายการ — `bun audit --audit-level=critical` เป็นเกตของ CI), ถอด `next-auth` ที่ template ใส่มาแต่ไม่มีโค้ดใช้ (advisory critical เช่นกัน)

---

## 7. ขั้นถัดไปที่เหมาะสม

1. ต่อข้อมูลจริง (adapter → `Price`/`Fundamental`/`FundFlow` แบบ PIT) แล้วรัน walk-forward + attribution ใหม่ — ป้าย "จำลอง" ต้องเปลี่ยนตามแหล่งข้อมูลจริง · สแกน Neotic 3D ต้องการงบรายไตรมาส (กำไรสุทธิ + งวด + วันประกาศ) และหุ้นที่ถูกถอนในช่วงทดสอบด้วย
2. ทดสอบ 3 ปุ่ม AI กับผู้ให้บริการจริงหลังตั้ง `OQE_LLM_API_KEY`
3. ให้ board/decision แสดงขนาดหลัง MDX ด้วย ถ้าต้องการบังคับทั้งระบบ (ตอนนี้บังคับที่ Apex ซึ่งเป็นชั้นสุดท้าย)
4. build/run Docker image บนเครื่องที่มี Docker แล้วยืนยัน `/api/health` ผ่าน compose
