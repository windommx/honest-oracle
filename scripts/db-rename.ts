// Runs prisma/manual/2026-09-rebrand-rename.sql against DATABASE_URL and reports what it
// found — BEFORE `prisma db push` on a database that predates the rebrand.
//   npm run db:rename
// Exits non-zero if DATABASE_URL is unset or the statement fails; prints which tables
// exist before and after so the operator can see the rename happened (or was not needed).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const TABLES = ["RushProject", "BookisdomProject", "RushProjectVersion", "BookisdomProjectVersion", "OracleReading", "LifemapReading"];

async function presence(db: PrismaClient): Promise<Record<string, boolean>> {
  const rows = await db.$queryRawUnsafe<{ name: string; present: boolean }[]>(
    `SELECT t AS name, to_regclass('"' || t || '"') IS NOT NULL AS present FROM unnest($1::text[]) AS t`, TABLES
  );
  return Object.fromEntries(rows.map((r) => [r.name, r.present]));
}

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set — nothing to migrate."); process.exit(2); }
  const db = new PrismaClient();
  try {
    const before = await presence(db);
    console.log("before:", before);
    const sql = readFileSync(join(__dirname, "..", "prisma", "manual", "2026-09-rebrand-rename.sql"), "utf8");
    await db.$executeRawUnsafe(sql);
    const after = await presence(db);
    console.log("after: ", after);
    const renamed = TABLES.filter((t) => before[t] !== after[t]);
    console.log(renamed.length ? `renamed: ${renamed.join(", ")}` : "no rename needed (already on new names, or fresh database)");
    console.log("next: npx prisma db push");
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
