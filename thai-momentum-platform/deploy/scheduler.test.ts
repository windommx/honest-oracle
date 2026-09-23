/// <reference types="bun-types" />
// bun test ./deploy — ตัวตั้งเวลางาน (deploy/scheduler.ts): เวลารอบถัดไปตามเวลาไทย + การอ่าน env + --once/--plan
import { describe, expect, it } from "bun:test"
import path from "node:path"
import { formatBangkok, loadJobs, nextRunAt, parseCodes, parseDays, parseTime, splitCommand } from "./scheduler"

const WEEKDAYS = parseDays("1-5")
const EVERY_DAY = parseDays("0-6")
const at = (iso: string) => new Date(iso)

describe("nextRunAt — 18:30 เวลาไทย จ.–ศ.", () => {
  const daily = { hour: 18, minute: 30, days: WEEKDAYS }

  it("วันพุธก่อน 18:30 (ไทย) → เย็นวันเดียวกัน = 11:30Z", () => {
    expect(nextRunAt(at("2026-09-23T05:00:00Z"), daily).toISOString()).toBe("2026-09-23T11:30:00.000Z")
  })

  it("เลย 18:30 แล้ว → วันทำการถัดไป · ตรง 18:30 พอดีถือว่าเลยแล้ว (ไม่รันซ้ำ)", () => {
    expect(nextRunAt(at("2026-09-23T12:00:00Z"), daily).toISOString()).toBe("2026-09-24T11:30:00.000Z")
    expect(nextRunAt(at("2026-09-23T11:30:00Z"), daily).toISOString()).toBe("2026-09-24T11:30:00.000Z")
  })

  it("ศุกร์หลัง 18:30 → จันทร์ (ข้ามเสาร์–อาทิตย์)", () => {
    expect(nextRunAt(at("2026-09-25T12:00:00Z"), daily).toISOString()).toBe("2026-09-28T11:30:00.000Z")
  })

  it("ใช้ปฏิทินไทย ไม่ใช่ UTC: 23:30Z วันอาทิตย์ = 06:30 วันจันทร์ที่ไทย → เย็นวันจันทร์", () => {
    expect(nextRunAt(at("2026-09-27T23:30:00Z"), daily).toISOString()).toBe("2026-09-28T11:30:00.000Z")
  })

  it("backup 02:30 ทุกวัน: 20:00Z (03:00 ไทย) → 02:30 ไทยของคืนถัดไป", () => {
    expect(nextRunAt(at("2026-09-22T20:00:00Z"), { hour: 2, minute: 30, days: EVERY_DAY }).toISOString()).toBe(
      "2026-09-23T19:30:00.000Z"
    )
  })

  it("ไม่ขึ้นกับ TZ ของเครื่อง (คำนวณด้วย UTC+7 คงที่)", () => {
    const iso = nextRunAt(at("2026-03-29T00:30:00Z"), daily).toISOString() // วันเปลี่ยน DST ของยุโรป
    expect(iso).toBe("2026-03-30T11:30:00.000Z")
  })

  it("formatBangkok แสดงเวลาไทย + วัน", () => {
    expect(formatBangkok(at("2026-09-23T11:30:00Z"))).toBe("2026-09-23 18:30 (Wed)")
  })
})

describe("การตั้งค่า", () => {
  it("parseTime / parseDays / splitCommand", () => {
    expect(parseTime("08:05")).toEqual({ hour: 8, minute: 5 })
    expect(() => parseTime("24:00")).toThrow()
    expect(() => parseTime("6pm")).toThrow()
    expect([...parseDays("1,3,5")]).toEqual([1, 3, 5])
    expect([...parseDays("0-6")]).toHaveLength(7)
    expect(() => parseDays("5-1")).toThrow()
    expect(() => parseDays("7")).toThrow()
    expect(splitCommand("  bun  scripts/daily.ts --x ")).toEqual(["bun", "scripts/daily.ts", "--x"])
  })

  it("ค่าเริ่มต้น: daily 18:30 จ.–ศ. · backup 02:30 ทุกวัน", () => {
    const [daily, backup] = loadJobs({})
    expect(daily).toMatchObject({ name: "daily", hour: 18, minute: 30, cmd: ["bun", "scripts/daily.ts"], retries: 2 })
    expect([...daily.days]).toEqual([1, 2, 3, 4, 5])
    expect(daily.warmPaths).toContain("/api/research/importance")
    expect(backup).toMatchObject({ name: "backup", hour: 2, minute: 30, cmd: ["bun", "scripts/backup-db.ts", "--reason", "nightly"] })
    expect(backup.days.size).toBe(7)
    expect(backup.warmPaths).toEqual([])
  })

  it("daily ลองใหม่เฉพาะ exit code ชั่วคราว (1/3/5/124) · backup ลองใหม่ทุก code", () => {
    const [daily, backup] = loadJobs({})
    expect([...daily.retryOn].sort((a, b) => a - b)).toEqual([1, 3, 5, 124])
    expect(daily.retryOn.has(4)).toBe(false) // คุณภาพข้อมูลวิกฤต — ต้องมีคนดู ไม่ใช่ลองซ้ำ
    expect(backup.retryOn.size).toBe(0)
    expect([...loadJobs({ TMP_DAILY_RETRY_CODES: "3, x, 999" })[0].retryOn]).toEqual([3])
    expect([...parseCodes("5,1")]).toEqual([5, 1])
  })

  it("env ทับค่าเริ่มต้นได้ · ค่าเสียใช้ค่าเริ่มต้น", () => {
    const [daily, backup] = loadJobs({
      TMP_DAILY_AT: "19:05",
      TMP_DAILY_DAYS: "1-4",
      TMP_DAILY_CMD: "bun scripts/daily.ts --dry-run",
      TMP_BACKUP_AT: "03:15",
      TMP_JOB_RETRIES: "abc",
      TMP_WARM_PATHS: "/api/overview, nope ,/api/signals",
    })
    expect(daily).toMatchObject({ hour: 19, minute: 5, cmd: ["bun", "scripts/daily.ts", "--dry-run"], retries: 2 })
    expect([...daily.days]).toEqual([1, 2, 3, 4])
    expect(daily.warmPaths).toEqual(["/api/overview", "/api/signals"])
    expect(backup).toMatchObject({ hour: 3, minute: 15 })
    expect(() => loadJobs({ TMP_DAILY_AT: "25:00" })).toThrow()
  })

  it("dead-man's switch: รับเฉพาะ http(s) URL · ไม่ตั้ง = null", () => {
    const [daily, backup] = loadJobs({ TMP_PING_DAILY_URL: "https://hc-ping.com/abc/", TMP_PING_BACKUP_URL: "not a url" })
    expect(daily.pingUrl).toBe("https://hc-ping.com/abc")
    expect(backup.pingUrl).toBeNull()
    expect(loadJobs({})[0].pingUrl).toBeNull()
  })
})

describe("CLI", () => {
  const script = path.join(import.meta.dir, "scheduler.ts")
  const run = (args: string[], env: Record<string, string> = {}) =>
    Bun.spawnSync([process.execPath, script, ...args], { env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" })

  it("--plan พิมพ์รอบถัดไปของทุกงาน", () => {
    const p = run(["--plan"])
    expect(p.exitCode).toBe(0)
    const out = p.stdout.toString()
    expect(out).toContain("daily")
    expect(out).toContain("backup")
  })

  it("--once รันงานทันที: exit code ตามคำสั่ง + log JSON", () => {
    const ok = run(["--once", "daily"], { TMP_DAILY_CMD: "true", TMP_APP_URL: "" })
    expect(ok.exitCode).toBe(0)
    expect(ok.stdout.toString()).toContain('"msg":"job done"')
    const bad = run(["--once", "backup"], { TMP_BACKUP_CMD: "false" })
    expect(bad.exitCode).toBe(1)
    expect(bad.stderr.toString()).toContain('"msg":"job failed"')
    expect(run(["--once", "nope"]).exitCode).toBe(2)
  })

  it("--once ส่ง ping: สำเร็จ = GET <url> · ล้มเหลว = GET <url>/fail", async () => {
    const hits: string[] = []
    const srv = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req) => (hits.push(new URL(req.url).pathname), new Response("ok")) })
    try {
      const base = `http://127.0.0.1:${srv.port}/ping/daily`
      const env = { ...process.env, TMP_DAILY_CMD: "true", TMP_APP_URL: "", TMP_PING_DAILY_URL: base }
      const ok = Bun.spawn([process.execPath, script, "--once", "daily"], { env, stdout: "pipe", stderr: "pipe" })
      expect(await ok.exited).toBe(0)
      const bad = Bun.spawn([process.execPath, script, "--once", "daily"], { env: { ...env, TMP_DAILY_CMD: "false" }, stdout: "pipe", stderr: "pipe" })
      expect(await bad.exited).toBe(1)
      expect(hits).toEqual(["/ping/daily", "/ping/daily/fail"])
    } finally {
      srv.stop(true)
    }
  })
})
