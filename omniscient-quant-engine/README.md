# Omniscient Quant Engine — Full-Cycle Multi-View Quant Platform

แพลตฟอร์มเทรดเชิงระบบ "7 ชั้น" สำหรับหุ้นไทย (SET) หน้าเดียว (`/`) ภาษาไทยทั้งระบบ: L0 ข้อมูล point-in-time → L1 มุมมองเดี่ยว → L2 Dependence (Clayton copula Θ / lower-tail) → L3 Multi-View factor integration (PCA + enrichment + bipartite) → L4 walk-forward + gate attribution → L5 Monte Carlo CVaR sizing → L6 5-Gate execution + journal → L∞ Meta-Risk (ruin math, defense-in-depth, Risk MDX 7 มิติ, antifragility) → L7 Apex (Kelly-Vol sizing, microstructure, crisis MC, model registry) พร้อม "หลอมรวม" (convergent-evidence synthesis 13 สาย), Market Intelligence Terminal และ Command Center

> **ค่าเริ่มต้นเป็นข้อมูลจำลองเพื่อการสาธิต** (22 หุ้น × 750 วันทำการ จาก generator seed ตายตัว) — ไม่ใช่ราคาตลาดจริง แม้ชื่อหุ้นจะตรงกับหุ้นจริง · นำเข้าข้อมูลจริงแทนได้ (หัวข้อ "ข้อมูล") · ป้ายที่มาของข้อมูลบนทุกหน้ามาจากตาราง `DataSource` ไม่ได้เขียนตายตัว · ไม่ใช่คำแนะนำการลงทุน ([ข้อกำหนดและข้อจำกัด](src/app/terms/page.tsx) ที่ `/terms`)

โฟลเดอร์นี้คือ **การบูรณะซอร์สต้นฉบับแบบ 1:1** จาก workspace ของ z.ai (8 commit, 27–28 ก.ย. 2569, HEAD `a3d421b`) แล้วต่อยอดเป็นรอบ ๆ ตาม `worklog.md`: Task 15 บูรณะ + เกตคุณภาพ + ความปลอดภัย + ชั้น LLM ที่ซื่อสัตย์ · Task 16 ประเมิน 360 องศา · **Task 17 ปิดช่องว่างตามผลประเมิน** (กติกาเป็นข้อมูล + pre-registration, ความทนทานข้าม seed, ช่วงความเชื่อมั่น, นำเข้าข้อมูลจริง + provenance, backup/restore, บทบาทผู้ชม + audit trail, a11y ผ่าน axe ทุกมุมมอง, E2E gate) — สรุปสถาปัตยกรรม: **[`docs/PROJECT-SUMMARY.md`](docs/PROJECT-SUMMARY.md)** · คะแนน 10 มิติพร้อมหลักฐาน: **[`docs/scorecard.md`](docs/scorecard.md)**

## Stack

Next.js 16.3 (App Router, standalone) · React 19 · TypeScript 5 (strict + noImplicitAny) · Prisma 6 + SQLite · Tailwind 4 + shadcn/ui · Recharts · zod 4 · Bun (package manager/test runner ตาม `bun.lock`) · server โปรดักชันรันด้วย node 22 · Playwright + axe-core (E2E/a11y gate)

## เริ่มใช้งาน

```bash
cd omniscient-quant-engine
cp .env.example .env          # DATABASE_URL="file:../db/custom.db" (สัมพัทธ์กับ prisma/)
bun install --frozen-lockfile
bun run db:generate           # prisma generate
bun run dev                   # http://localhost:3000 (ฟังเฉพาะ 127.0.0.1 — ดูหัวข้อความปลอดภัย)
```

- `db/custom.db` ที่แนบมาคือ **snapshot ข้อมูลจำลอง** 22 หุ้น × 750 วัน + ตัวอย่าง journal/รายงาน — เปิดแล้วเห็นระบบทำงานทันที (บันทึกที่มาไว้ในตาราง `DataSource` แล้ว)
- เริ่มจากฐานเปล่า: ลบ `db/custom.db` → `bun run db:push` → เซิร์ฟเวอร์ seed ข้อมูลจำลองเองตอนเริ่ม (warm-up) หรือเมื่อ API แรกถูกเรียก
- ครั้งแรกหน้าหลักแสดง **คำแนะนำเริ่มต้นใช้งาน** (ปิดแล้วจำไว้ในเครื่อง) · sidebar ไป Terminal และแท็บวิเคราะห์ 10 แท็บ · ⌘K/Ctrl+K ค้นหาหุ้น · แถบล่างบอกเสมอว่าข้อมูลคืออะไร สดแค่ไหน ใช้กติกาชุดไหน และ LLM ตั้งค่าหรือยัง

## ข้อมูล — จำลอง หรือ ข้อมูลจริงของคุณ

| ทาง | คำสั่ง | หมายเหตุ |
|---|---|---|
| CSV แบบยาว `symbol,date,open,high,low,close,volume` | `bun scripts/ingest-csv.ts prices.csv --source "csv:..." [--license ...] [--meta meta.csv] [--yes]` | หัวคอลัมน์แบบ AmiBroker/MetaStock ได้ · วันที่ ISO / `YYYYMMDD` / `DD/MM/YYYY` / ปี พ.ศ. · ไม่มี `--yes` = ตรวจอย่างเดียว |
| Yahoo Finance (`.BK`, ราคาปรับปันผล/สปลิต) | `bun scripts/fetch-yahoo.ts --universe demo \| --symbols PTT,AOT,... [--range 5y] [--yes]` | ไม่มีงบ/เงินไหล/หมวดธุรกิจ · ใช้ตามเงื่อนไขของ Yahoo · เข้าถึงไม่ได้ = หยุดพร้อมบอกเหตุผล |
| API | `POST /api/data/ingest` (JSON ชุดข้อมูล + `"confirm":"REPLACE"` หรือ `"dryRun":true`) | ผู้ดูแลเท่านั้น · จำกัดความถี่ · บันทึกใน ActionLog |
| กลับไปข้อมูลจำลอง | `POST /api/system` `{"force":true}` | ถ้าข้อมูลปัจจุบันเป็นข้อมูลจริง ต้อง backup สำเร็จก่อนจึงจะยอม |

- **ทุกการนำเข้า:** ตรวจรูปแบบ (zod) → ทำความสะอาด (วันซ้ำ, high<low, high/low ไม่ครอบ open/close, วันเสาร์–อาทิตย์เยอะ = เตือน timezone) → ต้องมี ≥ 5 หุ้นและ ≥ 300 วันซื้อขายร่วม → **backup ฐานข้อมูลก่อน** (ล้ม = ยกเลิก) → แทนที่ใน transaction เดียว → บันทึก `DataSource` (ที่มา สิทธิ์ ช่วงวันที่ คำเตือน) → cache ทุกชั้นหมดอายุเอง (รวม server ที่รันอยู่) · journal / รายงาน / การล็อกกติกา ไม่ถูกแตะ
- **ข้อมูลแบบมีแต่ราคา:** สาย "เงินไหล" "มูลค่า" "พื้นฐาน" ของหลอมรวม **งดออกเสียง** (น้ำหนัก 0) แทนการอ่านค่า 0 เป็นข้อมูลจริง · beta ประมาณจากข้อมูลเมื่อไม่ได้ให้มา · ปริมาณเก็บเป็นล้านหุ้น
- **ความสด:** เทียบปฏิทินวันซื้อขาย SET (`src/lib/data/calendar.ts` — วันหยุด 2025–2026 แบบ best-effort ต้องตรวจกับประกาศ SET) → `GET /api/data/provenance`, `/api/health`, แถบล่างของ UI · ข้อมูลจำลองไม่ประเมินความสด (วันที่เป็นแค่ป้าย)
- `bun scripts/engine-check.ts` = รันเอนจินทั้งท่อบน DB ปัจจุบันแล้วพิมพ์สรุป JSON (ใช้หลังนำเข้าข้อมูลทุกครั้ง)

## กติกา ความเชื่อมั่น และความทนทาน (research integrity)

- **กติกาเป็นข้อมูล:** threshold/น้ำหนักทุกตัวของ gates, backtest, synthesis, MDX, Kelly, ruin อยู่ใน `RULES` ชุดเดียว (`src/lib/quant/engine/rules.ts`) พร้อม sha256 ของ canonical JSON · test บังคับให้ bump `RULES_VERSION` ทุกครั้งที่แก้ค่า
- **Pre-registration:** กด "ล็อกกติกาชุดนี้" (แท็บ Backtest) หรือ `POST /api/rules` ก่อนดูผลรอบใหม่ — board/backtest/synthesis/meta-risk/apex/system ทุกรายงานติด stamp ว่าใช้ hash ไหนและตรงกับที่ล็อกล่าสุดหรือไม่ · ป้าย "จูนบนข้อมูลจำลอง" แสดงคู่กติกาเสมอ
- **ช่วงความเชื่อมั่น 95%:** hit rate (Wilson) · P(win) และ R ของ Kelly (Wilson + bootstrap seed ตายตัว) · f* ที่ขอบล่าง (≤ 0 = edge ยังไม่แน่นอนทางสถิติ — Apex เตือน)
- **ความทนทานข้าม seed:** `GET /api/research/robustness?seeds=...` / แผงในแท็บ Backtest — รัน generator → panel → walk-forward → gate attribution ต่อ seed แล้วสรุป ROBUST/FRAGILE/NOISE ต่อ gate และ STABLE/MIXED/UNSTABLE · seed ของ demo ให้ผลเท่ากับแท็บ Backtest ทุกตัวเลข (ท่อคำนวณเดียวกัน `buildPanel`) · ผลปัจจุบัน 5 seed = **MIXED** (hit rate 31.6–68.8%, ชนะซื้อถือ 2/5, G1/G3 ทนทาน, G2/G5 เป็น noise) — นี่คือหลักฐานว่าผลของ seed เดียวไม่ควรเชื่อ

## โปรดักชัน

```bash
bun run build                                                   # next build (standalone) + คัดลอก static/public
DATABASE_URL="file:/abs/path/omniscient-quant-engine/db/custom.db" bun run start   # node .next/standalone/server.js ที่ 127.0.0.1:3000
# เปิดให้เครื่องอื่นใช้: ตั้ง OQE_AUTH_PASSWORD ก่อน แล้ว bun run start:lan (ฟัง 0.0.0.0)
```

- โหมด standalone ใช้ `DATABASE_URL` แบบ **absolute path** (path สัมพัทธ์ถูกตีความจากตำแหน่ง Prisma client ในโฟลเดอร์ standalone)
- ตอนเริ่ม server อุ่น cache งานหนัก (panel, backtest, board, factors, dependence) ในพื้นหลัง — ผู้ใช้คนแรกไม่ต้องรอคำนวณ · ปิดด้วย `OQE_WARM_CACHE=0` · สถานะที่ `/api/health` (`cache`)
- Log เป็น JSON 1 บรรทัดต่อเหตุการณ์ในโปรดักชัน (`OQE_LOG_FORMAT=text` อ่านง่ายตอน dev, `LOG_LEVEL`) · ค่าที่ชื่อเหมือนความลับถูกปิดเสมอ · error 500 ส่ง `errorId` ให้ client และรายละเอียดอยู่ใน log เท่านั้น
- Docker: `docker compose up -d --build` (บังคับตั้ง `OQE_AUTH_PASSWORD`) · image seed DB ลง volume `/data` ครั้งแรก (`OQE_SEED_DB=demo|empty|none`) · **image ยังไม่ได้ build ทดสอบ** (sandbox ไม่มีเครือข่ายสำหรับ docker)

### Backup / restore

```bash
bun scripts/backup-db.ts [--reason nightly] [--keep 30]     # VACUUM INTO แบบออนไลน์ → OQE_BACKUP_DIR (ค่าเริ่มต้น data/backups) · ไฟล์ 0600 · ตรวจ quick_check
bun scripts/restore-db.ts --list                            # รายการ backup
bun scripts/restore-db.ts --latest                          # แสดงแผนเท่านั้น (exit 2)
bun scripts/restore-db.ts --latest --yes                    # กู้จริง: ปฏิเสธถ้า server/process ยังเปิด DB · สำรอง DB ปัจจุบันเป็น pre-restore-*.db ก่อน · สลับแบบ atomic
```

ระบบ backup เองอัตโนมัติก่อนการแทนที่ข้อมูลทุกครั้ง (นำเข้า / seed ใหม่) · `/api/health` รายงานอายุ backup ล่าสุด

## ความปลอดภัย

- **ไม่ตั้ง env = โหมด local:** เปิด http://localhost:3000 บนเครื่องที่รัน server ได้ ส่วนเครื่องอื่นได้ 403 พร้อมวิธีตั้งรหัสผ่าน · `dev`/`start` ฟังเฉพาะ 127.0.0.1
- **เปิดให้เครื่องอื่นใช้:** `OQE_AUTH_PASSWORD` = ผู้ดูแล (HTTP Basic, ชื่อผู้ใช้ใส่อะไรก็ได้) · `OQE_VIEWER_PASSWORD` = **ผู้ชมอ่านอย่างเดียว** (GET เท่านั้น — แก้ journal/ล็อกกติกา/นำเข้าข้อมูล/เรียก LLM ได้ 403 และปุ่มใน UI ถูกปิดพร้อมเหตุผล) · `OQE_API_TOKEN` = Bearer ของสคริปต์ที่ `/api/*` · ผ่านอินเทอร์เน็ตต้องมี TLS reverse proxy (`OQE_HSTS=1`, `OQE_ALLOWED_ORIGINS`)
- **ทุกโหมด:** POST/PUT/PATCH/DELETE ที่ `/api/*` ต้องเป็น JSON จาก origin เดียวกัน (CSRF) · input ทุกเส้นทางที่แก้ข้อมูลตรวจด้วย zod (400 บอกช่องที่ผิด, 404 เมื่อไม่พบแถว) · LLM / seed / นำเข้า / รายงานหนัก จำกัดความถี่ (429 + Retry-After) · เดารหัสซ้ำถูกจำกัด · security headers + CSP
- **ร่องรอย:** การกระทำที่แก้ข้อมูลหรือเรียก LLM ถูกบันทึกในตาราง `ActionLog` (ทาง: local/basic/viewer/token, เส้นทาง, status, สรุปสั้น) → `GET /api/audit-log?action=journal&limit=50` · คำขอที่ถูกปฏิเสธ (รหัสผิด, rate limit, ข้ามไซต์, ผู้ชมพยายามแก้ข้อมูล) เป็น `security.deny` ใน log (จำกัด 1 บรรทัด/นาที/ผู้เรียก — ไม่มี header/query)
- ตรรกะทั้งหมดอยู่ใน `src/lib/security/` (pure, มี unit test) · `src/proxy.ts` แปลงผลเป็น response · env ทั้งหมด: `.env.example`

## LLM (ทางเลือก)

ระบบใช้ LLM เพียง 3 จุด — **หลอมรวมด้วย AI**, **AI Auditor** และ **แชท AI Analyst** — ทุก prompt ล็อกให้อ้างตัวเลขจาก evidence JSON ที่เอนจินคำนวณแล้วเท่านั้น (AI Auditor บันทึก hash ของกติกาที่ถูก audit ด้วย) เอนจินวิเคราะห์ทั้งหมดทำงานโดยไม่ต้องใช้ LLM

| ทาง | ตั้งค่า |
|---|---|
| endpoint แบบ OpenAI-compatible (`/v1/chat/completions`) | `OQE_LLM_API_KEY` + `OQE_LLM_MODEL` (+ `OQE_LLM_BASE_URL`) |
| `z-ai-web-dev-sdk` (พฤติกรรมเดิมของต้นฉบับ) | วางไฟล์ `.z-ai-config` ในโฟลเดอร์แอป / home / `/etc` |
| ไม่ตั้งค่า | ปุ่ม AI ทั้ง 3 ถูกปิดพร้อมคำอธิบายวิธีตั้งค่า · API ตอบ **503** `llm_unavailable` · `/api/health` รายงาน `llm.configured=false` |

## การทดสอบ — เกตเดียว

```bash
bun run verify     # typecheck · lint (max-warnings 0) · test · test:ops · build · smoke · e2e — ครบ = เหมือน CI เขียว
bun run test       # bun test src — unit + engine invariants + route handlers + component tests (happy-dom) บน SQLite ชั่วคราว
bun run test:ops   # smoke checker + e2e budget + สคริปต์ ops ผ่าน CLI จริง (ingest-csv → engine-check → backup-db → restore-db)
bun run smoke      # หลัง build: standalone server บนสำเนา DB → ทุก route (status, JSON เคร่งครัด, validation 400/404/422, header ความปลอดภัย)
bun run e2e        # Playwright + axe: 12 มุมมอง desktop + มือถือ 390px ต้องไม่มี violation ของ WCAG 2.1 AA/2.2 target-size (งบ 0)
                   #   + interaction หลัก 13 ข้อ · รายงาน/ภาพหน้าจอที่ .e2e/
bun deploy/smoke.ts --db empty   # ทางที่สอง: DB เปล่า → auto-seed
```

CI: `.github/workflows/omniscient-quant-engine.yml` รันคำสั่งชุดเดียวกัน + smoke บน DB เปล่า + `bun audit --audit-level=critical` และแนบรายงาน E2E เป็น artifact

## API (App Router, ไม่ใช้ server action)

| เส้นทาง | หน้าที่ |
|---|---|
| `GET /api/health` | สุขภาพระบบ (DB, ข้อมูล + ความสด, backup, cache, LLM) — 200 ok/degraded · 503 down · public ในโหมด auth |
| `GET /api/meta` | ข้อมูลกำกับของ UI: เวอร์ชัน, ป้ายข้อมูล, stamp กติกา, LLM, สิทธิ์เขียนของผู้เรียก |
| `GET /api` · `GET/POST /api/system` | ดัชนี API · สถานะข้อมูล + regime · seed (`{"force":true}` = backup แล้วสร้างใหม่) |
| `GET/POST /api/rules` · `GET /api/research/robustness` | กติกาทั้งชุด + hash + ประวัติการล็อก · ล็อก (pre-registration) · ความทนทานข้าม seed |
| `GET /api/data/provenance` · `POST /api/data/ingest` | ที่มา/ความสด/ความครอบคลุมของข้อมูล · นำเข้าข้อมูลจริง |
| `GET /api/audit-log` | ประวัติการกระทำ (ล่าสุดก่อน, กรองด้วย `action`) |
| `GET /api/board` · `GET /api/decision/{symbol}` | Decision Board ทุกตัว · 5-Gate + trade plan + risk MC + history |
| `GET /api/analytics/factors` · `GET /api/analytics/dependence` | Multi-View factor model + volcano · Θ matrix + decouple |
| `GET /api/backtest` | walk-forward + gate attribution + calibration + hit-rate CI + rules stamp |
| `GET/POST/PATCH/DELETE/PUT /api/journal` | trade journal (ตรวจ input · PUT = เติมตัวอย่างจาก board) |
| `GET/POST /api/synthesis/{symbol}` | หลอมรวม 13 สาย (POST = narrative ด้วย LLM) |
| `GET /api/meta-risk/{symbol}` · `GET /api/apex/{symbol}` | Meta-Risk L∞ · Apex L7 (ขนาดไม้สุดท้าย = min(Kelly-Vol, CVaR, 25%) × Risk MDX + CI ของ p/R) |
| `GET /api/market/quotes` · `GET /api/market/series/{symbol}` · `GET/POST /api/analyst/{symbol}` | Terminal (OHLCV จาก DB) · AI panel (POST = แชท LLM) |
| `GET/POST /api/audit` | รายงาน LLM auditor |

## โครงสร้าง

| path | หน้าที่ |
|---|---|
| `src/app/page.tsx` · `terms/` · `error.tsx` · `global-error.tsx` · `not-found.tsx` | app shell (sidebar, topbar, ⌘K, คำแนะนำครั้งแรก, แถบล่างจาก provenance) · ข้อกำหนด · หน้าข้อผิดพลาด |
| `src/components/dashboard/` · `terminal/` · `quant/` · `charts/` · `providers/` | Command Center · Terminal · แท็บวิเคราะห์ (รวม `research-integrity.tsx`) · chart SVG · `AppMetaProvider` (ป้ายข้อมูล/สิทธิ์/LLM) |
| `src/lib/quant/engine/` | panel (`buildPanel` ท่อเดียว) · rules + registry · robustness · factors/volcano · gates · backtest · risk · synthesis · meta-risk · mdx · micro · apex · terminal · api (orchestrator + cache) · warmup |
| `src/lib/data/` | calendar (SET) · freshness · csv · yahoo · ingest (ตรวจ/ทำความสะอาด/แทนที่) · provenance · service |
| `src/lib/ops/backup.ts` · `src/lib/log.ts` · `src/lib/audit.ts` · `src/lib/http/responses.ts` | backup ออนไลน์ · structured logger · ActionLog · คำตอบมาตรฐาน (400/404/500 + errorId) + zod |
| `src/lib/llm.ts` · `src/proxy.ts` · `src/lib/security/` | ชั้น LLM · ด่านสิทธิ์ทุกคำขอ (local/auth, ผู้ดูแล/ผู้ชม/Bearer, CSRF, rate limit, security events) |
| `scripts/` | ingest-csv · fetch-yahoo · engine-check · backup-db · restore-db · record-datasource (+ `ops.test.ts`) |
| `deploy/` | `server.ts` (เปิด standalone บนสำเนา DB) · `smoke.ts` · `e2e.ts` (Playwright + axe) · `docker-entrypoint.sh` |
| `prisma/schema.prisma` | 10 model: Stock, Price, Fundamental (PIT), FundFlow, JournalEntry, AuditReport, SynthesisReport, RuleRegistration, DataSource, ActionLog |
| `docs/PROJECT-SUMMARY.md` · `docs/scorecard.md` · `worklog.md` | สถาปัตยกรรม · คะแนน 10 มิติ · บันทึกงาน Task 0–17 |

## หลักการที่ระบบยึด

หลักฐานบรรจบ (convergent evidence) ก่อนคำสั่ง · walk-forward แบบ purged + embargo เท่านั้นที่นับเป็นผล out-of-sample · ตัวเลขสำคัญแสดงพร้อมช่วงความเชื่อมั่น · กติกาล็อกก่อนดูผล (pre-registration) และทุกรายงานบอกว่าใช้กติกาชุดไหน · ผลต้องทนทานข้าม seed ก่อนจะเรียกว่า "edge" · Risk of Ruin ก่อนผลตอบแทน · ข้อมูลที่ไม่มี = งดออกเสียง ไม่ใช่ศูนย์ · LLM มีหน้าที่เรียบเรียง ไม่ใช่ตัดสินใจ · บอกเสมอว่าข้อมูลคืออะไร และไม่ใช่คำแนะนำการลงทุน

## ข้อจำกัดที่รู้ตัว

- **ยังไม่มีหลักฐานว่ามี edge ในตลาดจริง:** กติกาจูนบนข้อมูลจำลอง และผลข้าม seed เป็น MIXED — ต้องนำเข้าข้อมูลจริง ล็อกกติกา แล้วดูผล forward/out-of-sample ก่อนเชื่อ
- Yahoo Finance ถูกนโยบายเครือข่ายของ sandbox ที่พัฒนาปฏิเสธ (HTTP 403 ที่ proxy) — ท่อนำเข้าทดสอบด้วยข้อมูลรูปแบบ CSV/Yahoo จาก fixture และ generator ไม่ใช่ข้อมูลตลาดจริง · ปฏิทินวันหยุด SET เป็น best-effort
- ผลลัพธ์ LLM ไม่ได้ทดสอบกับผู้ให้บริการจริง (ตรวจด้วย fake provider) · Docker image ยังไม่ได้ build ทดสอบ
- ไม่มีบัญชีผู้ใช้รายคน (แยกได้แค่ผู้ดูแล/ผู้ชม/token) · SQLite เหมาะกับผู้ใช้คนเดียวถึงทีมเล็ก
