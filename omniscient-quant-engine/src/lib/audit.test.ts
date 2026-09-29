import { describe, expect, test } from "bun:test"
import { db } from "@/lib/db"
import { logAction } from "./audit"

describe("audit — ActionLog", () => {
  test("บันทึก actor/action/method/path/status/detail ลง DB · loopback ในโหมด local = actor 'local'", async () => {
    const req = new Request("http://localhost:3000/api/journal?x=1", { method: "POST" })
    await logAction(req, "journal.create", 201, { symbol: "TSE", id: "abc" })
    const row = await db.actionLog.findFirst({ where: { action: "journal.create" }, orderBy: { createdAt: "desc" } })
    expect(row).not.toBeNull()
    expect(row!.actor).toBe("local")
    expect(row!.method).toBe("POST")
    expect(row!.path).toBe("/api/journal")
    expect(row!.status).toBe(201)
    expect(row!.detail).toEqual({ symbol: "TSE", id: "abc" })
  })

  test("เขียน DB ไม่ได้ → ไม่ throw (คำขอหลักต้องไม่พังเพราะ log)", async () => {
    const req = new Request("http://localhost:3000/api/system", { method: "POST" })
    const huge = { big: BigInt(1) } // Prisma serialize bigint ใน Json ไม่ได้ → create ล้ม
    await expect(logAction(req, "data.seed", 200, huge)).resolves.toBeUndefined()
  })
})
