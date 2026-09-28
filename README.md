# NaraClear + โครงสร้างชีวิต

โปรเจกต์ Next.js (App Router) + TypeScript + Tailwind + Prisma + NextAuth (Credentials) พร้อมโมดูล โครงสร้างชีวิต สำหรับ “แผนที่ชีวิต 100 ปี” แบบโปร่งใส

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

## โครงสร้างชีวิต

- Landing: `/lifemap`
- App: `/lifemap/app`
- History: `/lifemap/history`
- API Keys: `/lifemap/api-keys`
- Pricing: `/lifemap/pricing`
- Admin: `/lifemap/admin`

### Public API (Premium)

```http
POST /api/public/lifemap
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


## Thai Momentum Platform (แอปแยกใน `thai-momentum-platform/`)

แพลตฟอร์มโมเมนตัมหุ้นไทย (Jev × Momentum System) บูรณะจากซอร์สต้นฉบับแบบ 1:1 เป็นแอป Next.js 16 อิสระ มี `package.json` และฐานข้อมูล SQLite ของตัวเอง
ไม่ผูกกับแอปหลักในโฟลเดอร์ราก (root `tsconfig.json` exclude โฟลเดอร์นี้ไว้) — วิธีรันและเอกสารทั้งหมดอยู่ที่ `thai-momentum-platform/README.md`


## Omniscient Quant Engine (แอปแยกใน `omniscient-quant-engine/`)

แพลตฟอร์ม quant หลายมุมมองครบวงจร (7 Layers: PIT data → Multi-View factors → Copula dependence → walk-forward → CVaR sizing → 5-Gate execution → Meta-Risk/Apex) บูรณะแบบ 1:1 จาก workspace ต้นฉบับ (z.ai, 27–28 ก.ย. 2569) เป็นแอป Next.js 16 อิสระ มี `package.json`, ฐานข้อมูล SQLite และ CI ของตัวเอง (`.github/workflows/omniscient-quant-engine.yml`)
ข้อมูลตลาดเป็น **synthetic เพื่อการสาธิต** ทั้งหมด ไม่ใช่คำแนะนำการลงทุน — ไม่ผูกกับแอปหลักในโฟลเดอร์ราก (root `tsconfig.json` exclude โฟลเดอร์นี้ไว้) วิธีรัน ความปลอดภัย การตั้งค่า LLM และเอกสารทั้งหมดอยู่ที่ `omniscient-quant-engine/README.md`
