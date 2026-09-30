# Worklog — Omniscient Quant Engine (SaaS Platform)

Project: Full-Cycle Multi-View Quant Platform (Next.js 16 + Prisma/SQLite + shadcn/ui + recharts)

Goal: Build the "Omniscient Quant Engine" SaaS — 7-Layer architecture (L0 Data/PIT QC → L1 Single-View → L2 Dependence Manifold → L3 Multi-View Factor Integration → L4 Prediction → L5 Risk/Sizing → L6 5-Gate Execution + Journal) with convergent-evidence decision engine, walk-forward backtest, gate attribution, and LLM audit loop.

---

Task ID: 0
Agent: main orchestrator (Z.ai Code)
Task: Explore project, plan build, init worklog

Work Log:
- Explored /home/z/my-project: Next.js 16 App Router, React 19, TS, Prisma 6 + SQLite (db/custom.db), full shadcn/ui set, recharts 2.15.4, framer-motion, z-ai-web-dev-sdk 0.0.18
- Confirmed constraints: single route `/`, API routes (no server actions), port 3000, prisma schema in /prisma, db file in /db
- Planned 8-stage build (see todos)

Stage Summary:
- Baseline confirmed; worklog initialized
- Next: prisma schema + quant core lib

---
Task ID: 1-4 (core engine)
Agent: main orchestrator (Z.ai Code)
Task: Prisma schema + quant core lib + synthetic market + analytics engine + API routes

Work Log:
- prisma/schema.prisma: Stock/Price/Fundamental(PIT announceDate)/FundFlow/JournalEntry/AuditReport → db push OK
- src/lib/quant/rng.ts: mulberry32 + Box-Muller + Student-t + tradingDates
- src/lib/quant/stats.ts: MWU(tie-correct), BH-FDR, Cohen's d, hypergeomSf (logGamma), Kendall tau→Clayton Θ, PCA (Jacobi), PSI, KDE 1d, normalSf with asymptotic tail
- src/lib/quant/market.ts: 22 SET stocks × 750 days, regime script (SIDEWAYS→CRISIS→RECOVERY→BULL→CRISIS→RECOVERY→BULL), TSE Solar Big-Lot event @0.82, PIT fundamentals (announce = period+45d), flows
- engine/: types, panel (DB-backed in-memory cache), factors (PCA 4 factors, data-driven naming incl. Idiosyncratic Story via concentration, view variance decomposition, hypergeom enrichment + Jaccard dedup, bipartite hubs, PCA outliers), volcano (stock×feature 352 points), risk (MC Student-t CVaR + sizing budget/CVaR), gates (5-Gate engine + Wyckoff-lite phases + trade plan + light parametric mode), backtest (walk-forward logistic, purged+embargo, gate attribution, calibration), api orchestrator (cache by version)
- API routes: /api/system, /api/board, /api/decision/[symbol], /api/analytics/factors, /api/analytics/dependence, /api/backtest, /api/journal (GET/POST/PATCH/DELETE/PUT-seed), /api/audit (LLM)
- Bug fixes during smoke tests: (1) cs-mean of z-scores ≈ 0 by construction → market factors must use RAW cross-sectional means; (2) sizing formula riskBudget/CVaR (remove ×100); (3) G1 momentum slope 21d→42d (recovery arc); (4) normalSf underflow → asymptotic erfc; (5) story factor detection argmax concentration >0.10; (6) decouple threshold z<-1.5; (7) default seed 20250902 (healthy ending regime)

Stage Summary:
- Engine verified by smoke: 4 signals (SCB/INTUCH/PTTGC pullback, PTTEP momentum), regime RECOVERY/Accumulation, G1 attribution edge=+0.294 p≈0 SPEAKS_TRUTH, G3 edge=+0.105 p=0.045, backtest 73 signals hitRate 61.6% sharpe 0.73, F2=Idiosyncratic Story (TSE 22.4%), volcano 163 significant / 352 points, PCA outliers TSE+ADVANC
- Next: chart components (subagent 6-a) + main page (6-b)

---
Task ID: 6-a
Agent: frontend-styling-expert
Task: Build 7 chart components for quant engine dark terminal UI

Work Log:
- Read worklog + engine types (GateSnapshot/BipartiteEdge/FactorResult) to align prop shapes; confirmed recharts 2.15.4 + TS strict + Tailwind 4 setup
- Created src/components/charts/volcano-chart.tsx: custom SVG scatter, symmetric d-domain (+0.2 pad), y 0..max+1, dashed thresholds d=±0.5 / q=1.301 ("q=0.05" label), sign-colored significant points (#34d399/#fb7185) vs zinc-52525b, top-N stock labels, mono ticks, Thai footer legend
- Created src/components/charts/enrichment-dot.tsx: horizontal dot plot, geneRatio axis (max*1.1), r=4+hits*1.6 (cap 12), q-banded fills (emerald/amber/zinc), hits/count mono labels right of dot, 26-char truncated theme labels, empty-state Thai text + legend line
- Created src/components/charts/bipartite-network.tsx: left amber 14x14 rx3 factor squares with 2-tspan id/name labels, right r=7 sign-colored stock circles, bezier edges (opacity .35, width 0.8+|loading|*1.8 cap 4), degree >= 3 hubs get amber r=10 ring + "HUB" tag, degree badge "xN" per stock, stocks ordered by |loading|-weighted factor index for readable edges, edges drawn before nodes
- Created src/components/charts/heatmap-grid.tsx: symmetric max-abs scale, rgba ramp helper (emerald 52,211,153 / rose 251,113,133, alpha 0.15->1, |v|<4% -> #27272a), 1px inset gap cells, sparse horizontal col labels (every 5th), optional 4px group color band above matrix, row labels zinc-400; cols > 60 switches to fixed 14px cells inside overflow-x-auto wrapper
- Created src/components/charts/gate-ribbon.tsx: 5 lanes G1 Regime..G5 Execution, per-day pass (#10b981 @ .8) / fail (#3f3f46) cells, sparse day-of-month ticks, ENTRY_PULLBACK (amber) / ENTRY_MOMENTUM (emerald) 5px triangles with <title>, days > 120 -> 2px cells + overflow-x-auto, Thai legend
- Created src/components/charts/factor-trajectory.tsx: recharts ResponsiveContainer + LineChart, F1-F4 (amber/rose/emerald/teal) strokeWidth 1.6 dot=false, zero ReferenceLine dashed, dark Tooltip (#18181b/#3f3f46), XAxis MM-DD tickFormatter with interval 8, font-mono wrapper
- Created src/components/charts/pca-scatter.tsx: custom SVG symmetric PC1/PC2 domains, grid zinc-800 + stronger zero lines, r=6 points (normal emerald .8; outlier rose + X cross #18181b + dashed amber r=10 ring), all-symbol labels with alternating y offset (outliers offset 12 to clear ring), Thai QC note under chart
- All 7 files: 'use client', pure presentational (no fetching), self-contained module-scope helpers (niceTicks/decimalsFor/trunc/heatColor), w-full wrappers, viewBox + preserveAspectRatio="xMidYMid meet" + width 100% (dense modes: fixed-size svg in overflow-x-auto), <title> hover tooltips on marks, zinc/emerald/rose/amber/teal palette only, font-mono on numbers, zero emojis (replaced one arrow glyph with ASCII "->")
- Verified: bunx tsc --noEmit -p tsconfig.json -> 0 errors in components/charts (remaining 4 project errors pre-exist in examples/ + skills/, out of scope); bunx eslint src/components/charts -> clean

Stage Summary:
- 7 files created: volcano-chart.tsx, enrichment-dot.tsx, bipartite-network.tsx, heatmap-grid.tsx, gate-ribbon.tsx, factor-trajectory.tsx, pca-scatter.tsx (all export interfaces + default presentational components, ready for 6-b to wire engine outputs)
- Key decisions: fixed 640px viewBox design width for consistent downscaling; dense-mode escape hatches (heatmap > 60 cols / ribbon > 120 days) keep DOM manageable while preserving 1 cell = 1 datum; stock y-order in bipartite derived from loading-weighted factor index to minimize edge crossings; recharts used only in factor-trajectory per spec
- Next: main page wiring (task 6-b)

---
Task ID: 6-b, 7, 8 (UI + Auditor + Verification)
Agent: main orchestrator (Z.ai Code)
Task: Main page (7 tabs, dark terminal), AI Auditor wiring, Agent Browser end-to-end verification

Work Log:
- src/lib/quant/api-types.ts (client-side mirrors), hooks/use-api.ts (lint-compliant async-only setState), lib/format.ts
- components/quant/: quant-header (regime chip + refresh), quant-widgets (GateChips/SignalBadge/KpiCard/Panel), overview-tab (KPIs + Signal of the Day + 7-Layer architecture map + Decision Board 22 rows), multiview-tab (factor cards + variance decomposition + enrichment + bipartite + volcano + PCA + trajectories), dependence-tab (Θ chart, KDE price zones, 22×22 Θ heatmap, drift/decouple table), decision-tab (5-Gate checklist + trade plan + price chart with stops + gate ribbon + save-to-journal), risk-tab (interactive CVaR sizing calculator + MC loss histogram + L-VaR board + circuit breakers), backtest-journal-tab (metrics + equity curve + gate attribution + calibration + journal CRUD), auditor-tab (LLM audit run + history + reflection protocol)
- app/page.tsx: single-route tabbed shell (lazy per-tab fetching), layout.tsx (th metadata), globals.css (scrollbar/selection)
- Fixed during verification: chart default-export imports; decisionQ must also fire on dependence tab; theta chart y-domain clipping; CVaR/VaR sign display (loss ไม่มี +); trajectories redefined to long-short forward-return spread (cs-mean of PCA scores ≡ 0 ตามโครงสร้าง)
- Agent Browser E2E: ภาพรวม (KPIs/signals/architecture/board) → Multi-View (factors F1-F4 + charts) → Dependence (Θ 0.77, KDE, matrix) → Decision (TSE fail-gates case; INTUCH all-pass case; save-to-journal toast) → Risk (sizing calc 1% budget ÷ CVaR = ฿50,582 notional, loss at stop ≈ 0.99% budget) → Backtest & Journal (hit 61.6%, attribution G1/G3 SPEAKS_TRUTH, seed demo journal) → AI Auditor (LLM ตอบไทยจริง: root cause = gate noise G2/G4/G5, action = ปรับ threshold, riskAdjustment 0.7, conf 0.8)
- Mobile 390×844 verified; footer sticky via min-h-screen flex + mt-auto; console/errors/dev.log clean; eslint clean; tsc clean

Stage Summary:
- SaaS platform complete & browser-verified: 7 tabs ครบทั้ง 7 Layers, journal loop + LLM audit loop ทำงานจริง
- Default data: seed 20250902, 22 หุ้น × 750 วัน (auto-seed on first API hit), 4 signals วันล่าสุด (SCB/INTUCH/PTTGC pullback, PTTEP momentum)

---
Task ID: 9 (หลอมรวม synthesis layer)
Agent: main orchestrator (Z.ai Code)
Task: หลอมรวมเรียบเรียงการวิเคราะห์หุ้น — Convergent-Evidence Synthesis (fuser + LLM narrative + 8th tab)

Work Log:
- Note: user upload "Pasted Content_1790556104437.txt" not present on disk (upload dir empty) → executed intent directly: fuse + organize the platform's analysis into one readable per-stock report
- src/lib/quant/engine/synthesis.ts: buildSynthesisDossier() — 11 evidence strands (G1_REGIME w.9, G2_DEPENDENCE w.7, G3_TECHNICAL w.9, G4_RISK w.6, G5_EXECUTION w.4, ML_PROB w.8, FLOW w.6, VALUATION w.5 vs sector median, FACTOR = Σsign(exposure)×sign(traj-slope)·|z|, FUNDAMENTAL PIT revG%, HUB bipartite w.3); each strand votes LONG/SHORT/NEUTRAL, weight halved if gate not SPEAKS_TRUTH in walk-forward attribution; convergence score −100…+100, agreement = aligned weight share; verdict bands STRONG_LONG ≥55&agree≥.6 / LEAN_LONG ≥25 / MIXED / LEAN_SHORT / STRONG_SHORT; strength/weakness top-3, kill switches (plan + decouple re-couple + hard stop + PSI HEAVY), roadmap from L6 plan; renderReport() plain-text export
- prisma: SynthesisReport model (append-only: symbol, runDate, price, score, agreement, L/S/N, verdict, regime, strands Json, dossier Json, narrative Json) → db push OK (required dev-server restart to pick up new client)
- api/synthesis/[symbol]: GET = dossier + last-8 history; POST = LLM (Thai, evidence-locked, must refuse action when MIXED) → {headline, summary, convergence, risks[]} → persisted + reportText
- components/quant/synthesis-tab.tsx: toolbar (select + amber หลอมรวมด้วย AI + copy report + refresh), ConvergenceGauge diverging meter (−100…+100 marker, ±55 thresholds, aria meter), verdict card + 4 KPI, 11-strand table (vote chips, layer badge, eff-weight, ✓trusted/½ badge, max-h scroll), AI narrative panel (headline/summary/convergence/risks), bull/bear top-3, roadmap + kill switches, history table; verdictThai() for history rows
- page.tsx: 8th tab "หลอมรวม" (FlaskConical icon) after ภาพรวม, passes symbols + initialSymbol
- Fixes during smoke: (1) revG stored as % in panel — removed ×100, thresholds 8/−5; (2) CVaR display without "+" (loss); (3) dev server restart after prisma generate (db.synthesisReport undefined)
- E2E Agent Browser: tab renders (TSE +6 MIXED agree 54%); หลอมรวมด้วย AI → Thai narrative grounded in evidence ("TSE อยู่ในโซนไม่ควรลงทุน - หลักฐานสวนกัน") + history row saved; INTUCH POST via curl (LEAN_LONG +36, 4-0-7, correct MIXED-refusal discipline); SCB LEAN_LONG +45, decoupled −1.56 kill switch correct; symbol switching via dropdown; mobile 390×844 verified; console/errors clean; eslint + tsc clean

Stage Summary:
- New capability: "หลอมรวม" = convergent-evidence synthesis — the platform now fuses 11 independent strands into a single organized per-stock report with a −100…+100 convergence score, attribution-weighted trust, LLM narrative in Thai, append-only report archive, copyable plain-text export
- Verdicts observed: TSE MIXED +6 (story stock, expensive), INTUCH LEAN_LONG +36 (decoupled accumulation), SCB LEAN_LONG +45 (decoupled, all gates pass), consistent with Decision Board signals
- Artifacts: synthesis.ts, SynthesisReport (db), /api/synthesis/[symbol], synthesis-tab.tsx, page.tsx tab wiring

---
Task ID: 10 (Meta-Risk L∞)
Agent: main orchestrator (Z.ai Code)
Task: หลอมรวม Part IV (Anatomy of True Risk Mastery) + Part V (Meta-Architecture) เข้าแพลตฟอร์ม — Ruin Math, Risk of Ruin MC, Defense-in-Depth 5 ชั้น, Self-Repudiating Models, Meta-Checklist

Work Log:
- backtest.ts: metrics เพิ่ม sortino (downside-dev), calmar (annualReturn/MDD), profitFactor (grossWin/grossLoss ของไม้สัญญาณ, cap 99), expectancy% (win%×avgWin − loss%×avgLoss)
- meta-risk.ts (ใหม่): recoveryNeeded() เส้นโค้งอสมมาตร; ruinTable() −5…−90% → recovery; simRuin() Monte Carlo 3000 paths × 48 ไม้/ปี เทียบ fixed vs drawdown-scaled sizing (scale = max(0.25, 1 − DD/20%)); defenseLayers() 5 ชั้น (Pre-Trade R/R + P(up), At-Trade size×CVaR ≤ 2% พอร์ต, Post-Entry stops + kill switch, Portfolio cap ตัว 15% + ธีม 2 ตัว, Systemic cash ≥ 20% + losing streak < 3 จาก Journal); reflexivityPhase() 5 เฟส (PRE_IGNITION/IGNITION/RUNNING/EXHAUSTION/COLLAPSE จาก distHigh+ret21+flow5+RSI); deathConditions() 5 เงื่อนไขตาย (hitRate < 45%, gate SPEAKS_TRUTH = 0, PSI > 0.2, calibration skew > 10, false signal > 40% ใน 60 สัญญาณ); checklist 12 ข้อ (Part IV 7 + Part V 5) ตอบจากข้อมูลสด; absorbingBarrier verdict (inGame = P(ruin50) ≤ 5% && ความเสียหาย/ไม้ ≤ 2% && planned ≤ 80%)
- api/meta-risk/[symbol]: GET dossier (ใช้ board rows ที่ประเมินแล้ว ไม่ eval ซ้ำ + journal 30 รายการ)
- meta-risk-tab.tsx (แท็บ 9 "Meta-Risk (L∞)"): Absorbing Barrier card (chip อยู่ในเกม/เสี่ยงเกิน + 4 KPI), ตาราง Ruin Math (universal + plan-specific stops), RuinGauge เทียบ fixed vs drawdown-scaled, DefenseStack 5 ชั้นสี, มาตรวัด 6 KPI, Reflexivity stepper, DeathTable, Checklist 2 คอลัมน์
- page.tsx: แท็บ metarisk หลัง Risk & Sizing (icon ShieldAlert)
- Bug fixes ระหว่าง smoke: (1) simRuin หน่วย % vs fraction — risk 1 ใช้เป็น multiplier ทำ eq×(1−1)=0 → P(ruin)=100% ผิด; แก้ riskFrac = risk/100 → P(ruin) จริง 0%; (2) layer 3 เงื่อนไขกลับทิศ (hardStop ของระบบเป็น vol-based ที่อยู่เหนือ structStop เสมอ) → เปลี่ยนเป็น "stops ครบ + kill switch มี"; (3) การประเมินสัญญาณรอบข้างซ้ำ (light eval) → ใช้ board rows; (4) react-hooks/static-components (Row ใน RuinGauge) → ย้ายเป็น module-level RuinStatLine
- Restart dev server (เคลียร์ __oqeAnalytics cache ที่ถือ BacktestResult รุ่นเก่าไม่มี sortino)
- ผลตรวจจริง: SCB P(ruin50) 0% (p .616, R≈.96, เสี่ยง 1%), medFinal ×1.10, Sortino 1.19 / Calmar .95 / PF 1.56 / Expectancy +1.107% ตรง backtest, cash 49%, ชั้น 1 WARN (R/R 1.03 — SCB อยู่ ATH = สัญญาณจริง), checklist 10 pass/2 fail (correlation LTD หนา + ยังไม่ผ่าน gate); TSE fail correlation+แผน, reflex RUNNING; PTTEP reflex EXHAUSTION
- Agent Browser E2E: แท็บครบ 7 panels, KPI/ชิป/สีถูกต้อง, mobile 390px stack ดี, console สะอาด, eslint + tsc ผ่าน

Stage Summary:
- แพลตฟอร์มมี 9 แท็บครบ: ภาพรวม → หลอมรวม → Multi-View → Dependence → Decision → Risk & Sizing → Meta-Risk (L∞) → Backtest & Journal → AI Auditor
- มโนทัศน์ Part IV/V กลายเป็นตัวเลขสด: "วัด Risk of Ruin ก่อนผลตอบแทน" (MC เทียบ 2 โหมด sizing), "เกราะ 5 ชั้น" ตรวจสดต่อหุ้น, "โมเดลต้องรู้ว่าตัวเองตายเมื่อไหร่" (5 เงื่อนไข trigger จริง), Meta-Checklist 12 ข้อตอบจากข้อมูล
- ตัวเลขสำคัญ: advanced metrics ยึดจาก walk-forward out-of-sample เท่านั้น (ไม่ใช่ in-sample)

---
Task ID: 11-b
Agent: frontend-styling-expert
Task: apex-tab.tsx — UI แท็บ Apex (L7)

Work Log:
- อ่าน worklog (task 10 meta-risk) + ไฟล์อ้างอิง: meta-risk-tab.tsx (template), quant-widgets.tsx (Panel/KpiCard), api-types.ts (Apex types ท้ายไฟล์), use-api.ts และ engine apex.ts/micro.ts เพื่อยืนยันความหมาย field (exitComplexity 0-100, slippagePct ต่อฝั่ง, survivalScore เกณฑ์ 85/60, registry rows)
- สร้าง src/components/quant/apex-tab.tsx (ไฟล์เดียว, export ApexTab({ symbols })): toolbar Select+RefreshCw+error/loading คัดจาก meta-risk-tab ทุก idiom; Panel 1 Apex Verdict (ชิป พร้อมลงมือ/มีเงื่อนไข/Kelly ปฏิเสธ + 4 KpiCard + Execution Adapter เป็น ol list-decimal); Panel 2 KellyWaterfall 10 แถว (WfRow: ป้ายซ้าย-ค่า mono ขวา, sub = source/vol) + กล่องเทียบ Kelly-Vol vs CVaR Budget (G4) vs FINAL (ขอบ emerald) + note หรือกล่อง notice rose เมื่อ edgeGuard; Panel 3 MicroBlock (4 KPI grid 2/4 cols, MirageChip rose VOLUME MIRAGE/emerald volume น่าเชื่อถือ, exit complexity meter aria role="meter" สี 4 ช่วง emerald/amber/orange-400/rose + บรรทัด slippage ±X% ต่อฝั่ง, KnightChip RISK/UNCERTAINTY + reason); Panel 4 CrisisBlock (survival meter + verdict + ตาราง 6 สถานการณ์ overflow-x-auto min-w-[640px]: portDamagePct สี ≤2 emerald/>2 rose, plannedLossPct zinc, stopExecuted ตัดได้/ไม่ได้ตัด/—, ShieldCheck/ShieldX, note ใต้ชื่อ); Panel 5 RegistryTable (sticky thead + max-h-96 overflow-auto, id chip mono + layer, health mini-bar สีตามสถานะ, ชิป ACTIVE/PROBATION/DEAD, note zinc-500); Panel 6 Reflexivity (chip REFLEX_STYLE + detail + stepper 5 เฟสคัดจาก meta-risk) คู่ grid lg:grid-cols-2 กับ Panel 7 กฎเหล็ก 4 ข้อ (border-l-2 border-amber-500/50 bg-amber-500/5 + lucide icon)
- sub-components ทั้งหมดเป็น module-level (WfRow/MeterBar/MirageChip/KnightChip/KellyWaterfall/MicroBlock/CrisisTable/CrisisBlock/RegistryTable) — เลี่ยง component ประกาศใน render (บทเรียน task 10)
- ตรวจ: bunx tsc --noEmit สะอาด (error คงเหลือมีแต่เดิมใน examples/ + skills/), bunx eslint src/components/quant/apex-tab.tsx exit 0, import อยู่ในรายการที่อนุญาตเท่านั้น (react, lucide-react, quant-widgets, ui/select, ui/button, use-api, lib/utils, api-types)
- ยืนยันข้อมูลจริง: curl /api/apex/TSE + 7 สัญลักษณ์ — payload ตรง type ทุก key (6 scenarios, 11 registry rows, verdict.execution 6 ข้อ, TSE final 5% survival 100 risky=true → ชิป "มีเงื่อนไข")

Stage Summary:
- ผลิตไฟล์เดียว: src/components/quant/apex-tab.tsx — แท็บ Apex (L7) ครบ 7 panels ตามสเปค ใช้ภาษา/สี/สัญญาเดียวกับแพลตฟอร์ม (Thai, zinc + emerald/rose/amber/orange-400, ตัวเลข font-mono, lucide icons ไม่มี emoji, ตาราง responsive)
- การตัดสินใจหลัก: MeterBar ใช้ร่วม 2 จุด (exit complexity 4 ช่วงสี / survival 3 ช่วง) พร้อม aria meter; RegistryTable ใส่ sticky thead + max-h-96 เพราะมี 11 แถวจริง; edgeGuard สลับ note → กล่อง rose; ทุก threshold สียึดตามสเปค (survival 85/60, portDamage 2%, exitComplexity 25/50/75)
- ยังไม่ wire เข้า page.tsx (งานของ task อื่น) — ไม่แตะไฟล์อื่นใดตามขอบเขต

---
Task ID: 11 (11-a + 11-c)
Agent: main orchestrator (Z.ai Code)
Task: หลอมรวมพัฒนาต่อยอดระบบ ชั้นสูง ยอดเยี่ยมขั้นสูงสุด — Apex Layer (L7): Kelly-Vol Sizing + Microstructure + Crisis MC + Model Registry + fuser 11→13 สาย

Work Log:
- Note: user upload "Pasted Content_1790558959271.txt" ไม่อยู่บนดิสก์ (upload dir ว่าง ปัญหาเดิมซ้ำ) → ดำเนินการตามเจตนา: ยกระดับแพลตฟอร์มขึ้น "ชั้นสูงสุด" ต่อจาก Part IV/V ที่เข้าแล้วใน Task 10
- src/lib/quant/engine/micro.ts (ใหม่): microstructureMetrics() จาก OHLCV ดิบของ generator cache (seed เดียวกับ DB) — CLV 5/20d, Roll (1984) spread estimator (bps), Amihud illiquidity (impact bps ของคำสั่ง 1% ADV20), big-lot intensity (flow5/turnover5 %), volume mirage (volRatio ≥2 + CLV5 <0.15 / volRatio ≥2.6 + OBV ไม่ขึ้น), exit complexity 0–100 (spread 40 + impact 25 + dryness 20 + gap 3σ 15), slippage/ฝั่ง, Knight classification (RISK vs UNCERTAINTY + haircut 0.5: เช็กเฉพาะหุ้นก่อน exit>65 / decoupled+spread>80 แล้วปิดท้าย PSI>0.2 ระดับตลาด)
- src/lib/quant/engine/apex.ts (ใหม่): (1) kellyVolSizing() — f* = p−(1−p)/R จาก walk-forward (per-symbol ≥15 ไม้ ไม่งั้นทั้งระบบ), ครึ่ง Kelly 0.5, vol target 20% (mult cap 0.25–1.25), DD throttle (1−maxDD/20%, พื้น 0.25), Knight haircut → risk/ไม้ ÷ ระยะ stop = kellySize cap 25%; edgeGuard: f* ≤ 0 → ขนาด 0 "Kelly ปฏิเสธ"; final = min(kelly, CVaR budget G4, 25); ระยะความเสี่ยงวัดจาก fill แย่สุดของ entry zone (entryHigh) ถึง stop แข็ง — conservative; (2) crisisStressTest() — 6 สถานการณ์ถ่วงน้ำหนัก: GAP −5/−8/−12% (open ผ่าน stop = ออกที่ open), DROUGHT 10 วัน −14% + P(stop ทำงาน) จาก exit complexity, CRASH_20 MC 1200 paths (vol ×2.2, t4, gap ข้ามคืน, ตัดที่ open/stop, P95 ≤ 2% = รอด), REFLEX collapse −23.5% เทียบวินัย/ไม่วินัย → survivalScore 0–100; (3) modelRegistry() — 11 โมเดล (G1–G5 จาก attribution edge/p, ML hit rate, CAL skew, PSI drift, MICRO, KELLY, SYNTH false-signal 60 ไม้หลัง) สถานะ ACTIVE/PROBATION/DEAD + systemHealth; (4) buildApexDossier() — Apex Verdict + Execution Adapter (limit order เฉพาะโซน, แบ่งคำสั่ง ≤10% ADV20, slippage budget 2 ฝั่ง, exit ก่อนเข้า)
- meta-risk.ts: เปลี่ยน reflexivityPhase() เป็น export (ให้ synthesis + apex ใช้ร่วมกัน)
- synthesis.ts อัปเกรด 11 → 13 สาย: REFLEXIVITY w0.65 (IGNITION/RUNNING=LONG, EXHAUSTION/COLLAPSE=SHORT) + MICROSTRUCTURE w0.55 (mirage หรือ exit>65 หรือ CLV20<−0.2 = SHORT; CLV20>0.25 = LONG); renderReport "(13 สาย)"; ผลจริง TSE +6(4/4/3) → +14(5/4/4), INTUCH +36→+39
- API /api/apex/[symbol] (GET: state+bt+probs → buildApexDossier) + api-types.ts (Apex types ครบชุด)
- page.tsx: แท็บที่ 10 "Apex (L7)" (icon Crown) ต่อจาก Meta-Risk
- แก้ระหว่าง smoke: (1) PSI ผ่าน bt.summary ไม่มีจริง → คำนวณจาก state.fStress เหมือน meta-risk (ค่าเดียวกับ board: 3.978 HEAVY จริง); (2) regime ผ่าน currentRegimeSummary; (3) entryMid ของโซนกว้างทำ lossAtStop เหลือ 0.5% → ใช้ entryHigh (fill แย่สุด); (4) Knight เรียงลำดับเฉพาะหุ้นก่อน PSI รวม; (5) typo เกราะวเนียม
- ผลตรวจจริง: SCB (mega-cap) spread 0bps · exit 0/100 · ADV 9,433MB · slippage 0.013% → CVaR จำกัดที่ 12.7% · survival 100/100; TSE (small-cap) spread 252bps · exit 40/100 · ADV 14MB · slippage 1.286% · big-lot 6.08% → 5.0%; registry 6 ACTIVE/1 PROBATION/4 DEAD (G2/G4/G5 edge ลบ + PSI DEAD ตาม self-repudiation) systemHealth 52–55
- Agent Browser E2E: แท็บ Apex ครบ 7 panels (verdict/KPI/waterfall/เทียบ 3 ค่า/microstructure+mirage chip+meter/Knight box/ตาราง 6 สถานการณ์/registry sticky/stepper/กฎเหล็ก), สลับหุ้น SCB→TSE ผ่าน dropdown จริง, แท็บ หลอมรวม แสดง "13 สายจาก 8 เลเยอร์" + สาย REFLEXIVITY/MICROSTRUCTURE ในตาราง, กด หลอมรวมด้วย AI → narrative ไทยอ้าง "วงจรสะท้อนกลับ (Reflexivity)" จริง + history เซฟแถวใหม่ (+14, 5/4/4) ข้างแถวเก่า (+6, 4/4/3), mobile 390×844 stack ครบ, console/dev.log สะอาด, eslint + tsc ผ่าน

Stage Summary:
- แพลตฟอร์มมี 10 แท็บ: ภาพรวม → หลอมรวม → Multi-View → Dependence → Decision → Risk & Sizing → Meta-Risk (L∞) → Apex (L7) → Backtest & Journal → AI Auditor
- L7 Apex = "ชั้นสูงสุด" ที่หลอมทฤษฎีที่ยังเหลือเป็นตัวเลขสด: Fractional Kelly (0.25–0.5) × Vol Targeting × DD throttle × Knight haircut (ขนาดไม้สุดท้าย = min กับ CVaR budget), microstructure 5 ความจริงของหุ้นเล็ก (CLV/Roll spread/Amihud/Big-lot/mirage/exit>entry slippage), Monte Carlo crisis 6 สถานการณ์ (stop ไม่รับประกันราคา รับประกันวินัย), Model Registry self-repudiating (โมเดลตายเมื่อ edge กลับด้าน/PSI HEAVY/hit<45%)
- หลอมรวม (fuser) อัปเกรดเป็น 13 สายโดยอัตโนมัติ — REFLEXIVITY และ MICROSTRUCTURE มีสิทธิ์โหวตและเข้า narrative ของ LLM
- ขนาดไม้เปลี่ยนจาก "CVaR อย่างเดียว" เป็น "min(Kelly-Vol, CVaR, cap 25%)" พร้อม edgeGuard = Kelly ปฏิเสธไม้ที่ไม่มี edge

---
Task ID: 3-c
Agent: frontend-styling-expert
Task: AI analysis panel (Terminal — Market Intelligence Dashboard)

Work Log:
- อ่าน worklog + api-types.ts (เฉพาะท้ายไฟล์ AnalystBriefT: trend/signal/gates/plan/indicators/sr/synth/brief) + format.ts + quant-widgets.tsx (GateChips {gates, size?} / SignalBadge {signal}) + ui/input + ui/button (size icon = size-9 = 36px)
- สร้าง src/components/terminal/ai-panel.tsx ไฟล์เดียว ('use client', presentational, ไม่ fetch): root flex flex-col h-full rounded-xl border-zinc-800/80 bg-zinc-900/30 overflow-hidden — header คงที่, body เป็น min-h-0 flex-1 overflow-y-auto, footer chat อยู่นอก scroll (mt-auto)
- Header: "AI ANALYSIS / {symbol}" + badge RULE ENGINE (emerald) + name truncate + ชิปวันที่ fmtDate
- S1 แนวโน้มรายวัน: ชิปทิศงาน UP(emerald/TrendingUp)/DOWN(rose/TrendingDown)/SIDE(zinc/MoveRight) + label, "1D · {date}", บรรทัดย่อย mono ราคา/EMA20/EMA50/ห่าง ATH fmtPct(,1), GateChips size md + phase
- S2 CONDITIONAL PLAN: การ์ด amber-500/30, SignalBadge, NO_TRADE → "รอเงื่อนไข:" + ชิป failingGates (rose mono 10px) + reasons.g3 ตัด 140 ตัวอักษร; ไม่งั้น → ประโยคเข้าโซน/trigger/stop แข็ง/ขนาด% (ตัวเลข mono); StatBox 2 กล่อง ราคาปัจจุบัน / จุดเข้าโซนกลาง (mid โซน emerald-300); kill switch ตัด 90 ตัวอักษร + AlertTriangle 10px amber
- S3 AI ANALYST — LOCAL: Sparkles amber 12px + "grounded · rule-based"; การ์ด synth (headline/summary line-clamp-4/คะแนน fmtSigned + chip verdict); "บทวิเคราะห์เชิงระบบ:" + brief เป็น ul list-disc; ไม่มี synth → เฉพาะ brief
- S4 แนวรับ-แนวต้าน: SrBox module-level — SUPPORT emerald / RESISTANCE amber, values slice(0,2) mono ว่าง→"—", หมายเหตุ "Pivots ระยะ 90 วัน", บรรทัด Stop แข็ง/Stop โครงสร้าง
- S5 ตัวชี้วัดหลัก: MetricRow module-level 8 แถว (volRatio × สีตามเกณฑ์ 1.5/0.6, RSI chip ซื้อเกิน/ขายเกิน/กลาง, MACD สีตามเครื่องหมาย + ลูกศร TrendingUp/Down เทียบ macdHPrev, Fund Flow 5d sign-colored, Θ z + DECOUPLE chip rose, ProbUp (ML) %, CVaR rose-300, Volatility 21d zinc-300)
- Footer chat: อวตารกลม 28px gradient amber→orange + Bot ขาว 14px, Input placeholder "ถาม AI นักวิเคราะห์..." (Enter ส่ง), Button size icon aria-label "ส่งคำถาม" disabled เมื่อว่าง/asking, bubble user (amber) / ai (zinc, whitespace-pre-wrap) ใน max-h-40 scroll, ระหว่างรอ → Loader2 spin + "กำลังคิด...", ล้มเหลว → ข้อความขอโทษไทย
- เลี่ยง lint react-hooks/set-state-in-effect ตามโจทย์: ไม่ใช้ useEffect เลย — เก็บแชทเป็น {sym, msgs} แล้ว msgs = chat.sym === symbol ? chat.msgs : [] (รีเซ็ตอัตโนมัติเมื่อเปลี่ยนหุ้น) + busyRef กันส่งซ้ำ
- Sub-components ทั้งหมด module-level (SectionLabel/StatBox/MetricRow/SrBox/Skel/LoadingBody/ErrorBox/EmptyState/BriefContent); skeleton pulse ครบทุก section ตอน loading; error = กล่อง rose "โหลดวิเคราะห์ไม่สำเร็จ: {error}"
- ตรวจ: bunx tsc --noEmit → 0 error ในไฟล์นี้ (error คงเหลือเป็นของ examples/, skills/, engine/terminal.ts ของ task อื่น); bunx eslint src/components/terminal/ai-panel.tsx → exit 0 สะอาด
- เกร็ดเทคนิค: ไอคอนใน Button ต้องใช้ class "size-3.5" (ไม่ใช่ h-3.5 w-3.5) เพื่อหลบ selector [&_svg:not([class*='size-'])]:size-4 ของ shadcn button ไม่ให้ชนะ specificity

Stage Summary:
- ไฟล์เดียวเสร็จสมบูรณ์: src/components/terminal/ai-panel.tsx — แผง "AI ANALYSIS" ขวาของ terminal ครบ 5 sections + header + footer chat ตามสเปคทุกจุด (สี zinc/emerald/rose/amber เท่านั้น, ตัวเลข font-mono, label ไทยตามสเปค, ไม่มี emoji, aria-label ครบ, ปุ่ม 36px)
- Chat เป็น local state ที่ผูกกับ symbol และเรียก props.onAsk (Promise<string>) เท่านั้น — panel ไม่ fetch เอง, รอ parent (task ถัดไป) wire /api/terminal/ask
- export ทั้ง named AiPanel และ default เผื่อสไตล์ import ของ task อื่น; ยังไม่แตะไฟล์อื่นใดตามขอบเขต

---
Task ID: 3-a
Agent: frontend-styling-expert
Task: Terminal chrome — sidebar/topbar/chips/watchlist

Work Log:
- อ่าน worklog + api-types.ts (หัวข้อ "Terminal (Market Intelligence Dashboard)"): QuoteRowT/QuotesResponse/RegimeInfo/GateSnapshotT + format.ts (fmtPct/fmtNum/fmtDate/chgColor/driftColor) + quant-widgets/quant-header เพื่อยืนยัน idiom; เช็ก lucide-react ครบทุก icon (รวม Waypoints/ShieldHalf/LineChart) และประเภท LucideIcon ก่อนเขียน
- สร้าง src/components/terminal/sidebar.tsx: aside hidden lg:flex h-full w-64 (มือถือไม่แสดง), brand block BrainCircuit amber-400 + "MARKET INTELLIGENCE", user card (avatar 32px gradient amber→orange initial Q + Badge outline ShieldCheck PRO), 5 กลุ่มเมนู Collapsible defaultOpen (trigger เป็น group, chevron group-data-[state=open]:rotate-180), NavItem active = bg-amber-500/15 text-amber-300 border-amber-500/40 / inactive zinc, nav พื้นที่ flex-1 min-h-0 overflow-y-auto, footer mt-auto = RegimeFooterChip (regime.regime + fmtDate th-TH, สีตาม drift prop ผ่าน driftColor, fallback zinc เมื่อไม่ส่ง drift) + "OQE v1.0 · จำลองเพื่อสาธิต"
- สร้าง src/components/terminal/topbar.tsx: h-14 flex, ซ้าย = "กำลังดู" + symbol font-mono text-lg bold + name truncate max-w-40 + ChgBadge (TrendingUp/Down + chgColor + fmtPct), กลาง flex-1 = ปุ่ม search ลอกสไตล์ input (⌘K kbd chip แสดง ≥sm, onClick onOpenSearch), ขวา = RegimeMiniPill (hidden md:inline-flex: regime + marketChg1d chgColor) + ปุ่ม refresh h-10 w-10 (RefreshCw animate-spin เมื่อ loading, disabled) + ปุ่ม Menu lg:hidden (onOpenNav) — ปุ่ม icon ทุกปุ่มมี aria-label สูง 40px
- สร้าง src/components/terminal/category-chips.tsx: แถว flex gap-2 overflow-x-auto, chip = rounded-xl border px-4 py-2 min-w-fit (active border-amber-500/60 bg-amber-500/10 + count text-amber-300), บรรทัด 1 = count font-mono text-lg bold + label text-xs semibold, บรรทัด 2 = sub text-[10px] zinc-500 truncate, ทุกปุ่มมี aria-pressed, export type CategoryChipT
- สร้าง src/components/terminal/watchlist.tsx (export type WatchTab): Panel เต็มความสูง + className passthrough (สำหรับ max-h-[420px] lg:max-h-none ฝั่ง mobile), header = Activity emerald + Badge outline "LIVE QUOTE" (pulse dot) + "จำนวน {n} symbols · fmtDate(lastDate)", Input ค้นหา (Search icon absolute, local useState, กรอง symbol/name), role=tablist 3 แท็บ MARKET/LEVELS/FAVORITES (active text-amber-300 border-b-2 border-amber-400) คุมโดย parent ผ่าน activeTab/onTabChange, ลิสต์ flex-1 min-h-0 overflow-y-auto divide-y — MARKET grid [star|symbol+name+signal-dot|sparkline|price+chg] เรียง signal rank (PB 0/MO 1/NO_TRADE 2) → chg1d desc; LEVELS แสดง "เข้า {entryLow}-{entryHigh}" emerald / "หยุด {stopHard}" rose / "ขนาด {maxSizePct}%" zinc (สัญญาณมาก่อนแล้วที่เหลือตาม chg1d); FAVORITES กรองด้วย favorites prop + empty state "ยังไม่มีรายการโปรด — กดดาวเพื่อเก็บหุ้น"; Sparkline = SVG 56x20 polyline normalize min-max stroke #34d399/#fb7185; star เป็น span role=button (ห้าม button ซ้อน button) aria-pressed + stopPropagation; loading = 6 skeleton rows animate-pulse; sub-components ทั้งหมด module-level (Sparkline/SignalDot/StarToggle/RowShell/IdentityCell/PriceCell/MarketRow/LevelsRow/SkeletonRows/EmptyState)
- ตรวจ: bunx tsc --noEmit → 0 error ใน src/components/terminal (error คงเหลือเป็นของ examples/ + skills/ + src/lib/quant/engine/terminal.ts ซึ่งเป็นสโคปงานไฟล์ engine ของ task อื่น — ไม่แตะตามขอบเขต); bunx eslint src/components/terminal → clean (exit 0)
- ไม่แก้ไฟล์อื่นใด (ไม่แตะ page.tsx)

Stage Summary:
- 4 ไฟล์ใหม่ใน src/components/terminal/: sidebar.tsx, topbar.tsx, category-chips.tsx, watchlist.tsx — chrome ของ Market Intelligence Terminal ครบ (nav rail + top bar + filter chips + watch panel) พร้อมให้ task ถัดไป wire เข้า layout/หน้า terminal
- สัญญา props ตามสเปคเป๊ะ: sidebar(view, onNavigate, regime, drift?), topbar(symbol, name, chg1d, regime, loading?, onOpenSearch, onOpenNav, onRefresh), chips(cats, active, onSelect), watchlist(quotes, lastDate, loading, symbol, onSelect, favorites, onToggleFav, activeTab, onTabChange) + className passthrough ที่ watchlist/chips; favorites อยู่นอกคอมโพเนนต์ (parent เก็บ localStorage), แท็บถูกคุมโดย parent, ค้นหาเป็น local state เท่านั้น — ไม่มี fetch ในไฟล์เหล่านี้
- ข้อตัดสินใจ: star ใช้ span role=button เพื่อเลี่ยง button ซ้อน button; LEVELS แสดงทั้งมี/ไม่มีสัญญาณ (สัญญาณขึ้นก่อน) ตีความ "first then rest"; ปุ่ม icon topbar h-10 w-10 และแถวรายการ ≥40px ตามกฎ a11y; พาเลตต์ zinc + emerald/rose/amber เท่านั้น ไม่มี emoji ตัวเลข font-mono ทั้งหมด

---
Task ID: 3-b
Agent: frontend-styling-expert
Task: PriceChart SVG panel
Work Log:
- อ่าน worklog + api-types.ts (เฉพาะหัว Terminal: SeriesResponse/OhlcBarT/QuoteRowT) + lib/format.ts + lib/utils.ts; ตรวจ tsconfig (strict, ไม่มี noUncheckedIndexedAccess) และ idiom เดิมจาก components/charts (task 6-a)
- สร้าง src/components/terminal/price-chart.tsx ไฟล์เดียว ('use client', default export PriceChart) — pure presentational, props: { data: SeriesResponse | null; loading; error?; plan?: {entryLow, entryHigh, stopHard} | null; tf: '1D'|'1W'; onTfChange; onRefresh; onToggleExpand? }
- โครงแผง: rounded-xl border-zinc-800/80 bg-zinc-900/30 flex flex-col h-full; header 3 แถว (PRICE CHART / แผนภูมิราคา + REAL OHLC badge emerald, symbol/name/chg1d badge พร้อม TrendingUp/Down h-3, source line "OQE Synthetic Generator · EOD · ข้อมูลถึง {fmtDate(lastDate)}"); toolbar TIMEFRAME (1D/1W → onTfChange) + CHART (Candles/Line local state) + OVERLAYS 9 chips พร้อมจุดสี series (EMA20 #fbbf24, EMA50 #fb923c, SMA20 #a1a1aa, BB #71717a, Donchian #2dd4bf, VWAP #c084fc; Volume/Swing/Levels ไม่มีจุด) + ปุ่ม RefreshCw (หมุนเมื่อ loading) / Maximize2 ชิดขวา; footer OHLCV mono สีตามทิศแท่งล่าสุด + VR + "{n} bars"
- SVG geometry แบบโมดูลล้วน: buildGeom() — สูงรวม 460 (top 20 + price 330 + gap 10 + volume 80 + x-axis 20), right axis 56 / left pad 8, Y-domain จาก low/high ของแท่ง + ค่า overlay ที่เปิด (bbU/bbL/donU/donL + ema/sma/vwap) pad 4%; niceTicks() แบบ 1-2-2.5-5-10, 5 grid แนวนอน + 6 grid แนวตั้ง label MM-DD (1D) / YY-MM-DD (1W); slot<3px สลับเป็น HL path รวม 2 เส้น (up/down) ประหยัด DOM เมื่อแท่งเยอะ, ไม่งั้น wick line + body rect กว้าง max(1.5, slot*0.62) สี #10b981/#f43f5e
- Overlays: polyline แบบ segment ข้าม null (overlayPath), BB เส้นประ U/L + M จุด, volume hist opacity 0.35 + เส้น ADV20 ประ + label, Swing H/L สามเหลี่ยม ▽/△ 5px (#fb7185/#34d399) พร้อม <title>, Levels = เส้นประ R (#f59e0b) / S (#10b981) + chip ขอบขวา 48x14 (fill #78350f/#064e3b text #fcd34d/#6ee7b7) clamp ในกรอบราคา, plan เมื่อส่งมา = โซน entry เขียวจาง 0.08 + ขอบบน/ล่าง + เส้น STOP ประชมพู่กับ chip rose
- Crosshair: onMouseMove → index แท่งใกล้สุด (state เฉพาะใน ChartSvg), เส้นประดิ่ง + price tag แกนขวาที่ Y เคอร์เซอร์ + date tag ล่าง, tooltip HTML absolute แบบ pointer-events-none พร้อม clamp ในกรอบ แสดง date / OHLC สีตามทิศ / Chg% เทียบ close ก่อนหน้า / V toLocaleString / VR× (v/adv20); onMouseLeave เคลียร์
- Performance: ResizeObserver (callback ref setWrapEl) วัดความกว้าง state default 720; JSX เลเยอร์นิ่งทั้งบล็อกถูก useMemo บน [data, width, overlays, tf, mode, plan, clipId] — hover รีเรนเดอร์เฉพาะ crosshair+tooltip; helper ทั้งหมด (niceTicks/axisDecimals/dateTick/overlayPath/clamp/fx) เป็น module-level, ไม่มี component ประกาศใน render
- State แสดงผล: loading → skeleton h-[460px] animate-pulse bg-zinc-800/30; error → กล่อง rose + ปุ่ม ลองใหม่ (onRefresh); data ว่าง/null → "ไม่มีข้อมูล" กลางจอ; a11y: svg role="img" aria-label "แผนภูมิแท่งเทียน {symbol}", ทุก chip เป็น <button type=button aria-pressed>, ปุ่มไอคอนมี aria-label, ตัวเลข font-mono ทั้งหมด, พาเลตต์ zinc/emerald/rose/amber/teal + fuchsia เฉพาะ VWAP ตามกฎ
- ตรวจ: bunx tsc --noEmit → 0 error จากไฟล์นี้ (error คงเหลือ pre-existing ใน examples/ skills/ และ engine/terminal.ts ของ task อื่น), bunx eslint src/components/terminal/price-chart.tsx → exit 0; ไม่แตะไฟล์อื่นใด
Stage Summary:
- ไฟล์เดียวเสร็จ: src/components/terminal/price-chart.tsx — แผงเทียนราคาสไตล์ TradingView สำหรับคอลัมน์กลางของ Terminal (EOD 1D/1W, candles/line, 9 overlay toggles, S/R chips + plan zone, crosshair tooltip, footer OHLCV) พร้อมให้ task 3-c wire ผ่าน props ทั้งหมด ไม่มีการ fetch ในตัว
- การตัดสินใจหลัก: แยก geom/layers เป็น useMemo สองชั้นเพื่อให้ hover ถูก, thin-mode รวมแท่งเป็น 2 path เมื่อ slot<3px, chip R/S/STOP clamp ระดับในกรอบราคาและวาดนอก clip group เพื่อไม่โดนตัด, ใช้ callback-ref + ResizeObserver เพื่อรองรับกรณี chart ยังไม่ mount ตอน effect แรก

---
Task ID: 12
Agent: main orchestrator (Z.ai Code) + 3 × frontend-styling-expert (3-a/3-b/3-c)
Task: นำ Dashboard "Nugaom AI Pick / Market Intelligence" (ภาพอ้างอิงจากผู้ใช้) มาปรับใช้กับ Omniscient Quant Engine — Market Intelligence Terminal

Work Log:
- ผู้ใช้อัปโหลดภาพดีไซน์ trading terminal (sidebar + symbol search + category chips + watchlist + candlestick chart + AI analysis panel) → ปรับโครงสร้างมาเป็นหน้าหลักของแพลตฟอร์มโดยผูกข้อมูลจริงจากเอนจินเดิมทั้งหมด
- Foundation (orchestrator):
  - src/lib/quant/engine/terminal.ts (ใหม่): getQuotes() (board + volume/adv20/spark30/valueM ต่อตัว), getSeries(symbol, tf=1D|1W, bars) (OHLCV จาก generator cache + EMA20/50, SMA20, Bollinger(20,2), Donchian20, VWAP20, MACD 12/26/9, swing pivots fractal ±2, S/R cluster จาก pivots 90 วัน, weekly aggregation แบบ ISO), getAnalyst(symbol) (trend dir จาก EMA spread, plan จาก evaluateGates, indicators ครบ, brief กฎเกณฑ์ไทย 5 บรรทัด, ดึง SynthesisReport ล่าสุดจาก DB), askAnalyst() (LLM ไทย grounded ล็อกหลักฐาน, thinking disabled, NO_TRADE ต้องแนะนำรอ)
  - ⚠️ แก้ bug สำคัญ: tradingDates() anchor กับ "วันนี้" → generator ใหม่จบวันที่ต่างจาก DB (09-28 vs 09-25) → ผูก label วันที่ของ series กับวันล่าสุดของ DB เสมอ (tradingDates(n, dbLast)) ให้กราฟตรงกับ Board/Decision/Synthesis
  - API ใหม่ 3 เส้น: GET /api/market/quotes, GET /api/market/series/[symbol]?tf&bars, GET+POST /api/analyst/[symbol] (POST = chat)
  - api-types.ts: เพิ่ม QuoteRowT/QuotesResponse/OhlcBarT/SeriesResponse/AnalystBriefT
- Subagents (ขนาน 3 ทีม อ่าน worklog ก่อนทำ และ append ผลเมื่อจบ):
  - 3-a: sidebar.tsx (brand+user PRO card+5 group Collapsible+active amber+regime chip, รับ className เพื่อใช้ซ้ำใน mobile Sheet), topbar.tsx (กำลังดู symbol+chg, search trigger ⌘K, regime pill, refresh, hamburger), category-chips.tsx (count+label+sub, active amber), watchlist.tsx (Live Market Watch, MARKET/LEVELS/FAVORITES tabs, search, star→localStorage, sparkline SVG 56×20, sort ตาม signal rank)
  - 3-b: price-chart.tsx (791 บรรทัด): custom SVG candles 460px (wick+body, slot<3px ยุบเป็น HL path), overlays 9 ชนิด toggle ได้พร้อม color dot, volume+ADV20, swing △▽, R/S chips ขอบขวา (amber R / emerald S), entry zone band + STOP line จาก plan, crosshair+tooltip OHLCV/Chg/VR, timeframe 1D/1W, Candles/Line, OHLCV footer, ResizeObserver, useMemo แยก static layers
  - 3-c: ai-panel.tsx (467 บรรทัด): แนวโน้มรายวัน chip (UP/DOWN/SIDE), GateChips, CONDITIONAL PLAN card (SignalBadge+entry zone+trigger+stop+size+kill switch), stat boxes ราคาปัจจุบัน/จุดเข้าโซนกลาง, AI ANALYST—LOCAL (synth headline/summary/score จาก DB + brief bullets), S/R boxes เขียว/ส้ม, ตัวชี้วัดหลัก 8 แถว (volRatio/RSI chip/MACD±trend/flow/Θz DECOUPLE/ProbUp/CVaR/vol21), chat footer (avatar+Input+send, bubbles user ส้ม/AI zinc, reset ต่อ symbol แบบไม่ใช้ effect)
- Orchestrator wiring: terminal-view.tsx (grid 3 คอลัมน์, chips dynamic จาก sectors จริง + สัญญาณ + Decouple, กรอง+sort watchlist, favorites localStorage, ask→POST), page.tsx rewire เป็น shell (Sidebar rail + mobile Sheet + TopBar + ⌘K CommandDialog ค้นหา 22 ตัวพร้อมราคาสด + view switching คงแท็บเดิมครบ 10 แท็บ + status bar sticky ล่าสุด), ลบ Tabs wrapper เดิม (sidebar แทนที่)
- แก้จากการตรวจจริง: (1) TS error runDate (Prisma เก็บ String อยู่แล้ว) (2) มือถือ panel ทับกัน — watchlist wrapper สูง 0 (flex-1 ใน grid row auto collapse) → กำหนด h-[420px]/h-[680px] บนมือถือ + chart panel เพิ่ม overflow-y-auto + grid placement ชัดเจนทั้ง lg (2 คอลัมน์, watchlist row-span-2) และ xl (3 คอลัมน์) (3) heading CommandGroup พิมพ์ผิด
- Agent Browser E2E ผ่านทุก flow: desktop 1440 (3 คอลัมน์ครบตามดีไซน์) → คลิก SCB ใน watchlist (chart+AI panel+topbar เปลี่ยนพร้อมกัน, plan เข้าโซน 146.90–166.58 ถูกต้อง, DECOUPLE Θz −1.56) → ⌘K พิมพ์ "gulf" เลือก (GULF โหลดครบ, R 48.93/S 45.92, G2 G3 ตก = Phase 1 Accumulation) → 1W รายสัปดาห์ (150 bars) → ชิป "สัญญาณ" กรองเหลือ 4 ตัว → แชท AI ถามจริง ตอบไทย grounded (NO_TRADE เพราะ G2/G3 ตก ตรง CONDITIONAL PLAN) → FAVORITES กดดาว SCB เก็บลง localStorage → แท็บ ภาพรวม ใน shell ใหม่ทำงานปกติ → mobile 390×844 (stack ไม่ทับ, sheet menu ครบ) → lg 1100 (2 คอลัมน์) → crosshair+tooltip แสดง OHLC/Chg/VR จริง; console สะอาด, dev.log ไม่มี error, tsc + eslint ผ่าน

Stage Summary:
- แพลตฟอร์มมีหน้าหลักใหม่ = "Market Intelligence Terminal" ตามดีไซน์ที่ผู้ใช้ให้มา โดยแต่ละแผงผูกกับเอนจินจริง: Watchlist ← board+quotes, Chart ← series+indicators+S/R 90 วัน+plan levels, AI Panel ← 5 Gates plan+synthesis archive+LLM chat
- โครงสร้าง: sidebar นำทางครบทั้ง Terminal + 10 แท็บเดิม (ภาพรวม→AI Auditor), ⌘K global search, status bar sticky
- ข้อจำกัดที่รู้ตัว: timeframe มี 1D/1W (ข้อมูล EOD จำลอง 750 วัน — ไม่ปลอม intraday), ราคา/สัญญาณทุกจุดมาจาก seed เดียวกันทั้งแพลตฟอร์ม
- Artifacts: engine/terminal.ts, api/{market/quotes, market/series/[symbol], analyst/[symbol]}, components/terminal/* (6 ไฟล์), page.tsx (shell ใหม่), api-types.ts (+terminal types)
---
Task ID: 13-a
Agent: frontend-styling-expert
Task: Design System + Dashboard Primitives + Shell Reskin

Work Log:
- อ่าน worklog.md ทั้งไฟล์ (งาน 0→12) + โค้ดจริงที่เกี่ยว: globals.css, terminal/sidebar.tsx, terminal/topbar.tsx, lib/format.ts (driftColor/chgColor/fmtDate), api-types.ts (RegimeInfo), page.tsx (ยืนยัน props wiring: sidebar ถูกใช้ทั้ง rail hidden lg:flex และ mobile Sheet className="flex", topbar ผูก board/regime), เช็ก lucide-react 0.525 มี Gauge + tsconfig strict ไม่มี noUncheckedIndexedAccess
- globals.css: (1) ปรับ scrollbar thumb เป็น rgba(255,255,255,0.10)/hover 0.18 ให้เนียนขึ้น — ไม่ลบ scrollbar/selection/input-spinner เดิม (2) append ท้ายไฟล์: @keyframes oqe-marquee + .oqe-animate-marquee (var --marquee-duration) + .oqe-marquee-paused:hover pause, @keyframes oqe-fade-up + .oqe-fade-up + .oqe-delay-1..6 (60–360ms), @keyframes oqe-shimmer + .oqe-shimmer::after (sheen 135deg 0→0.06→0, translateX -100%→200%), @keyframes oqe-pulse-glow (amber) + .oqe-live-dot, .oqe-bg-scene (radial emerald/amber บน #09090b), .oqe-panel (ใส่ใน @layer components เพื่อให้ utility เช่น hover:border-white/[0.14]/rounded-lg ทับได้ — จุดตัดสินใจสำคัญ: ถ้าเขียน unlayered จะชนะ cascade ทับ utility ของ Tailwind 4), .oqe-ticker-mask (mask + -webkit-mask), และ @media prefers-reduced-motion ปิด animation ทั้งชุด (a11y เสริม)
- สร้าง src/components/dashboard/primitives.tsx ('use client', presentational ล้วน ไม่ fetch, sub-component ทุกตัวอยู่ระดับ module, geometry ครุมด้วย useMemo, ตัวเลข font-mono tabular-nums ทั้งหมด): TONE map กลาง (text/icon/stroke/dot ตาม tone) + regex ไทย /[\u0E00-\u0E7F]/; MicroLabel (ไทย→text-[11px] tracking-normal, อังกฤษ→10px uppercase tracking-[0.14em]); Panel (section.oqe-panel + header เมื่อมี title/subtitle/actions + body p-4 sm:p-5 เมื่อ padded + bodyClassName + titleClassName optional); StatTile (label/value text-xl bold สี tone/sub + icon วงกลมจางมุมขวา + hover:border-white/[0.12]); RadialGauge (SVG arc 240° เริ่ม 150°, track white/[0.08] w7 round, value arc clamp(min,max) สีตาม tone + drop-shadow glow, กลาง = ค่า mono bold + label (Thai-aware) + sub, role=img + aria-label + <title>); BreadthBar (แถบเดียว h-2 rounded-full emerald-500/zinc-600/rose-500 + label ซ้าย/กลาง(flat>0)/ขวา mono 11px + role=img aria-label สรุปครบ); Sparkline (polyline normalize min-max, stroke #fb7185/#34d399/#a1a1aa ตาม positive, w1.5, data <2 จุด → เส้นตรงกลาง, aria-hidden); TickerTape (oqe-ticker-mask + flex w-max oqe-animate-marquee, --marquee-duration = max(24, n*3.2)s, items ซ้ำ 2 รอบรอบสอง aria-hidden, item เป็น button mono SYMBOL/price/chg + เส้นคั่นตั้ง white/10, hover pause, ไม่มี state ต่อ item — CSS animation ล้วน, empty → null); SectorHeat (grid 2/3/4 คอลัมน์, เรียง chg1d มาก→น้อย, tint alpha = rel*0.16 (สูงสุด ~0.16) emerald/rose, ~0 → white/[0.03], แสดง n ตัว + chg1d ใหญ่ + 21D เล็ก); EquityCurve (downsample stride ≤160 จุดคง first/last, viewBox 720×240 preserveAspectRatio="none" + vector-effect non-scaling-stroke, grid 4 เส้น, strategy emerald w2 + area gradient → transparent, buy&hold zinc-500 w1.5 dashed, y tick เป็น HTML label text-[9px] mono (กันตัวอักษรยืดตาม viewBox — เทียบเท่า fill #71717a), x label YY-MM-DD จาก string เอง 6 จุด, legend + ผลตอบแทนรวมสองเส้น, hover crosshair เส้นประดิ่ง + จุด + tooltip date/equity/buyHold แบบง่าย clamp ขอบ); PulseDot (8px สีตาม tone, oqe-live-dot auto เมื่อ tone='up')
- Reskin sidebar.tsx (props เดิมเป๊ะ {view, onNavigate, regime, drift, className}): aside border-r border-white/[0.06] bg-zinc-950/80 backdrop-blur; brand block โลโก้ rounded-xl กริดเรืองแสง amber (bg-amber-500/10 border-amber-500/30 + inset shadow + background-image grid 6px) + PulseDot tone warn + oqe-live-dot มุมโลโก้ (ring-zinc-950) + ชื่อ Omniscient Quant + tagline "QUANT COMMAND CENTER"; user card เปลี่ยนเป็น oqe-panel; nav กลุ่มใหม่ key 'home' label 'ศูนย์ควบคุม' icon Gauge นำหน้า items = [{dashboard, 'Command Center', Gauge}, {terminal, 'ตลาดสด · Terminal', Monitor}] ตามด้วยกลุ่มเดิมครบ (จักรวาลหลัก/วิเคราะห์/ความเสี่ยง/MY LAB); NavItem active = border-amber-500/40 bg-amber-500/10 text-amber-300 + shadow-[0_0_18px_-6px_rgba(251,191,36,0.5)] + แถบบาร์ซ้าย 2px amber absolute, inactive hover = border-white/[0.08] bg-white/[0.04], สูง ≥40px (py-2.5); หัวกลุ่ม min-h-10 + tracking Thai-aware; RegimeFooterChip คงพฤติกรรม driftColor แต่ rounded-lg + fallback border นุ่ม border-white/[0.08] bg-white/[0.04]; footer border-t border-white/[0.06]
- Reskin topbar.tsx (props เดิมเป๊ะ {symbol, name, chg1d, regime, loading?, onOpenSearch, onOpenNav, onRefresh}): header h-14 border-b border-white/[0.06] bg-zinc-950/70 backdrop-blur-md; label "กำลังดู" ใช้ MicroLabel (Thai-aware) จาก primitives; ปุ่ม search h-10 rounded-xl bg-white/[0.03] border-white/[0.07] hover white/[0.06]/[0.14] + kbd ⌘K chip เดิม; RegimeMiniPill = oqe-panel rounded-lg + PulseDot tone warn (amber); ปุ่ม icon refresh/menu h-10 w-10 rounded-xl bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.08] คง aria-label + animate-spin เมื่อ loading + disabled:opacity-60
- ตรวจบังคับ: bunx tsc --noEmit → ไฟล์ที่แก้ 0 error (คงเหลือ 4 error เดิมใน examples/websocket/* และ skills/{image-edit,stock-analysis-skill}/* ซึ่งเป็นของเดิมก่อนหน้า ไม่ใช่สโคปนี้); bunx eslint ทั้ง 3 ไฟล์ → exit 0 สะอาด; ตรวจ pattern ห้าม → ไม่มี emoji / ไม่มี blue|indigo|violet|sky|cyan ใน 3 ไฟล์; ตรวจว่าเนื้อ CSS เดิมครบ (scrollbar/selection/spinner/@theme) ด้วยสคริปต์
- ตรวจ runtime ผ่าน dev server จริง: GET / → 200, HTML มี "QUANT COMMAND CENTER" + nav "ศูนย์ควบคุม/Command Center" + "กำลังดู" และไม่เหลือ tagline เดิม "MARKET INTELLIGENCE"; CSS chunk ที่ serve มี oqe-panel/oqe-bg-scene/oqe-ticker-mask/keyframes ครบทุกตัว (หมายเหตุ: Turbopack dev แคช CSS chunk เดิมสักครู่ก่อน recompile — touch ไฟล์แล้วเสิร์ฟชุดใหม่ถูกต้อง; ::after โดน Lightning CSS minify เป็น :after ซึ่งเทียบเท่า)
- ไม่แตะไฟล์อื่นใดนอกสโคป (page.tsx/terminal-view/watchlist/ai-panel/price-chart/category-chips/quant-*/API ไม่ถูกแตะ)

Stage Summary:
- ได้ Design System "Institutional Quant Terminal" ครบชุด: tokens/keyframes/utilities ใน globals.css (oqe-marquee/fade-up+delay-1..6/shimmer/pulse-glow/live-dot/bg-scene/panel/ticker-mask + scrollbar เนียน + reduced-motion) และ primitives.tsx เป็นสัญญา UI กลางให้ Task 13-b (Command Center) import ต่อได้ทันที
- Export contract ของ src/components/dashboard/primitives.tsx (ตรงสเปคทุกชื่อ/prop, ทุก component รับ className passthrough): type Tone = 'up'|'down'|'warn'|'default'; MicroLabel({children, className?}); Panel({title?, subtitle?, actions?, children, className?, bodyClassName?, padded?=true, titleClassName?}); StatTile({label, value, sub?, tone?='default', icon?: LucideIcon, className?}); RadialGauge({value, min?=-2, max?=2, label, sub?, size?=104, tone?='default'}); BreadthBar({adv, dec, flat, className?}); Sparkline({data: number[], width?=72, height?=22, positive?, className?}); TickerTape({items: {symbol, price, chg1d}[], onSelectSymbol?, className?}); SectorHeat({cells: {sector, chg1d, chg21d, n}[], className?}); EquityCurve({data: {date, equity, buyHold}[], className?}); PulseDot({tone?='default', className?})
- Shell ใหม่พร้อมใช้: sidebar มี nav "ศูนย์ควบคุม" (dashboard + terminal) สไตล์ active amber glow + แถบบาร์ซ้าย, topbar เนียนด้วย white/[0.03–0.08] surfaces + PulseDot; หมายเหตุให้ 13-b: view 'dashboard' ยังไม่มีใน page.tsx switch (จะ fallback เข้ากลุ่ม max-w-7xl ว่าง) — ให้ wire Command Center ต่อ และ .oqe-panel อยู่ @layer components จึง override ด้วย utility ได้ปกติ; PulseDot tone อื่น static แต่เรียก live ได้ด้วย className="oqe-live-dot" (ตามที่ brand block ใช้)

---
Task ID: 13-b
Agent: frontend-styling-expert
Task: Command Center Dashboard (หน้าหลักใหม่) + page.tsx wiring

Work Log:
- อ่าน worklog.md ทั้งไฟล์ (เน้น 13-a export contract ของ primitives + shell reskin) และไฟล์สัญญาทุกไฟล์: primitives.tsx (ทุก export/props), page.tsx (shell + ViewKey + useApi pattern), api-types.ts (BoardResponse/BoardRowT/RegimeInfo/BacktestResponse/SeriesResponse/AnalystBriefT), price-chart.tsx (PriceChartProps บนสุด), quant-widgets.tsx (GateChips/SignalBadge), quant-header.tsx (DriftChip), use-api.ts, format.ts — พิสูจน์สเกลข้อมูลจาก engine จริง: rows.chg1d = % (ret1×100), marketChg1d = สัดส่วน (close/prev−1), hitRate/maxDD/expectancy = หน่วย % แล้ว (backtest.ts ×100 ก่อน return), probUp = 0..1, regime string = "X / Y" (split '/' ได้ 2 บรรทัด)
- สร้าง src/components/dashboard/command-center.tsx ('use client', export named CommandCenter + default, props ตายตัวตามสเปค {board, boardLoading, tick, onOpenSymbol}):
  - Data wiring ในตัว: useApi BacktestResponse `/api/backtest?tick=${tick}` + SeriesResponse `/api/market/series/${symbol}?tf=${tf}&bars=180&tick=${tick}` + AnalystBriefT `/api/analyst/${symbol}?tick=${tick}`; symbol/tf เป็น internal state เริ่ม TSE/1D; plan สำหรับ overlay กราฟ = {entryLow, entryHigh, stopHard} จาก analystQ (null เมื่อยังไม่มี); onRefresh = refresh คู่ series+analyst; hooks ทั้งหมด (useMemo ×6: ticker/signals/movers/breadth/sectorCells) อยู่ก่อน early-return เพื่อไม่ละเมิด rules-of-hooks
  - Wrapper: div.oqe-bg-scene min-h-full + TickerTape sticky top-0 z-10 bg-zinc-950/80 backdrop-blur (คลิก → onOpenSymbol(s,'terminal')) + container mx-auto max-w-[1400px] space-y-4 px-3 py-4 sm:px-5 sm:py-5
  - แถว A (grid lg:grid-cols-12, min-w-0 ทุก child): [1] Panel สภาพตลาดวันนี้ (col-span-8, oqe-delay-1) — DriftChip ใน actions; ซ้าย PulseDot tone ตาม regime (CRISIS→down/BULL→up/อื่น warn) + regimeMain text-2xl bold + regimeSub text-sm zinc-500 + "ตลาดวันนี้" text-3xl mono สี chgColor (แปลง marketChg1d×100 → % ที่ถูกต้อง — topbar/quant-header เดิมแสดงสัดส่วนดิบ ไม่แตะเพราะนอกสโคป) + ชิป DECOUPLE ALERTS rose เมื่อ >0 (จำนวน + รายชื่อ symbol truncate); ขวา 3 RadialGauge size 96 (Stress tone กลับด้าน: >0.3→down, Momentum/Flow: >0.3→up, <−0.3→down, กลาง→warn); ล่าง border-t white/[0.06] + MicroLabel MARKET BREADTH + PSI + BreadthBar (adv/dec/flat นับจาก rows). [2] Panel สุขภาพเอนจิน (col-span-4, delay-2) — subtitle เกณฑ์วินัย, actions MonoBadge HIT xx% (≥50 emerald); grid-cols-2 sm:grid-cols-3 มี 6 StatTile (Sharpe/Sortino/Calmar/PF/MaxDD/Expectancy) พร้อม tone ตามเกณฑ์ (MaxDD เก็บเป็น % จึงใช้เส้นตัด 15/20; แสดง −abs เป็น %), loading → skeleton 6 ช่อง animate-pulse, error → กล่อง rose เล็ก + ปุ่มลองใหม่ ไม่พังทั้งหน้า
  - แถว B: [1] section col-span-8 (delay-3) — แถว QUICK PICK: MicroLabel นำหน้า + ชิป mono h-8 rounded-lg ของสัญญาณ (signal ≠ NO_TRADE, เรียง probUp desc, max 6, แสดง prob% เล็ก, active = amber border/bg/text + aria-pressed, คลิก setSymbol) + กล่อง h-[480px] sm:h-[520px] min-w-0 ครอบ PriceChart (data/loading/error/plan/tf/onTfChange/onRefresh ตามสัญญา, ไม่ส่ง onToggleExpand → ปุ่มขยาย disabled). [2] Panel โอกาสที่ดีที่สุดวันนี้ (col-span-4, delay-4) — actions MicroLabel "N signals"; รายการ ≤5 แถวเป็น <button type=button> บล็อกเต็มกว้าง (~84px สูง ≥56) ขอบ white/[0.06] hover amber: แถว 1 symbol mono bold + name truncate + SignalBadge, แถว 2 แถบ P(up) h-1.5 fill emerald-400 + เลข mono, แถว 3 "เข้า x–y · ขนาด z%" + GateChips sm; คลิก → onOpenSymbol(symbol,'decision'); empty state "วันนี้ยังไม่มีสัญญาณที่ผ่านทุกเกต — ถือเงินสดรอ" เรียบ; ท้าย panel border-t + "ย้ายแรงวันนี้" grid-cols-2 ขาขึ้น/ขาลง 3 อันดับ (h-10, chg1d mono สี, คลิก → terminal, aria-label เป็นกลาง "เปลี่ยนแปลงวันนี้" กันกรณีคอลัมน์ขาลงมีค่าบวก)
  - แถว C: [1] Panel เส้นทางความมั่งคั่ง (col-span-7, delay-5) — actions MonoBadge คู่ SHR/MDD; body = EquityCurve(bt.equity) หรือ skeleton h-56 เมื่อไม่มี bt. [2] Panel ภาพความร้อนกลุ่มอุตสาหกรรม (col-span-5, delay-6) — SectorHeat จาก groupBy sector (avg chg1d/chg21d + n)
  - Skeleton เต็มหน้าก่อน board มา (CommandCenterSkeleton, role=status + aria-busy={boardLoading}): แถบ sticky h-10 + grid โครงเดียวกับของจริง (8/4, 8/4, 7/5) animate-pulse — ไม่กระพริบเลย์เอาต์เมื่อข้อมูลถึง; กัน layout-shift ของ header actions ด้วย MonoBadge "HIT —" placeholder ระหว่างโหลด
  - กฎออกแบบครบ: สี emerald/rose/amber/zinc เท่านั้น, ตัวเลข font-mono tabular-nums ทุกจุด, ปุ่มทุกปุ่ม type="button" + aria-label/aria-pressed, ไม่มี emoji, sub-component (MonoBadge/Skeleton) อยู่ระดับ module
- แก้ src/app/page.tsx (จุดเดียวที่แตะนอกไฟล์ใหม่): import CommandCenter + PulseDot (จาก dashboard primitives), type ViewKey เพิ่ม 'dashboard' บนสุดของ union, useState<ViewKey>('dashboard') เป็น default, main เป็น if/else 3 ทาง: dashboard → <CommandCenter board boardLoading tick onOpenSymbol={(s,v)=>{setSymbol(s); setView(v ?? 'decision')}} /> อยู่นอก div max-w-7xl (CommandCenter จัด max-width เอง), terminal → TerminalView เดิม, อื่น ๆ → div max-w-7xl เดิมคงเดิมทุกแท็บ; footer: border-t เปลี่ยนเป็น border-white/[0.06] + ครอบ "pipeline ready…" ด้วย inline-flex + PulseDot tone="up" หน้าข้อความ (ข้อความ/โครงอื่นคงเดิมทุกตัวอักษร); ⌘K pickFromSearch คงไป terminal; ยืนยัน sidebar key 'dashboard' (ทำไว้ใน 13-a) เดินทางถึง view จริง
- ตรวจบังคับ: bunx tsc --noEmit → ไฟล์ที่สร้าง/แก้ 0 error (คงเหลือ 4 error เดิมใน examples/websocket/* และ skills/* ไม่ใช่สโคป); bunx eslint command-center.tsx + page.tsx → exit 0; dev.log ท้ายไฟล์ไม่มี compile error, GET / 200; E2E ผ่าน agent-browser จริง: desktop 1440 hero แสดง RECOVERY + gauge + breadth + ticker 22 ตัว + quick-pick เรียง P(up) ถูก (PTTEP 60% → SCB 58% → INTUCH 57% → PTTGC 55%), คลิกแถวโอกาส SCB → ไป Decision view, กด sidebar "Command Center" → กลับมาถูก, console สะอาด ไม่มี page error, overflow-x = 0 ทั้ง 1440 และ 390px, 390px stack เดี่ยว 1 คอลัมน์
- ไม่แตะ: primitives.tsx, ทุกไฟล์ components/terminal และ components/quant (import อย่างเดียว), ทุก API route, globals.css

Stage Summary:
- Command Center เป็นหน้า landing ใหม่ของแพลตฟอร์มแล้ว (default view 'dashboard') ครบ 3 แถวตามสเปค: Hero (สภาพตลาด + 3 gauges + breadth | สุขภาพเอนจิน 6 KPI วินัย), กราฟ (quick-pick + PriceChart 180 bars + plan overlay | โอกาสที่ดีที่สุด + movers), และเส้นทางความมั่งคั่ง + ภาพความร้อนกลุ่ม — ทุก panel ใช้ design system 13-a (oqe-panel/oqe-bg-scene/oqe-fade-up delay 1–6) และกัน error ของตัวเอง
- การตัดสินใจสำคัญ: (1) marketChg1d เป็นสัดส่วน จึง ×100 ก่อน fmtPct ต่างจาก topbar/quant-header เดิมที่แสดงดิบ (พบ quirk เดิมของระบบ ไม่แก้เพราะนอกสโคป — ควร follow-up) (2) ค่า hitRate/maxDD/expectancy เป็นหน่วย % แล้วจาก engine จึงใช้เส้นตัด 15/20 ไม่ใช่ 0.15/0.20 ตามตัวอักษร (3) MicroLabel ใช้ "DECOUPLE ALERTS" สะกดตรงกับศัพท์ในระบบ (สเปคพิมพ์ "DECUPLE" ซึ่งเป็น typo) (4) hooks ทั้งหมดก่อน early-return เพื่อกัน rules-of-hooks และ skeleton โครงเดียวกับของจริงเพื่อไม่กระพริบ (5) ปุ่มลับ mover ใช้ aria-label เป็นกลางเพราะคอลัมน์ "ขาลง" อาจมีค่าบวกเมื่อตลาดขาขึ้นทั้งกระดาน
- จุดระวังตอน integrate: PriceChart สูง intrinsic ~600px (header+SVG 460+footer) ในกล่องสเปค 480/520px → panel เลื่อนภายในได้ (overflow-y-auto ในตัว) ถ้าอยากเห็น footer OHLCV เต็มให้เพิ่มความสูงกล่องเป็น ≥640px; tick ของ CommandCenter มาจาก refreshAll ของ page.tsx จึงรีเฟรชครบทั้ง board/backtest/series/analyst พร้อมกัน; page.tsx ยังโหลด board ด้วย useApi('/api/board') เดิม (ไม่มี tick) — เส้นนี้ตั้งใจคงไว้
---
Task ID: 13 (orchestrator) + 13-a + 13-b
Agent: main orchestrator (Z.ai Code) + frontend-styling-expert
Task: ออกแบบ Dashboard layout ใหม่ทั้งหมด — "เนียนตา สวยงาม มืออาชีพระดับสูง" → Command Center เป็นหน้าหลักของ Omniscient Quant Engine

Work Log:
- 13-a (frontend-styling-expert): globals.css เพิ่ม design system (oqe-marquee/fade-up/shimmer/pulse-glow/oqe-bg-scene/oqe-panel/oqe-ticker-mask + prefers-reduced-motion, scrollbar นุ่มขึ้น); สร้าง src/components/dashboard/primitives.tsx 11 primitives (Panel/MicroLabel/StatTile/RadialGauge/BreadthBar/Sparkline/TickerTape/SectorHeat/EquityCurve/PulseDot/Tone); reskin sidebar.tsx (กลุ่มใหม่ "ศูนย์ควบคุม": dashboard + terminal, active amber glow + แถบซ้าย) + topbar.tsx (backdrop-blur, ขอบ white/[0.06]) — props เดิมครบ, ใช้ได้ทั้ง desktop rail + mobile Sheet
- 13-b (frontend-styling-expert): สร้าง src/components/dashboard/command-center.tsx (~520 บรรทัด) = TickerTape sticky (22 ตัว คลิกได้) → แถว A hero regime (3 RadialGauge Stress/Momentum/Flow + BreadthBar + Decouple alerts + DriftChip) | สุขภาพเอนจิน 6 KPI วินัย Part IV (Sortino/Calmar/PF/MaxDD/Expectancy เทียบเป้า) → แถว B Quick-Pick chips + PriceChart (plan zone + S/R) | โอกาสที่ดีที่สุด (P(up) bar + GateChips) + ย้ายแรงวันนี้ → แถว C EquityCurve (กลยุทธ์ vs ซื้อถือ + hover tooltip) | SectorHeat; page.tsx เพิ่ม ViewKey 'dashboard' เป็น default + onOpenSymbol(s, view) + footer เนียนขึ้น
- Orchestrator E2E (agent-browser 1440×900 + 390×844) จับ bug 4 จุดและแก้เอง:
  1. topbar.tsx + quant-header.tsx: regime.marketChg1d เป็น fraction (0.0158) แสดง "+0.02%" ผิดสเกล → ×100 ก่อน fmtPct (ตอนนี้ +1.58% ตรงกับ hero)
  2. StatTile panel col-span-4 ÷ grid-cols-3 = 102px → ค่า Expectancy "+1.11%" ตกขอบ → เปลี่ยน A2 เป็น grid-cols-2 เท่านั้น + subtitle สั้นลง
  3. SectorHeat lg:grid-cols-4 ทำชื่อกลุ่มถูกตัด ("Ene...") → เหลือ grid-cols-2 sm:grid-cols-3 (ตอนนี้ Energy/Tourism/Consumer/Banking/Digital/Renewable เต็มชื่อ)
  4. ยืนยัน legend "ซื้อถือ" สะกดถูกต้อง (ไม่ใช่ typo ตามที่เข้าใจแรกจากภาพ)
- ทดสอบ interaction ครบ: Quick-Pick chip → กราฟสลับ SCB พร้อม plan zone/STOP จริง; คลิกแถวโอกาส (aria-label "เปิดใน Decision") → ไป Decision (L6) ของ PTTEP ครบ 5-Gate + Trade Plan; คลิก GULF บน ticker → เปิด Terminal (watchlist+chart+AI panel สลับพร้อมกัน, NO_TRADE โชว์ G2/G3 ตก); mobile sheet nav → Command Center; sticky footer อยู่ล่างเสมอ; overflow-x = 0 ทั้ง 2 ขนาดจอ; console + dev.log สะอาด; eslint exit 0; tsc ไฟล์เรา 0 error (เหลือ error เดิมใน skills/, examples/)

Stage Summary:
- แพลตฟอร์มมีหน้าหลักใหม่ = "Command Center" (default view) ระดับ institutional: ดีไซน์ภาษาเดียวทั้งระบบ (ขอบ white/[0.06], panel gradient, micro-label tracking, mono tabular-nums, fade-up ไล่ delay, ticker marquee หยุดเมื่อ hover) — ผูกข้อมูลจริงจากเอนจินทุกชั้น: board (regime/breadth/signals/gates), backtest (KPI วินัย + equity curve), series+analyst (กราฟ + plan)
- Sidebar เพิ่มกลุ่ม "ศูนย์ควบคุม" (Command Center + Terminal) นำหน้าแท็บเดิมครบ 10 แท็บ; ทุก view เดิมยังทำงานเหมือนเดิม
- แก้ bug สเกล marketChg1d ที่ติดมาตั้งแต่เดิมทั้ง topbar และ quant-header
- Artifacts: globals.css, components/dashboard/{primitives,command-center}.tsx, terminal/{sidebar,topbar}.tsx, quant/quant-header.tsx, app/page.tsx
---
Task ID: 14
Agent: main orchestrator (Z.ai Code)
Task: "นำมาปรับใช้ในส่วนที่เข้ากันได้ หรือเพิ่มความสามารถได้" (upload Pasted Content_1790578368504.txt) — ปิดช่องสุดท้ายของ Part IV/V: Risk MDX 7 มิติ + Antifragility Index

Work Log:
- Upload ไม่มาอีกครั้ง: /home/z/my-project/upload/ ว่าง + find ทั้งดิสก์ไม่เจอ (ปัญหาเดิมจาก Task 11/12) → ดำเนินการตามเจตนาต่อจาก Task 10/11: สำรวจเอนจินทั้งหมดแล้วพบว่า Part IV/V ถูกหลอมไปมาก (meta-risk.ts, micro.ts, apex.ts, synthesis 13 สาย) เหลือชิ้นที่สเปคระบุชัดแต่ยังไม่มี = 7 มิติความเสี่ยง (MDX เน้น Liquidity + Behavioral), ดัชนี Antifragility, size override เชิงบังคับ
- src/lib/quant/engine/mdx.ts (ใหม่): buildRiskMdx() ถอดความเสี่ยงเป็น 7 มิติ (score 0–100 ยิ่งสูงยิ่งเสี่ยง): MARKET .12 (F_stress/regime/slope), LIQUIDITY .20⭐ (Roll spread/Amihud impact/exit complexity/ADV20 piecewise), BEHAVIORAL .18⭐ (mirage/RSI chase/reflexivity phase/สายแพ้ Journal/precommitment), MODEL .15 (เงื่อนไขตาย/calibration skew/PSI/hit rate), CONCENTRATION .12 (ธีมเดียวกัน/ใช้เงินรวม/ขนาดไม้/cash), TAIL .15 (CVaR/LTD/gap 3σ/P(ruin50)), EXECUTION .08 (slippage/R/R/ระยะจากโซนเข้า) → composite = Σ(w·score) + band 4 ระดับ (ต่ำ/กลาง/สูง/วิกฤต) + SIZE OVERRIDE: OK (<50) / HALF (50–74 ลดครึ่ง) / ZERO (≥75 ห้ามเปิดไม้ใหม่) + topRisk มิติเสี่ยงสุด
- buildAntifragility() ในไฟล์เดียวกัน: ดัชนี 0–100 จาก 5 องค์ประกอบ — Drawdown Throttle (พิสูจน์ด้วย MC fixed vs scaled: ratio 1−pScaled/pFixed), Cash Optionality (cash/40%), Automated Brakes (เกราะชั้น 3–5: stops+kill switch/เพดานตัว-ธีม/cash+ตัดวงจร), Crisis Survival (MC 6 สถานการณ์จริงจาก apex.ts), Reflex Discipline (สถานการณ์ REFLEX −23.5% รอดไหม) → verdict ANTIFRAGILE ≥75 / ROBUST ≥55 / FRAGILE ≥35 / บอบช้ำ
- meta-risk.ts: เรียก microstructureMetrics() + ส่ง MdxInput (reg/reflexPhase/psiStress/ruinFixedScaled P50/calSkew/deathsTriggered/planReady/rr/lossAtStop) → buildRiskMdx + buildAntifragility เพิ่มใน MetaRiskDossier (riskMdx, antifragility)
- api-types.ts: MdxDimT / RiskMdxT / AntifragilityIndexT + extend MetaRiskDossierT
- meta-risk-tab.tsx: Panel 8 "Risk MDX — ภาพรวมความเสี่ยง 7 มิติ" (chip MDX รวม + chip SIZE OVERRIDE + chip มิติเสี่ยงสุด + การ์ด 7 มิติ grid 3 คอลัมน์ แต่ละใบมี meter aria + หลักฐานสด) + Panel 9 "ดัชนี Antifragility" (chip ระดับ + verdict + องค์ประกอบ 5 ใบ) + caption แท็บอัปเดต; ระหว่างแก้ไฟล์ edit ทำ Checklist ทับ — ตรวจจับและซ่อมกลับทันที
- ผลตรวจจริง (curl): TSE MDX 43 (LIQUIDITY 60 สูง/EXECUTION 72 สูง = small-cap จริง) | SCB MDX 32 (LIQUIDITY 2 = mega-cap) | PTTEP BEHAVIORAL 52 (reflex EXHAUSTION) | GULF 34 | MODEL 58 ทุกตัวจาก PSI 3.978 HEAVY (สอดคล้อง drift ที่รู้อยู่แล้ว) | AF 95 ANTIFRAGILE ทุกตัว (ขนาดไม้ถูกคุม, cash 49%)
- Agent Browser E2E: Meta-Risk tab แสดง Panel 8/9 ครบทั้ง desktop 1440 และ mobile 390 (stack เดี่ยว ไม่ทับ ไม่ overflow), สลับ SCB→TSE ผ่าน dropdown ข้อมูลเปลี่ยนจริง (MDX 32→43, spread 0→252 bps), Command Center + Apex regression ผ่าน, console/dev.log สะอาด, bunx tsc 0 error (นอกสโคปเดิม), bun run lint exit 0

Stage Summary:
- Part IV/V บูรณาการ 100% แล้ว: เพิ่ม "แผนที่ความเสี่ยง 7 มิติ" (เน้น Liquidity + Behavioral ตามสเปค) ที่ไม่ได้อธิบายแค่ตัวเลข แต่ออกคำสั่งขนาดไม้ (OK/HALF/ZERO override) และ "ดัชนี Antifragility" ที่วัดว่าระบบได้ประโยชน์จากความโกลาหลหรือแค่ทน
- ข้อจำกัดที่รู้ตัว: SIZE OVERRIDE ยังเป็นคำสั่งแสดงผลใน Meta-Risk (ยังไม่ไปหั่น plan.sizePct ของ gates โดยตรง — ควร follow-up ให้ synthesis/apex อ่าน MDX override ด้วย ถ้าจะบังคับทั้งระบบ)
- Artifacts: src/lib/quant/engine/mdx.ts, meta-risk.ts (wire), api-types.ts (types), meta-risk-tab.tsx (Panel 8/9)
---
Task ID: 15 (บูรณะเข้า repo honest-oracle)
Agent: Claude Code (session claude/funny-hopper-2z0g9h)
Task: "ต้องการสร้าง platform completed" — นำ workspace ต้นฉบับ (z.ai, 8 commit, HEAD a3d421b) เข้า repo เป็นแอปอิสระ `omniscient-quant-engine/` แล้วทำให้ "เสร็จ" ตามมาตรฐานของ repo: เกตเดียว (typecheck · lint · test · build · smoke), ความปลอดภัย, LLM ที่ซื่อสัตย์, เอกสาร, CI

Work Log:
- บูรณะ 1:1: คัดลอกทุกไฟล์ของ workspace (src/, prisma/, db/custom.db, public/, config, worklog.md) ยกเว้นของที่ผูกกับ container z.ai (.zscripts/, Caddyfile, .env absolute path, download/, mini-services/, tool-results/, examples/ ที่มี tsc error ค้าง, tests/*.sh ของ template) · ลบ tailwind.config.ts (Tailwind 4 ใช้ @theme ใน globals.css, components.json ชี้ config ว่าง) · แก้ .gitignore ของ template ที่มีบรรทัด `test`/`prompt`/`.env*` (จะซ่อน src/test/ และ .env.example) · registry ใน bun.lock `.com` → `.org`
- Baseline: tsc 0 error, eslint สะอาด — แต่ `next build` เดา workspace root เป็น repo (มี package-lock.json ของแอปหลัก) → standalone ไปโผล่ที่ `.next/standalone/omniscient-quant-engine/server.js` และหยิบ `middleware.ts` ของแอปหลักมาเป็น Proxy ของแอปนี้ → แก้ด้วย `outputFileTracingRoot` + `turbopack.root` ใน next.config.ts, ถอด `typescript.ignoreBuildErrors` (เกตต้องซื่อสัตย์), เพิ่ม security headers + CSP, `poweredByHeader: false`, `images.unoptimized`
- LLM: สร้าง `src/lib/llm.ts` เป็นชั้นเดียว — OpenAI-compatible ผ่าน env (OQE_LLM_API_KEY + OQE_LLM_MODEL + OQE_LLM_BASE_URL) / z-ai-web-dev-sdk เมื่อพบ .z-ai-config (คง system→assistant + thinking disabled ตามต้นฉบับ) / ไม่มี → LlmUnavailableError → route ตอบ 503 พร้อมวิธีตั้งค่า (ไม่ใช่ 500 ดิบ) · ย้าย 3 จุดเรียก (audit, synthesis POST, askAnalyst) มาใช้ชั้นนี้ · `extractJsonObject` แทน regex ตัด code fence · `/api/health` รายงาน llm.configured
- ความปลอดภัย: `src/proxy.ts` + `src/lib/security/` (net/csrf/rate-limit/auth/config/policy/messages — port แบบเดียวกับ thai-momentum-platform แต่ใช้ HTTP Basic แทน session cookie) — โหมด local รับเฉพาะ loopback (เครื่องอื่น 403 พร้อมวิธีตั้งรหัส), โหมด auth ด้วย OQE_AUTH_PASSWORD (Basic) + OQE_API_TOKEN (Bearer ที่ /api/*), CSRF (Sec-Fetch-Site/Origin/Content-Type JSON) ทุกโหมด, rate limit LLM POST 4/นาที · แชท 12/นาที · seed 2/นาที · รายงานหนัก 60/นาที, brute-force 5/นาที/IP + 30/นาทีรวม · dev/start bind 127.0.0.1, start ด้วย node
- Risk MDX override (follow-up ที่ Task 14 ทิ้งไว้): `kellyVolSizing` รับ mdx → finalSize = min(Kelly, CVaR, 25) × {OK 1, HALF 0.5, ZERO 0} + ฟิลด์ sizeBeforeMdxPct/mdxOverride/mdxComposite · `buildApexDossier(..., { riskMdx })` · route /api/apex คำนวณ meta-risk ก่อนแล้วส่ง riskMdx เข้า apex · verdict/headline/execution และ apex-tab (แถว waterfall "× Risk MDX override", กล่อง Final) แสดงคำสั่ง
- Test suite (bun test + preload SQLite ชั่วคราวจาก schema จริง — ไม่แตะ db/custom.db): rng (determinism, gaussian, Student-t, tradingDates), stats (MWU, BH-FDR, Cohen's d, hypergeom, Kendall/Clayton, PCA, PSI, KDE), market (22×750, OHLC, PIT, seed), engine invariants ทั้ง 7 ชั้น (seed/panel, gates ทุกหุ้น, backtest deterministic, factors/volcano/Θ, board sorting, decision, synthesis 13 สาย + verdict band, meta-risk ruin/MDX/antifragility, apex ×MDX, terminal, journal), llm (provider resolution, OpenAI-compatible ผ่าน fake fetch, z-ai ผ่าน fake SDK, 503/502), security (net/csrf/auth/config/rate-limit/policy ทั้ง local + auth + brute force) = 65 test · deploy/smoke.test.ts 3 test
- `deploy/smoke.ts`: เปิด standalone server บนสำเนา DB (หรือ DB เปล่า → auto-seed) แล้วเรียก 24 route: GET ทุกเส้น + 404 + POST ที่เรียก LLM ต้อง 503 llm_unavailable + JSON เคร่งครัด (NaN/Infinity) + ไม่มี ⨯ ใน log
- ตรวจจริงกับ server: โหมด local — loopback 200, Host แปลก 403 HTML, XFF ปลอม 403 JSON, cross-site POST 403, form POST 415, POST /api/audit ครั้งที่ 5 ใน 1 นาที 429, headers CSP/X-Frame-Options/nosniff ครบ ไม่มี X-Powered-By · โหมด auth — ไม่มี credential 401 + WWW-Authenticate Basic, /api/health 200, Basic ถูก 200/ผิด 401, Bearer ถูก 200/ผิด 401
- Dependency: `bun audit --audit-level=critical` (เกตของ CI) พบ Next 16.1.3 critical 2 รายการ (GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4) → อัปเกรด next + eslint-config-next 16.3.6 (เหมือน thai-momentum-platform) · next-auth (template ใส่มา ไม่มีโค้ดใช้) มี critical GHSA-7rqj-j65f-68wh → ถอดออก · เหลือ moderate/low ใน next-intl/prismjs/jsdiff (template deps ไม่ได้ใช้ในโค้ด — ไม่อยู่ในเกต)
- Ops/เอกสาร: `/api/health`, `/api` index, Dockerfile (multi-stage node 22 + bun, non-root, HEALTHCHECK) + docker-compose (บังคับรหัสผ่าน) + entrypoint (seed volume) — ยังไม่ได้ build image ใน sandbox · `.env.example` ครบทุก env · README.md · docs/PROJECT-SUMMARY.md · root README section + root tsconfig exclude · CI `.github/workflows/omniscient-quant-engine.yml`
- ผลเกตสุดท้าย (เครื่อง sandbox, bun 1.3.11 + node 22): tsc 0 error · eslint 0 · bun test src 65/65 · test:ops 3/3 · next build (standalone ที่ .next/standalone/server.js, Proxy = ของแอปนี้) · smoke demo DB 24/24 (4.6 s) · smoke empty DB 24/24 (6.8 s, auto-seed ใน /api/system 2.8 s) · bun audit critical 0

Stage Summary:
- แอปอยู่ที่ `omniscient-quant-engine/` ใน repo honest-oracle เป็นแอปอิสระ (tsconfig/toolchain/CI ของตัวเอง) — เอนจิน/UI/prompt/schema ของต้นฉบับไม่ถูกแตะ นอกจาก Apex ที่เคารพคำสั่ง Risk MDX แล้ว
- "เสร็จ" ในความหมายของ repo นี้: `bun run verify` เขียว = CI เขียว, ใช้งานนอก container z.ai ได้ (LLM เลือกได้/ปิดได้อย่างซื่อสัตย์), เปิดให้เครื่องอื่นใช้ได้อย่างปลอดภัย, มีเอกสารครบ
- ข้อจำกัดที่รู้ตัว: ข้อมูล synthetic ล้วน · LLM ยังไม่ได้ทดสอบกับผู้ให้บริการจริง · Docker image ยังไม่ได้ build · board/decision ยังแสดง sizePct ก่อน MDX (Apex คือขนาดสุดท้าย)
---
Task ID: 16 (ประเมิน 360 องศา)
Agent: Claude Code (session claude/funny-hopper-2z0g9h)
Task: "ประเมิน 360 องศา" — ให้คะแนน 10 มิติแบบเดียวกับ thai-momentum-platform/docs/scorecard.md พร้อมหลักฐานที่ตรวจได้และเส้นทางสู่ 10/10

Work Log:
- รวบรวมหลักฐาน 3 ชั้น: (1) เกต/CI/smoke/audit จาก Task 15 (2) รีวิวโค้ดและ worklog: เกณฑ์ gates ฝังในโค้ด ไม่มี prereg/hash, worklog Task 1-4 บันทึกการจูน threshold และเลือก seed ให้ regime ปลายทางดีบนข้อมูลชุดเดียวกับที่รายงานผล, ESLint ปิดกฎสำคัญ, component 28 ไฟล์ไม่มี test, ไม่มี error.tsx, งานหนัก synchronous (3) ตรวจในเบราว์เซอร์จริงครั้งแรกของแอปนี้: Playwright + axe-core บน build โปรดักชัน (ไม่ตั้งค่า LLM) ทั้ง 12 มุมมอง desktop 1440 + 3 มุมมอง mobile 390
- ผล browser: overflow แนวนอน 0 ทุกมุมมอง · page error 0 · console warning 0 · console error 3 = log 503 ของปุ่ม AI ที่ตั้งใจ · ปุ่มไม่มีชื่อ 0 · ปฏิสัมพันธ์ 6/6 ผ่าน (⌘K→SCB, แชท/หลอมรวม/audit ตอบ 503 ภาษาไทย, journal seed ผ่าน CSRF, แถว Risk MDX ใน Apex) · โหลดหน้าแรกเย็น 4.6 s · axe พบ violation ทุกมุมมอง: color-contrast 14–68 โหนด/มุมมอง, nested-interactive 22 (watchlist), scrollable-region-focusable 1–2, aria-* ผิด 2–6, aria-hidden-focus 1, เป้าสัมผัส < 24px 13 จุด (ticker) — เป็น backlog แก้ได้ในโค้ด
- เขียน docs/scorecard.md: คะแนนก่อน/หลัง Task 15 ต่อมิติ (เฉลี่ย 4.0 → 5.3), มุมมอง 7 ฝ่าย, ตารางหลักฐานทั้งหมด, นิยาม 10/10, ขั้นตอนนอกโค้ด M0–M5, backlog โค้ด 11 ข้อเรียงตามผลต่อคะแนน, เช็คลิสต์กฎหมาย, ธุรกิจ · ลิงก์จาก README

Stage Summary:
- คะแนนหลังบูรณะ: เครื่องมือ 8.5 · วิจัย 6 · หลักฐานจริง 2 · ข้อมูล 3 · วิศวกรรม 7.5 · ความปลอดภัย 7 · UX/UI 7.5 · ปฏิบัติการ 5 · กฎหมาย 4 · ธุรกิจ 2 → เฉลี่ย 5.3 (ก่อน 4.0)
- สิ่งที่ดึงคะแนนมากที่สุดแก้ด้วยโค้ดไม่ได้ (ข้อมูลจริง เวลา ผู้ใช้) · สิ่งที่แก้ด้วยโค้ดได้ก่อนเลย: ล็อกกติกา + ป้าย "จูนบนข้อมูลจำลอง", robustness ข้าม seed, adapter ข้อมูลจริง, worker thread, component/E2E test + เปิดกฎ lint, /terms, backup/log, Docker verify, axe fixes

---
Task ID: 17
Agent: Claude Code (session 01EpMHhtfxT5nq7BqhZXKr4G)
Task: ปิดช่องว่างตาม scorecard รอบ 1 ให้คะแนนสูงขึ้นครบทุกองค์ประกอบ + แดชบอร์ด COT ตามภาพตัวอย่าง

Work Log:
- กติกาเป็นข้อมูล (`rules.ts`, sha256, `POST /api/rules`, stamp บนทุกรายงาน) · robustness ข้าม 5 seed · CI ของ hit rate/Kelly · `buildPanel` ท่อเดียว
- นำเข้าข้อมูลจริง (CSV/Yahoo/API) + DataSource provenance + ปฏิทิน SET/ความสด · Terminal/micro อ่าน OHLCV จาก DB · สายที่ขาดข้อมูลงดออกเสียง
- บทบาทผู้ชม · ActionLog · security events · zod · errorId · structured log · backup/restore/engine-check · warm-up cache · health ขยาย
- /terms · error/404 · คำแนะนำครั้งแรก · footer จาก provenance · a11y: axe 0 violation · ESLint เต็ม + noImplicitAny · component tests 30 · E2E Playwright+axe ใน CI
- แก้ race ของการ seed ตอน warm-up (single-flight + transaction) ที่ smoke DB เปล่าจับได้
- แดชบอร์ด COT (27 ตลาด, Legacy/Disaggregated, COT Index, ตาราง, pies, gauges) — ข้อมูลจำลองที่รักษาเอกลักษณ์รายงาน CFTC เพราะ cftc.gov ถูก proxy ปฏิเสธ

Stage Summary:
- คะแนนเฉลี่ย 5.3 → 6.3 (docs/scorecard.md รอบ 2) · verify: test 148, ops 12, smoke 44/44, E2E 22/22 + 14/14
- ผล robustness = MIXED → ยังไม่มีหลักฐานว่ามี edge; ต้องนำเข้าข้อมูลจริง ล็อกกติกา แล้ววัดผลนอกตัวอย่าง

---
Task ID: 18
Agent: Claude Code (session 01EpMHhtfxT5nq7BqhZXKr4G)
Task: เน้นปรับใช้งานเฉพาะหุ้นไทยเท่านั้น

Work Log:
- แทนแดชบอร์ด COT (ฟิวเจอร์สสหรัฐฯ 27 ตลาด) ด้วย "เงินไหลนักลงทุน" ในโครงเดิม: SET ทั้งตลาด = ยอดซื้อ/ขาย/สุทธิของนักลงทุน 4 ประเภท · หุ้นรายตัว 22 ตัว = NVDR เทียบผู้ลงทุนอื่น + short sale (SET ไม่เผยแพร่ประเภทนักลงทุนรายหุ้น)
- `src/lib/flows/`: generator deterministic ผูกกับราคา/ปริมาณของ panel เดียวกับ Terminal (เอกลักษณ์ Σซื้อ = Σขาย = มูลค่า, Σสุทธิ = 0 ตรงระดับ 0.01 ล้านบาท) · รวมรายสัปดาห์ที่ทนวันหยุด · ตารางใช้สัปดาห์ที่ครบ · ช่วงเวลา 1D–1Y/YTD · Flow Index 6/36 เดือน · สรุปจากตัวเลขด้วยกฎตายตัว · test 8 ข้อ
- `GET /api/flows` · `GET /api/flows/{SET|symbol}` · UI `src/components/flows/` (สีกลุ่มผ่าน validator CVD/contrast บนพื้นมืด, แท่งเทียนขึ้นโปร่ง/ลงทึบ, legend + ค่าล่าสุด, แกนเริ่ม 0 สำหรับขนาด, meter แทนวงกลม 2 ชิ้น)
- หุ้นไทยเท่านั้นทั้งระบบ: ช่องค้นหา "ค้นหาหุ้นไทย" · ingest รับเฉพาะ `currency: "THB"` · Yahoo ต่อ `.BK` เสมอและปฏิเสธผลที่ไม่ใช่ THB · prompt ของ AI Analyst จำกัดขอบเขต · /terms, metadata, README, PROJECT-SUMMARY
- set.or.th / settrade.com / tfex.co.th ถูก egress proxy ปฏิเสธ (403) → ยอดเงินไหลเป็นข้อมูลจำลอง มีป้ายบอกทุกหน้า (ไม่ได้อ้อม)

Stage Summary:
- v1.3.0 · test 151 · ops 12 · smoke 45/45 (demo DB และ DB เปล่า) · E2E 23/23 มุมมอง (รวมเงินไหล desktop + มือถือ) ผ่าน axe งบ 0 · 14/14 interaction
- งานต่อ: importer ข้อมูลจริงของหน้าเงินไหล (ไฟล์ประเภทนักลงทุน / NVDR / short sale ของ SET)

---
Task ID: 19
Agent: Claude Code (session 01EpMHhtfxT5nq7BqhZXKr4G)
Task: ต้องการ deep research → เพิ่มฟีเจอร์ Deep Research ในแพลตฟอร์ม

Work Log:
- `src/lib/research/`: ประกอบรายงานรายหุ้น 11 หัวข้อจากผลของทุกชั้น (หลอมรวม 13 สาย, 5 Gates + แผนเทรด, Risk, Meta-Risk, Apex, เงินไหล, walk-forward + robustness) — มุมมองของแต่ละหัวข้อมาจากโหวตของสายเดิม ไม่สร้างสัญญาณใหม่ · สรุป/ความเสี่ยง/ข้อจำกัดด้วยกฎตายตัว · Markdown renderer · prompt LLM ที่อ้างตัวเลขจากรายงานเท่านั้น
- `src/lib/quant/engine/dossiers.ts`: บริบทร่วม (backtest, P(up), board, journal) ของ Meta-Risk / Apex / Deep Research → ตัวเลขตรงกันทุกหน้า (route เดิมย้ายมาใช้) · `peekSeedRobustness` อ่านผลที่คำนวณแล้วโดยไม่สั่งคำนวณใหม่
- `GET /api/research/deep/{symbol}` (+ `?format=md`) · `POST` = เรียบเรียงด้วย LLM (ผู้ดูแลเท่านั้น, จำกัดความถี่แบบรายงาน LLM, ActionLog `research.deep`, 503 เมื่อไม่มี LLM) · test เส้นทางสำเร็จด้วยเซิร์ฟเวอร์ LLM ปลอมแบบ OpenAI
- UI: แท็บ Deep Research (จักรวาลหลัก) · เลือกหุ้น · ดาวน์โหลด Markdown · พิมพ์/บันทึก PDF (ซ่อนเมนู + ตัวอักษรเข้มบนพื้นขาว) · สารบัญ · ตาราง 13 สาย · เช็กลิสต์ Part IV/V
- แก้บั๊กที่รายงานนี้เผยให้เห็น: สาย Regime ของหลอมรวมเทียบป้าย regime ทั้งสตริง ("RECOVERY" กับ "RECOVERY / Accumulation") จึงโหวต "กลาง/sideways" เสมอ และเช็กลิสต์ Meta-Risk ข้อ V.4 ไม่เคยตรวจเจอ CRISIS → ตัดสินจากตระกูลของ regime (`regimeFamily`) · สาย G1 ใช้หน้าต่างความชันเดียวกับ G1 gate (เดิมต่างกัน 1 วันจนทิศกลับด้าน) · ข้อความ RECOVERY ตามทิศของความชัน
- `/api` index ครบทุกเส้นทาง · README/terms/PROJECT-SUMMARY

Stage Summary:
- v1.4.0 · test 161 · ops 12 · smoke 50/50 · E2E 26/26 มุมมอง (Deep Research desktop + มือถือ) ผ่าน axe งบ 0 · 15/15 interaction
- ข้อจำกัด: ข้อมูลตั้งต้นและเงินไหลเป็นข้อมูลจำลอง · บทเรียบเรียง LLM ไม่ถูกจัดเก็บ (สร้างใหม่ได้ทุกครั้ง) · ยังไม่ดึงข่าว/งบจากแหล่งภายนอก

---
Task ID: 20
Agent: Claude Code (session 01EpMHhtfxT5nq7BqhZXKr4G)
Task: นำมาปรับใช้งานร่วมกัน (กราฟตัวอย่าง 5 แบบ) → หน้า "จังหวะตลาด" สำหรับหุ้นไทย

Work Log:
- ดัดแปลงกราฟวิเคราะห์จังหวะการทำงาน 5 แบบเป็น 5 แผงของหุ้นไทย: ความพร้อมกัน → หุ้นเคลื่อนแรงพร้อมกัน (|ret| > 2σ ของ 60 วันก่อนหน้า) + breadth % เหนือ MA20 + ปฏิทิน 52 สัปดาห์ · heatmap ชั่วโมง×วัน → ฤดูกาลวัน×เดือน · สัดส่วน model → สัดส่วนมูลค่าซื้อขายรายหมวด + N_eff · แผนที่ความหมาย (UMAP + k-means) → แผนที่วันซื้อขาย (PCA + k-means++ seed คงที่) · ใครเริ่ม turn → ด่านแรกที่บล็อกสัญญาณรายเดือน
- `src/lib/rhythm/`: คำนวณแบบ pure จาก MarketState (ด่านใช้ evaluateGates ตัวเดียวกับ backtest) · cache ต่อเวอร์ชันข้อมูล · หน้าต่างสูงสุด ~3 ปี · เกิน 6 หมวดรวมเป็น "หมวดอื่น ๆ" · หัวข้อแผง = ข้อค้นพบจากตัวเลขด้วยกฎตายตัว · test 20 ข้อ (เทียบการคำนวณมือ, ตรงกับ evaluateGates, deterministic)
- ความซื่อตรงทางสถิติ: ฤดูกาลรายงาน t + q (Benjamini–Hochberg ข้าม 17 ช่อง) — |t| ≥ 2 ที่ไม่ผ่าน FDR ถูกบอกว่าอาจเป็นความบังเอิญ · ผลตอบแทนล่วงหน้าของกลุ่มวันติดป้ายสถิติย้อนหลังในตัวอย่าง · ป้ายข้อมูลจำลองบนหน้า + /terms
- `GET /api/rhythm?symbol=` (rate limit แบบรายงานหนัก · 400/404/409) · UI `src/components/rhythm/` + component test · ชิ้นส่วนกราฟร่วม `src/components/charts/chart-kit.tsx` (ย้ายจากหน้าเงินไหล) · ชื่อหมวดภาษาไทยย้ายไป `src/lib/flows/format.ts`
- สี: categorical 6 ช่องผ่าน validator (adjacent CVD ΔE 8.4 / normal 19.3 บน #0f0f11) · scatter ใช้ 2 สี + เทา (all-pairs ΔE 26.8) · diverging น้ำเงิน↔แดงไล่ใน OKLab ความสว่างเท่ากันต่อขั้น · heatmap มีตารางข้อมูล + ค่าเมื่อชี้ · มือถือเลื่อนแนวนอนในกรอบ (ไม่ล้นหน้า)
- บั๊กที่ test/axe จับได้: อ่าน provenance พร้อมกับการ seed DB เปล่า → ป้าย "ไม่ทราบที่มา" (แก้: โหลด state ก่อน) · Recharts ใส่ role="img" ไร้ชื่อให้จุด scatter ทุกจุด (631 violation) → ซ่อนตัวกราฟข้างใน ChartFrame จาก AT (ชื่อ/สรุปอยู่ที่ role="img" ชั้นนอก) · `<dl>` มี span แทรก

Stage Summary:
- v1.5.0 · test 186 · ops 12 · smoke 54/54 (demo DB) + DB เปล่า · E2E 29/29 มุมมอง (จังหวะตลาด desktop, KBANK, มือถือ) ผ่าน axe งบ 0 · 16/16 interaction
- ข้อจำกัด: รูปแบบทั้งหมดมาจากข้อมูลจำลอง · ฤดูกาลมีตัวอย่างเพียง 2–3 ครั้งต่อเดือนปฏิทิน · งานต่อ: แหล่งอ้างอิงของ Deep Research (แนบเอกสาร + อ้างอิง [S#] + เก็บรายงาน AI)

---
Task ID: 21
Agent: Claude Code (session 01EpMHhtfxT5nq7BqhZXKr4G)
Task: "หลอมรวมกับของเดิม" (กราฟต้นฉบับ 5 แบบ) + "นำมาปรับใช้" (รายงานของ FinFlow จากอีก session)

Work Log:
- บทเรียนจาก FinFlow ที่ใช้กับ OQE ได้จริง (ทดสอบซ้ำก่อนแก้): `bun run start` กับ `.env` ค่าเริ่มต้น (SQLite path สัมพัทธ์) เปิดฐานข้อมูลไม่ได้ ("Unable to open the database file", /api/health = down) เพราะ standalone chdir ไป .next/standalone → `src/lib/sqlite-path.ts` แปลงเป็น absolute เทียบ `<โปรเจกต์>/prisma/` เฉพาะตอนรันจาก standalone (dev/สคริปต์/test/Docker ไม่แตะ) · กติกาเดียวกันใช้ร่วมกับสคริปต์ ops · `/favicon.ico` 404 → `src/app/icon.svg`
- ข้อที่เหลือของ FinFlow ไม่เกิดกับ OQE: build ตรวจ type อยู่แล้ว (ไม่มี ignoreBuildErrors) · ไม่มีนาฬิกา render ฝั่ง server · seed มีข้อมูลเต็ม · ตัว FinFlow เองอยู่คนละ repo ที่ session นี้เข้าไม่ได้ จึงยังไม่ได้นำเข้า
- หน้าจังหวะตลาดเพิ่มองค์ประกอบของกราฟต้นฉบับ: บรรทัดตัวเลขสำคัญใต้หัวข้อทุกแผง · ตัวเลขทุกช่อง heatmap + กรอบช่องสูงสุด/ต่ำสุด + แท่งขอบบน/ขวาพร้อมค่าและเส้นเฉลี่ย (แรเงาเดือนที่ |t| ≥ 2) · คำอธิบายวันพุ่งในกราฟ · การกระจายรายเดือน · breadth เดือน × วันพร้อมขอบขวา (เฉลี่ย | % วัน > 50%) · ป้ายชื่อหมวดในพื้นที่ซ้อน · แท่งคู่รายเดือน (มูลค่า | เงินไหล) พร้อมยอดรวม + N_eff · ป้ายกลุ่มพร้อม % ของวัน + เส้นทาง 5 วันล่าสุด · % ในแท่งซ้อนของด่าน + จำนวนหุ้น-วันใต้เดือน · สัญญาณ pullback (ทึบ) / momentum (โปร่ง) พร้อมยอดรวม
- หลอมรวมกับหน้าเดิม: Command Center มีแถบจังหวะตลาด (`/api/rhythm?view=summary`) · Deep Research มีหัวข้อที่ 12 "จังหวะตลาด & จังหวะของหุ้น" (ข้อมูลประกอบ ไม่โหวต · บอกผล FDR เสมอ) · อุ่น cache จังหวะตลาดตอนเริ่มเซิร์ฟเวอร์
- สรุปเทียบ "เดือนแรก → เดือนล่าสุด" ข้ามเดือนแรกที่ไม่เต็มเดือน (เดิมเทียบกับเดือนที่มีแค่ 2 วัน)

Stage Summary:
- v1.6.0 · test 191 · ops 12 · smoke 55/55 (demo + DB เปล่า) · E2E 29/29 มุมมอง · 17/17 interaction (รวมแถบจังหวะตลาดใน Command Center)

---
Task ID: 22
Agent: Claude Code (session 01EpMHhtfxT5nq7BqhZXKr4G)
Task: นำรูปแบบ "Grid Behavior Atlas" (A–F) มาช่วยวิจัยระบบแบบ 360 องศา เพื่อเพิ่มประสิทธิภาพสูงสุด → หน้า "Atlas พฤติกรรมระบบ"

Work Log:
- ดัดแปลง 6 มุมของ Atlas บอท grid เป็นการส่องเอนจิน 5 ด่านบนหุ้นไทย: A แผนที่สถานะตลาด (ตำแหน่งบนแผนที่บอกผลของโมเดลได้ไหม) · B จังหวะเวลา · C ความลึก (สัญญาณพร้อมกัน + หางของการกระจาย) · D ส่วนผสมกำไร/ขาดทุน (กระจุกแค่ไหน · N_eff) · E เริ่มอย่างไร จบอย่างไร (+ กติกาออกทางเลือก) · F ทดสอบความฉลาดแบบ walk-forward (AUC + ปรับคันโยก)
- `src/lib/atlas/`: แยกข้อมูล 2 ชุดชัดเจน — (1) สัญญาณตามกติกาทั้งหน้าต่าง (ตารางด่านชุดเดียวกับหน้าจังหวะตลาด) จำลองเป็นไม้ตาม OHLC จริง: เข้าราคาปิด · stop = `plan.stopHard` · เป้า +2R · ถือ ≤ 5 วัน · แตะสองฝั่งวันเดียวกัน = stop ก่อน · เปิดกระโดดผ่าน stop = ออกที่ราคาเปิด → ผลในตัวอย่าง (B–E) (2) walk-forward backtest → P(up) นอกตัวอย่าง (A, F)
- สถิติ (`stats.ts`, pure + seed คงที่): circular block bootstrap (บล็อก 5 วัน) · ส่วนต่างแบบจับคู่ + p สองทาง · AUC ถ่วงน้ำหนัก O(n) ต่อรอบบนลำดับที่เรียงครั้งเดียว (bootstrap แบบบล็อกของ "วัน") · p จากการเลื่อนผลเป็นวงกลม (คงความสัมพันธ์ตามเวลา) · Spearman · N_eff · k-NN ไม่นับวันที่ห่างกัน ≤ 5 วันทำการ · คันโยก/กติกาออกหลายแบบปรับด้วย Benjamini–Hochberg
- คำตัดสินของคันโยก: ดีกว่า/แย่กว่า ต้อง q < 0.1 และ CI ไม่คร่อมศูนย์ · คันโยกที่ไม่เปลี่ยนผลเลยสักวัน = "ไม่เปลี่ยนสัญญาณ" (ไม่ใช่ "ยังสรุปไม่ได้") · ข้อเสนอเพื่อเพิ่มประสิทธิภาพ (ทดลอง / คงไว้ / เฝ้าระวัง) สร้างด้วยกฎตายตัวจากผลที่ผ่านเกณฑ์เท่านั้น — ไม่มีผลใดผ่าน = "อย่าจูนเพิ่มบนข้อมูลชุดนี้"
- `GET /api/atlas` (rate limit แบบรายงานหนัก · 409 ข้อมูลไม่พอ · cache ต่อเวอร์ชันข้อมูล · อุ่นตอนเริ่มเซิร์ฟเวอร์) · UI `src/components/atlas/` (แท็บ MY LAB): forest plot แบบ HTML (ตัวเลขเป็นข้อความทุกแถว) · แผนที่สลับ "สีตามผลของโมเดล / ไฮไลต์กลุ่มวัน" · heatmap จำนวนนับ (ramp น้ำเงินเฉดเดียว) พร้อมขอบบน/ขวาและเส้น "ควรเป็นถ้าเกิดสม่ำเสมอ" · ผลลัพธ์ที่มีลำดับ (ถึงเป้า → stop) ใช้ diverging · ชิ้นส่วน tooltip/ป้าย/tick ย้ายไป `chart-kit.tsx` ใช้ร่วมกับหน้าจังหวะตลาด
- test: `src/lib/atlas/atlas.test.ts` (ไม้จำลองตรงกับการคำนวณมือจาก OHLC · กติกาออกเปลี่ยนผลตามทิศที่ควร · ตัวเลขหัวหน้าสอดคล้องกัน · คำตัดสินตาม q + CI · deterministic) · component test · route test · smoke · e2e (desktop + ไฮไลต์กลุ่มวัน + มือถือ)

Stage Summary:
- ผลบนข้อมูลสาธิต: AUC ของ P(up) 0.511 [0.481, 0.538] ไม่ต่างจากโยนเหรียญ · ไม่มีคันโยกใดผ่านเกณฑ์ · "ไม่ใช้ G4" และ "เฉพาะวัน risk-on" ไม่เปลี่ยนสัญญาณเลย (ด่านอื่นคัดออกก่อน) · stop 20% ของไม้ = 67% ของขาดทุน · กติกาออก "ถือไม่เกิน 10 วัน" ดีกว่า +0.66 จุด/ไม้ (q 0.07, ในตัวอย่าง) · แผนที่สถานะตลาดยังไม่ช่วยเลือกวันให้โมเดล (ρ 0.03, p 0.74)
- v1.7.0 · test 207 · ops 12 · smoke 56/56 · E2E 32/32 มุมมอง (Atlas desktop + ไฮไลต์กลุ่มวัน + มือถือ) ผ่าน axe งบ 0 · 18/18 interaction

---
Task ID: 23
Agent: Claude Code (session 01EpMHhtfxT5nq7BqhZXKr4G)
Task: "มุ่งสู่กระบวนการทำงานอย่างแท้จริง" → วงจรการทำงานประจำวันที่ใช้งานได้จริง (หน้า "กระบวนการทำงาน")

Work Log:
- วงจรหลังตลาดปิด 6 ขั้น: ข้อมูล (ความสดตามปฏิทิน SET) → ล็อกกติกา (pre-registration) → สัญญาณรอบล่าสุด (ชุดเดียวกับ Decision Board) → บันทึกลง Journal ก่อน 10:00 น. ของวันซื้อขายถัดไป → โบรกเกอร์กระดาษติดตามผล → เทียบความคาดหวัง · ทุกขั้นมีสถานะเป็นข้อความ + ปุ่มของขั้น (รันรอบ / ล็อกกติกา)
- `src/lib/workflow/execution.ts` (pure): ทำตามแผนเทรดของแพลตฟอร์มเอง — pullback ตั้งซื้อที่ขอบบนของโซนเข้า · momentum ซื้อที่ราคาเปิด · ราคาตั้งซื้อ/stop ปัดลงตาม tick ของ SET (0.01 … 2 บาทตามระดับราคา) · อายุคำสั่ง 3 วันทำการ · เปิดต่ำกว่า stop = ยกเลิก · ออกที่ stop / +2R / ถือครบ 5 วัน · แท่งเดียวแตะทั้งสองฝั่ง = stop · วันที่ได้ของตรวจเฉพาะ stop · แท่งหยุดซื้อขายไม่จับคู่ · อ่านเฉพาะแท่งหลังวันสัญญาณ (test ยืนยันว่าตัดอนาคตทิ้งแล้วสิ่งที่ตัดสินไปแล้วไม่เปลี่ยน)
- บันทึกลง `JournalEntry` ที่มีอยู่ (ไม่แก้ schema): ป้าย `[รอบอัตโนมัติ]` + meta ใน `gates.cycle` (วันสัญญาณ ชนิด ราคาตั้งซื้อ hash กติกา ชนิดข้อมูล) · หนึ่งหุ้นต่อหนึ่งวันสัญญาณ รันซ้ำไม่ซ้ำ · อัปเดตสถานะไปข้างหน้าเท่านั้น รายการที่จบแล้ว (รวมที่ผู้ใช้ตั้งเอง) ไม่แตะ · รันพร้อมกันหลายทางใช้ผลรอบเดียว
- หลักฐาน forward นับเฉพาะไม้ที่ใช้ข้อมูลจริง + บันทึกหลังล็อกด้วย hash เดียวกับที่ล็อก + บันทึกก่อนตลาดเปิดรอบถัดไป — ไม้อื่นบอกเหตุผลทุกไม้ · ฐานความคาดหวัง = เล่นกระบวนการซ้ำย้อนหลังก่อนวันล็อกด้วยโบรกเกอร์ชุดเดียวกัน (test ยืนยันว่าไม้ที่บันทึกกับการเล่นซ้ำให้ผลเท่ากันทุกประการ) · เทียบด้วย z ของผลเฉลี่ย (R) เมื่อ ≥ 10 ไม้ · เตือนเมื่อต่ำกว่าคาด/ขาดทุนติดกันที่โอกาสเกิด < 1%/ขนาดไม้รวมเกิน 100%/ข้อมูลค้าง/กติกาถูกแก้หลังล็อก
- `GET /api/workflow` · `POST /api/workflow/run` (ผู้ดูแลเท่านั้น · 6 ครั้ง/นาที · ActionLog `workflow.run` — รันจากตัวตั้งเวลา/CLI บันทึกเป็น method SYSTEM) · ตัวตั้งเวลาในเซิร์ฟเวอร์ `OQE_CYCLE_AUTO=1` (หลัง 17:45 น. ของวันซื้อขายเมื่อข้อมูลของวันนั้นเข้า · ครั้งเดียวต่อรอบ) · `scripts/daily-cycle.ts [--fetch yahoo]` สำหรับ cron (exit 3 = ข้อมูลค้าง)
- ข้อมูลจริงจาก session นี้ทำไม่ได้: proxy ของ environment ปฏิเสธ `query1.finance.yahoo.com` (403) เช่นเดียวกับ set.or.th/settrade — กระบวนการพร้อมใช้ทันทีที่รันในเครื่อง/เซิร์ฟเวอร์ที่เข้าถึงได้ หรือนำเข้า CSV
- การเข้าถึง repo ของ FinFlow (`windommx/ANTHROPIC-API-KEY`) ถูกตัวตรวจความปลอดภัยปฏิเสธซ้ำ — ไม่ได้พยายามทางอื่น

Stage Summary:
- การเล่นซ้ำด้วยคำสั่งที่ส่งได้จริงบนข้อมูลสาธิต: 195 สัญญาณ · ได้ของ 50.8% · ชนะ 42.7% · −0.09R [−0.28, +0.13] (รวม −8.0R) เทียบ Atlas ที่ซื้อที่ราคาปิด +0.11R — edge ในตัวอย่างหายไปเมื่อการส่งคำสั่งสมจริง จึงต้องเก็บผล forward ก่อนเชื่อผลย้อนหลัง
- v1.8.0 · test 225 · ops 12 · smoke 58/58 · E2E 35/35 มุมมอง (กระบวนการทำงาน desktop + หลังรันรอบ + มือถือ) ผ่าน axe งบ 0 · 19/19 interaction
