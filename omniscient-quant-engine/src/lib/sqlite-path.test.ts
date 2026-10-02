import { describe, expect, test } from "bun:test"
import { resolveSqliteFile, runtimeDatabaseUrl, standaloneProjectRoot } from "./sqlite-path"

describe("sqlite-path — SQLite path สัมพัทธ์ใช้ได้ทุกโหมด (dev · สคริปต์ · standalone)", () => {
  test("กติกาของ Prisma: สัมพัทธ์นับจาก prisma/ · absolute · file:/// · query · quote · ไม่ใช่ SQLite", () => {
    expect(resolveSqliteFile("file:../db/custom.db", "/app/prisma")).toBe("/app/db/custom.db")
    expect(resolveSqliteFile("file:./dev.db", "/app/prisma")).toBe("/app/prisma/dev.db")
    expect(resolveSqliteFile("file:/data/app.db?connection_limit=1", "/app/prisma")).toBe("/data/app.db")
    expect(resolveSqliteFile("file:///data/app.db", "/app/prisma")).toBe("/data/app.db")
    expect(resolveSqliteFile('"file:/data/app.db"', "/app/prisma")).toBe("/data/app.db")
    expect(resolveSqliteFile("postgresql://u:p@h/db", "/app/prisma")).toBeNull()
    expect(resolveSqliteFile(undefined, "/app/prisma")).toBeNull()
  })

  test("รู้จัก cwd ของ standalone build (server.js chdir ไป <ราก>/.next/standalone)", () => {
    expect(standaloneProjectRoot("/srv/oqe/.next/standalone")).toBe("/srv/oqe")
    expect(standaloneProjectRoot("/srv/oqe/.next/standalone/sub")).toBe("/srv/oqe")
    expect(standaloneProjectRoot("/srv/oqe")).toBeNull()
    expect(standaloneProjectRoot("/srv/oqe/.next/standalone-old")).toBeNull()
  })

  test("standalone: path สัมพัทธ์ → absolute เทียบ <ราก>/prisma (คง query) · โหมดอื่น/absolute/DB อื่น = ค่าเดิม", () => {
    const sa = "/srv/oqe/.next/standalone"
    expect(runtimeDatabaseUrl("file:../db/custom.db", sa)).toBe("file:/srv/oqe/db/custom.db")
    expect(runtimeDatabaseUrl('"file:../db/custom.db?connection_limit=1"', sa)).toBe("file:/srv/oqe/db/custom.db?connection_limit=1")
    expect(runtimeDatabaseUrl("file:/data/app.db", sa)).toBe("file:/data/app.db")
    expect(runtimeDatabaseUrl("postgresql://u:p@h/db", sa)).toBe("postgresql://u:p@h/db")
    expect(runtimeDatabaseUrl(undefined, sa)).toBeUndefined()
    // dev / สคริปต์ / test: Prisma หา prisma/ เองถูกอยู่แล้ว — ไม่แตะ
    expect(runtimeDatabaseUrl("file:../db/custom.db", "/srv/oqe")).toBe("file:../db/custom.db")
  })
})
