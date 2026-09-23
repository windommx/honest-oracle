/// <reference types="bun-types" />
// bun test — cache ในโปรเซสของ Purged Permutation Importance (GET /api/research/importance)
// รันใน subprocess ที่ seed ข้อมูล demo ขนาดเล็กลง DB ชั่วคราวของตัวเอง (importance.harness.ts)
import { afterAll, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createSchemaDb } from "@/test/schema-db"

const dir = mkdtempSync(path.join(tmpdir(), "importance-cache-test-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function runHarness(): any {
  const file = path.join(dir, "importance.db")
  createSchemaDb(file)
  const proc = Bun.spawnSync([process.execPath, path.join(import.meta.dir, "importance.harness.ts")], {
    cwd: dir,
    env: { ...process.env, DATABASE_URL: `file:${file}`, NODE_ENV: "test", TZ: "UTC" },
    stdout: "pipe",
    stderr: "pipe",
  })
  if (proc.exitCode !== 0) throw new Error(`importance harness failed: ${proc.stderr.toString().slice(-2000)}`)
  const line = proc.stdout.toString().split("\n").find((l) => l.startsWith("HARNESS_RESULT "))
  if (!line) throw new Error(`importance harness: ไม่พบบรรทัดผล\n${proc.stdout.toString().slice(-1500)}`)
  return JSON.parse(line.slice("HARNESS_RESULT ".length))
}

describe("purgedPermutationImportanceCached", () => {
  const r = runHarness()

  it("เรียกซ้ำ = ผลเดิมทุกไบต์จาก cache โดยไม่คำนวณใหม่", () => {
    expect(r.first.cache).toBe("miss")
    expect(r.first.rows).toBe(12)
    expect(r.first.paths).toBeGreaterThan(0)
    expect(r.second.cache).toBe("hit")
    expect(r.sameBytes).toBe(true)
    expect(r.statsAfterTwo).toMatchObject({ hits: 1, misses: 1, computations: 1 })
    expect(r.second.ms).toBeLessThan(r.first.ms)
  })

  it("ผลจาก cache เท่ากับการคำนวณตรง (ยกเว้น tookMs) และผู้เรียกแก้ object แล้ว cache ไม่เพี้ยน", () => {
    expect(r.equalsDirect).toBe(true)
    expect(r.mutationSafe).toBe(true)
  })

  it("พารามิเตอร์ต่าง = คำนวณใหม่ · ค่าที่เท่ากันหลังใส่ default/ปัดเศษ = ใช้ cache เดิม", () => {
    expect(r.defaultsNormalized).toBe("hit")
    expect(r.statsAfterParams.computations).toBe(2)
    expect(r.statsAfterParams.size).toBe(2)
  })

  it("request พร้อมกันตอน cache ว่าง = คำนวณครั้งเดียว (single-flight)", () => {
    expect(r.concurrent.stats.computations).toBe(1)
    expect(r.concurrent.caches.filter((c: string) => c === "miss")).toHaveLength(1)
  })

  it("ข้อมูลเปลี่ยน (data_version) → คำนวณใหม่ และทิ้งผลของข้อมูลเก่า", () => {
    expect(r.afterDataChange.cache).toBe("miss")
    expect(r.afterDataChange.stats.computations).toBe(2)
    expect(r.afterDataChange.stats.size).toBe(1)
  })

  it("route: X-Cache MISS → HIT และ body เหมือนกันทุกไบต์", () => {
    expect(r.route.status).toEqual([200, 200])
    expect(r.route.xcache).toEqual(["MISS", "HIT"])
    expect(r.route.sameBody).toBe(true)
  })
})
