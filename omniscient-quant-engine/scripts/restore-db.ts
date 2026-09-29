/// <reference types="bun-types" />
// ============================================================
// bun scripts/restore-db.ts — กู้ฐานข้อมูลจากไฟล์ backup (ทับ DB ตาม DATABASE_URL)
//
//   bun scripts/restore-db.ts --list                    # รายการ backup (ใหม่ → เก่า)
//   bun scripts/restore-db.ts --latest                  # แสดงแผนเท่านั้น (ไม่เขียนอะไร) — exit 2
//   bun scripts/restore-db.ts --latest --yes            # กู้จาก backup ล่าสุดจริง
//   bun scripts/restore-db.ts /path/to/oqe-backup-....db --yes
//
// กันพลาด:
// - ต้องมี --yes เสมอ ไม่งั้นแค่พิมพ์แผน
// - ปฏิเสธถ้ามี process อื่นเปิดไฟล์ DB อยู่ (/proc/<pid>/fd บน Linux) หรือ server ตอบ /api/health
//   (OQE_APP_URL หรือ http://127.0.0.1:$PORT) — หยุด server ก่อน · ข้ามด้วย --ignore-running-server (อันตราย)
// - ตรวจไฟล์ต้นทาง (PRAGMA integrity_check + ตาราง Stock/Price) ก่อนแตะ DB ปัจจุบัน
// - คัดลอก DB ปัจจุบันเก็บไว้ก่อนเสมอ (<backup dir>/pre-restore-<เวลา>.db — ไม่ถูกลบอัตโนมัติ)
// - เขียนไฟล์ชั่วคราวข้างปลายทาง ตรวจซ้ำ แล้ว rename ทับแบบ atomic + ลบ -journal/-wal/-shm เก่า
// exit code: 0 สำเร็จ · 1 ผิดพลาด · 2 ไม่มี --yes (แสดงแผน) · 3 มี server/process ใช้ DB อยู่
// ============================================================

process.env.OQE_LOG_FORMAT ??= "json"

import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs"
import path from "node:path"
import { log } from "@/lib/log"
import { defaultBackupDir } from "@/lib/ops/backup"
import { inspectSqlite, resolveSqliteFile } from "./sqlite-file"

const SIDE_FILES = ["-journal", "-wal", "-shm"] as const

/** ไฟล์ .db ในโฟลเดอร์ backup (รวม pre-restore-*) เรียงใหม่ → เก่าตามเวลาแก้ไข */
export function listRestorable(dir: string): Array<{ file: string; bytes: number; mtime: Date }> {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith(".db"))
    .map((f) => {
      const file = path.join(dir, f)
      const st = statSync(file)
      return { file, bytes: st.size, mtime: st.mtime }
    })
    .filter((e) => e.bytes > 0)
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime() || b.file.localeCompare(a.file))
}

/** process อื่นที่เปิดไฟล์ DB อยู่ (Linux: /proc/<pid>/fd) — null = ตรวจไม่ได้บนเครื่องนี้ */
export function findOpenHandles(file: string): Array<{ pid: number; cmd: string }> | null {
  if (!existsSync("/proc/self/fd")) return null
  const targets = new Set<string>([file, ...SIDE_FILES.map((s) => file + s)])
  try {
    const real = realpathSync(file)
    targets.add(real)
    for (const s of SIDE_FILES) targets.add(real + s)
  } catch {}
  const found: Array<{ pid: number; cmd: string }> = []
  for (const ent of readdirSync("/proc")) {
    if (!/^\d+$/.test(ent) || Number(ent) === process.pid) continue
    let fds: string[]
    try {
      fds = readdirSync(`/proc/${ent}/fd`)
    } catch {
      continue // process ของ user อื่น / จบไปแล้ว
    }
    for (const fd of fds) {
      let link: string
      try {
        link = readlinkSync(`/proc/${ent}/fd/${fd}`)
      } catch {
        continue
      }
      if (targets.has(link.replace(/ \(deleted\)$/, ""))) {
        let cmd = ""
        try {
          cmd = readFileSync(`/proc/${ent}/cmdline`, "utf8").replace(/\u0000/g, " ").trim().slice(0, 160)
        } catch {}
        found.push({ pid: Number(ent), cmd })
        break
      }
    }
  }
  return found
}

/** server ที่ตอบ /api/health (ตอบด้วย status ใดก็ได้ = มี server รันอยู่) */
async function probeServers(urls: string[], timeoutMs = 1500): Promise<string | null> {
  for (const base of urls) {
    const url = `${base.replace(/\/+$/, "")}/api/health`
    try {
      await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
      return url
    } catch {}
  }
  return null
}

const stamp = (d = new Date()) => d.toISOString().replace(/[-:.]/g, "")
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`

function fsyncFile(file: string) {
  const fd = openSync(file, "r+")
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

async function main(argv: string[]): Promise<number> {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    console.log(
      [
        "ใช้: bun scripts/restore-db.ts --list | --latest | <ไฟล์ backup>  [--yes] [--dir <โฟลเดอร์ backup>] [--ignore-running-server]",
        "  ไม่มี --yes = แสดงแผนอย่างเดียว · หยุด server ก่อนกู้เสมอ",
      ].join("\n"),
    )
    return argv.length === 0 ? 2 : 0
  }
  const flags = new Set(argv.filter((a) => a.startsWith("--")))
  const dirIdx = argv.indexOf("--dir")
  const dir = dirIdx >= 0 && argv[dirIdx + 1] ? path.resolve(argv[dirIdx + 1]) : path.resolve(defaultBackupDir())
  const positional = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--dir")

  if (flags.has("--list")) {
    const items = listRestorable(dir)
    console.log(`โฟลเดอร์ backup: ${dir} (${items.length} ไฟล์)`)
    for (const b of items) console.log(`  ${b.mtime.toISOString()}  ${mb(b.bytes).padStart(9)}  ${b.file}`)
    return 0
  }

  const target = resolveSqliteFile(process.env.DATABASE_URL)
  if (!target) {
    log.error("restore refused", { reason: "DATABASE_URL ไม่ใช่ SQLite (file:...)" })
    return 1
  }
  const source = positional[0] ? path.resolve(positional[0]) : flags.has("--latest") ? listRestorable(dir)[0]?.file : undefined
  if (!source) {
    log.error("restore refused", { reason: "ไม่ได้เลือกไฟล์ backup — ระบุไฟล์ หรือ --latest (ดูรายการด้วย --list)", dir })
    return 1
  }
  if (path.resolve(source) === path.resolve(target)) {
    log.error("restore refused", { reason: "ต้นทางกับปลายทางเป็นไฟล์เดียวกัน", file: source })
    return 1
  }
  const info = inspectSqlite(source)
  if (!info.ok) {
    log.error("restore refused", { reason: "ไฟล์ backup ไม่ผ่าน integrity_check", source, integrity: info.integrity })
    return 1
  }
  const current = existsSync(target) ? inspectSqlite(target) : null
  console.log(
    [
      `ต้นทาง : ${source}`,
      `         หุ้น ${info.stocks ?? "?"} ตัว · ราคา ${info.prices?.toLocaleString("en-US") ?? "?"} แถว · ล่าสุด ${info.lastDate ?? "-"}`,
      `ปลายทาง: ${target}`,
      current
        ? `         (ปัจจุบัน) หุ้น ${current.stocks ?? "?"} ตัว · ราคา ${current.prices?.toLocaleString("en-US") ?? "?"} แถว · ล่าสุด ${current.lastDate ?? "-"}`
        : "         (ยังไม่มีไฟล์)",
    ].join("\n"),
  )

  const ignoreServer = flags.has("--ignore-running-server")
  const handles = findOpenHandles(target)
  const probeUrls = [process.env.OQE_APP_URL, `http://127.0.0.1:${process.env.PORT || 3000}`].filter((u): u is string => !!u)
  const server = ignoreServer ? null : await probeServers(probeUrls)
  if (!ignoreServer && ((handles && handles.length > 0) || server)) {
    log.error("restore refused", { reason: "มี server/process ใช้ DB อยู่ — หยุด server ก่อน", openedBy: handles ?? [], respondingServer: server })
    return 3
  }

  const safety = current ? path.join(dir, `pre-restore-${stamp()}.db`) : null
  if (!flags.has("--yes")) {
    console.log(
      [
        "",
        "แผน (ยังไม่ได้เขียนอะไร):",
        safety ? `  1) คัดลอก DB ปัจจุบันเก็บไว้ที่ ${safety}` : "  1) (ไม่มี DB ปัจจุบันให้สำรอง)",
        `  2) คัดลอก backup → ${target} แบบ atomic แล้วลบ -journal/-wal/-shm เก่า`,
        "เพิ่ม --yes เพื่อดำเนินการจริง",
      ].join("\n"),
    )
    return 2
  }

  const t0 = Date.now()
  if (safety) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    copyFileSync(target, safety)
    for (const s of SIDE_FILES) if (existsSync(target + s)) copyFileSync(target + s, safety + s)
    try {
      chmodSync(safety, 0o600)
    } catch {}
  }
  mkdirSync(path.dirname(target), { recursive: true })
  const tmp = `${target}.restore-${process.pid}.tmp`
  try {
    copyFileSync(source, tmp)
    fsyncFile(tmp)
    const check = inspectSqlite(tmp)
    if (!check.ok) throw new Error(`ไฟล์ที่คัดลอกไม่ผ่านการตรวจ: ${check.integrity}`)
    chmodSync(tmp, existsSync(target) ? statSync(target).mode & 0o777 : 0o600)
    // -wal/-shm/-journal ของไฟล์เดิมต้องไม่ถูก SQLite นำไปใช้กับไฟล์ใหม่ (ทำให้ DB พัง)
    for (const s of SIDE_FILES) if (existsSync(target + s)) unlinkSync(target + s)
    renameSync(tmp, target)
  } catch (e) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp)
    } catch {}
    log.error("restore failed — current database left unchanged", { error: e, safetyCopy: safety })
    return 1
  }
  const after = inspectSqlite(target)
  log.info("restore ok", { source, target, safetyCopy: safety, stocks: after.stocks, prices: after.prices, lastDate: after.lastDate, tookMs: Date.now() - t0 })
  return 0
}

if (import.meta.main) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code
    })
    .catch((e) => {
      log.error("restore crashed", { error: e })
      process.exitCode = 1
    })
}
