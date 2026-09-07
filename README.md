# NaraSuite + Honest Oracle + MindBridge

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

## MindBridge — ดนตรีบำบัดเชิงหลักฐาน

แพลตฟอร์มดนตรีบำบัดแบบ full-stack ที่ทุกตัวเลขตรวจซ้ำเองได้ เอนจินอยู่ที่
`lib/therapy-engine/` (pure + deterministic, มีเทสต์ครบทุกโมดูล) — ดู
`lib/therapy-engine/README.md` สำหรับเหตุผลเบื้องหลังการออกแบบ

- Landing: `/therapy`
- ประเมิน (GAD-7 + PHQ-9): `/therapy/assess`
- ตารางหลักฐาน: `/therapy/interventions`
- ห้องฝึกฟัง/หายใจ (iso-principle): `/therapy/session`
- บันทึกการนอน: `/therapy/sleep`
- ความคืบหน้า: `/therapy/progress`
- ความปลอดภัย: `/therapy/safety`

ใช้ได้โดยไม่ต้องเข้าสู่ระบบ — คำตอบเก็บใน `localStorage` และจะซิงก์ขึ้นบัญชี
ก็ต่อเมื่อผู้ใช้เข้าสู่ระบบไว้

### API (ต้องเข้าสู่ระบบ)

| Method | Endpoint | ทำอะไร |
|---|---|---|
| `GET` / `POST` | `/api/therapy/assessments` | อ่านประวัติ / ส่งคำตอบแล้วให้เซิร์ฟเวอร์คิดคะแนนเอง |
| `GET` / `POST` | `/api/therapy/sessions` | บันทึกเซสชันที่ทำจริง |
| `GET` / `POST` | `/api/therapy/sleep` | บันทึกการนอนรายคืน (upsert ตามวันที่) |
| `GET` | `/api/therapy/export` | ดาวน์โหลดข้อมูลทั้งหมด รวมคำตอบรายข้อ |
| `DELETE` | `/api/therapy/export` | ลบข้อมูล MindBridge ทั้งหมดของผู้ใช้ |

`POST /api/therapy/assessments` รับเฉพาะ `{ instrument, responses }` — คะแนนรวม
ที่ client ส่งมาจะถูกละทิ้งเสมอ เซิร์ฟเวอร์คิดใหม่จากคำตอบผ่านเอนจินตัวเดียวกับ
ที่ UI ใช้ ทุกแถวในตารางจึงคำนวณย้อนกลับจากคำตอบที่อยู่ข้าง ๆ ได้

> ⚠️ MindBridge เป็นเครื่องมือคัดกรองและดูแลตัวเอง **ไม่ใช่การวินิจฉัย ไม่ใช่การรักษา
> และไม่ทดแทนผู้ให้บริการสุขภาพ** — หากมีความคิดทำร้ายตัวเอง โทร 1323 (ตลอด 24 ชม.)

ต้องรัน `npm run db:push` หลัง deploy เพื่อสร้างตาราง `TherapyAssessment`,
`TherapySession`, `TherapySleepNight`

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

