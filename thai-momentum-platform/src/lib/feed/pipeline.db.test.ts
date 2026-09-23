/// <reference types="bun-types" />
// bun test — สายพานรายวันกับ SQLite จริง (subprocess + DB ชั่วคราว) · fetch stub · jev/run + verify จริง in-process
import { afterAll, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createSchemaDb } from "@/test/schema-db"

const dir = mkdtempSync(path.join(tmpdir(), "pipeline-db-test-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function run(): any {
  const file = path.join(dir, "pipeline.db")
  createSchemaDb(file)
  const proc = Bun.spawnSync([process.execPath, path.join(import.meta.dir, "pipeline.db-harness.ts"), dir], {
    cwd: dir,
    env: { ...process.env, DATABASE_URL: `file:${file}`, NODE_ENV: "test", SET_HOLIDAYS_FILE: "" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = proc.stdout.toString().trim().split("\n").pop() ?? ""
  if (proc.exitCode !== 0) throw new Error(`pipeline harness failed: ${proc.stderr.toString().slice(-3000)}`)
  return JSON.parse(out)
}

describe("runDailyPipeline บน DB สังเคราะห์", () => {
  const r = run()

  it("วันใหม่: ingest เฉพาะแถวใหม่ → รันสมอง → verify → track snapshot → backup → run log + EventLog", () => {
    expect(r.r1.exit).toBe(0)
    expect(r.r1.status).toBe("ok")
    expect(r.r1.steps).toMatchObject({ calendar: "ok", provenance: "ok", fetch: "ok", reconcile: "ok", ingest: "ok", brain: "ok", verify: "ok", track: "ok", backup: "ok" })
    expect(r.c1.raw - r.c0.raw).toBe(40)
    expect(r.c1.decisions).toBeGreaterThan(r.c0.decisions)
    expect(r.c1.snapshots).toBe(1)
    expect(r.c1.dailyRuns).toBe(1)
    expect(r.r1.eventEmitted).toBe(true)
    expect(r.log1Status).toBe("ok")
    expect(r.log1Pct).toBe(100)
    expect(r.brainR1.date).toBe("2026-09-23")
    expect(r.trackR1.status).toBe("OK")
  })

  it("รันซ้ำวันเดียวกัน = NOOP ไม่เขียน DB เลย (ไม่ ingest · Jev idempotent · snapshot เดิม · ไม่มี event · ไม่ backup)", () => {
    expect(r.r2.exit).toBe(0)
    expect(r.r2.status).toBe("noop")
    expect(r.r2.steps).toMatchObject({ ingest: "noop", brain: "noop", track: "noop", backup: "skipped" })
    expect(r.c2).toEqual(r.c1)
    expect(r.r2.eventEmitted).toBe(false)
    expect(r.prevAttempts).toBe(1)
    expect(r.backups).toBe(2) // r1 + r7 เท่านั้น
  })

  it("ก่อนเวลาข้อมูลปิดตลาด + รอบล่าสุดทำแล้ว = SKIPPED (exit 0) ไม่ดึง ไม่เขียน", () => {
    expect(r.r3.exit).toBe(0)
    expect(r.r3.status).toBe("skipped")
    expect(r.r3.reason).toContain("ยังไม่ถึงเวลาข้อมูลปิดตลาด")
    expect(r.c3).toEqual(r.c2)
  })

  it("feed ไม่อัปเดต → STALE exit 5 ไม่รันสมอง · corporate action ในรอบ → exit 4 ปฏิเสธก่อน ingest", () => {
    expect(r.r4.exit).toBe(5)
    expect(r.r4.steps.brain).toBe("skipped")
    expect(r.r4.critical[0]).toContain("latest date ไม่ขยับ")
    expect(r.r5.exit).toBe(4)
    expect(r.r5.steps.ingest).toBe("critical")
    expect(r.r5.critical[0]).toContain("S01")
    expect(r.c5.raw).toBe(r.c3.raw) // ไม่มีแถวเพี้ยนเข้าฐาน
    expect(r.c5.decisions).toBe(r.c3.decisions)
  })

  it("dry-run: ดึง/ตรวจครบแต่ไม่เขียน DB ไม่เขียน run log ไม่ emit", () => {
    expect(r.r6.exit).toBe(0)
    expect(r.r6.steps).toMatchObject({ ingest: "skipped", brain: "skipped", verify: "skipped", backup: "skipped" })
    expect(r.r6.logFile).toBeNull()
    expect(r.c6).toEqual(r.c5)
  })

  it("inbox สองแหล่ง: reconcile ข้ามแหล่ง (> 0.5% ติดธง) · Settrade ชนะวันเดียวกัน · ingest แยกป้ายต่อแหล่ง · archive/rejected", () => {
    expect(r.r7.exit).toBe(0)
    expect(r.r7.status).toBe("ok")
    const pair = r.recon7.find((x: { pairs: string }) => x.pairs.includes("settrade") && x.pairs.includes("set"))
    expect(pair.flagged).toBe(1)
    expect(pair.conflicts).toEqual(["S21"])
    expect(r.warnings7.join(" ")).toContain("broken.json")
    expect(r.archived).toEqual(["set-20260924.csv", "set-20260924.sectors.json", "settrade-20260924.json"])
    expect(r.rejected).toEqual(["broken.json"])
    expect(r.inboxLeft).toEqual([])
    expect(r.ingestSources).toEqual(["set", "settrade"])
    expect(r.sectorS20).toBe("Energy")
    expect(r.c7.raw - r.c6.raw).toBe(40)
  })
})
