// ============================================================
// bun scripts/restore-db.ts — กู้ฐานข้อมูลจากไฟล์ backup (ทับ DB ตาม DATABASE_URL)
//
//   bun scripts/restore-db.ts --list                    # รายการ backup (ใหม่ → เก่า)
//   bun scripts/restore-db.ts --latest                  # แสดงแผนเท่านั้น (ไม่เขียนอะไร) — exit 2
//   bun scripts/restore-db.ts --latest --yes            # กู้จาก backup ล่าสุดจริง
//   bun scripts/restore-db.ts /path/to/tmp-backup-....db --yes
//
// กันพลาด:
// - ต้องมี --yes เสมอ ไม่งั้นแค่พิมพ์แผน
// - ปฏิเสธถ้ามี process อื่นเปิดไฟล์ DB อยู่ (สแกน /proc/<pid>/fd บน Linux หรือ lsof) หรือ server ตอบ /api/health
//   (TMP_APP_URL หรือ http://127.0.0.1:$PORT) — หยุด server ก่อน · ข้ามด้วย --ignore-running-server (อันตราย)
// - ตรวจไฟล์ต้นทาง (PRAGMA integrity_check + ตาราง RawDaily) ก่อนแตะ DB ปัจจุบัน
// - คัดลอก DB ปัจจุบันเก็บไว้ก่อนเสมอ (<backup dir>/pre-restore-<เวลา>.db — ไม่ถูกลบอัตโนมัติ)
// - เขียนไฟล์ชั่วคราวข้างปลายทาง ตรวจซ้ำ แล้ว rename ทับแบบ atomic + ลบ -journal/-wal/-shm เก่า
// exit code: 0 สำเร็จ · 1 ผิดพลาด · 2 ไม่มี --yes (แสดงแผน) · 3 มี server/process ใช้ DB อยู่
// ============================================================

import { Database } from "bun:sqlite"
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
  readSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs"
import path from "node:path"
import { defaultBackupDir } from "@/lib/ops/backup"
import { createLogger } from "@/lib/ops/log"

const log = createLogger("restore")
const APP_ROOT = path.resolve(import.meta.dir, "..")
const SIDE_FILES = ["-journal", "-wal", "-shm"] as const

/**
 * path ไฟล์ SQLite จาก DATABASE_URL ตามกติกาของ Prisma: path สัมพัทธ์นับจากโฟลเดอร์ของ schema.prisma
 * (file:../db/custom.db → <app>/db/custom.db) · ตัด query string (?connection_limit=…) · ไม่ใช่ file: → null
 */
export function resolveSqliteFile(url: string | undefined, schemaDir: string = path.join(APP_ROOT, "prisma")): string | null {
  const u = (url ?? "").trim().replace(/^["']|["']$/g, "")
  if (!u.startsWith("file:")) return null
  let p = u.slice("file:".length)
  const q = p.indexOf("?")
  if (q >= 0) p = p.slice(0, q)
  if (p.startsWith("//")) p = p.slice(2) // file:///abs/path
  if (!p) return null
  return path.isAbsolute(p) ? path.normalize(p) : path.resolve(schemaDir, p)
}

export interface SqliteInfo {
  ok: boolean
  integrity: string
  rawRows: number | null
  latestDate: string | null
}

/** ตรวจไฟล์ SQLite แบบอ่านอย่างเดียว: header + integrity_check + ตาราง RawDaily */
export function inspectSqlite(file: string): SqliteInfo {
  try {
    const fd = openSync(file, "r")
    const header = Buffer.alloc(16)
    try {
      readSync(fd, header, 0, 16, 0)
    } finally {
      closeSync(fd)
    }
    if (header.toString("latin1") !== "SQLite format 3\u0000") return { ok: false, integrity: "ไม่ใช่ไฟล์ SQLite", rawRows: null, latestDate: null }
  } catch (e) {
    return { ok: false, integrity: `อ่านไฟล์ไม่ได้: ${(e as Error).message}`, rawRows: null, latestDate: null }
  }
  let sqlite: Database | null = null
  try {
    sqlite = new Database(file, { readonly: true })
    const rows = sqlite.query("PRAGMA integrity_check").all() as Record<string, unknown>[]
    const integrity = rows.map((r) => String(r.integrity_check ?? "")).join("; ")
    const raw = sqlite.query("SELECT COUNT(*) AS n, MAX(date) AS d FROM RawDaily").get() as { n: number; d: string | null } | null
    return { ok: integrity === "ok", integrity, rawRows: raw?.n ?? null, latestDate: raw?.d ?? null }
  } catch (e) {
    return { ok: false, integrity: (e as Error).message, rawRows: null, latestDate: null }
  } finally {
    sqlite?.close()
  }
}

export interface BackupEntry {
  file: string
  bytes: number
  mtime: Date
}

/** ไฟล์ .db ในโฟลเดอร์ backup (รวม pre-restore-*) เรียงใหม่ → เก่าตามเวลาแก้ไข */
export function listBackups(dir: string): BackupEntry[] {
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

/**
 * process อื่นที่เปิดไฟล์ DB (หรือ -journal/-wal/-shm) อยู่ — Linux: /proc/<pid>/fd · อื่น ๆ: lsof
 * คืน null = ตรวจไม่ได้บนเครื่องนี้ (ไม่มีทั้ง /proc และ lsof)
 */
export function findOpenHandles(file: string): { pid: number; cmd: string }[] | null {
  const targets = new Set([file, ...SIDE_FILES.map((s) => file + s)])
  try {
    const real = realpathSync(file)
    targets.add(real)
    for (const s of SIDE_FILES) targets.add(real + s)
  } catch {}
  if (existsSync("/proc/self/fd")) {
    const found: { pid: number; cmd: string }[] = []
    for (const ent of readdirSync("/proc")) {
      if (!/^\d+$/.test(ent)) continue
      const pid = Number(ent)
      if (pid === process.pid) continue
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
          found.push({ pid, cmd })
          break
        }
      }
    }
    return found
  }
  try {
    const proc = Bun.spawnSync(["lsof", "-t", "--", ...[...targets].filter((t) => existsSync(t))], { stdout: "pipe", stderr: "pipe" })
    const pids = proc.stdout.toString().split(/\s+/).filter(Boolean).map(Number).filter((p) => p !== process.pid)
    return pids.map((pid) => ({ pid, cmd: "" }))
  } catch {
    return null
  }
}

/** server ที่ตอบ /api/health (ตอบด้วย status ใดก็ได้ = มี server รันอยู่) — คืน URL แรกที่ตอบ */
export async function probeServers(urls: string[], timeoutMs = 1500): Promise<string | null> {
  for (const base of urls) {
    const url = `${base.replace(/\/+$/, "")}/api/health`
    try {
      await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
      return url
    } catch {}
  }
  return null
}

function stamp(d = new Date()): string {
  return d.toISOString().replace(/[-:.]/g, "")
}

function fsyncFile(file: string) {
  const fd = openSync(file, "r+")
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

interface Args {
  source?: string
  latest: boolean
  list: boolean
  yes: boolean
  ignoreServer: boolean
  dir: string
}

function parseArgs(argv: string[]): Args {
  const flags = new Set(argv.filter((a) => a.startsWith("--")))
  const dirIdx = argv.indexOf("--dir")
  const dir = dirIdx >= 0 && argv[dirIdx + 1] ? path.resolve(argv[dirIdx + 1]) : path.resolve(defaultBackupDir())
  const positional = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--dir")
  return {
    source: positional[0] ? path.resolve(positional[0]) : undefined,
    latest: flags.has("--latest"),
    list: flags.has("--list"),
    yes: flags.has("--yes"),
    ignoreServer: flags.has("--ignore-running-server"),
    dir,
  }
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    console.log(
      [
        "ใช้: bun scripts/restore-db.ts --list | --latest | <ไฟล์ backup>  [--yes] [--dir <โฟลเดอร์ backup>] [--ignore-running-server]",
        "  ไม่มี --yes = แสดงแผนอย่างเดียว · หยุด server ก่อนกู้เสมอ (docker compose stop app scheduler)",
      ].join("\n")
    )
    return argv.length === 0 ? 2 : 0
  }
  const args = parseArgs(argv)

  if (args.list) {
    const items = listBackups(args.dir)
    console.log(`โฟลเดอร์ backup: ${args.dir} (${items.length} ไฟล์)`)
    for (const b of items) console.log(`  ${b.mtime.toISOString()}  ${mb(b.bytes).padStart(9)}  ${b.file}`)
    return 0
  }

  const target = resolveSqliteFile(process.env.DATABASE_URL)
  if (!target) {
    log.error("DATABASE_URL is not a SQLite file: URL", { hint: "ตั้ง DATABASE_URL=file:/abs/path/app.db" })
    return 1
  }

  const source = args.source ?? (args.latest ? listBackups(args.dir)[0]?.file : undefined)
  if (!source) {
    log.error("no backup selected", { dir: args.dir, hint: "ระบุไฟล์ หรือ --latest (ดูรายการด้วย --list)" })
    return 1
  }
  if (path.resolve(source) === path.resolve(target)) {
    log.error("source and target are the same file", { file: source })
    return 1
  }

  const info = inspectSqlite(source)
  if (!info.ok) {
    log.error("backup file failed integrity check", { source, integrity: info.integrity })
    return 1
  }
  const current = existsSync(target) ? inspectSqlite(target) : null
  console.log(
    [
      `ต้นทาง : ${source}`,
      `         RawDaily ${info.rawRows?.toLocaleString("en-US")} แถว · ล่าสุด ${info.latestDate ?? "-"} · integrity ${info.integrity}`,
      `ปลายทาง: ${target}`,
      current
        ? `         (ปัจจุบัน) RawDaily ${current.rawRows?.toLocaleString("en-US") ?? "?"} แถว · ล่าสุด ${current.latestDate ?? "-"} · integrity ${current.integrity}`
        : "         (ยังไม่มีไฟล์)",
    ].join("\n")
  )

  // ---- มีใครใช้ DB อยู่ไหม ----
  const handles = findOpenHandles(target)
  const probeUrls = [process.env.TMP_APP_URL, `http://127.0.0.1:${process.env.PORT || 3000}`].filter((u): u is string => !!u)
  const server = args.ignoreServer ? null : await probeServers(probeUrls)
  if (!args.ignoreServer && ((handles && handles.length > 0) || server)) {
    log.error("database is in use — stop the server first", {
      openedBy: handles ?? [],
      respondingServer: server,
      hint: "docker compose stop app scheduler · systemctl stop thai-momentum · แล้วรันคำสั่งนี้ใหม่",
    })
    return 3
  }
  if (handles === null && !args.ignoreServer) {
    console.warn("⚠️  ตรวจ process ที่เปิดไฟล์ไม่ได้บนเครื่องนี้ (ไม่มี /proc และ lsof) — ต้องแน่ใจเองว่าหยุด server แล้ว")
  }

  const safety = current ? path.join(args.dir, `pre-restore-${stamp()}.db`) : null
  if (!args.yes) {
    console.log(
      [
        "",
        "แผน (ยังไม่ได้เขียนอะไร):",
        safety ? `  1) คัดลอก DB ปัจจุบันเก็บไว้ที่ ${safety}` : "  1) (ไม่มี DB ปัจจุบันให้สำรอง)",
        `  2) คัดลอก backup → ${target} แบบ atomic แล้วลบ -journal/-wal/-shm เก่า`,
        "เพิ่ม --yes เพื่อดำเนินการจริง",
      ].join("\n")
    )
    return 2
  }

  // ---- 1) สำรอง DB ปัจจุบัน (คัดลอกตรง ๆ — server หยุดแล้ว ไฟล์จึงนิ่ง) ----
  const t0 = Date.now()
  if (safety) {
    mkdirSync(args.dir, { recursive: true, mode: 0o700 })
    copyFileSync(target, safety)
    for (const s of SIDE_FILES) if (existsSync(target + s)) copyFileSync(target + s, safety + s)
    try {
      chmodSync(safety, 0o600)
    } catch {}
  }

  // ---- 2) เขียนไฟล์ชั่วคราวข้างปลายทาง → ตรวจ → rename ทับ ----
  mkdirSync(path.dirname(target), { recursive: true })
  const tmp = `${target}.restore-${process.pid}.tmp`
  try {
    copyFileSync(source, tmp)
    fsyncFile(tmp)
    const check = inspectSqlite(tmp)
    if (!check.ok) throw new Error(`ไฟล์ที่คัดลอกไม่ผ่านการตรวจ: ${check.integrity}`)
    const mode = existsSync(target) ? statSync(target).mode & 0o777 : 0o600
    chmodSync(tmp, mode)
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

  log.info("restore ok", {
    source,
    target,
    rawRows: info.rawRows,
    latestDate: info.latestDate,
    safetyCopy: safety,
    tookMs: Date.now() - t0,
  })
  console.log("✅ กู้ข้อมูลเสร็จ — เริ่ม server ใหม่ได้ (docker compose start app scheduler) แล้วตรวจ GET /api/health")
  return 0
}

if (import.meta.main) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((e) => {
      log.error("restore crashed", { error: e })
      process.exitCode = 1
    })
}
