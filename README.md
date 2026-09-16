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

## StageLab

โมดูล SaaS สำหรับระบบ Stage Analysis (Weinstein) — ทำรอบทบทวนหุ้นรายสัปดาห์
คัดหุ้นด้วย Funnel จัดพอร์ต และบันทึกวินัยการเทรด แยกข้อมูลรายผู้ใช้เต็มรูปแบบ

- Landing: `/stagelab`
- Pricing: `/stagelab/pricing`
- App: `/stagelab/app` (ต้องเข้าสู่ระบบ)

แผน Free ใช้รอบทบทวนได้ครบ 5 ขั้น ส่วนแผน Pro เปิดโต๊ะวิจัย (Thesis, Backtest,
Risk Radar, Pro Desk, Quant Lab) ใช้ Stripe ตัวเดียวกับที่ตั้งค่าไว้ด้านล่าง

จักรวาลหุ้นเป็นข้อมูลอ้างอิงร่วมที่ระบบสร้างให้อัตโนมัติเมื่อถูกอ่านครั้งแรก
หรือจะสั่งล่วงหน้าก็ได้:

```bash
npm run db:seed:stagelab
```

รายละเอียดสถาปัตยกรรม การแยก tenant แผนการใช้งาน และชุดทดสอบ อ่านได้ที่
[`docs/stagelab.md`](docs/stagelab.md)

## Production

อ่าน [`docs/production.md`](docs/production.md) ก่อน deploy — ลำดับที่ถูกต้องคือ

```bash
npm run check:env          # ตรวจ env ก่อน แล้วบอกว่าตัวไหนผิด
npm run db:migrate:deploy  # ใช้ migration เสมอ ห้ามใช้ db:push บน production
npm run build
npm run smoke              # ยิงจริงผ่าน HTTP หลัง deploy
```

ฐานข้อมูลที่มีตารางอยู่แล้วต้อง baseline ก่อนหนึ่งครั้ง — วิธีอยู่ในเอกสาร

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

