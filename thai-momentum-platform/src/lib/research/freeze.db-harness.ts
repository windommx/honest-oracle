// ============================================================
// สคริปต์ทดสอบล็อกช่วงเก็บผลจริง (live freeze) กับ SQLite จริง — รันเป็น subprocess โดย freeze.db.test.ts เท่านั้น
// (route เขียน Setting/Decision/EventLog → ต้องมี DB ของตัวเอง ไม่ใช้ DB ร่วมของ bun test process หลัก)
// ใช้: DATABASE_URL=file:/tmp/x.db bun freeze.db-harness.ts → พิมพ์ JSON บรรทัดสุดท้าย
//
// ฉาก: seed ตลาดจำลองเล็ก (160 วัน × 60 หุ้น — IC / stops / evidence มีข้อมูลพอที่จะ "เขียนจริง" เมื่อไม่ล็อก)
//   (0) สร้าง policy/config ด้วย route จริง → (1) ล็อก → (2) ลองเขียนทุกทางขณะล็อก → (3) สถานะ + track record
//   → (4) แก้ค่าตรงใน DB (drift) → (5) ปลดล็อก (ต้องพิมพ์ UNFREEZE) → (6) คุมผล: ปลดล็อกแล้วเขียนได้อีกครั้ง
//   → (7) บันทึกล็อกถูกแก้/เสีย/ลบตรงใน DB → (8) EventLog hash chain ยังครบ
// ============================================================

import { createHash } from "node:crypto"
import { db } from "@/lib/db"
import { internalRequest } from "@/lib/security/request-principal"

const expectedFile = (process.env.DATABASE_URL ?? "").replace(/^file:/, "")

async function guard() {
  // ห้ามเขียน DB ที่ไม่ใช่ไฟล์ชั่วคราวของการทดสอบ (เช่น db/custom.db) เด็ดขาด
  const list = (await db.$queryRawUnsafe(`PRAGMA database_list`)) as { name: string; file: string }[]
  const main = list.find((d) => d.name === "main")?.file ?? ""
  if (!expectedFile || main !== expectedFile) throw new Error(`guard: connected to "${main}", expected "${expectedFile}"`)
}

const KEYS = ["config_th", "signals_policy", "stops_policy", "meta_model", "prereg_trial"] as const
const sha = (s: string | null | undefined) => (typeof s === "string" ? createHash("sha256").update(s).digest("hex") : null)

async function values(): Promise<Record<string, string | null>> {
  const rows = await db.setting.findMany({ where: { key: { in: [...KEYS, "live_freeze"] } } })
  const m = new Map(rows.map((r) => [r.key, r.value]))
  return Object.fromEntries([...KEYS, "live_freeze"].map((k) => [k, m.get(k) ?? null]))
}

async function counts() {
  return {
    settings: await db.setting.count(),
    events: await db.eventLog.count(),
    qSignal: await db.decision.count({ where: { question: "Q_SIGNAL" } }),
    qStop: await db.decision.count({ where: { question: "Q_STOP" } }),
    thaiFitRuns: await db.researchRun.count({ where: { kind: "thai_fit" } }),
    policyEvents: await db.eventLog.count({ where: { kind: { in: ["signals_policy", "stops_policy", "config"] } } }),
  }
}

const send = (method: string, path: string, body: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
const lastFreezeEvent = async () => {
  const e = await db.eventLog.findFirst({ where: { kind: "live_freeze" }, orderBy: { id: "desc" } })
  return e ? (JSON.parse(e.payload) as Record<string, unknown> & { hashes?: Record<string, string | null> }) : null
}

async function main() {
  const out: Record<string, unknown> = {}
  const seed = await import("@/app/api/seed/route")
  const ic = await import("@/app/api/signals/ic/route")
  const stops = await import("@/app/api/stops/route")
  const cfg = await import("@/app/api/config/th/route")
  const evRun = await import("@/app/api/evidence/run/route")
  const fz = await import("@/app/api/research/freeze/route")
  const track = await import("@/app/api/track-record/route")
  const { freezePrereg, DEFAULT_TRIAL_PARAMS } = await import("@/lib/research/prereg")
  const { auditEvents } = await import("@/lib/research/events")
  const { invalidateConfigThCache } = await import("@/lib/config/thai-config")
  const icGet = async (hold: number) => (await ic.GET(internalRequest(`http://localhost/api/signals/ic?hold=${hold}`))).json()
  const stopsGet = async () => (await stops.GET(internalRequest("http://localhost/api/stops"))).json()
  const status = async () => (await fz.GET()).json()
  const trackGet = async () => (await track.GET()).json()

  // (0) ตลาดจำลอง + กติกาชุดแรกผ่าน route จริง (ยังไม่ล็อก = เขียนได้ตามปกติ)
  out.seed = (await seed.POST(send("POST", "/api/seed", { days: 160, symbols: 60 }))).status
  const ic0 = await icGet(10)
  // stops_policy ที่ต่างจากผู้ชนะ walk-forward แน่นอน (arm bayesR แต่ adopted:false) → GET /api/stops ครั้งถัดไป "จะเขียนทับ" ถ้าไม่ล็อก
  const stopsSeed = JSON.stringify({ arm: "bayesR", adopted: false, decidedAt: "2026-01-02T00:00:00.000Z", stats: { sharpeDelta: 0, maxDDDelta: 0, n: 0 } })
  await db.setting.upsert({ where: { key: "stops_policy" }, create: { key: "stops_policy", value: stopsSeed }, update: { value: stopsSeed } })
  const put0 = await cfg.PUT(send("PUT", "/api/config/th", { calendarOverlay: true, note: "ก่อนล็อก" }))
  await freezePrereg(DEFAULT_TRIAL_PARAMS)
  out.baseline = { icSaved: ic0.policySaved, icFrozen: ic0.frozen, putStatus: put0.status }

  // (1) ล็อก
  const before = await values()
  const noNote = await fz.POST(send("POST", "/api/research/freeze", { action: "freeze", note: "   " }))
  const badAction = await fz.POST(send("POST", "/api/research/freeze", { action: "lock" }))
  const fr = await fz.POST(send("POST", "/api/research/freeze", { action: "freeze", note: "  H: พอร์ต Jev ชนะ benchmark t ≥ 2 ที่ 120 วัน  " }))
  const frj = await fr.json()
  const ev = await lastFreezeEvent()
  const again = await fz.POST(send("POST", "/api/research/freeze", { action: "freeze", note: "ล็อกซ้ำ" }))
  out.freeze = {
    noNote: noNote.status,
    badAction: badAction.status,
    status: fr.status,
    frozen: frj.frozen,
    note: frj.freeze?.note,
    dataDate: frj.freeze?.dataDate,
    maxDate: (await db.rawDaily.aggregate({ _max: { date: true } }))._max.date,
    hashesMatch: KEYS.every((k) => frj.freeze?.hashes?.[k] === sha(before[k])),
    metaNull: frj.freeze?.hashes?.meta_model === null,
    preregHash: frj.freeze?.preregHash,
    preregExpected: JSON.parse(before.prereg_trial ?? "{}").hash ?? null,
    eventAction: ev?.action,
    eventHashesMatch: KEYS.every((k) => ev?.hashes?.[k] === sha(before[k])),
    drift: frj.drift,
    integrity: frj.integrity,
    again: { status: again.status, code: (await again.json()).code },
  }

  // (2) ขณะล็อก: GET ยังคำนวณ/ตอบผลได้ แต่ไม่เขียน · PUT config = 409 · evidence/run = อ่านอย่างเดียว
  const c1 = await counts()
  const ic1 = await icGet(60)
  const st1 = await stopsGet()
  const put1 = await cfg.PUT(send("PUT", "/api/config/th", { calendarOverlay: false }))
  const put1j = await put1.json()
  const ev1r = await evRun.POST(send("POST", "/api/evidence/run", { mode: "all" }))
  const ev1 = await ev1r.json()
  // ล้างข้อมูลทั้งชุด / เปลี่ยน prereg / deploy-ถอด meta_model ระหว่างล็อก = 409 แม้ยืนยันแล้ว (ข้อมูลไม่หาย)
  const rawBefore = await db.rawDaily.count()
  const seedFz = await seed.POST(send("POST", "/api/seed", { confirm: "RESET", days: 60, symbols: 20 }))
  const feedIngest = await import("@/app/api/feed/ingest/route")
  const replFz = await feedIngest.POST(
    send("POST", "/api/feed/ingest", { source: "test", replaceDemo: true, confirm: "REPLACE", rows: [{ date: "2099-01-02", symbol: "ZZZ", close: 10, val: 5_000_000 }] })
  )
  const preregRoute = await import("@/app/api/research/prereg/route")
  const preregFz = await preregRoute.POST(send("POST", "/api/research/prereg", { reset: true }))
  const cpcvRoute = await import("@/app/api/research/cpcv/route")
  const cpcvFz = await cpcvRoute.POST(send("POST", "/api/research/cpcv", { disableModel: true }))
  const blocked = {
    seed: { status: seedFz.status, code: (await seedFz.json()).code },
    replaceDemo: { status: replFz.status, code: (await replFz.json()).code },
    preregReset: { status: preregFz.status, code: (await preregFz.json()).code },
    cpcvDisable: { status: cpcvFz.status, code: (await cpcvFz.json()).code },
    rawDailyDelta: (await db.rawDaily.count()) - rawBefore,
  }
  invalidateConfigThCache()
  const after = await values()
  const c2 = await counts()
  out.frozen = {
    ic: { hold: ic1.hold, policySaved: ic1.policySaved, frozen: ic1.frozen, freezeNote: ic1.freezeNote, freezeDrift: ic1.freezeDrift, signals: Object.keys(ic1.ic ?? {}).length },
    stops: { saved: st1.adoption?.saved, frozen: st1.frozen, freezeNote: st1.freezeNote, arms: st1.arms?.length, policyArm: st1.policy?.arm, policyAdopted: st1.policy?.adopted, error: st1.error ?? null },
    put: { status: put1.status, code: put1j.code, error: put1j.error },
    evidence: { status: ev1r.status, applied: ev1.applied, frozen: ev1.frozen, message: ev1.message, hasReport: !!ev1.report, calendarOverlay: ev1.config?.calendarOverlay },
    changedKeys: KEYS.filter((k) => after[k] !== before[k]),
    qSignalDelta: c2.qSignal - c1.qSignal,
    qStopDelta: c2.qStop - c1.qStop,
    policyEventsDelta: c2.policyEvents - c1.policyEvents,
    eventsDelta: c2.events - c1.events,
    thaiFitRunsDelta: c2.thaiFitRuns - c1.thaiFitRuns,
    blocked,
  }

  // (3) สถานะ (อ่านอย่างเดียว) + track record — รอบตัดสินใจแรกเกิด "หลัง" ล็อก (แบบที่โปรโตคอลกำหนด)
  const latest = (await db.rawDaily.aggregate({ _max: { date: true } }))._max.date ?? ""
  await db.decision.create({ data: { date: latest, question: "Q_REGIME", target: "market", action: "neutral", conf: 0.6, source: "lite" } })
  const c3 = await counts()
  const st = await status()
  const c4 = await counts()
  const tr = await trackGet()
  out.statusFrozen = { frozen: st.frozen, drift: st.drift, integrity: st.integrity, message: st.message, readOnly: JSON.stringify(c3) === JSON.stringify(c4) }
  out.trackFrozen = {
    status: tr.status,
    frozen: tr.freeze?.frozen,
    frozenAt: tr.freeze?.frozenAt,
    expectedFrozenAt: frj.freeze?.frozenAt,
    note: tr.freeze?.note,
    dataDate: tr.freeze?.dataDate,
    drift: tr.freeze?.drift,
    violated: tr.freeze?.violated,
    startedBeforeFreeze: tr.freeze?.startedBeforeFreeze,
    changes: tr.freeze?.changes,
    hashesMatch: KEYS.every((k) => tr.freeze?.hashes?.[k] === sha(before[k])),
  }

  // (4) แก้ค่าตรงใน DB (ข้ามด่านล็อก ไม่มี event) → ต้องโผล่ดัง ๆ ทุกจุด
  const edited = JSON.stringify({ ...JSON.parse(before.signals_policy ?? "{}"), weights: { mom: 0.1, mfd: 0.9, sec: 0, vol: 0 } })
  await db.setting.update({ where: { key: "signals_policy" }, data: { value: edited } })
  const st2 = await status()
  const tr2 = await trackGet()
  const ic2 = await icGet(10)
  out.drift = {
    keys: ((st2.drift ?? []) as { key: string }[]).map((d) => d.key),
    frozenHash: st2.drift?.[0]?.frozen,
    currentHash: st2.drift?.[0]?.current,
    expectFrozen: sha(before.signals_policy),
    expectCurrent: sha(edited),
    message: st2.message,
    trackDrift: ((tr2.freeze?.drift ?? []) as { key: string }[]).map((d) => d.key),
    trackViolated: tr2.freeze?.violated,
    trackNotes: tr2.notes ?? [],
    confidenceNotes: tr2.confidence?.notes ?? [],
    icDrift: ic2.freezeDrift,
    icSaved: ic2.policySaved,
    stillEdited: (await values()).signals_policy === edited,
  }

  // (5) ปลดล็อก: ไม่มี confirm / confirm ผิด = 409 · ไม่มีเหตุผล = 400 · ครบ = ปลดล็อก + event พร้อม drift
  const u0 = await fz.POST(send("POST", "/api/research/freeze", { action: "unfreeze", reason: "ลอง" }))
  const u0j = await u0.json()
  const u1 = await fz.POST(send("POST", "/api/research/freeze", { action: "unfreeze", confirm: "unfreeze", reason: "ลอง" }))
  const u2 = await fz.POST(send("POST", "/api/research/freeze", { action: "unfreeze", confirm: "UNFREEZE", reason: "  " }))
  const stillFrozen = (await values()).live_freeze !== null
  const u3 = await fz.POST(send("POST", "/api/research/freeze", { action: "unfreeze", confirm: "UNFREEZE", reason: "ทดสอบ: จบ trial 1" }))
  const u3j = await u3.json()
  const uev = await lastFreezeEvent()
  const u4 = await fz.POST(send("POST", "/api/research/freeze", { action: "unfreeze", confirm: "UNFREEZE", reason: "ซ้ำ" }))
  out.unfreeze = {
    noConfirm: { status: u0.status, code: u0j.code, confirmRequired: u0j.confirmRequired, error: u0j.error },
    wrongCase: u1.status,
    noReason: u2.status,
    stillFrozenAfterRejects: stillFrozen,
    ok: { status: u3.status, frozen: u3j.frozen },
    event: { action: uev?.action, reason: uev?.reason, drift: uev?.drift, frozenAt: uev?.frozenAt },
    again: { status: u4.status, code: (await u4.json()).code },
    recordGone: (await values()).live_freeze === null,
  }

  // (6) คุมผล: ปลดล็อกแล้ว route เดิมเขียนได้อีกครั้ง (พิสูจน์ว่าสิ่งที่กันไว้คือการล็อก ไม่ใช่อย่างอื่น)
  const ic3 = await icGet(60)
  const st3 = await stopsGet()
  const put3 = await cfg.PUT(send("PUT", "/api/config/th", { calendarOverlay: false }))
  const v3 = await values()
  out.control = {
    icSaved: ic3.policySaved,
    icFrozen: ic3.frozen,
    stopsSaved: st3.adoption?.saved,
    putStatus: put3.status,
    signalsChanged: v3.signals_policy !== edited,
    signalsHold: JSON.parse(v3.signals_policy ?? "{}").hold,
    stopsChanged: v3.stops_policy !== before.stops_policy,
    configChanged: v3.config_th !== before.config_th,
  }

  // (7) บันทึกล็อกถูกแก้/เสีย/ลบตรงใน DB
  await fz.POST(send("POST", "/api/research/freeze", { action: "freeze", note: "trial 2" }))
  // ย้าย baseline เงียบ ๆ: แก้ policy แล้วแก้ hash ในบันทึกล็อกให้ตรง → drift หาย แต่ไม่ตรงกับ EventLog
  const moved = JSON.stringify({ promoted: [], weights: { mom: 0, mfd: 0, sec: 0, vol: 0 }, hold: 20 })
  await db.setting.update({ where: { key: "signals_policy" }, data: { value: moved } })
  const rec = JSON.parse((await values()).live_freeze ?? "{}")
  rec.hashes.signals_policy = sha(moved)
  await db.setting.update({ where: { key: "live_freeze" }, data: { value: JSON.stringify(rec) } })
  const i1 = await status()
  // บันทึกล็อกอ่านไม่ได้ → ถือว่ายังล็อก (ไม่ใช่ปลดล็อกเงียบ ๆ)
  await db.setting.update({ where: { key: "live_freeze" }, data: { value: "{broken" } })
  const i2 = await status()
  const putCorrupt = await cfg.PUT(send("PUT", "/api/config/th", { calendarOverlay: true }))
  const icCorrupt = await icGet(10)
  // ลบบันทึกล็อกตรง ๆ → EventLog ยังบอกว่าล็อก
  await db.setting.delete({ where: { key: "live_freeze" } })
  const i3 = await status()
  const tr3 = await trackGet()
  out.integrity = {
    moved: { drift: i1.drift, integrity: i1.integrity },
    corrupt: { frozen: i2.frozen, corrupt: i2.corrupt, integrity: i2.integrity, put: putCorrupt.status, icSaved: icCorrupt.policySaved, icFrozen: icCorrupt.frozen },
    deleted: { frozen: i3.frozen, integrity: i3.integrity, trackIntegrity: tr3.freeze?.integrity, trackViolated: tr3.freeze?.violated },
  }

  // (8) freeze/unfreeze ทุกครั้งอยู่ใน hash chain และ chain ยังครบ
  const audit = await auditEvents(1)
  out.audit = { ok: audit.ok, total: audit.total, freezeEvents: await db.eventLog.count({ where: { kind: "live_freeze" } }) }
  return out
}

await guard()
const result = await main()
console.log(JSON.stringify(result))
await db.$disconnect()
process.exit(0)
