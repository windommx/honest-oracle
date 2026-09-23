# Thai Momentum Platform — Jev × Momentum System

เว็บแพลตฟอร์มโมเมนตัมหุ้นไทยแบบ fullstack หน้าเดียว (`/`) ภาษาไทยทั้งระบบ: ข้อมูล → สัญญาณ → ห้องวิจัย → สมองตัดสินใจ Jev → Human Gate → พอร์ตกระดาษ พร้อมเอนจินสากล (GTAA Rotation), SET Sniper, Bayes Stop, Evidence Board, Shadow Lab และ Flagship 1–10

โฟลเดอร์นี้คือ **การบูรณะซอร์สต้นฉบับแบบ 1:1** จาก git repository ของโปรเจกต์เดิม (22 commit, 20–22 ก.ย. 2026, HEAD `479545a`) ที่กู้จากไฟล์ zip 13 ชุด — โค้ดแอปพลิเคชัน, schema, เอกสาร, ข้อมูลจริง GTAA, Python LAB KIT และ `worklog.md` ครบทุกบรรทัด สิ่งที่ไม่ได้นำมาคือของที่ผูกกับ container เดิม (สคริปต์ z.ai, Caddyfile) และภาพหน้าจอ/ไฟล์สื่อจากการทดสอบ

สรุปสถาปัตยกรรม ไทม์ไลน์ และผลลัพธ์ทั้งหมด: **[`docs/PROJECT-SUMMARY.md`](docs/PROJECT-SUMMARY.md)**

## Stack

Next.js 16 (App Router, standalone) · React 19 · TypeScript 5 · Prisma 6 + SQLite · Tailwind 4 + shadcn/ui · Recharts · Bun (runtime และ package manager ตาม `bun.lock` ต้นฉบับ)

## เริ่มใช้งาน

```bash
cd thai-momentum-platform
cp .env.example .env          # DATABASE_URL="file:../db/custom.db" (สัมพัทธ์กับ prisma/)
bun install --frozen-lockfile # เวอร์ชันตรงกับต้นฉบับทุกแพ็กเกจ
bun run db:generate           # prisma generate
bun run dev                   # http://localhost:3000 (ฟังเฉพาะ 127.0.0.1 — ดูหัวข้อความปลอดภัย)
```

- `db/custom.db` ที่แนบมาคือ **snapshot ข้อมูล demo (synthetic)** 520 วัน × 240 หุ้น พร้อม tracking log ของ GTAA, paper trade log และ shadow log — เปิดแล้วเห็นระบบทำงานทันที
- จะเริ่มจากฐานเปล่าก็ได้: ลบ `db/custom.db` → `bun run db:push` → ไปแท็บ **ข้อมูล** กด seed หรือ ingest CSV จาก AmiBroker (รองรับคอลัมน์ `open,high,low` สำหรับ SET Sniper)
- ทุกอย่างทำงานใน **PAPER MODE** — ไม่มีการส่งคำสั่งซื้อขายจริง ทุกคำสั่งที่กระทบพอร์ตผ่าน Human Gate
- เปิดครั้งแรกจะเห็นคู่มือเริ่มต้นบน Command Center: เลือก **โหมดง่าย** (7 แท็บหลัก + Track Record) หรือ **Pro** (ครบทุกแท็บ) เปลี่ยนภายหลังได้ที่ sidebar, ⌘K หรือ Options Center · ธีมสว่าง/มืด/ตามระบบที่ปุ่มดวงอาทิตย์บน header · ศัพท์เทคนิคที่ขีดเส้นใต้กดดูความหมายภาษาไทยได้ (อภิธานศัพท์ 46 คำ)

## โปรดักชัน

```bash
bun run build                                   # next build + คัดลอก static/public เข้า .next/standalone
DATABASE_URL="file:/abs/path/thai-momentum-platform/db/custom.db" bun run start      # node .next/standalone/server.js ที่ 127.0.0.1:3000
# เปิดให้เครื่องอื่นใช้: ตั้ง TMP_AUTH_PASSWORD (+ TMP_AUTH_SECRET) ก่อน แล้ว bun run start:lan (ฟัง 0.0.0.0)
```

- โหมด standalone ควรใช้ `DATABASE_URL` แบบ **absolute path** (ต้นฉบับใช้แบบเดียวกัน) เพราะ path สัมพัทธ์ถูกตีความจากตำแหน่ง Prisma client ในโฟลเดอร์ standalone
- server โปรดักชันต้องรันด้วย **node** — Bun 1.3.11 รัน build ของ Next 16.3.6 ไม่ได้ (ทุก route ตอบ 500 "Expected CommonJS module to have a function wrapper") สคริปต์ `start` จึงเรียก node ให้
- ติดตั้งจริง (Docker Compose / systemd / Fly) · งานตามเวลา · backup/restore · monitoring · incident checklist: **[`docs/ops.md`](docs/ops.md)**

## ความปลอดภัย

- **ไม่ตั้ง env = โหมด local:** เปิด http://localhost:3000 บนเครื่องที่รัน server ได้เหมือนเดิม ส่วนเครื่องอื่น โดเมน หรือ reverse proxy ได้ 403 พร้อมวิธีตั้งรหัสผ่าน · `dev`/`start` ฟังเฉพาะ 127.0.0.1 เพราะ proxy ของ Next มองไม่เห็น IP จริงของ socket (ถ้าฟัง 0.0.0.0 โดยไม่ตั้งรหัสผ่าน คนใน LAN ที่ปลอม `Host` + `X-Forwarded-For` อาจผ่านได้)
- **เปิดให้เครื่องอื่นใช้:** ตั้ง `TMP_AUTH_PASSWORD` (+ `TMP_AUTH_SECRET=$(openssl rand -hex 32)`) → เข้าสู่ระบบที่ `/login` (cookie HttpOnly · SameSite=Lax · 7 วัน) · `TMP_VIEWER_PASSWORD` = ผู้ชมอ่านอย่างเดียว · `TMP_API_TOKEN` = Bearer token ของสคริปต์/cron · ใช้งานจริงผ่านอินเทอร์เน็ตให้มี TLS reverse proxy ด้านหน้า (`TMP_HSTS=1`)
- **ทุกโหมด:** POST/PUT/PATCH/DELETE ที่ `/api/*` ต้องเป็น JSON และมาจาก origin เดียวกัน (กัน CSRF) · งานหนัก/LLM/ดึงข้อมูลภายนอก/เดารหัสผ่าน จำกัดความถี่ (429) · security headers + CSP · GET ที่บันทึก policy/ผลตรวจ (`/api/stops`, `/api/signals/ic`, `/api/verify`, `/api/lab/dashboard`) บันทึกเฉพาะผู้ดูแลที่เรียกจากหน้าเว็บนี้ ผู้ชมหรือเว็บอื่นได้ผลคำนวณแต่ไม่เขียน DB
- **ลบข้อมูลทั้งชุดต้องยืนยัน:** `/api/seed` → `{"confirm":"RESET"}` · replaceDemo ของ `/api/feed/ingest` และ `/api/feed/fetch` → `{"confirm":"REPLACE"}` (ไม่ส่ง = 409 พร้อมรายการสิ่งที่จะหาย) และสำรอง DB (VACUUM INTO) ไว้ที่ `data/backups/` หรือ `TMP_BACKUP_DIR` ก่อนลบเสมอ
- **หลักฐานตรวจสอบ:** `GET /api/events/export?format=json|csv` (hash chain + decisions) · ข้อกำหนด ความเสี่ยง สิทธิ์ข้อมูล PDPA: `/terms` · env ทั้งหมด: `.env.example`

## เครื่องมือ CLI

```bash
bun run ic                     # IC harness ของ Signals v2 (ตาราง IC/ICIR + verdict + น้ำหนัก)
bun run fetch:cross            # ดึง SPX / USDTHB / GOLD จาก Yahoo (ข้ามอย่างปลอดภัยถ้าไม่มีเน็ต)
bun run gtaa -- fetch          # ราคาจริง 15 สินทรัพย์ 30 ปี → data/gtaa/panel.json (ผ่าน quality gate)
bun run gtaa -- run|macro|sensitivity|selftest|reset
bun run daily                  # pipeline รายวัน: ดึงราคา → ตรวจคุณภาพ/กระทบยอด → Jev → verify → track snapshot → backup (exit code: docs/ops.md)
bun run evidence:real          # Evidence Board + IC + walk-forward → data/reports/evidence-YYYY-MM-DD.json (ป้าย REAL เฉพาะแหล่งจริงล้วน ≥ 250 วัน)
bun run backup                 # สำรอง SQLite (VACUUM INTO + ตรวจ integrity) · bun run restore -- --latest --yes (หยุด server ก่อน)
bun run scheduler              # ตั้งเวลา daily จ.–ศ. 18:30 + backup 02:30 (เวลาไทย) ไม่ต้องพึ่ง cron
```

## การทดสอบ

```bash
bun run test                                      # bun test src — unit + scenario บน SQLite ชั่วคราว
python3 -m unittest discover -s lab/tests_stops   # LAB KIT: thai_fit / apply_verdict / preflight / context_updater
python3 lab/tests_lab/test_lab_kit.py             # LAB KIT: state_gen / synth_state / nimble_runner / eval / dashboard
bun run test:ops                                  # backup/restore CLI + scheduler
bun run smoke                                     # หลัง build: เปิด standalone server บนสำเนา DB แล้ว GET ทุก route (JSON เคร่งครัด)
```

CI ของแอปนี้อยู่ที่ `.github/workflows/thai-momentum-platform.yml` — รันคำสั่งชุดเดียวกัน (typecheck · lint · test · build · smoke · audit critical · Python) ทุก push ที่แตะโฟลเดอร์นี้

`bun test` ใช้ preload `src/test/setup.ts` (ตั้งใน `bunfig.toml`) ชี้ `DATABASE_URL` ไป SQLite ชั่วคราวที่สร้างจาก `prisma/schema.prisma` ก่อนโหลดไฟล์ test ใด ๆ — เทสต์จึงไม่แตะ `db/custom.db` (bun โหลด `.env` เองอัตโนมัติ และใช้ Prisma client ตัวเดียวร่วมกันทุกไฟล์) · เทสต์ที่ต้องการ DB แยกขาดให้รันใน subprocess พร้อม `createSchemaDb()` จาก `src/test/schema-db.ts`

## LAB KIT (Python, รันบนเครื่อง local)

`lab/` คือฉบับ offline ของ Evidence Board + Shadow Lab สำหรับข้อมูล OHLC จริง (อ่าน `db/custom.db` ตาราง `RawDaily`) — ลำดับรัน, cron รายเดือน และธรรมาภิบาลอยู่ใน [`lab/README.md`](lab/README.md)

## โครงสร้าง

| path | หน้าที่ |
|---|---|
| `src/app/page.tsx` → `src/components/platform/app-shell.tsx` | หน้าเดียว 18 แท็บ (sidebar, ⌘K palette, ticker, market clock, mobile dock) · ธีมสว่าง Gold Ivory / มืด Gold Night · โหมดง่าย/Pro · คู่มือเริ่มต้น · อภิธานศัพท์ |
| `src/app/api/**` | API 56 เส้น (App Router, ไม่ใช้ server action) |
| `src/lib/momentum/` | core data engine, contracts, backtest engine, Signals v2, Alpha Stack, Bayes Stop, AI-Score |
| `src/lib/research/` | Profit Engine, CPCV, meta-labeling, importance, prereg, event hash chain, thai-fit (H1–H4), Global Engines 9 ตัว |
| `src/lib/gtaa/` | GTAA Rotation (Faber): engine + self-test 14 ข้อ + walk-forward + Monte Carlo + Macro Gate + tracking |
| `src/lib/sniper/` | SET Sniper: key levels / sweep / FVG / Volume Profile / absorption / confluence / circuit breaker |
| `src/lib/flagship/` | สายพานคัดกรอง 6 ด่าน → ReliabilityScore → อันดับ 1–10 |
| `src/lib/lab/` · `lab/` | Shadow Lab (rule × Nimble × label) และ Python offline kit |
| `src/proxy.ts` · `src/lib/security/` | ด่านสิทธิ์ทุกคำขอ: โหมด local/auth, session, CSRF, rate limit, ยืนยันก่อนลบ |
| `src/lib/feed/` | ท่อข้อมูล: Yahoo/inbox → กระทบยอด → corporate actions → ingest · ปฏิทิน SET · ความสด · ที่มา/สิทธิ์ข้อมูล |
| `src/lib/track/` | track record พอร์ตกระดาษแบบตรวจย้อนได้ (ledger hash + NAV + snapshot ใน hash chain) |
| `src/lib/ops/` · `scripts/` · `deploy/` | backup/restore, logger, pipeline รายวัน, scheduler, smoke test, Docker/systemd/Fly |
| `src/lib/config/thai.ts` · `thai-config.ts` | ค่าคงที่ตลาดไทย + config-as-data (`config_th`) |
| `prisma/schema.prisma` | 18 model (RawDaily, Snapshot, Decision, Position, Trade, EventLog, GtaaSignal, …) |
| `data/gtaa/panel.json` | ราคาจริง Yahoo adjclose 15 สินทรัพย์ × 360 เดือน |
| `docs/research/` | บันทึกวิจัย GTAA (Faber), SET Sniper, market feed, ระเบียบวิธีวิจัย (`methodology.md`) และขั้นตอนพิสูจน์ผลบนข้อมูลจริง (`evidence-protocol.md`) |
| `docs/ops.md` · `docs/scorecard.md` | คู่มือปฏิบัติการ · scorecard 10 มิติ พร้อมสิ่งที่ต้องทำนอกโค้ดเพื่อไปถึง 10/10 |
| `docs/reference/` | เอกสารต้นทาง 2 ฉบับที่ระบบถูกออกแบบจาก |
| `research/` | ผลค้นวิจัยโลก 10 คลัสเตอร์ที่ใช้คัด Global Engines |
| `worklog.md` | บันทึกงานทุก task ของ agent ที่สร้างระบบ (804 บรรทัด) |

## หลักการที่ระบบยึด

เกณฑ์ตัดสินลงทะเบียนล่วงหน้า · ผลลบแสดงตรง (WEAK / NO-GO / FAIL) · ทุกการตัดสินใจลง audit แบบ hash chain · เอนจินใหม่ทำงานเป็นเงาก่อนได้สิทธิ์ตัดสินใจ · ป้ายความจริงของข้อมูล (SYNTHETIC / REAL / DAILY PROXY) แสดงเสมอ · ไม่มีสัญญาณใดการันตีกำไร

## หมายเหตุการบูรณะ

- `bun.lock` ต้นฉบับอ้าง `registry.npmjs.com`; เปลี่ยนเป็น `registry.npmjs.org` (registry เดียวกัน แพ็กเกจและ hash เดิมทุกตัว)
- `.env` ต้นฉบับชี้ path ใน container เดิม จึงแทนด้วย `.env.example`
- โฟลเดอร์ `examples/` และ `skills/` ของ template เดิม (ซึ่งมี tsc error ค้าง) ไม่ได้นำมา — ผลคือ `tsc --noEmit` 0 error และ `eslint .` ผ่านทั้งโปรเจกต์

## แหล่งข้อมูลจริง (feed)

ข้อมูลที่แนบมาเป็น demo (synthetic) — ต่อข้อมูลจริงได้ 4 ทาง ทุกทางเข้าท่อ ingest เดียวกัน (indicator · โผ · sector · EventLog provenance) และมีป้ายความจริงของข้อมูลกำกับ รายละเอียด/ข้อจำกัด/ToS อยู่ใน [`docs/research/market-feed.md`](docs/research/market-feed.md)

| ทาง | ข้อมูลที่ได้ | วิธีใช้ |
|---|---|---|
| **Yahoo Finance (.BK)** — ดึงจาก server ได้ทันที | OHLCV รายวัน ปรับปันผล/สปลิต · มูลค่าซื้อขาย ≈ close×volume | แท็บข้อมูล → การ์ด "ดึงข้อมูลจริงจาก feed" หรือ `bun run fetch:th -- --symbols SET50 --range 2y` |
| **SET (set.or.th) ผ่าน settfex** — Python บนเครื่องคุณ | ราคาปิด + volume + มูลค่าซื้อขายจริง (บาท) + องค์ประกอบดัชนี/sector | `pip install settfex` → `python lab/fetch_set_feed.py --index SET50 --post http://localhost:3000` |
| **Settrade Open API** — ทางการ ต้องมีบัญชี | SET + TFEX real-time/ย้อนหลัง | เทมเพลต `lab/fetch_settrade_feed.py` → POST `/api/feed/ingest` |
| **CSV** (AmiBroker) | ตามไฟล์ของคุณ | การ์ดนำเข้า CSV |

API: `GET /api/feed` (ทะเบียนแหล่ง + รายชื่อตั้งต้น) · `POST /api/feed/fetch` (Yahoo) · `POST /api/feed/ingest` (JSON จากสคริปต์ภายนอก)
