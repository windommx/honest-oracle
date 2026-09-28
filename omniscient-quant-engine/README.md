# Omniscient Quant Engine — Full-Cycle Multi-View Quant Platform

แพลตฟอร์มเทรดเชิงระบบ "7 ชั้น" สำหรับหุ้นไทย (SET) หน้าเดียว (`/`) ภาษาไทยทั้งระบบ: L0 ข้อมูล point-in-time → L1 มุมมองเดี่ยว → L2 Dependence (Clayton copula Θ / lower-tail) → L3 Multi-View factor integration (PCA + enrichment + bipartite) → L4 walk-forward + gate attribution → L5 Monte Carlo CVaR sizing → L6 5-Gate execution + journal → L∞ Meta-Risk (ruin math, defense-in-depth, Risk MDX 7 มิติ, antifragility) → L7 Apex (Kelly-Vol sizing, microstructure, crisis MC, model registry) พร้อม "หลอมรวม" (convergent-evidence synthesis 13 สาย), Market Intelligence Terminal และ Command Center

> **ข้อมูลทั้งหมดเป็น synthetic เพื่อการสาธิต** (22 หุ้น × 750 วันทำการ จาก generator ที่ seed ตายตัว) — ไม่ใช่ราคาตลาดจริง ทุกหน้าติดป้าย "ไม่ใช่คำแนะนำการลงทุน" · ตัวเลขทุกตัวพิสูจน์ว่า "ท่อถูก" ไม่ใช่ "edge มีจริง"

โฟลเดอร์นี้คือ **การบูรณะซอร์สต้นฉบับแบบ 1:1** จาก workspace ของ z.ai (8 commit, 27–28 ก.ย. 2569, HEAD `a3d421b`) — โค้ดแอป, schema, DB snapshot และ `worklog.md` ครบทุกบรรทัด สิ่งที่ไม่ได้นำมาคือของที่ผูกกับ container เดิม (`.zscripts/`, `Caddyfile`, `.env` ที่ชี้ path ใน container, `examples/`, `tool-results/`) และสิ่งที่เพิ่มในรอบบูรณะ (Task 15 ใน `worklog.md`) คือเกตคุณภาพ ชั้นความปลอดภัย ชั้น LLM ที่ซื่อสัตย์ test suite และเอกสาร — สรุปสถาปัตยกรรม/ไทม์ไลน์ทั้งหมด: **[`docs/PROJECT-SUMMARY.md`](docs/PROJECT-SUMMARY.md)** · ประเมิน 360 องศา 10 มิติ พร้อมหลักฐานและเส้นทางสู่ 10/10: **[`docs/scorecard.md`](docs/scorecard.md)**

## Stack

Next.js 16.3 (App Router, standalone) · React 19 · TypeScript 5 · Prisma 6 + SQLite · Tailwind 4 + shadcn/ui · Recharts · Bun (package manager/test runner ตาม `bun.lock`) · server โปรดักชันรันด้วย node 22

## เริ่มใช้งาน

```bash
cd omniscient-quant-engine
cp .env.example .env          # DATABASE_URL="file:../db/custom.db" (สัมพัทธ์กับ prisma/)
bun install --frozen-lockfile # ตาม bun.lock (ต้นฉบับ + Next 16.3.6 ที่แพตช์ช่องโหว่แล้ว)
bun run db:generate           # prisma generate
bun run dev                   # http://localhost:3000 (ฟังเฉพาะ 127.0.0.1 — ดูหัวข้อความปลอดภัย)
```

- `db/custom.db` ที่แนบมาคือ **snapshot ข้อมูล demo (synthetic)** 22 หุ้น × 750 วัน พร้อมตัวอย่าง journal 4 รายการ, รายงานหลอมรวม 4 ฉบับ และ audit 1 ฉบับ — เปิดแล้วเห็นระบบทำงานทันที
- จะเริ่มจากฐานเปล่าก็ได้: ลบ `db/custom.db` → `bun run db:push` → API แรกที่ถูกเรียกจะ seed ข้อมูลจำลองเอง (หรือ `POST /api/system` · `{"force":true}` = ล้างแล้วสร้างใหม่)
- หน้าหลัก = **Command Center** (สภาพตลาด, สุขภาพเอนจิน, กราฟ + quick pick, โอกาสวันนี้, equity curve, sector heat) · sidebar ไปยัง Terminal และแท็บวิเคราะห์ 10 แท็บ: ภาพรวม → หลอมรวม → Multi-View → Dependence → Decision → Risk & Sizing → Meta-Risk (L∞) → Apex (L7) → Backtest & Journal → AI Auditor · ⌘K ค้นหา symbol

## โปรดักชัน

```bash
bun run build                                                   # next build (standalone) + คัดลอก static/public
DATABASE_URL="file:/abs/path/omniscient-quant-engine/db/custom.db" bun run start   # node .next/standalone/server.js ที่ 127.0.0.1:3000
# เปิดให้เครื่องอื่นใช้: ตั้ง OQE_AUTH_PASSWORD ก่อน แล้ว bun run start:lan (ฟัง 0.0.0.0)
```

- โหมด standalone ควรใช้ `DATABASE_URL` แบบ **absolute path** เพราะ path สัมพัทธ์ถูกตีความจากตำแหน่ง Prisma client ในโฟลเดอร์ standalone
- Docker: `docker compose up -d --build` (บังคับตั้ง `OQE_AUTH_PASSWORD` ใน `.env` — ดู `docker-compose.yml`) · image seed DB ลง volume `/data` ครั้งแรก (`OQE_SEED_DB=demo|empty|none`) · **image ยังไม่ได้ build ทดสอบใน session ที่สร้างไฟล์** (sandbox ไม่มีเครือข่ายสำหรับ docker) — ตรวจครั้งแรกบนเครื่องที่มี Docker

## ความปลอดภัย

- **ไม่ตั้ง env = โหมด local:** เปิด http://localhost:3000 บนเครื่องที่รัน server ได้เหมือนเดิม ส่วนเครื่องอื่น โดเมน หรือ reverse proxy ได้ 403 พร้อมวิธีตั้งรหัสผ่าน · `dev`/`start` ฟังเฉพาะ 127.0.0.1 เพราะ proxy ของ Next มองไม่เห็น IP จริงของ socket (ถ้าฟัง 0.0.0.0 โดยไม่ตั้งรหัสผ่าน คนใน LAN ที่ปลอม `Host` + `X-Forwarded-For` อาจผ่านได้)
- **เปิดให้เครื่องอื่นใช้:** ตั้ง `OQE_AUTH_PASSWORD` → ทุกหน้า/API ต้องส่ง HTTP Basic auth (browser ถามรหัสเอง ชื่อผู้ใช้ใส่อะไรก็ได้) · `OQE_API_TOKEN` = Bearer token ของสคริปต์/monitor ที่ `/api/*` · ใช้งานจริงผ่านอินเทอร์เน็ตให้มี TLS reverse proxy ด้านหน้า (`OQE_HSTS=1`, `OQE_ALLOWED_ORIGINS`) — Basic auth บน http ธรรมดา = รหัสวิ่งเป็นตัวอักษรเปล่า
- **ทุกโหมด:** POST/PUT/PATCH/DELETE ที่ `/api/*` ต้องเป็น JSON และมาจาก origin เดียวกัน (กัน CSRF) · เส้นทางที่เรียก LLM / seed / รายงานหนัก จำกัดความถี่ต่อ client (429 + Retry-After) · เดารหัสผ่าน/token ซ้ำถูกจำกัด (5 ครั้ง/นาที/IP) · security headers + CSP · ไม่มี session/cookie ฝั่ง server
- ตรรกะทั้งหมดอยู่ใน `src/lib/security/` (pure, มี unit test) และ `src/proxy.ts` แค่แปลงผลเป็น response · env ทั้งหมด: `.env.example`

## LLM (ทางเลือก)

ระบบใช้ LLM เพียง 3 จุด — **หลอมรวมด้วย AI** (narrative ของรายงานหลอมรวม), **AI Auditor** (System 2 reflection) และ **แชท AI Analyst** ใน Terminal — ทุก prompt ล็อกให้อ้างตัวเลขจาก evidence JSON ที่เอนจินคำนวณแล้วเท่านั้น เอนจินวิเคราะห์ทั้งหมด (gates, backtest, คะแนนหลอมรวม, meta-risk, apex) ทำงานโดยไม่ต้องใช้ LLM

| ทาง | ตั้งค่า |
|---|---|
| endpoint แบบ OpenAI-compatible (`/v1/chat/completions`) | `OQE_LLM_API_KEY` + `OQE_LLM_MODEL` (+ `OQE_LLM_BASE_URL` ค่าเริ่มต้น OpenAI) |
| `z-ai-web-dev-sdk` (พฤติกรรมเดิมของต้นฉบับบน container z.ai) | วางไฟล์ `.z-ai-config` ในโฟลเดอร์แอป / home / `/etc` |
| ไม่ตั้งค่า | ปุ่ม AI ทั้ง 3 ตอบ **503** พร้อมข้อความบอกวิธีตั้งค่า (ไม่ใช่ error ดิบ) · `/api/health` รายงาน `llm.configured=false` |

## การทดสอบ — เกตเดียว

```bash
bun run verify        # typecheck · lint · test · test:ops · build · smoke — ครบ = เหมือน CI เขียว
bun run test          # bun test src — unit + engine invariant tests บน SQLite ชั่วคราว (ไม่แตะ db/custom.db)
bun run smoke         # หลัง build: เปิด standalone server บนสำเนา DB แล้วเรียกทุก route (JSON เคร่งครัด, POST LLM ต้อง 503)
bun deploy/smoke.ts --db empty   # ทางที่สอง: DB เปล่า → auto-seed
```

CI ของแอปนี้อยู่ที่ `.github/workflows/omniscient-quant-engine.yml` — รันคำสั่งชุดเดียวกัน (typecheck · lint · test · build · smoke ×2 · audit critical) ทุก push ที่แตะโฟลเดอร์นี้

`bun test` ใช้ preload `src/test/setup.ts` (ตั้งใน `bunfig.toml`) ชี้ `DATABASE_URL` ไป SQLite ชั่วคราวที่สร้างจาก `prisma/schema.prisma` ก่อนโหลดไฟล์ test ใด ๆ — test ของเอนจินจึง seed ข้อมูลจำลองลง DB ชั่วคราวเองและยึด "รูปร่าง + กฎ" ที่ต้องจริงเสมอ (ไม่ยึดตัวเลขตายตัว เพราะ generator anchor วันทำการล่าสุดของวันที่รัน)

## API (App Router, ไม่ใช้ server action)

| เส้นทาง | หน้าที่ |
|---|---|
| `GET /api/health` | สุขภาพระบบ (DB, ข้อมูล, LLM) สำหรับ monitor/Docker — 200 ok/degraded · 503 down · public ในโหมด auth |
| `GET /api` · `GET/POST /api/system` | ดัชนี API · สถานะข้อมูล + regime · seed/รีเซ็ต |
| `GET /api/board` · `GET /api/decision/{symbol}` | Decision Board ทุกตัว · 5-Gate + trade plan + risk MC + history |
| `GET /api/analytics/factors` · `GET /api/analytics/dependence` | Multi-View factor model + volcano · Θ matrix + decouple |
| `GET /api/backtest` | walk-forward + gate attribution + calibration |
| `GET/POST/PATCH/DELETE/PUT /api/journal` | trade journal (PUT = seed ตัวอย่างจาก board) |
| `GET/POST /api/synthesis/{symbol}` | หลอมรวม 13 สาย (POST = narrative ด้วย LLM, append-only archive) |
| `GET /api/meta-risk/{symbol}` · `GET /api/apex/{symbol}` | Meta-Risk L∞ · Apex L7 (ขนาดไม้สุดท้ายเคารพคำสั่ง Risk MDX) |
| `GET /api/market/quotes` · `GET /api/market/series/{symbol}` · `GET/POST /api/analyst/{symbol}` | Terminal: quotes · OHLCV + indicators + S/R · AI panel (POST = แชท LLM) |
| `GET/POST /api/audit` | รายงาน LLM auditor |

## โครงสร้าง

| path | หน้าที่ |
|---|---|
| `src/app/page.tsx` | app shell: sidebar (rail + mobile Sheet), topbar, ⌘K, Command Center / Terminal / 10 แท็บ |
| `src/components/dashboard/` · `terminal/` · `quant/` · `charts/` | Command Center + design primitives · Market Intelligence Terminal · แท็บวิเคราะห์ · chart SVG 7 ตัว |
| `src/lib/quant/market.ts` · `rng.ts` · `stats.ts` | synthetic SET universe (regime script, story event, PIT fundamentals) · RNG · สถิติ (MWU, BH-FDR, PCA, copula, PSI, KDE) |
| `src/lib/quant/engine/` | panel (L0) · factors/volcano (L3) · gates (L6) · backtest (L4) · risk (L5) · synthesis · meta-risk · mdx · micro · apex (L7) · terminal · api (orchestrator + cache) |
| `src/lib/llm.ts` | ชั้น LLM กลาง (OpenAI-compatible / z-ai / ไม่มี → 503) |
| `src/proxy.ts` · `src/lib/security/` | ด่านสิทธิ์ทุกคำขอ: โหมด local/auth, Basic/Bearer, CSRF, rate limit |
| `src/test/` · `deploy/smoke.ts` · `deploy/docker-entrypoint.sh` | DB ชั่วคราวของ bun test · API smoke ของ standalone · entrypoint ของ image |
| `prisma/schema.prisma` | 7 model: Stock, Price, Fundamental (PIT announceDate), FundFlow, JournalEntry, AuditReport, SynthesisReport |
| `docs/PROJECT-SUMMARY.md` · `docs/scorecard.md` · `worklog.md` | สรุปสถาปัตยกรรม/ไทม์ไลน์ · ประเมิน 360 องศา · บันทึกงานทุก task ของ agent ที่สร้างระบบ (Task 0–14) + รอบบูรณะ (Task 15) + ประเมิน (Task 16) |

## หลักการที่ระบบยึด

หลักฐานบรรจบ (convergent evidence) ก่อนคำสั่ง · ทุกสัญญาณผ่าน 5 gates และคะแนนหลอมรวมถอดจากสายหลักฐานที่ตรวจได้ (ไม่มีคะแนนจากอารมณ์) · walk-forward แบบ purged + embargo เท่านั้นที่นับเป็นผล out-of-sample · Risk of Ruin ก่อนผลตอบแทน (ขนาดไม้ = min(Kelly-Vol, CVaR budget, cap 25%) × คำสั่ง Risk MDX) · โมเดลรู้ว่าตัวเองตายเมื่อไหร่ (model registry self-repudiating) · LLM มีหน้าที่เรียบเรียง ไม่ใช่ตัดสินใจ · ป้าย "ข้อมูลจำลอง · ไม่ใช่คำแนะนำการลงทุน" แสดงเสมอ

## ข้อจำกัดที่รู้ตัว / ขั้นถัดไป

- ข้อมูลเป็น synthetic ล้วน (EOD, timeframe 1D/1W) — ต่อข้อมูลจริงต้องเขียน adapter ลงตาราง `Price`/`Fundamental`/`FundFlow` (PIT) แล้วเอนจินทุกชั้นทำงานต่อได้ทันที
- Risk MDX override ถูกบังคับที่ Apex (ขนาดไม้สุดท้าย) แล้ว แต่ `plan.sizePct` ของ 5-Gate บน board/decision ยังเป็นค่าก่อน MDX (ตั้งใจ — board เป็นชั้น G4, Apex เป็นชั้นสุดท้าย)
- ผลลัพธ์ LLM ไม่ได้ทดสอบกับผู้ให้บริการจริงในรอบบูรณะ (ตรวจด้วย fake provider ใน unit test) — ทดสอบ 3 ปุ่ม AI หลังตั้งค่าคีย์จริง
- Docker image ยังไม่ได้ build ในรอบนี้ (ดูหมายเหตุใน `Dockerfile`)
