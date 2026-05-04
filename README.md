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

