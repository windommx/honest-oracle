/// <reference types="bun-types" />
// bun test — track record กับ SQLite จริง (subprocess + DB ชั่วคราวจาก schema จริง — ไม่แตะ db/custom.db)
import { afterAll, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createSchemaDb } from "@/test/schema-db"

const dir = mkdtempSync(path.join(tmpdir(), "track-db-test-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function run(scenario: string): any {
  const file = path.join(dir, `${scenario}.db`)
  createSchemaDb(file)
  const proc = Bun.spawnSync([process.execPath, path.join(import.meta.dir, "track.db-harness.ts"), scenario], {
    cwd: dir,
    env: { ...process.env, DATABASE_URL: `file:${file}`, NODE_ENV: "test" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = proc.stdout.toString().trim().split("\n").pop() ?? ""
  if (proc.exitCode !== 0) throw new Error(`harness ${scenario} failed: ${proc.stderr.toString().slice(-3000)}`)
  return JSON.parse(out)
}

describe("GET /api/track-record บน DB สังเคราะห์", () => {
  const r = run("track")

  it("ยุคข้อมูล replace-demo จาก yahoo = REAL · live since = รอบแรกในยุค · ไม่นับการตัดสินใจก่อนยุค", () => {
    expect(r.status).toBe("OK")
    expect(r.evidenceLabel).toBe("REAL")
    expect(r.epochKind).toBe("replace-demo")
    expect(r.liveSince).toBe(r.expectedLiveSince)
    expect(r.decisions.priorEpoch).toBe(1)
    expect(r.decisions.runs).toBe(30)
    expect(r.mode).toBe("LIVE")
  })

  it("NAV mark-to-market ตรงกับการคำนวณอิสระ (Position → slots จริง, Trade → ราคาจริง, ไม้ที่มนุษย์ปิด → ประมาณขนาด)", () => {
    expect(r.navLen).toBe(30)
    expect(r.sessions).toBe(29)
    expect(r.navFirst).toBeCloseTo(r.navExpFirst, 6)
    expect(r.navLast).toBeCloseTo(r.navExpLast, 5)
    expect(r.exposureAt66).toBeCloseTo((1 + 0.75 + 0.5) / 7, 4)
    const by = Object.fromEntries(r.legs.map((l: { symbol: string }) => [l.symbol, l]))
    expect(by.S01).toMatchObject({ status: "closed", slots: 1, slotsSource: "estimated" })
    expect(by.S01.recordedRetPct).toBeCloseTo(by.S01.netRetPct, 1)
    expect(by.S02).toMatchObject({ status: "open", slots: 0.75, slotsSource: "position" })
    expect(by.S03).toMatchObject({ status: "closed", slots: 0.5, slotsSource: "estimated" })
    expect(r.closedTrades).toBe(2)
    expect(r.openTrades).toBe(1)
  })

  it("สถานะ/เทรดของ seed ไม่นับ · ยังเร็วเกินไป (29 วัน, 2 เทรด)", () => {
    expect(r.decisions.untrackedPositions).toEqual(["S39"])
    expect(r.decisions.estimatedSlots).toBe(2)
    expect(r.verdict).toBe("TOO_EARLY")
    expect(r.tooEarly).toBe(true)
    expect(r.notes.join(" ")).toContain("S39")
  })

  it("snapshot ลง EventLog ครั้งแรก · ซ้ำ = ไม่บันทึก · audit chain ผ่าน · route ให้ผลเดียวกัน", () => {
    expect(r.snap1).toBe(true)
    expect(r.snap2).toBe(false)
    expect(r.snap2Reason).toContain("ไม่เปลี่ยน")
    expect(r.audit.ok).toBe(true)
    expect(r.routeStatus).toBe(200)
    expect(r.routeHashSame).toBe(true)
    expect(r.trustStatus).toBe(200)
    expect(r.trustLabel).toBe("REAL")
    expect(r.trustUniverse).toBe(40)
  })

  it("หลักฐานกันแก้ย้อนหลัง: แก้ราคาใน DB → NAV mismatch · แก้เหตุผลของ Decision → ledger mismatch", () => {
    expect(r.afterPrice).toMatchObject({ count: 1, navChecked: 1, navMismatches: 1, ledgerMismatches: 0 })
    expect(r.afterEdit.ledgerMismatches).toBe(1)
    expect(r.afterEditNotes.join(" ")).toContain("ledger hash ไม่ตรง")
  })
})
