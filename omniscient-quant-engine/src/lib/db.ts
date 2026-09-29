import { PrismaClient } from '@prisma/client'

// Prisma client ตัวเดียวต่อ process — dev ของ Next โหลดโมดูลซ้ำตอน HMR จึงเก็บบน globalThis
// log query เฉพาะเมื่อ OQE_DB_LOG=1 (ต้นฉบับพิมพ์ทุก query ตลอดเวลา — โปรดักชัน/test ไม่ต้องการ)
// error ไม่ log จาก Prisma โดยตรง: route จัดการเอง (404 เมื่อไม่พบแถว) หรือ log ผ่าน serverError พร้อม errorId อยู่แล้ว
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.OQE_DB_LOG === '1' ? ['query', 'warn', 'error'] : ['warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
