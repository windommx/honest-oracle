# NaraSuite + Honest Oracle

โปรเจกต์ Next.js (App Router) + TypeScript + Tailwind + Prisma + NextAuth (Credentials) พร้อมโมดูล Honest Oracle สำหรับ “แผนที่ชีวิต 100 ปี” แบบโปร่งใส

## Run (Local)

1) สร้างไฟล์ `.env` จาก `.env.example` แล้วใส่ค่าให้ครบ

2) ติดตั้งและเตรียมฐานข้อมูล

```bash
npm install
npm run db:generate
npm run db:push
```

3) รัน dev server

```bash
npm run dev
```

เปิด `http://localhost:3000`

## Honest Oracle

- Landing: `/oracle`
- App: `/oracle/app`
- History: `/oracle/history`
- API Keys: `/oracle/api-keys`
- Pricing: `/oracle/pricing`
- Admin: `/oracle/admin`

### Public API (Premium)

```http
POST /api/public/oracle
x-api-key: <YOUR_KEY>
Content-Type: application/json

{
  "inputName": "Nara",
  "birthDate": "2020-01-01T00:00:00.000Z",
  "birthTime": "12:00",
  "birthPlace": "Bangkok"
}
```

## HD Competency (ระบบประเมิน Competency Level พยาบาลไตเทียม)

โมดูลประเมินสมรรถนะพยาบาลหน่วยฟอกไตเทียม ย้ายมาจากแบบฟอร์ม Excel
"แบบประเมิน Level พยาบาลไตเทียม" (10 เกณฑ์ × 5 ระดับ, คะแนนเต็ม 100) — ล็อกอินแล้วใช้ได้ทันที
ข้อมูลของแต่ละบัญชี (หน่วย) แยกจากกัน

- App: `/competency` — ภาพรวมหน่วย · บันทึก/แก้ไขผลประเมิน · รายชื่อพยาบาล (โปรไฟล์ + แผนพัฒนา + ประวัติ)
- รายงานรายบุคคล (พิมพ์/บันทึก PDF): `/competency/report/<nurseId>` (`?a=<assessmentId>` เลือกครั้งที่ประเมิน)
- ส่งออกตาราง OUTCOME เป็น CSV (UTF-8 BOM เปิดใน Excel ได้เลย): `GET /api/competency/export`
- เริ่มต้นด้วยข้อมูลตัวอย่าง 7 คนจากไฟล์ต้นฉบับได้จากหน้าภาพรวม (เฉพาะบัญชีที่ยังไม่มีรายชื่อ)

เกณฑ์ระดับ: LEVEL 1 ผู้เริ่มต้น ≤50 · 2 ผู้เรียนรู้ 51-60 · 3 ผู้ปฏิบัติ 61-70 · 4 ผู้ชำนาญ 71-80 · 5 ผู้เชี่ยวชาญ 81-100
(คะแนน 50 ที่แบบฟอร์มไม่ได้ระบุ นับเป็น LEVEL 1) · LEVEL 6-7 (หัวหน้าแผนก/ผู้จัดการศูนย์) กำหนดตามตำแหน่ง ไม่คำนวณจากคะแนน
ตรรกะทั้งหมดอยู่ใน `lib/competency/` (pure, มีเทสต์) — API คำนวณคะแนนรวม/ระดับเองเสมอ ไม่รับจาก client

### API (ต้องล็อกอิน, ข้อมูลผูกกับบัญชีผู้ใช้)

| Method | Path | ใช้ทำอะไร |
|---|---|---|
| GET/POST | `/api/competency/nurses` | รายชื่อ (พร้อมผลล่าสุด) / เพิ่มพยาบาล |
| GET/PATCH/DELETE | `/api/competency/nurses/:id` | โปรไฟล์ + ประวัติ / แก้ไข / ลบ (ลบผลประเมินตาม) |
| GET/POST | `/api/competency/assessments` | รายการผลประเมิน (`?nurseId=`) / บันทึกผล (`{ nurseId }` หรือ `{ nurse: {...} }` + `scores` + `assessDate` `YYYY-MM-DD`) |
| GET/PATCH/DELETE | `/api/competency/assessments/:id` | ดู / แก้ไข (คำนวณคะแนนใหม่) / ลบ |
| GET | `/api/competency/dashboard` | สถิติหน่วย (จำนวน, ค่าเฉลี่ย, การกระจายระดับ, เกณฑ์ที่อ่อน, อันดับ) |
| GET | `/api/competency/export` | CSV ตาราง OUTCOME |
| POST | `/api/competency/sample` | นำเข้าข้อมูลตัวอย่าง (409 ถ้ามีรายชื่ออยู่แล้ว) |

ตารางใหม่ `CompetencyNurse` / `CompetencyAssessment` — รัน `npm run db:push` หลัง deploy

## Billing (Stripe)

ตั้งค่า env:

- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID_PRO`
- `STRIPE_WEBHOOK_SECRET`

Webhook endpoint:

- `POST /api/billing/webhook`

## Deploy

แนะนำ Vercel + PostgreSQL (Neon/Supabase/Railway):

- ตั้งค่า env ตาม `.env.example`
- Deploy แล้วรัน Prisma ผ่าน `db:push` (หรือปรับเป็น `migrate` ตาม workflow ทีม)

