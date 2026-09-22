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
bun run dev                   # http://localhost:3000
```

- `db/custom.db` ที่แนบมาคือ **snapshot ข้อมูล demo (synthetic)** 520 วัน × 240 หุ้น พร้อม tracking log ของ GTAA, paper trade log และ shadow log — เปิดแล้วเห็นระบบทำงานทันที
- จะเริ่มจากฐานเปล่าก็ได้: ลบ `db/custom.db` → `bun run db:push` → ไปแท็บ **ข้อมูล** กด seed หรือ ingest CSV จาก AmiBroker (รองรับคอลัมน์ `open,high,low` สำหรับ SET Sniper)
- ทุกอย่างทำงานใน **PAPER MODE** — ไม่มีการส่งคำสั่งซื้อขายจริง ทุกคำสั่งที่กระทบพอร์ตผ่าน Human Gate

## โปรดักชัน

```bash
bun run build                                   # next build + คัดลอก static/public เข้า .next/standalone
DATABASE_URL="file:/abs/path/thai-momentum-platform/db/custom.db" bun run start
# หรือ node .next/standalone/server.js (ตั้ง PORT / DATABASE_URL เป็น env)
```

โหมด standalone ควรใช้ `DATABASE_URL` แบบ **absolute path** (ต้นฉบับใช้แบบเดียวกัน) เพราะ path สัมพัทธ์ถูกตีความจากตำแหน่ง Prisma client ในโฟลเดอร์ standalone

## เครื่องมือ CLI

```bash
bun run ic                     # IC harness ของ Signals v2 (ตาราง IC/ICIR + verdict + น้ำหนัก)
bun run fetch:cross            # ดึง SPX / USDTHB / GOLD จาก Yahoo (ข้ามอย่างปลอดภัยถ้าไม่มีเน็ต)
bun run gtaa -- fetch          # ราคาจริง 15 สินทรัพย์ 30 ปี → data/gtaa/panel.json (ผ่าน quality gate)
bun run gtaa -- run|macro|sensitivity|selftest|reset
```

## LAB KIT (Python, รันบนเครื่อง local)

`lab/` คือฉบับ offline ของ Evidence Board + Shadow Lab สำหรับข้อมูล OHLC จริง (อ่าน `db/custom.db` ตาราง `RawDaily`) — ลำดับรัน, cron รายเดือน และธรรมาภิบาลอยู่ใน [`lab/README.md`](lab/README.md)

## โครงสร้าง

| path | หน้าที่ |
|---|---|
| `src/app/page.tsx` → `src/components/platform/app-shell.tsx` | หน้าเดียว 17 แท็บ (sidebar, ⌘K palette, ticker, market clock, mobile dock) |
| `src/app/api/**` | API 46 เส้น (App Router, ไม่ใช้ server action) |
| `src/lib/momentum/` | core data engine, contracts, backtest engine, Signals v2, Alpha Stack, Bayes Stop, AI-Score |
| `src/lib/research/` | Profit Engine, CPCV, meta-labeling, importance, prereg, event hash chain, thai-fit (H1–H4), Global Engines 9 ตัว |
| `src/lib/gtaa/` | GTAA Rotation (Faber): engine + self-test 14 ข้อ + walk-forward + Monte Carlo + Macro Gate + tracking |
| `src/lib/sniper/` | SET Sniper: key levels / sweep / FVG / Volume Profile / absorption / confluence / circuit breaker |
| `src/lib/flagship/` | สายพานคัดกรอง 6 ด่าน → ReliabilityScore → อันดับ 1–10 |
| `src/lib/lab/` · `lab/` | Shadow Lab (rule × Nimble × label) และ Python offline kit |
| `src/lib/config/thai.ts` · `thai-config.ts` | ค่าคงที่ตลาดไทย + config-as-data (`config_th`) |
| `prisma/schema.prisma` | 18 model (RawDaily, Snapshot, Decision, Position, Trade, EventLog, GtaaSignal, …) |
| `data/gtaa/panel.json` | ราคาจริง Yahoo adjclose 15 สินทรัพย์ × 360 เดือน |
| `docs/research/` | บันทึกวิจัย GTAA (Faber) และ SET Sniper |
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
