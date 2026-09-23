/// <reference types="bun-types" />
// bun test — ล็อกช่วงเก็บผลจริง (live freeze): hash · drift · ตรวจบันทึกล็อกกับ EventLog · เหตุการณ์ที่เปลี่ยนกติกา
// + ด่านของ proxy ต่อ POST /api/research/freeze (ผู้ดูแล + same-origin + JSON เท่านั้น — ไม่ลดระดับ)
// (ส่วนที่ต้องใช้ DB จริงอยู่ใน freeze.db.test.ts — subprocess + SQLite ชั่วคราว)
import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { CONFIG_TH_KEY } from "@/lib/config/thai-config"
import { POLICY_KEY } from "@/lib/momentum/signals/io"
import { STOP_POLICY_KEY } from "@/lib/momentum/stops/engine"
import { readSecurityConfig } from "@/lib/security/config"
import { decideAccess } from "@/lib/security/policy"
import { issueSession } from "@/lib/security/session"
import {
  buildFreezeStatus,
  buildTrackFreeze,
  checkFreezeIntegrity,
  compareFreeze,
  FROZEN_KEYS,
  freezeFlagFrom,
  hashValues,
  normalizeText,
  parseFreezeEvent,
  parseLiveFreeze,
  policyKeysOfEvent,
  preregHashOf,
  type FreezeEventInfo,
  type LiveFreeze,
} from "./freeze"

const sha = (s: string) => createHash("sha256").update(s).digest("hex")

const VALUES = {
  config_th: '{"holdDefault":5}',
  signals_policy: '{"promoted":["mom"],"hold":10}',
  stops_policy: '{"arm":"bayesT","adopted":true}',
  meta_model: null,
  prereg_trial: '{"hash":"' + "c".repeat(64) + '","params":{"k":3},"frozenAt":"2026-09-01T00:00:00.000Z"}',
}

function mkFreeze(p: Partial<LiveFreeze> = {}): LiveFreeze {
  return {
    v: 1,
    frozenAt: "2026-09-23T11:00:00.000Z",
    dataDate: "2026-09-22",
    note: "H: Jev ชนะ benchmark t ≥ 2 ที่ 120 วัน",
    hashes: hashValues(VALUES),
    preregHash: "c".repeat(64),
    ...p,
  }
}

const freezeEvent = (id: number, f: LiveFreeze): FreezeEventInfo =>
  parseFreezeEvent({ id, ts: "2026-09-23T11:00:00.001Z", payload: JSON.stringify({ action: "freeze", ...f }) })

describe("hash ของค่าที่ล็อก", () => {
  it("sha256 ของค่าดิบตามไบต์ (ตรวจเองด้วย sha256sum ได้) · ไม่มีแถว = null", () => {
    const h = hashValues(VALUES)
    expect(h.config_th).toBe(sha(VALUES.config_th))
    expect(h.signals_policy).toBe(sha(VALUES.signals_policy))
    expect(h.meta_model).toBeNull()
    expect(Object.keys(h).sort()).toEqual([...FROZEN_KEYS].sort())
    // "exact value": เปลี่ยนแค่ช่องว่างก็ถือว่าเปลี่ยน (ค่าที่ Jev อ่านคือสตริงนี้ทั้งก้อน)
    expect(hashValues({ ...VALUES, config_th: '{"holdDefault": 5}' }).config_th).not.toBe(h.config_th)
  })

  it("key ตรงกับค่าคงที่ของโมดูลที่ Jev อ่านจริง (เปลี่ยนชื่อ key ที่ต้นทางแล้วลืมที่นี่ = test แดง)", () => {
    expect(FROZEN_KEYS).toContain(CONFIG_TH_KEY as (typeof FROZEN_KEYS)[number])
    expect(FROZEN_KEYS).toContain(POLICY_KEY as (typeof FROZEN_KEYS)[number])
    expect(FROZEN_KEYS).toContain(STOP_POLICY_KEY as (typeof FROZEN_KEYS)[number])
  })

  it("prereg hash อ่านจาก PreregInfo.hash · ค่าเสีย/ไม่มี = null", () => {
    expect(preregHashOf(VALUES.prereg_trial)).toBe("c".repeat(64))
    expect(preregHashOf("{bad")).toBeNull()
    expect(preregHashOf(null)).toBeNull()
  })

  it("note/reason: trim + ตัดความยาว · ไม่ใช่ string = ว่าง", () => {
    expect(normalizeText("  สมมติฐาน  ")).toBe("สมมติฐาน")
    expect(normalizeText("x".repeat(5000), 10)).toHaveLength(10)
    expect(normalizeText(42)).toBe("")
  })
})

describe("compareFreeze — drift", () => {
  const frozen = hashValues(VALUES)
  it("ค่าเดิมทุกตัว → ไม่มี drift", () => {
    expect(compareFreeze(frozen, hashValues({ ...VALUES }))).toEqual([])
  })
  it("แก้ค่า / ลบแถว / แถวโผล่ใหม่ = drift ทุกกรณี พร้อม hash ทั้งสองฝั่ง", () => {
    const d = compareFreeze(
      frozen,
      hashValues({ ...VALUES, signals_policy: '{"promoted":[],"hold":60}', stops_policy: null, meta_model: '{"w":[1]}' }),
    )
    expect(d.map((x) => x.key)).toEqual(["signals_policy", "stops_policy", "meta_model"])
    expect(d[0].frozen).toBe(frozen.signals_policy)
    expect(d[0].current).toBe(sha('{"promoted":[],"hold":60}'))
    expect(d[1]).toMatchObject({ key: "stops_policy", current: null })
    expect(d[2]).toMatchObject({ key: "meta_model", frozen: null })
    expect(d[0].label).toContain("signals_policy")
  })
})

describe("parseLiveFreeze", () => {
  it("round trip · JSON เสีย / key ไม่ครบ / hash ไม่ใช่ hex / frozenAt ไม่ใช่วันที่ → null", () => {
    const f = mkFreeze()
    expect(parseLiveFreeze(JSON.stringify(f))).toEqual(f)
    expect(parseLiveFreeze("{oops")).toBeNull()
    const { meta_model: _drop, ...partial } = f.hashes
    void _drop
    expect(parseLiveFreeze(JSON.stringify({ ...f, hashes: partial }))).toBeNull()
    expect(parseLiveFreeze(JSON.stringify({ ...f, hashes: { ...f.hashes, config_th: "nothex" } }))).toBeNull()
    expect(parseLiveFreeze(JSON.stringify({ ...f, frozenAt: "yesterday" }))).toBeNull()
    expect(parseLiveFreeze(null)).toBeNull()
  })
})

describe("freezeFlagFrom — ธงของ route ที่เคยเขียนกติกา", () => {
  it("ไม่มีบันทึกล็อก → ไม่ล็อก", () => {
    expect(freezeFlagFrom(null, VALUES)).toEqual({ frozen: false, frozenAt: null, freezeNote: null, freezeDrift: [] })
  })
  it("ล็อกอยู่ ค่าตรง → frozen + ข้อความ 🔒 ไม่บันทึก policy ใหม่", () => {
    const f = freezeFlagFrom(JSON.stringify(mkFreeze()), VALUES)
    expect(f.frozen).toBe(true)
    expect(f.frozenAt).toBe("2026-09-23T11:00:00.000Z")
    expect(f.freezeNote).toContain("🔒 ล็อกช่วงเก็บผลจริง — ไม่บันทึก policy ใหม่")
    expect(f.freezeDrift).toEqual([])
  })
  it("ล็อกอยู่แต่ค่าถูกแก้ตรงใน DB → freezeDrift + ⚠️ ในข้อความ", () => {
    const f = freezeFlagFrom(JSON.stringify(mkFreeze()), { ...VALUES, config_th: '{"holdDefault":10}' })
    expect(f.freezeDrift).toEqual(["config_th"])
    expect(f.freezeNote).toContain("⚠️")
  })
  it("บันทึกล็อกอ่านไม่ได้ → ถือว่าล็อก (fail closed — กันการปลดล็อกด้วยการทำให้ค่าเสีย)", () => {
    const f = freezeFlagFrom("garbage", VALUES)
    expect(f.frozen).toBe(true)
    expect(f.frozenAt).toBeNull()
  })
})

describe("checkFreezeIntegrity — บันทึกล็อกเทียบ EventLog (hash chain)", () => {
  const f = mkFreeze()
  it("บันทึกตรงกับเหตุการณ์ freeze ล่าสุด → ไม่มีปัญหา", () => {
    expect(checkFreezeIntegrity(f, false, freezeEvent(7, f))).toEqual([])
  })
  it("แก้ hash ในบันทึกล็อกให้ตรงกับ policy ที่แก้ (ย้าย baseline เงียบ ๆ) → ไม่ตรงกับ EventLog", () => {
    const moved = { ...f, hashes: { ...f.hashes, signals_policy: sha("edited") } }
    const issues = checkFreezeIntegrity(moved, false, freezeEvent(7, f))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain("EventLog #7")
  })
  it("บันทึกล็อกไม่มีเหตุการณ์คู่ (สร้างตรงใน DB) / เหตุการณ์ล่าสุดคือ unfreeze → แจ้ง", () => {
    expect(checkFreezeIntegrity(f, false, null)[0]).toContain("ไม่พบเหตุการณ์ freeze")
    const unf = parseFreezeEvent({ id: 9, ts: "2026-09-24T00:00:00.000Z", payload: JSON.stringify({ action: "unfreeze", reason: "x" }) })
    expect(checkFreezeIntegrity(f, false, unf)[0]).toContain("ไม่พบเหตุการณ์ freeze")
  })
  it("EventLog บอกว่าล็อกแต่บันทึกล็อกหาย (ลบตรงใน DB) → แจ้งว่าตอนนี้ไม่ได้ล็อก", () => {
    const issues = checkFreezeIntegrity(null, false, freezeEvent(7, f))
    expect(issues[0]).toContain("ถูกลบตรงใน DB")
  })
  it("ไม่เคยล็อก / ปลดล็อกตามขั้นตอน → ไม่มีปัญหา", () => {
    expect(checkFreezeIntegrity(null, false, null)).toEqual([])
    const unf = parseFreezeEvent({ id: 9, ts: "2026-09-24T00:00:00.000Z", payload: JSON.stringify({ action: "unfreeze", reason: "x" }) })
    expect(checkFreezeIntegrity(null, false, unf)).toEqual([])
  })
})

describe("buildFreezeStatus", () => {
  it("ล็อกอยู่ + ค่าตรง + EventLog ตรง → ข้อความ 🔒 ตรงทุกตัว", () => {
    const f = mkFreeze()
    const s = buildFreezeStatus({ freezeRaw: JSON.stringify(f), values: VALUES, lastEvent: freezeEvent(3, f), dataDate: "2026-09-25" })
    expect(s.frozen).toBe(true)
    expect(s.corrupt).toBe(false)
    expect(s.drift).toEqual([])
    expect(s.integrity).toEqual([])
    expect(s.current.dataDate).toBe("2026-09-25")
    expect(s.current.preregHash).toBe("c".repeat(64))
    expect(s.keys.map((k) => k.key)).toEqual([...FROZEN_KEYS])
    expect(s.message).toContain("ตรงกับตอนล็อกทุกตัว")
  })
  it("drift → ข้อความ ⚠️ ระบุ key", () => {
    const f = mkFreeze()
    const s = buildFreezeStatus({ freezeRaw: JSON.stringify(f), values: { ...VALUES, stops_policy: null }, lastEvent: freezeEvent(3, f), dataDate: null })
    expect(s.drift.map((d) => d.key)).toEqual(["stops_policy"])
    expect(s.message).toContain("⚠️")
    expect(s.message).toContain("stops_policy")
  })
  it("ยังไม่ล็อก / บันทึกเสีย", () => {
    expect(buildFreezeStatus({ freezeRaw: null, values: VALUES, lastEvent: null, dataDate: null })).toMatchObject({ frozen: false, freeze: null, drift: [] })
    const bad = buildFreezeStatus({ freezeRaw: "{", values: VALUES, lastEvent: null, dataDate: null })
    expect(bad).toMatchObject({ frozen: true, corrupt: true, freeze: null })
    expect(bad.integrity[0]).toContain("อ่านไม่ได้")
  })
})

describe("policyKeysOfEvent — เหตุการณ์ใน EventLog ที่เปลี่ยนกติกา", () => {
  it("ตาม payload ที่ route emit จริง", () => {
    expect(policyKeysOfEvent("signals_policy", "{}")).toEqual(["signals_policy"])
    expect(policyKeysOfEvent("stops_policy", "{}")).toEqual(["stops_policy"])
    expect(policyKeysOfEvent("config", '{"patch":{}}')).toEqual(["config_th"])
    expect(policyKeysOfEvent("research", '{"action":"prereg_reset"}')).toEqual(["prereg_trial"])
    expect(policyKeysOfEvent("research", '{"action":"prereg_freeze","hash":"ab"}')).toEqual(["prereg_trial"])
    expect(policyKeysOfEvent("research", '{"action":"meta_model_disabled"}')).toEqual(["meta_model"])
    expect(policyKeysOfEvent("research", '{"kind":"cpcv","deployed":true}')).toEqual(["meta_model"])
    expect(policyKeysOfEvent("research", '{"kind":"cpcv","deployed":false}')).toEqual([])
    expect(policyKeysOfEvent("research", '{"kind":"trial"}')).toEqual([])
    expect(policyKeysOfEvent("seed", "{}")).toEqual(["signals_policy", "stops_policy", "meta_model", "prereg_trial"])
    expect(policyKeysOfEvent("ingest", '{"replacedDemo":true}')).toHaveLength(4)
    expect(policyKeysOfEvent("ingest", '{"replacedDemo":false}')).toEqual([])
    expect(policyKeysOfEvent("jev_run", "{}")).toEqual([])
    expect(policyKeysOfEvent("research", "not json")).toEqual([])
  })
})

describe("buildTrackFreeze — ข้อมูลล็อกของ track record", () => {
  const f = mkFreeze({ frozenAt: "2026-09-10T00:00:00.000Z" })
  const ev = (id: number, kind: string, ts: string, payload: unknown = {}) => ({ id, kind, ts, payload: JSON.stringify(payload) })
  const statusOf = (values = VALUES, record: LiveFreeze | null = f) =>
    buildFreezeStatus({ freezeRaw: record ? JSON.stringify(record) : null, values, lastEvent: record ? freezeEvent(20, record) : null, dataDate: null })

  it("record เริ่มก่อนล็อก: การเปลี่ยนกติกาก่อนล็อกนับเป็นบริบท (ไม่ใช่การละเมิด) · หลังล็อก = ละเมิด", () => {
    const events = [
      ev(1, "signals_policy", "2026-08-01T00:00:00.000Z"), // ก่อน record → ไม่นับ
      ev(5, "config", "2026-09-05T00:00:00.000Z"), // ใน record ก่อนล็อก
      ev(20, "live_freeze", "2026-09-10T00:00:00.001Z", { action: "freeze", ...f }), // ตัวล็อกเอง → ไม่นับ
      ev(30, "stops_policy", "2026-09-15T00:00:00.000Z"), // หลังล็อก!
      ev(31, "research", "2026-09-16T00:00:00.000Z", { kind: "trial" }), // ไม่แตะกติกา
    ]
    const { info, notes } = buildTrackFreeze({ status: statusOf(), events, recordStart: "2026-09-02T11:00:00.000Z", liveSince: "2026-09-01", epochStart: "2026-08-01T00:00:00.000Z" })
    expect(info.changes.map((c) => [c.id, c.afterFreeze])).toEqual([
      [5, false],
      [30, true],
    ])
    expect(info.startedBeforeFreeze).toBe(true)
    expect(info.violated).toBe(true)
    expect(notes.join(" ")).toContain("หลังล็อก")
    expect(notes.join(" ")).toContain("record เริ่ม 2026-09-01 ก่อนล็อกกติกา")
  })

  it("ล็อกก่อนเริ่ม record + ไม่มีอะไรเปลี่ยน → ไม่ละเมิด ไม่มีหมายเหตุ", () => {
    const { info, notes } = buildTrackFreeze({ status: statusOf(), events: [], recordStart: "2026-09-11T11:00:00.000Z", liveSince: "2026-09-11", epochStart: null })
    expect(info).toMatchObject({ frozen: true, frozenAt: f.frozenAt, violated: false, startedBeforeFreeze: false, beforeEpoch: false })
    expect(notes).toEqual([])
  })

  it("drift (แก้ตรงใน DB ไม่มี event) → ละเมิด + หมายเหตุ ⚠️", () => {
    const { info, notes } = buildTrackFreeze({ status: statusOf({ ...VALUES, signals_policy: "{}" }), events: [], recordStart: null, liveSince: null, epochStart: null })
    expect(info.violated).toBe(true)
    expect(info.drift.map((d) => d.key)).toEqual(["signals_policy"])
    expect(notes[0]).toContain("⚠️ กติกาที่ระบบเทรดใช้ไม่ตรงกับที่ล็อกไว้")
  })

  it("seed/ล้าง demo หลังล็อก → beforeEpoch + ละเมิด", () => {
    const { info } = buildTrackFreeze({ status: statusOf(), events: [ev(40, "seed", "2026-09-12T00:00:00.000Z")], recordStart: null, liveSince: null, epochStart: "2026-09-12T00:00:00.000Z" })
    expect(info.beforeEpoch).toBe(true)
    expect(info.changes[0]).toMatchObject({ id: 40, afterFreeze: true })
    expect(info.violated).toBe(true)
  })

  it("ไม่ได้ล็อก: บอกว่ายังไม่ล็อก + จำนวนการเปลี่ยนกติกาในช่วง record · ปลดล็อกในช่วง record แสดงพร้อมเหตุผล", () => {
    const events = [
      ev(2, "live_freeze", "2026-09-03T00:00:00.000Z", { action: "unfreeze", reason: "เปลี่ยน universe" }),
      ev(3, "config", "2026-09-04T00:00:00.000Z"),
    ]
    const { info, notes } = buildTrackFreeze({ status: statusOf(VALUES, null), events, recordStart: "2026-09-01T11:00:00.000Z", liveSince: "2026-09-01", epochStart: null })
    expect(info.frozen).toBe(false)
    expect(info.violated).toBe(false)
    expect(info.changes.map((c) => c.text)).toEqual(["ปลดล็อก — เหตุผล: เปลี่ยน universe", "แก้ config_th"])
    expect(notes.join(" ")).toContain("ยังไม่ได้ล็อกกติกาช่วงเก็บผล")
    expect(notes.join(" ")).toContain("เปลี่ยนแล้ว 1 ครั้ง")
  })
})

describe("POST /api/research/freeze ผ่านด่าน proxy เดิม (ไม่ลดระดับ)", () => {
  const AUTH = readSecurityConfig({
    TMP_AUTH_PASSWORD: "admin-password-long",
    TMP_VIEWER_PASSWORD: "viewer-password-long",
    TMP_AUTH_SECRET: "k".repeat(64),
    TMP_API_TOKEN: "t".repeat(48),
  })
  const NOW = 1_800_000_000_000
  const admin = issueSession("admin", AUTH, NOW / 1000)!.token
  const viewer = issueSession("viewer", AUTH, NOW / 1000)!.token
  const decide = (method: string, headers: Record<string, string>, sessionToken: string | null) =>
    decideAccess({ method, pathname: "/api/research/freeze", headers: new Headers({ host: "tmp.example.com", ...headers }), sessionToken, config: AUTH, now: NOW, limiter: null })
  const JSON_SAME = { origin: "https://tmp.example.com", "sec-fetch-site": "same-origin", "content-type": "application/json", "content-length": "20" }

  it("ผู้ดูแล same-origin JSON → ผ่าน · ผู้ชมอ่านสถานะได้แต่ POST ไม่ได้ (403)", () => {
    expect(decide("POST", JSON_SAME, admin).kind).toBe("allow")
    expect(decide("GET", { "sec-fetch-site": "same-origin" }, viewer).kind).toBe("allow")
    expect(decide("POST", JSON_SAME, viewer)).toMatchObject({ kind: "deny", status: 403, code: "read_only" })
  })
  it("ข้ามไซต์ / ไม่ใช่ JSON / ไม่ได้เข้าสู่ระบบ → ปฏิเสธ", () => {
    expect(decide("POST", { ...JSON_SAME, "sec-fetch-site": "cross-site", origin: "https://evil.example" }, admin)).toMatchObject({ status: 403 })
    expect(decide("POST", { ...JSON_SAME, "content-type": "text/plain" }, admin)).toMatchObject({ status: 415 })
    expect(decide("POST", JSON_SAME, null)).toMatchObject({ status: 401 })
  })
})
