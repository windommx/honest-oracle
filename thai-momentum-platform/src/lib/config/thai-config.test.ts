/// <reference types="bun-types" />
// bun test — config-as-data (config_th): วันที่ตามเวลาตลาด + save/merge/cache/history + PUT route
// (ส่วน DB รันใน child process กับ SQLite ชั่วคราว — ไม่แตะ db/custom.db และไม่ชน Prisma client ของ test อื่น)
import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { createSchemaDb } from "@/test/schema-db"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join, resolve } from "path"

import { bangkokDate, HISTORY_MAX } from "./thai-config"

describe("bangkokDate", () => {
  it("ใช้วันที่ของกรุงเทพไม่ว่า server อยู่ TZ ไหน (เดิม toISOString = วันที่ UTC)", () => {
    // 2026-09-22 20:00 UTC = 2026-09-23 03:00 ที่กรุงเทพ
    expect(bangkokDate(new Date(Date.UTC(2026, 8, 22, 20, 0)))).toBe("2026-09-23")
    // 2026-09-22 16:59 UTC = 23:59 วันเดียวกันที่กรุงเทพ
    expect(bangkokDate(new Date(Date.UTC(2026, 8, 22, 16, 59)))).toBe("2026-09-22")
    // ข้ามปี
    expect(bangkokDate(new Date(Date.UTC(2025, 11, 31, 17, 0)))).toBe("2026-01-01")
  })
})

const ROOT = resolve(import.meta.dir, "../../..")

function withTempDb<T>(seed: (d: Database) => void, code: string): T {
  const dir = mkdtempSync(join(tmpdir(), "thai-config-test-"))
  try {
    const file = join(dir, "t.db")
    createSchemaDb(file) // schema จริงจาก prisma/schema.prisma (src/test/schema-db.ts)
    const d = new Database(file)
    seed(d)
    d.close()
    const p = Bun.spawnSync([process.execPath, "-e", code], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: `file:${file}` },
      stdout: "pipe",
      stderr: "pipe",
    })
    const out = p.stdout.toString()
    const line = out.split("\n").find((l) => l.startsWith("RESULT "))
    if (!line) throw new Error(`child failed (${p.exitCode}): ${p.stderr.toString()}\n${out}`)
    return JSON.parse(line.slice(7)) as T
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe("PUT /api/config/th", () => {
  it("tfWeights บางคีย์: ค่าที่ตอบกลับ/cache = ค่าที่อ่านกลับจาก DB (เดิม cache {5:0.5} แต่ DB อ่านได้ครบ 7 คีย์)", () => {
    const r = withTempDb<{ status: number; put: Record<string, number>; cached: Record<string, number>; reread: Record<string, number> }>(
      () => {},
      `import { PUT } from "@/app/api/config/th/route"; import { getConfigTh, invalidateConfigThCache } from "@/lib/config/thai-config";
       const res = await PUT(new Request("http://localhost/api/config/th", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ tfWeights: { "5": 0.5 } }) }));
       const j = await res.json(); const cached = (await getConfigTh()).tfWeights;
       invalidateConfigThCache(); const reread = (await getConfigTh()).tfWeights;
       console.log("RESULT " + JSON.stringify({ status: res.status, put: j.config.tfWeights, cached, reread }));`,
    )
    expect(r.status).toBe(200)
    expect(r.put).toEqual({ "5": 0.5, "10": 0.3, "20": 0.2, "40": 0.1, "80": 0.05, "160": 0, "300": 0 })
    expect(r.cached).toEqual(r.reread)
    expect(r.put).toEqual(r.reread)
  }, 30000)

  it("body = null / array → 400 (เดิม null → 500 'null is not an object')", () => {
    const r = withTempDb<{ nul: number; arr: number; bad: number }>(
      () => {},
      `import { PUT } from "@/app/api/config/th/route";
       const put = (body) => PUT(new Request("http://localhost/api/config/th", { method: "PUT", headers: { "content-type": "application/json" }, body }));
       console.log("RESULT " + JSON.stringify({ nul: (await put("null")).status, arr: (await put("[]")).status, bad: (await put("{")).status }));`,
    )
    expect(r.nul).toBe(400)
    expect(r.arr).toBe(400)
    expect(r.bad).toBe(400)
  }, 30000)

  it("note ยาวถูกตัด และ history ถูกจำกัด HISTORY_MAX รายการล่าสุด", () => {
    const seeded = { history: Array.from({ length: 250 }, (_, i) => ({ ts: 1_700_000_000 + i, note: `n${i}` })) }
    const r = withTempDb<{ status: number; len: number; last: string; first: number }>(
      (d) => d.prepare(`INSERT INTO "Setting" (key, value) VALUES ('config_th', ?)`).run(JSON.stringify(seeded)),
      `import { PUT } from "@/app/api/config/th/route";
       const res = await PUT(new Request("http://localhost/api/config/th", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ calendarOverlay: true, note: "x".repeat(5000) }) }));
       const j = await res.json(); const h = j.config.history;
       console.log("RESULT " + JSON.stringify({ status: res.status, len: h.length, last: h[h.length - 1].note, first: h[0].ts }));`,
    )
    expect(r.status).toBe(200)
    expect(r.len).toBe(HISTORY_MAX)
    expect(r.last.length).toBe(500)
    expect(r.first).toBe(1_700_000_000 + 250 - (HISTORY_MAX - 1)) // เก็บรายการล่าสุด
  }, 30000)
})
