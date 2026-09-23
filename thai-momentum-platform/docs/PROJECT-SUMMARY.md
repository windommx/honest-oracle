# เรียบเรียงเนื้อหาไฟล์ zip 13 ชุด — โปรเจกต์ "Thai Momentum Platform (Jev × Momentum System)"

จัดทำ 22 ก.ย. 2026 จากไฟล์ที่อัปโหลด 13 ไฟล์ (`…-1.zip` ถึง `…-13.zip`)

---

## 1. ไฟล์ทั้ง 13 ชุดคืออะไร

ทั้ง 13 zip คือ **workspace เดียวกันที่ถูกหั่นเป็นชิ้น** ของโปรเจกต์ที่พัฒนาบน container ของแพลตฟอร์ม z.ai (path `/home/z/my-project`, ผู้ commit `Z User <z@container>`, มี dependency `z-ai-web-dev-sdk`, สคริปต์ `.zscripts/*.sh` คอมเมนต์ภาษาจีน) ระหว่างวันที่ **20–22 ก.ย. 2026** เมื่อรวมทุกชุดเข้าด้วยกันจะได้ทั้ง working tree และ git repository ครบสมบูรณ์

| zip | โฟลเดอร์ | เนื้อหา |
|---|---|---|
| 1 (52a3a43f) | `1/` | ไฟล์ config รากโปรเจกต์ (.gitignore, Caddyfile, bun.lock, tsconfig, tailwind, eslint, next/postcss config, components.json) · ภาพหน้าจอธีม 10 ภาพ (`theme-*.png`) · โฟลเดอร์ `upload/` 16 ไฟล์ = เอกสาร/ภาพ/วิดีโอที่ผู้ใช้ป้อนให้ agent |
| 2 (f169f639) | `2/` | `.zscripts/` 9 ไฟล์ (build/dev/start ของ z.ai) · `data/gtaa/panel.json` (ราคาจริง 15 สินทรัพย์ × 360 เดือน) · `db/custom.db` (SQLite ของระบบ) · `docs/research/` 2 ฉบับ · `tests/` 3 สคริปต์ |
| 3 (c45ca8da) | `3/.git/` | ชิ้นส่วน git: `COMMIT_EDITMSG`, `index`, objects 56 ชิ้น |
| 4 (0586790b) | `4/` | **หัวใจของโปรเจกต์**: `src/` ทั้งหมด, `package.json`, `.env`, `research/` (ผลค้นเว็บ 10 ไฟล์), `scripts/` 4 ไฟล์, `worklog.md` (804 บรรทัด บันทึกงานทุก task), `tool-results/` 139 ไฟล์ (ภาพหน้าจอ + log จากการทดสอบ), ภาพ `engines-*.png` |
| 5 (3147889e) | `5/` | โครง git (`HEAD`, `config`, `refs`, `logs` = reflog, `hooks`) · `download/README.md` · `examples/websocket/` (ตัวอย่างจาก template) · objects 74 ชิ้น |
| 6 (200d4084) | `6/` | `lab/` (Python offline kit 11 ไฟล์ + pycache) · `prisma/schema.prisma` · `mini-services/.gitkeep` · objects 139 ชิ้น |
| 7–13 | `7/` … `13/` | git objects ล้วน (72 / 13 / 120 / 201 / 178 / 54 / 102 ชิ้น) |

**ผลการประกอบกลับ:** objects รวม 1,007 ชิ้น (commit 22 · tree 418 · blob 567) ผ่าน `git fsck` และ checkout HEAD (`479545a`) ได้ครบ **447 ไฟล์** ตรงกับ working tree ทุกชิ้น ไม่มีไฟล์ขาด

**ข้อสังเกตสำคัญ:** โปรเจกต์นี้ **ไม่เกี่ยวกับ repo `honest-oracle`** ที่เปิดอยู่ใน session นี้ (repo นั้นคือ NaraClear / Lifemap / Bookisdom) จึงไม่ได้แตะ repo และไม่ได้ commit อะไรทั้งสิ้น เอกสารฉบับนี้เป็นการ "อ่านและเรียบเรียง" อย่างเดียว

---

## 2. โปรเจกต์นี้คืออะไร

**เป้าหมาย (จากหัว worklog):** แปลงระบบโมเมนตัมหุ้นไทยเดิม (AmiBroker → pipeline → "Jev" decision brain → human gate) ให้เป็นเว็บแพลตฟอร์ม fullstack **Next.js 16 + Prisma/SQLite + shadcn/ui** หน้าเดียวที่ `/` ภาษาไทยทั้งระบบ ทำงานใน **PAPER MODE** ตลอด (ไม่ส่งคำสั่งจริง)

**หลักการที่ยึดทั้งระบบ (ปรากฏซ้ำในทุก task):**
- **Evidence-first / pre-registered** — เกณฑ์ตัดสินทุกอย่างลงทะเบียนล่วงหน้าก่อนเห็นผล ไม่มีพารามิเตอร์แอบแฝง
- **Honest verdict** — ผลลบแสดงตรง ๆ (WEAK / NO-GO / FAIL) ระบบไม่ประดับตัวเลข
- **Default-deny Human Gate** — คำสั่งที่กระทบพอร์ตต้องผ่านมนุษย์ ระบบ "แนะนำ" เท่านั้น
- **Audit ที่แก้ย้อนหลังไม่ได้** — EventLog แบบ hash chain (sha256 ต่อเนื่อง)
- **Shadow ก่อน Live** — ทุกเอนจินใหม่ทำงานเป็นเงาสะสมหลักฐานก่อนได้สิทธิ์ตัดสินใจ
- **ติดป้ายความจริงของข้อมูล** — DAILY PROXY / SYNTHETIC / REAL แสดงบนหัวแท็บเสมอ

**ขนาดของโค้ด (ไม่รวม shadcn/ui 50 ไฟล์):**

| ส่วน | ไฟล์ | บรรทัด |
|---|---|---|
| `src/components/platform` (UI 17 แท็บ + shell) | 27 | 14,277 |
| `src/app/api` (API routes) | 46 | 4,644 |
| `src/lib/momentum` (core, engine, signals, arb, stops) | 18 | 4,447 |
| `src/lib/research` (profit engine, CPCV, global engines, thai-fit) | 20 | 3,685 |
| `src/lib/gtaa` | 17 | 2,544 |
| `src/lib/sniper` | 9 | 1,175 |
| `src/lib/lab` + `flagship` + `portfolio` + `skills` + `config` + `platform` | 17 | 3,093 |
| `lab/` (Python offline kit) | 10 | 2,465 |
| `scripts/` (CLI) | 4 | 388 |

รวม TypeScript ประมาณ 34,000 บรรทัด + Python 2,500 บรรทัด

**Stack:** Next.js 16 · React 19 · TypeScript 5 · Prisma 6 (SQLite `db/custom.db`) · Tailwind 4 · shadcn/ui · Recharts · TanStack Query/Table · Zustand · cmdk · Bun runtime · `z-ai-web-dev-sdk` (ใช้เป็น LLM ใน Shadow Lab)

---

## 3. โครงสร้างระบบ

### 3.1 แท็บ 17 แท็บ (จาก `nav-config.ts`)

| กลุ่ม | แท็บ |
|---|---|
| ภาพรวม | ภาพรวม (Command Center) · Momentum Map · สถิติ |
| สัญญาณ & วิจัย | สัญญาณเรือธง (Flagship 1–10) · สัญญาณ · Backtest · ห้องวิจัย · Evidence Board |
| Alpha & ความเสี่ยง | Alpha Stack · SET Sniper (ICT × Flow) · Bayes Stop |
| Global Engines | GTAA Rotation (Faber) |
| Shadow Lab | Shadow Lab |
| ระบบเทรด | Jev AI · พอร์ต |
| Agent | Agent Skill Tree |
| ระบบ | ข้อมูล |

### 3.2 API 46 เส้น (App Router, ไม่ใช้ server action)

- **ข้อมูล:** `/api/seed` `/api/ingest` `/api/dates` `/api/dq` `/api/map` `/api/overview` `/api/report` `/api/stats` `/api/regime`
- **Jev / พอร์ต:** `/api/jev/run` `/api/jev/decisions` `/api/jev/pending` `/api/verify` `/api/portfolio` `/api/portfolio/allocation` `/api/stops` `/api/backtest`
- **สัญญาณ / Alpha:** `/api/signals` `/api/signals/ic` `/api/signals/ab` `/api/arb/pairs` `/api/arb/engines` `/api/ai-score`
- **วิจัย:** `/api/research/prereg` `/api/research/trial` `/api/research/cpcv` `/api/research/importance` `/api/events/audit` `/api/evidence` `/api/evidence/run` `/api/config/th` `/api/engines/global`
- **Lab:** `/api/lab/run` `/api/lab/dashboard` `/api/lab/label` `/api/lab/eval`
- **GTAA:** `/api/gtaa/overview` `/api/gtaa/run` `/api/gtaa/snapshot` `/api/gtaa/history` `/api/gtaa/data` `/api/gtaa/fetch`
- **อื่น ๆ:** `/api/sniper` `/api/flagship` `/api/ops/pulse` `/api`

### 3.3 ฐานข้อมูล 18 model (Prisma) และจำนวนแถวใน snapshot ที่แนบมา

| model | หน้าที่ | แถว |
|---|---|---|
| RawDaily | ราคารายวันต่อหุ้น (close/open/high/low/val/liq5/ret5…ret300) | 124,800 |
| Snapshot | โผ Top-N ต่อ timeframe ต่อวัน | 75,625 |
| SymbolMeta | หุ้น → sector | 240 |
| CrossAsset | SPX / USDTHB / GOLD สำหรับ crossZ | 1,560 |
| Trade | paper trade log (ฐานของ Bayes Stop) | 315 |
| EventLog | hash chain audit | 106 |
| ShadowLog | double-key log rule × Nimble | 31 |
| ResearchRun | trial / cpcv / thai_fit / lab_eval + paramsHash | 23 |
| BacktestRun | ประวัติ backtest | 6 |
| Decision | audit การตัดสินใจของ Jev | 6 |
| Position | พอร์ตกระดาษ | 5 |
| EdgeLabel | label จากมนุษย์ | 5 |
| Setting | prereg / meta_model / signals_policy / config_th | 3 |
| GtaaSignal / GtaaRun | tracking log ของ GTAA | 2 / 1 |
| PendingGate / FuturesDaily / OptionsDaily | human gate / TFEX (STANDBY) | 0 |

`.env` มีตัวแปรเดียวคือ `DATABASE_URL` (path ของ SQLite)

---

## 4. ไทม์ไลน์การพัฒนา (22 commit, เวลา UTC; เวลาไทย +7 ชม.)

commit message ทุกอันเป็น UUID ที่แพลตฟอร์มสร้างอัตโนมัติ เนื้องานจึงต้องอ่านจาก `worklog.md` ประกอบ (เลข Task ใน worklog ซ้ำกันบางเลขเพราะแต่ละ session นับใหม่)

| # | เวลา | commit | งานที่ทำ (Task ใน worklog) |
|---|---|---|---|
| 1 | 09-20 05:49 | `76db55e` | Initial commit ของ template z.ai |
| 2 | 09-20 07:25 | `3db9067` | **Task 1–5:** foundation (Prisma 6 model, `core.ts`, `contracts.ts`), seed 520 วัน × 240 หุ้น, API 15 เส้น, 7 แท็บแรก, E2E ผ่าน browser |
| 3 | 09-20 08:31 | `57f0935` | **Task 6:** ชั้นวิจัย — Profit Engine 7 เกณฑ์, CPCV, Meta-labeling, Prereg, EventLog hash chain, แท็บห้องวิจัย · รับเอกสาร Pasted Content 1 |
| 4 | 09-20 10:28 | `7fd7766` | **Task 7-1 / 7-2-b / 7-2-c / 8:** Thai config, SymbolMeta + sector limits, HRP + Black-Litterman, meta features v2 + importance, Signals v2 + IC harness + A/B shadow, Alpha Stack, CLI `ic` / `fetch:cross` |
| 5 | 09-20 23:17 | `0b6763f` | chmod ทั้งโปรเจกต์ (mode change 154 ไฟล์) + tool-results |
| 6 | 09-21 01:14 | `42e3f1e` | **Task 9-ui + 5-a/5-b/5-c/6:** sidebar shell, Command Center, Bayes Stop (backend + แท็บ), AI-Score API, ธีม Dark Neon Cyberpunk |
| 7 | 09-21 02:09 | `ab7ee6a` | **Task 7:** layout "Mission Control Pro" (nav-config, ⌘K palette, market clock, ticker tape, mobile dock) |
| 8 | 09-21 02:24 | `ba177f2` | **Task 8 / 8-b:** CPCV end-to-end (embargo, preset, 4 กราฟ) + พิสูจน์ห่วงโซ่ deploy meta-model → Jev sizing |
| 9 | 09-21 04:07 | `d494088` | **Task 9-a…9-e / 10:** Evidence Night H1–H4, config_th auto-apply, wiring เข้า Jev, Shadow Lab 2 แท็บ, LAB KIT Python |
| 10 | 09-21 09:17 → 11:48 | `58dd329` → `90b119d` (amend) | **Task 13 (+13-a/b/c):** ธีม Daylight Terminal (สว่าง) ทั้งระบบ |
| 11 | 09-21 23:07 | `59b9345` | **Task 14:** ค้นวิจัยโลก 10 คลัสเตอร์ → 9 Global Engines ทดสอบบน SET → panel ใน Evidence Board |
| 12 | 09-21 23:54 | `69dd84b` | **Task 14 (GTAA):** เอนจิน GTAA Rotation (Faber) + harness + ข้อมูลจริง Yahoo + แท็บ + CLI + docs |
| 13 | 09-22 01:33 | `61dcdb4` | **Task 15 / 15-c:** Macro Gate, Tracking Log ใน DB, readiness, export CSV, การ์ด Global Regime |
| 14 | 09-22 02:13 | `25d5333` | **Task 16 / 16-c:** SET Sniper (ICT × Order Flow) + OHLC ใน RawDaily + docs · รับเอกสาร Pasted Content 2 |
| 15 | 09-22 02:36 | `efc7cca` | **Task 17:** Command Center 2.0 (4 tier, posture, dashboard-prefs) |
| 16 | 09-22 02:49 | `6a1d573` | **Task 18:** Agent Skill Tree (24 โหนด) |
| 17 | 09-22 03:21 | `d567dab` | **Task 14 (ซ้ำเลข):** Command Center 3.0 (.feature/.options, 12 โมดูล, `/api/ops/pulse`) |
| 18 | 09-22 04:54 | `45d8b8a` | **Task 19:** FLAGSHIP สัญญาณเรือธง อันดับ 1–10 |
| 19 | 09-22 06:04 | `d37e7ff` | **Task 20:** Super Options (Options Center, preset, hotkeys, dual layout) |
| 20 | 09-22 06:26 → 08:32 | `838c2ac` → `479545a` (amend) | chmod + เพิ่มไฟล์ใน upload 4 ชิ้น (ภาพ 2, วิดีโอ 2) = **HEAD** |

รูปแบบการทำงาน: agent หลัก (orchestrator) แตกงานให้ sub-agent ขนานกัน (backend / frontend / retheme / theme-migration) แต่ละตัวเขียน Work Log + Stage Summary ลง `worklog.md` และตรวจด้วย `tsc` / `lint` / agent-browser (desktop 1440 + mobile 390) ทุกครั้ง

---

## 5. รายละเอียดแต่ละโมดูล

### 5.1 ชั้นข้อมูล (แท็บ "ข้อมูล")
- **Seed demo:** 520 วัน × 240 หุ้น = RawDaily 124,800 แถว + Snapshot ~75k แถว ใน ~10 วินาที; seed มี market/sector factor, คู่หุ้น cointegrated 16 คู่, CrossAsset synthetic (SPX/USDTHB/GOLD), OHLC deterministic
- **Ingest CSV:** รองรับฟอร์แมตจาก AmiBroker (AFL snapshot รายวัน + history) รวมคอลัมน์ `open,high,low` (nullable) · ingest จริงจะยิง EventLog เพื่อเปลี่ยนป้าย provenance เป็น REAL
- **DQ checks** (leak / duplicate / price floor ฯลฯ) และ Dates overview
- **ค่ากรองไทย** (จาก `src/lib/config/thai.ts`): ราคา ≥ 1.5 บาท, มูลค่าซื้อขาย ≥ 3 ล้าน/วัน ติดกัน 5 วัน, Top-N = 25 ต่อ timeframe, timeframes 5/10/20/40/80/160/300 วัน

### 5.2 Momentum Map · สถิติ · Backtest
- **Momentum Map:** SVG ล้วน 7 คอลัมน์ × 30 อันดับ เส้นเชื่อมหุ้นที่ติดหลายโผ สีตามความถี่ ค้นหา/pin/เฉพาะหุ้นซ้ำ มี compact mode สำหรับหน้าภาพรวม
- **สถิติ:** forward return ตาม hold 5/10/20 แยกตาม timeframe, graduation (โผสั้น → โผยาว), Overlap Ratio z-score เทียบผลตลาด 10 วันข้างหน้า
- **Backtest engine** (`momentum/engine.ts`): ซื้อ T+1 ที่ราคาปิด, exit ด้วย stop หรือครบ hold, หักต้นทุน **cost + slippage ต่อขา** ทั้งใน per-trade และ equity curve · ค่า default ไทย `k3 / hold 8 / stop 9% / maxPos 7 / cost 30bps / slip 40bps`

### 5.3 Jev AI — สมองตัดสินใจ (แท็บ Jev AI + พอร์ต)
- Pipeline `Q_REGIME → Q_ENTRY → Q_ESCALATE → Q_EXIT` (+ `Q_SIGNAL`, `Q_PAIRS`) ทุกคำถามลง Decision audit พร้อม conf/reason · idempotent วันละครั้ง
- กติกา: regime `risk_on` = ซื้ออัตโนมัติในพอร์ตกระดาษ · `neutral` = ส่งเข้า PendingGate (Human Gate อนุมัติ/ปฏิเสธ) · `risk_off` / conf < 0.70 / slots เต็ม = blocked เป็น watch
- **Regime Composite** = 0.35·breadthZ + 0.25·crossZ + 0.20·(1−2·volPct) + 0.20·overlapZ → grossMult 0.25–1.25 → slot budget
- Sizing = base × volMult × boost (เฉพาะสัญญาณที่ PROMOTE) × **meta multiplier** จากโมเดล meta-labeling (clip 0.5–1.5) · ตัวกรองความเสี่ยง MFD > 0.45 block, sector ท้ายตาราง block, sector/group limits
- **config_th** (config-as-data) ถูกอ่านทุกรอบ: น้ำหนัก timeframe หล่อเข้าคะแนน, holdDefault, calendar overlay (TOM ×1.15), snap-back reversal ผ่าน human gate เดียวกัน (source = `reversal`)
- `/api/verify` เติม outcome ย้อนหลังและคำนวณ calibration (win rate ต่อช่วง conf + Brier score)
- **พอร์ต:** P&L, Effective N, weekly DD + kill switch (−5%), sector/group exposure

### 5.4 ห้องวิจัย (Research)
- **Prereg:** freeze กติกาเป็น sha256 ก่อนรัน
- **Profit Engine:** strategy vs naive, time-half, bootstrap CI 2,000 รอบ, cost grid, เช็กลิสต์ **7 เกณฑ์** → verdict GO / WEAK / NO-GO
- **CPCV** (López de Prado): N=6, k=2 → 15 paths, purge/embargo ตั้งได้ (preset "สเปกมาตรฐาน 6/2/10/10" และ "ผูก horizon"), 4 กราฟการกระจายผล; deploy meta-model ได้เฉพาะเมื่อ `metaPass` (hit ≥ 0.55)
- **Meta features v2** 12 ตัว (n_tf, streak, resid20/60, mom_quality20, dist_high, val_surge, val_trend, repeat_z, breadth, mkt_vol20, ret20_pct) + **Purged Permutation Importance**
- **Event Audit:** ตรวจ hash chain ทั้งเส้น

### 5.5 Thai config · Sector risk · HRP · Black-Litterman
- Sector limit 30% / ไม่เกิน 3 ตัวต่อ sector · Sector groups: Financials 35%, EnergyComplex 40%, PropertyChain 35%, Consumer 40%, Tech 40% · 13 sector มาตรฐาน SET
- `TH_RISK`: weekly DD −5%, vol target 13%, 40,000 บาท/ไม้, participation ≤ 4% ของ ADV
- Roadmap 3 เฟส (วิจัย 2–4 สัปดาห์ → paper 8–12 สัปดาห์ → เงินจริงไม่เกิน 10–15% ของพอร์ต)
- `/api/portfolio/allocation` 4 โหมด: equal / invvol / **HRP** (López de Prado 2016, pure TS) / **HRP + Black-Litterman** (Idzorek: view จาก n_tf, ω จากความมั่นใจ)

### 5.6 Signals v2 · IC Harness · Alpha Stack
- Panel รายวัน: breadth (b20/b50/b200/thrust), sector rotation, MFD (price rank − flow rank), overlapZ, volPct, crossZ (0.45·SPX − 0.35·USDTHB − 0.20·GOLD)
- **IC harness:** Spearman IC รายวัน demean ตลาด → verdict PROMOTE (|IC| > 0.02, |ICIR| > 0.25, n ≥ 120) / FLIP-CHECK / KILL → เขียน policy ลง Setting → Jev บังคับใช้
- **A/B shadow:** ถัง `lite` vs `lite+v2-shadow` เทียบ paired diff โปรโมทเมื่อ n ≥ 100 และ meanDiff > 0 หลังต้นทุน
- **Alpha Stack:** Pairs stat-arb (OLS β + OU half-life, ENTER |z|>2 / TAKE 0.5 / STOP 3.5) ทำงานเป็น shadow แล้ว · Basis / Parity / VRP condor / HRP allocator อยู่ **STANDBY** จนกว่าจะ ingest ข้อมูล TFEX · CLI `bun run ic`, `bun run fetch:cross`

### 5.7 Bayes Stop (Zambelli)
- เรียนรู้ระยะ stop จาก MAE ของเทรดที่ปิดแล้ว: bin winners/losers → P(L|b) → EV_hold → s* = argmax E[R|s]
- 2 วิธี: T (1 obs/เทรด) และ R (ทุกบาร์ระหว่างถือ) · recency 0.995 · walk-forward 3 arms `fixed10 / bayesT / bayesR` refit ทุก 60 วัน embargo 10 วัน
- กติกา adoption ลงทะเบียนล่วงหน้า: Sharpe_arm > Sharpe_fixed + 0.2, MaxDD แย่กว่าไม่เกิน 2pp, n ≥ 100 · ปัจจุบัน policy = `fixed10 · shadow` (ยังไม่ผ่านเกณฑ์)

### 5.8 AI-Score (เรดาร์ %CMPR)
- `src/lib/momentum/ai-score.ts` + `/api/ai-score`: AI-Score = Cmpr (volume วันนี้ ÷ เฉลี่ย 5 วัน) + %Diff EMA12-30 + Trend (rule-based) + Heikin-Score คาลิเบรตกับการ์ดตัวอย่างที่ผู้ใช้อัปโหลด (FTREIT 7.00, THAI 6.00, RCL 6.00, TTB 8.00)
- **หมายเหตุ:** มีเฉพาะ engine + API ยังไม่มีแท็บ UI และไม่มีบันทึกใน worklog (เพิ่มใน commit `42e3f1e`)

### 5.9 Evidence Board — H1–H4 + Imported Global Engines
- **thai_fit** (port จาก Python): H1 horizon scan (ICIR ต่อ form × hold) · H2 snap-back reversal · H3 turn-of-month · H4 โมเมนตัมยาวตาย → verdict ผูก paramsHash, persist ResearchRun
- **apply verdict อัตโนมัติ** → `config_th` (reversalEnabled, calendarOverlay, holdDefault, tfWeights) + history + EventLog + Decision audit (`auto-verdict@วันที่`)
- **Imported Global Engines 9 ตัว** (จากการค้นวิจัย 10 คลัสเตอร์ใน `research/s1–s10.json`): residual momentum (Blitz-Huij-Martens), frog-in-the-pan (Da et al.), vol-managed (Barroso / Daniel-Moskowitz), 52-week high (George-Hwang), signed flow (order flow imbalance), CSAD herding, triple-barrier, HMM regime, HRP + Ledoit-Wolf · เกณฑ์ผ่าน ICIR ≥ 0.25, meanIC ≥ 0.02, t ≥ 2 · แต่ละใบมี citation, thesis, verdictWhy, integration plan

### 5.10 Shadow Lab + LAB KIT (Python offline)
- **Shadow Lab บนเว็บ:** state ต่อหุ้นต่อวัน (จาก RawDaily หรือ synthetic 10 edge case) → rule engine 5 gates × **Nimble** (LLM ผ่าน z-ai SDK, conf ≥ 0.75) → ShadowLog double-key → dashboard (agreement matrix, calibration, Brier, P&L, gate kill) → edge queue → Dialog label (พิธี 5 นาที) → **Eval 5 ด่าน** (agreement, human edge, Brier, grammar, no-regression) → ResearchRun
- **LAB KIT `lab/`** 11 ไฟล์ Python สำหรับรันบนเครื่อง local กับ CSV จริง: `preflight.py` (6 DQ gates) · `thai_fit.py` (H1–H4) · `apply_verdict.py` · `state_gen.py` (rule_engine "ครู") · `synth_state.py` · `nimble_runner.py` (GGUF ผ่าน llama-cpp) · `shadow_dash.py` (Streamlit) · `build_dataset.py` (train/val ChatML) · `lora_nimble_core.yaml` (LLaMA-Factory LoRA) · `eval_harness.py` · `context_updater.py` (journal → context) · README มีลำดับรัน 0→6 และ cron รายเดือน
- ธรรมาภิบาลที่เขียนไว้: shadow P&L ห้ามใช้เร่งวันเทรดจริง · เงินจริงต้อง THE CORE ผ่าน 100 ไม้ + compliance ≥ 90% ก่อน

### 5.11 GTAA Rotation (Faber Aggressive) — เอนจินสากลตัวแรก
- กฎ: ปิดเดือน → กรอง SMA-10 เดือน → จัดอันดับโมเมนตัม 1/3/6/12 เดือน (มี 12-1) → Top-N equal weight → ที่เหลือเงินสด (BIL หรือ IEF แบบ trended) · รองรับ filter-then-rank / rank-then-filter, tranches 1–4, cost bps
- **Harness ความน่าเชื่อถือ:** self-test 14 invariant รันสดทุกครั้ง · walk-forward IS 5 ปี → OOS 1 ปี (degradation > 50% → ใช้ค่าเปเปอร์) · Monte Carlo 2 ชั้น · sensitivity grid 21 ช่อง · quality gate ข้อมูล
- **ข้อมูลจริง:** Yahoo adjclose 15 สินทรัพย์ × 30 ปี (1996-10 → 2026-09) ดึงผ่าน server-side fetcher (ส่ง UA browser; fallback Stooq PoW) บันทึกเป็น `data/gtaa/panel.json` · อัปโหลด CSV wide/long ได้
- **Macro Gate → Command Center:** stance `risk_off` (เงินสด ≥ 50% และ SPY หลุด SMA10) / `caution` / `risk_on` แสดงคู่ regime ไทยพร้อมแถว "เห็นพ้อง/ขัดแย้ง" แบบ shadow (ไม่เขียนทับ gross budget)
- **Tracking Log:** GtaaSignal (snapshot พอร์ตเป้าหมายก่อนเดือนเริ่ม, unique ต่อ decisionMonth × configHash) + GtaaRun + EventLog kind `gtaa` · ประเมินย้อนหลังอัตโนมัติเทียบ SPY · readiness CERTIFIED / VERIFIED / EXPERIMENTAL
- CLI `bun run gtaa -- fetch | run | macro | sensitivity | selftest | reset` (macro exit 2 เมื่อข้อมูลเก่า เหมาะกับ cron ท้ายเดือน)

### 5.12 SET Sniper (ICT × Order Flow) — DAILY PROXY
- Location: key levels (PDH/PDL/H20/L20/52W/เลขสวย), liquidity sweep 5 แท่ง fractal + reclaim, FVG 3 แท่ง + mitigation
- Value: Volume Profile รายวัน (POC / VA 70% / HVN / LVN จากมูลค่าซื้อขาย 60 แท่ง)
- Behavior: absorption proxy (effort-vs-result)
- **Confluence 3 ชั้น** น้ำหนัก 40/30/30 → verdict สูง ≥ 65 / กลาง ≥ 45 / ต่ำ พร้อมเหตุผลไทยทุกคะแนน
- **Circuit Breaker 3 ระดับ** (ตลาดวันเดียว −2/−3/−5%, ไม้ปิดล่าสุด, win rate 10 ไม้, DQ flags) — โหมด "แนะนำ" ทุกคำสั่งผ่าน Human Gate
- Sector rotation (ret20/ret60 + เงินไหล 5v20) · Lead-lag correlation SPX/USDTHB/GOLD · Daily Brief one-glance
- สิ่งที่ตั้งใจไม่ทำ + เงื่อนไขเปิด (docs §4): Delta แท้ / Footprint / Ghost Wall / Iceberg / Block Trade window / Sentiment / RL tuning

### 5.13 FLAGSHIP — สัญญาณเรือธง อันดับ 1–10
- สายพาน 6 ด่าน: G0 universe → G1 data & liquidity → G2 momentum (percentile ≥ 50%, MFD < 0.45) → G3 sector (ไม่อยู่ 2 กลุ่มท้าย) → G4 confluence ≥ 45 (คำนวณจาก OHLC เองทุกตัว) → G5 rank
- **ReliabilityScore** = engine 35 + confluence 25 + trend 15 + evidence 15 + risk 10 · Tier A ≥ 70, B ≥ 55, C = กองเฝ้าดู (เพดาน 54.9) · โหมดป้องกัน (breaker ≥ 2 หรือ risk_off) ตัด Tier A
- ป้าย provenance SYNTHETIC / REAL / UNKNOWN จาก EventLog · veto log ทุกการคัดออก · ป้ายกติกาความจริงใจบังคับแสดง ("ไม่มีสัญญาณใดการันตีกำไร")

### 5.14 Agent Skill Tree
- ปรับกรอบ "20 Skills สำหรับ AI Agent" (@beamnxw / Leafbox) 4 หมวด Research / Engineering / Create / Grow+Ship เป็นแผนผัง **24 โหนดของความสามารถที่ระบบมีจริง** สถานะ unlocked / shadow / locked / down derive สดจาก API · คิวปลดล็อก 4 รายการพร้อมเงื่อนไข (cron ท้ายเดือน, GTAA stance มีน้ำหนัก, แจ้งเตือน, tick จริง)

### 5.15 วิวัฒนาการ Dashboard / UX
1. 7 แท็บ Radix Tabs ธีมมืด zinc (Task 4)
2. Sidebar shell + Command Center + Bayes Stop (Task 9-ui)
3. **Dark Neon Cyberpunk** ตามภาพอ้างอิงของผู้ใช้ (Task 5-a/b/c, 6)
4. **Mission Control Pro:** icon-collapsible sidebar, breadcrumb, ⌘K command palette, นาฬิกาตลาด SET (Asia/Bangkok), ticker tape, mobile bottom dock, terminal footer (Task 7)
5. **Daylight Terminal** ธีมสว่าง ย้ายทุกไฟล์ด้วย mapping table (Task 13)
6. **Command Center 2.0** 4 tier (posture / vitals / modules / analytics / feeds) + dashboard prefs (Task 17)
7. **Command Center 3.0** มาตรฐาน `.feature` / `.options` 12 โมดูล + ops pulse checklist (Task 14 ตัวที่สอง)
8. **Command Center 4.0 "Super Options":** Options Center 4 แท็บ, preset 4 แบบ + ของฉัน, layout 1/2 คอลัมน์, เรียงโมดูลด้วย CSS order, โหมดโฟกัส/อ่าน, hotkeys O/R/D/L/X/Esc (Task 20)

ทุกรอบตรวจ mobile 390px ไม่ให้ล้น (docW = 390), touch target ≥ 44px, console 0 error

---

## 6. ตัวเลขผลลัพธ์ที่บันทึกไว้

ทุกตัวเลขในระบบหุ้นไทยมาจาก **ข้อมูล synthetic (seed)** ยกเว้น GTAA ที่ใช้ราคาจริงจาก Yahoo — worklog ย้ำเสมอว่าตัวเลข seed พิสูจน์ว่า "ท่อถูก" ไม่ใช่ "edge มีจริง"

| หัวข้อ | ผลที่บันทึก |
|---|---|
| Backtest ค่าไทย (k3/h8/stop9/pos7/cost30/slip40) | 431 เทรด · win 44.5% · CAGR −1.6% · MaxDD −24.4% · Sharpe 0.04 (slip 0 → CAGR +25.2%) |
| Profit Engine | WEAK 5/7 (รอบแรก) → NO-GO 2/7 (หลังใส่ slippage) |
| CPCV 6/2/10/10 | 15 paths · hit 53.8% ± 1.9 · AUC 0.544 · gap +1.95% · metaPass = false → meta model ปิด |
| Importance top-3 | mom_quality20 · dist_high · resid60 |
| IC harness | `mom` PROMOTE (IC +0.066, ICIR 0.49) · breadthZ/overlapZ KILL · crossZ/volPct USE |
| Pairs scanner | 37 คู่ cointegrated จาก 52 |
| Evidence H1–H4 | H1 PASS (form20/hold10 ICIR 0.92, t 20.4) · H2 FAIL (n 72, win 29%) · H3 FAIL (t 1.37) · H4 FAIL (form160 ICIR 0.97) |
| Global engines | PASS 3: Frog-in-the-Pan (ICIR 0.257) · 52-Week High (ICIR 2.54) · Signed Flow (ICIR 0.624) · FAIL 5 · INFO 1 (HRP) |
| Shadow Lab | logs 31 · agreement 71% · executed 1 · eval REJECTED (n=8, ตั้งใจให้ซื่อสัตย์) |
| **GTAA (ข้อมูลจริง 1997-11 → 2026-09)** | Top6/SMA10: CAGR +6.5% · MaxDD −16.9% · Sharpe 0.79 เทียบ SPY +9.4% / −50.8% / 0.62 · Top9 12-1: +5.2% / −14.9% / 0.80 · self-test 14/14 · readiness CERTIFIED · สัญญาณล่าสุด: พันธบัตร 4 ตัวสอบตกเทรนด์ ผู้นำ DBC/EEM/MTUM/VTV/EFA/VBR |
| SET Sniper (seed) | watchlist 24 · sweep 20 / FVG 16 · ผู้นำกลุ่ม Banking · breaker ระดับ 0 |
| Flagship (seed) | funnel 65 → 65 → 33 → 32 → 9 → 10 · อันดับ 1–5 Tier B (wvb 66.0, wdp 65.0, light 63.0, szw 59.6, yyf 56.3) |
| Skill Tree | unlocked 16 · shadow 1 · locked 7 · down 0 |
| Ops pulse | พิธีรายเดือนผ่าน 6/6 · นับถอยหลังรอบ GTAA 39 วัน |

---

## 7. เอกสารและสื่อที่ผู้ใช้ป้อนเข้า (`upload/`)

### 7.1 `Pasted Content_1789892364361.txt` (3,407 บรรทัด, 169 KB) — บทสนทนาชุด "เน้นการนำระบบไปใช้ลงทุนหุ้นไทยจริง"
ลำดับหัวข้อ: จุดแข็งของระบบกับตลาดไทย → ค่า config ที่แนะนำ (`config.py`) → ขั้นตอน 3 เฟส → ความเสี่ยงเฉพาะไทย → sector / sector-group limits → การกระจายความเสี่ยง 6 เทคนิค → **HRP** (ขั้นตอน, สูตร) → Risk Parity vs HRP → HRP vs **Black-Litterman** → สูตร BL ทีละขั้น → **Idzorek** (confidence → Ω) → โค้ด Python BL → mapping ความมั่นใจ → "สถาปัตยกรรมขั้นสูงสุด" 7 ชั้น → **CPCV** (purging, embargo, combinatorial, พารามิเตอร์ N/k/purge/embargo/h, ตัวอย่าง N=6 k=2) → Meta-labeling + CPCV → การเลือก features (v1 compact / **v2 extended 12 ตัว**) → Purged Permutation Importance (โค้ด) → Purged LOFO Importance (โค้ด)
→ ถูกนำไปใช้ใน Task 7-1 / 7-2-b / 7-2-c / 8

### 7.2 `Pasted Content_1790040843703.txt` (1,215 บรรทัด, 115 KB) — บทสนทนาชุด "20 Skills + ICT × Order Flow"
ลำดับหัวข้อ: โพสต์ "20 Skills สำหรับ AI Agent" (@beamnxw) 4 หมวด + ขยายความ + framework 3 คำถาม → โพสต์เรื่อง Yush เทรด ICT ไม่รอดจนหันมาอ่าน Order Flow (โพสต์ขายคอร์ส ATAS ของ "เจได Money") → ผสม ICT (Location) + Volume Profile (Value) + Order Flow (Behavior) → Confluence Engine ขั้นสูง → "Algorithmic Market Maker" blueprint 4 phase ผูก skill 20 ตัว → logics & algorithms (sweep / absorption / FVG validation) → **"SET Sniper"** เวอร์ชันหุ้นไทย (FFD, block trade, sector rotation, กฎ Cash Balance / Auto Halt / Block window / XD) → "SET Deep-Dive" (ghost wall, iceberg, dynamic beta, derivative lead-lag) → **"SET Alpha-X"** (inventory skew, HMM 4 regime, cross-asset Granger network, sentiment, insider pattern, game theory) → Phase 5–6 (RL / genetic, circuit breaker 3 ระดับ, SOR, mobile, compliance) → Master Blueprint (architecture diagram, process flow รายวัน 08:00–19:00, operational checklist)
→ ถูกนำไปใช้ใน Task 16 (SET Sniper) และ Task 18 (Agent Skill Tree) โดยระบบ **ตั้งใจไม่ทำ** ส่วนที่ต้องใช้ tick / L2 / social data / RL และบันทึกเหตุผลไว้ใน `docs/research/set-sniper.md`

### 7.3 ภาพและวิดีโอ

| ไฟล์ | เนื้อหา | นำไปใช้ |
|---|---|---|
| `FB_IMG_1789949325187/327346.jpg` | ตาราง "เรดาร์ %CMPR — Volume พุ่งผิดปกติ" อันดับ 1–15 และ 16–30 (18/09/2026) | ต้นแบบ AI-Score |
| `FB_IMG_1789949329488/331334/333089/334968.jpg` | การ์ด AI-Score รายตัว TTB 8.00 · FTREIT 7.00 · THAI 6.00 · RCL 6.00 (องค์ประกอบ %CMPR / EMA12-30 / Trend / Heikin) | คาลิเบรต `ai-score.ts` |
| `pasted_image_1789951551228.png` | ภาพ mock แดชบอร์ดนีออน cyberpunk (พื้นน้ำเงินดำ ขอบเรืองแสง cyan/magenta/green) | ธีม Task 6 |
| `af1eef14….webp` | ภาพแดชบอร์ด "DIVENDIA PRO" โทนสว่าง (ระบบข้อมูลปันผลหุ้นไทย) | อ้างอิงแดชบอร์ดโทนสว่าง |
| `349a83ba…FB_IMG_1789868981252.jpg` | หน้าแรกเอกสาร "JEV ENGINEERING — How to use Jev, and where it actually gives you the 100x" (@0xCodila) แนวคิด Jev = decision-making brain รับ state → คืน typed decision พร้อมความน่าจะเป็น | ที่มาของชื่อ/แนวคิด "Jev" |
| `88bf20c5…FB_IMG_1790034315241.jpg` | อินโฟกราฟิก "20 สกิล ไม่ต้องลงหมด!" (Leafbox) แผนผัง capability root 4 หมวด | Task 18 |
| `721362091….jpg` | โปสเตอร์ "Competency การพัฒนาพยาบาลไตเทียม / หัวหน้าหน่วยไตเทียม" | ไม่เกี่ยวกับโปรเจกต์ (น่าจะอัปโหลดผิดหรือเป็นงานอื่น) |
| `730584884….jpg` | อินโฟกราฟิก "WORK FLOW 1 งาน ENV โรงพยาบาล" 12 ขั้นตอน + สารบัญ SOP/WI | ไม่เกี่ยวกับโปรเจกต์ |
| `grok-video-…(5).mp4` / `(6).mp4` | วิดีโอ 2 ไฟล์ขนาดเท่ากัน 3.09 MB (น่าจะไฟล์เดียวกัน) เปิดดูใน session นี้ไม่ได้ | เพิ่มใน commit สุดท้าย |

### 7.4 ภาพหน้าจอที่ agent ถ่ายไว้ (`theme-*.png`, `engines-*.png`, `tool-results/*.png` รวม ~90 ภาพ)
ใช้ยืนยันงานแต่ละ task: overview / map / jev / signals / research / evidence / lab / gtaa / sniper / flagship / cc3 / layout ทั้ง desktop 1440 และ mobile 390 — ภาพชุดสุดท้ายเป็นธีม Daylight สว่าง sidebar ซ้าย ticker tape บน footer terminal

---

## 8. สถานะปัจจุบันและข้อจำกัดที่ระบบยอมรับเอง

- **ข้อมูลหุ้นไทยทั้งหมดยังเป็น synthetic** — ต้อง ingest CSV จริงจาก AmiBroker (รวม open/high/low) ก่อนใช้ตัดสินใจ; ป้ายจะเปลี่ยนเป็น REAL เอง
- **Meta model ปิดอยู่** (hit 53.8% < gate 55%) · Bayes Stop policy ยังเป็น `fixed10 · shadow` · Snap-back reversal ปิด (H2 FAIL)
- **Alpha Stack** ส่วน Basis / Parity / VRP / allocator STANDBY จนกว่าจะมีข้อมูล TFEX (ตาราง FuturesDaily / OptionsDaily ว่าง)
- **SET Sniper** ทุกชั้นเป็น DAILY PROXY; ชั้น tick / Level-2 / block trade / sentiment ล็อกไว้พร้อมเงื่อนไขเปิด
- **GTAA** เชื่อมแบบ shadow ยังไม่ผูก stance เป็น input ของ regime gate; cron ท้ายเดือนต้องรันบนเครื่องผู้ใช้
- **AI-Score** มีแค่ API ไม่มี UI
- โฟลเดอร์ `examples/` และ `skills/` ของ template มี tsc error ค้างเดิม (ไม่ใช่โค้ดโปรเจกต์)
- worklog บันทึกปัญหา dev server ซ้ำ ๆ: process ถูก reap ต้อง start แบบ double-fork daemon และ Prisma client เก่าหลัง `db push` ต้อง restart
- คำเตือนใน Flagship / LAB KIT: ไม่มีสัญญาณใดการันตีกำไร อันดับ 1–10 ไม่ใช่คำสั่งซื้อ ทุกคำสั่งผ่าน Human Gate

---

## 9. ขั้นถัดไปที่ worklog ระบุไว้เอง
1. ingest ข้อมูลจริง → รัน Evidence Night + IC harness + CPCV ใหม่บนข้อมูลจริง
2. ดึง 3 engine ที่ PASS (FIP, 52-week high, signed flow) ลง config จริงผ่านช่อง config + audit
3. ผูก GTAA stance เป็น input แบบมีน้ำหนักของ regime gate เมื่อหลักฐานพอ + บันทึก snapshot ท้ายเดือนฝั่ง server
4. ingest TFEX เพื่อเปิด Basis / Parity / VRP
5. ชั้น tick / order book สำหรับ Sniper (ตารางใหม่เก็บ L2 snapshot)
6. การ์ด FLAGSHIP Top 3 บน Command Center

---

## 10. วิธีกู้คืนโปรเจกต์จากไฟล์ทั้ง 13 ชุด

```bash
mkdir all && for f in *.zip; do unzip -q -o "$f" -d all; done
git init repo
cp -r all/3/.git/objects/* repo/.git/objects/
for d in 5 6 7 8 9 10 11 12 13; do
  for h in all/$d/??; do cp -rn "$h" repo/.git/objects/; done
done
cd repo
git update-ref refs/heads/main 479545a5054a02a9d7ecb9b9b18e6ff53e38dc41
git symbolic-ref HEAD refs/heads/main
git fsck --connectivity-only && git checkout -f main   # ได้ 447 ไฟล์ครบ
bun install && bun run db:generate && bun run dev      # ต้องมี .env DATABASE_URL ชี้ db/custom.db
```
