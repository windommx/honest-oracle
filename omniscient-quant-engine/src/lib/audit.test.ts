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

  test("detail ที่ serialize ไม่ได้ (object วนซ้ำ) → ไม่ throw ไม่บันทึก (คำขอหลักต้องไม่พังเพราะ log)", async () => {
    const req = new Request("http://localhost:3000/api/system", { method: "POST" })
    const circ: Record<string, unknown> = { note: "loop" }
    circ.self = circ
    const before = await db.actionLog.count({ where: { action: "data.seed" } })
    await expect(logAction(req, "data.seed", 200, circ)).resolves.toBeUndefined()
    expect(await db.actionLog.count({ where: { action: "data.seed" } })).toBe(before)
  })

  test("log line: detail อยู่ใน key detail — status ของ HTTP ไม่ถูกค่าใน detail ทับ", async () => {
    const lines: string[] = []
    const orig = console.log
    console.log = (line: string) => lines.push(line)
    try {
      await logAction(new Request("http://localhost:3000/api/journal", { method: "POST" }), "journal.create", 201, { status: "PLANNED" })
    } finally {
      console.log = orig
    }
    const line = lines.find((l) => l.includes("journal.create"))
    expect(line).toBeDefined()
    expect(line).toContain("status=201")
    expect(line).toContain('detail={"status":"PLANNED"}')
  })
})
