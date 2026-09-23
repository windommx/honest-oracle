/// <reference types="bun-types" />
// bun test — ล็อกช่วงเก็บผลจริง (live freeze) กับ route จริงบน SQLite ชั่วคราว (schema จริงจาก prisma/schema.prisma)
// รันใน subprocess ที่มี DATABASE_URL ของตัวเอง (route เขียน Setting/Decision/EventLog — ห้ามใช้ DB ร่วมของ process หลัก)
import { afterAll, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createSchemaDb } from "@/test/schema-db"

const dir = mkdtempSync(path.join(tmpdir(), "freeze-db-test-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function run(): any {
  const file = path.join(dir, "freeze.db")
  createSchemaDb(file)
  const env: Record<string, string | undefined> = { ...process.env, DATABASE_URL: `file:${file}`, TZ: "Asia/Bangkok", NODE_ENV: "test" }
  // โหมด local (ผู้ดูแล) เสมอ — GET ที่ "เคยเขียน" ต้องมีสิทธิ์เขียนจริงจึงพิสูจน์ได้ว่าสิ่งที่กันไว้คือการล็อก
  delete env.TMP_AUTH_PASSWORD
  delete env.TMP_API_TOKEN
  const proc = Bun.spawnSync([process.execPath, path.join(import.meta.dir, "freeze.db-harness.ts")], { cwd: dir, env, stdout: "pipe", stderr: "pipe" })
  const out = proc.stdout.toString().trim().split("\n").pop() ?? ""
  if (proc.exitCode !== 0) throw new Error(`freeze harness failed: ${proc.stderr.toString().slice(-3000)}`)
  return JSON.parse(out)
}

describe("ล็อกช่วงเก็บผลจริง (POST/GET /api/research/freeze + route ที่เคยเขียนกติกา)", () => {
  const r = run()

  it("ก่อนล็อก: route เขียนกติกาได้ตามปกติ (ฐานของการเปรียบเทียบ)", () => {
    expect(r.seed).toBe(200)
    expect(r.baseline).toEqual({ icSaved: true, icFrozen: false, putStatus: 200 })
  })

  it("ล็อก: เก็บ sha256 ของค่าดิบทุกตัว + วันที่ข้อมูลล่าสุด + prereg hash + บันทึก EventLog พร้อม hash", () => {
    const f = r.freeze
    expect(f.status).toBe(200)
    expect(f.frozen).toBe(true)
    expect(f.hashesMatch).toBe(true) // config_th / signals_policy / stops_policy / prereg_trial = sha256(Setting.value)
    expect(f.metaNull).toBe(true) // ไม่มีแถว = null (ไม่ใช่ hash ของสตริงว่าง)
    expect(f.dataDate).toBe(f.maxDate)
    expect(f.preregHash).toBe(f.preregExpected)
    expect(f.note).toBe("H: พอร์ต Jev ชนะ benchmark t ≥ 2 ที่ 120 วัน") // trim แล้ว
    expect(f.eventAction).toBe("freeze")
    expect(f.eventHashesMatch).toBe(true)
    expect(f.drift).toEqual([])
    expect(f.integrity).toEqual([])
    expect(f.again).toEqual({ status: 409, code: "already_frozen" })
    expect(f.noNote).toBe(400) // ต้องเขียนสมมติฐานก่อนล็อก
    expect(f.badAction).toBe(400)
  })

  it("ขณะล็อก: GET /api/signals/ic?hold=60 และ GET /api/stops ยังคำนวณ/ตอบผล แต่ไม่เปลี่ยน Setting · ไม่มี Decision/event ใหม่", () => {
    const z = r.frozen
    expect(z.ic).toMatchObject({ hold: 60, policySaved: false, frozen: true, freezeDrift: [], signals: 4 })
    expect(z.ic.freezeNote).toContain("🔒 ล็อกช่วงเก็บผลจริง — ไม่บันทึก policy ใหม่")
    expect(z.stops).toMatchObject({ saved: false, frozen: true, arms: 3, error: null })
    // หน้างานแสดง policy ที่ล็อกไว้ (ที่ Jev อ่านจริง) ไม่ใช่ผู้ชนะที่ยังไม่ได้บันทึก
    expect(z.stops).toMatchObject({ policyArm: "bayesR", policyAdopted: false })
    expect(z.changedKeys).toEqual([]) // เดิม: signals_policy (hold 60) + stops_policy ถูกเขียนทับ
    // ล้างข้อมูลทั้งชุด / reset prereg / ถอด meta_model ระหว่างล็อก → 409 live_frozen แม้ส่ง confirm มาแล้ว
    expect(z.blocked).toEqual({
      seed: { status: 409, code: "live_frozen" },
      replaceDemo: { status: 409, code: "live_frozen" },
      preregReset: { status: 409, code: "live_frozen" },
      cpcvDisable: { status: 409, code: "live_frozen" },
      rawDailyDelta: 0,
    })
    expect(z.qSignalDelta).toBe(0)
    expect(z.qStopDelta).toBe(0)
    expect(z.policyEventsDelta).toBe(0)
  })

  it("ขณะล็อก: PUT /api/config/th → 409 ภาษาไทย · POST /api/evidence/run (all) อ่านอย่างเดียว ไม่แตะ config_th", () => {
    const z = r.frozen
    expect(z.put.status).toBe(409)
    expect(z.put.code).toBe("live_frozen")
    expect(z.put.error).toContain("แก้ config_th")
    expect(z.put.error).toContain("UNFREEZE")
    expect(z.evidence).toMatchObject({ status: 200, applied: false, frozen: true, hasReport: true, calendarOverlay: true })
    expect(z.evidence.message).toContain("ไม่ auto-apply config_th")
    expect(z.thaiFitRunsDelta).toBe(1) // ผลรันวิจัยยังบันทึก (นับเป็น trial) — เปลี่ยนแค่ไม่ apply
    expect(z.eventsDelta).toBe(0)
  })

  it("GET /api/research/freeze อ่านอย่างเดียว · track record รายงาน frozenAt/บันทึก/hash (รอบตัดสินใจแรกหลังล็อก = ไม่ละเมิด)", () => {
    expect(r.statusFrozen).toMatchObject({ frozen: true, drift: [], integrity: [], readOnly: true })
    expect(r.statusFrozen.message).toContain("ตรงกับตอนล็อกทุกตัว")
    const t = r.trackFrozen
    expect(t.status).toBe("OK")
    expect(t.frozen).toBe(true)
    expect(t.frozenAt).toBe(t.expectedFrozenAt)
    expect(t.note).toContain("H: พอร์ต Jev")
    expect(t.dataDate).toBe(r.freeze.maxDate)
    expect(t.hashesMatch).toBe(true)
    expect(t).toMatchObject({ drift: [], violated: false, startedBeforeFreeze: false, changes: [] })
  })

  it("แก้ Setting ตรงใน DB ขณะล็อก → drift โผล่ทุกจุด (สถานะ · track record · signals/ic) และ GET ไม่เขียนทับกลับ", () => {
    const d = r.drift
    expect(d.keys).toEqual(["signals_policy"])
    expect(d.frozenHash).toBe(d.expectFrozen)
    expect(d.currentHash).toBe(d.expectCurrent)
    expect(d.message).toContain("⚠️")
    expect(d.trackDrift).toEqual(["signals_policy"])
    expect(d.trackViolated).toBe(true)
    expect(d.trackNotes.join(" ")).toContain("⚠️ กติกาที่ระบบเทรดใช้ไม่ตรงกับที่ล็อกไว้")
    expect(d.confidenceNotes.join(" ")).toContain("ไม่ใช่หลักฐานของกติกาที่ลงทะเบียนไว้")
    expect(d.icDrift).toEqual(["signals_policy"])
    expect(d.icSaved).toBe(false)
    expect(d.stillEdited).toBe(true)
  })

  it('ปลดล็อกต้องส่ง confirm:"UNFREEZE" ตรงตัว + เหตุผล · ปลดแล้วบันทึก EventLog พร้อม drift ที่พบ', () => {
    const u = r.unfreeze
    expect(u.noConfirm).toMatchObject({ status: 409, code: "confirm_required", confirmRequired: "UNFREEZE" })
    expect(u.noConfirm.error).toContain("trial ใหม่")
    expect(u.wrongCase).toBe(409)
    expect(u.noReason).toBe(400)
    expect(u.stillFrozenAfterRejects).toBe(true)
    expect(u.ok).toEqual({ status: 200, frozen: false })
    expect(u.event).toMatchObject({ action: "unfreeze", reason: "ทดสอบ: จบ trial 1", drift: ["signals_policy"], frozenAt: r.trackFrozen.frozenAt })
    expect(u.again).toEqual({ status: 409, code: "not_frozen" })
    expect(u.recordGone).toBe(true)
  })

  it("คุมผล: ปลดล็อกแล้ว route เดิมเขียนได้อีกครั้ง (สิ่งที่กันไว้คือการล็อก)", () => {
    expect(r.control).toEqual({
      icSaved: true,
      icFrozen: false,
      stopsSaved: true,
      putStatus: 200,
      signalsChanged: true,
      signalsHold: 60,
      stopsChanged: true,
      configChanged: true,
    })
  })

  it("บันทึกล็อกถูกแก้ให้ตรง policy ใหม่ / อ่านไม่ได้ / ถูกลบตรงใน DB → ตรวจเจอเทียบ EventLog · อ่านไม่ได้ = ยังล็อก", () => {
    const i = r.integrity
    expect(i.moved.drift).toEqual([]) // ย้าย baseline แล้ว hash ตรง…
    expect(i.moved.integrity[0]).toContain("ไม่ตรงกับ EventLog") // …แต่ไม่ตรงกับเหตุการณ์ freeze ที่แก้ไม่ได้
    expect(i.corrupt).toMatchObject({ frozen: true, corrupt: true, put: 409, icSaved: false, icFrozen: true })
    expect(i.deleted.frozen).toBe(false)
    expect(i.deleted.integrity[0]).toContain("ถูกลบตรงใน DB")
    expect(i.deleted.trackIntegrity[0]).toContain("ถูกลบตรงใน DB")
    expect(i.deleted.trackViolated).toBe(true)
  })

  it("freeze/unfreeze ทุกครั้งอยู่ใน EventLog hash chain และ chain ยังครบ", () => {
    expect(r.audit.ok).toBe(true)
    expect(r.audit.freezeEvents).toBe(3)
  })
})
