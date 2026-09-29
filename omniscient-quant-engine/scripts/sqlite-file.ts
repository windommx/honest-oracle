/// <reference types="bun-types" />
// ============================================================
// เครื่องมือไฟล์ SQLite ของสคริปต์ ops (backup/restore) — ใช้ bun:sqlite อ่านอย่างเดียว ไม่ผ่าน Prisma
// ============================================================

import { Database } from "bun:sqlite"
import { closeSync, openSync, readSync } from "node:fs"
import path from "node:path"

const APP_ROOT = path.resolve(import.meta.dir, "..")

/**
 * path ไฟล์ SQLite จาก DATABASE_URL ตามกติกาของ Prisma: path สัมพัทธ์นับจากโฟลเดอร์ของ schema.prisma
 * (file:../db/custom.db → <app>/db/custom.db) · ตัด query string · ไม่ใช่ file: → null
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
  stocks: number | null
  prices: number | null
  lastDate: string | null
}

/** ตรวจไฟล์ SQLite ของ OQE แบบอ่านอย่างเดียว: header + integrity_check + ตาราง Stock/Price */
export function inspectSqlite(file: string, mode: "quick" | "full" = "full"): SqliteInfo {
  const fail = (integrity: string): SqliteInfo => ({ ok: false, integrity, stocks: null, prices: null, lastDate: null })
  try {
    const fd = openSync(file, "r")
    const header = Buffer.alloc(16)
    try {
      readSync(fd, header, 0, 16, 0)
    } finally {
      closeSync(fd)
    }
    if (header.toString("latin1") !== "SQLite format 3\u0000") return fail("ไม่ใช่ไฟล์ SQLite")
  } catch (e) {
    return fail(`อ่านไฟล์ไม่ได้: ${(e as Error).message}`)
  }
  let sqlite: Database | null = null
  try {
    sqlite = new Database(file, { readonly: true })
    const pragma = mode === "quick" ? "quick_check" : "integrity_check"
    const rows = sqlite.query(`PRAGMA ${pragma}`).all() as Record<string, unknown>[]
    const integrity = rows.map((r) => String(r[pragma] ?? "")).join("; ")
    const stocks = (sqlite.query("SELECT COUNT(*) AS n FROM Stock").get() as { n: number } | null)?.n ?? null
    const p = sqlite.query("SELECT COUNT(*) AS n, MAX(date) AS d FROM Price").get() as { n: number; d: number | string | null } | null
    const lastDate = p?.d == null ? null : new Date(typeof p.d === "number" ? p.d : Date.parse(String(p.d))).toISOString().slice(0, 10)
    return { ok: integrity === "ok", integrity, stocks, prices: p?.n ?? null, lastDate }
  } catch (e) {
    return fail((e as Error).message)
  } finally {
    sqlite?.close()
  }
}
