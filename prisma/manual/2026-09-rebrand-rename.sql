-- ─────────────────────────────────────────────────────────────────────────────
-- Rebrand table renames (2026-09): Rush Engine → Bookisdom, Honest Oracle → โครงสร้างชีวิต (lifemap).
--
-- Prisma names tables after models and this schema uses no @@map, so renaming a model
-- renames its table. `prisma db push` would otherwise DROP the old table and CREATE the
-- new one — losing every row. Run THIS first on any database that already has data, then
-- `prisma db push`. PostgreSQL.
--
-- Every statement is conditional and idempotent: it renames only if the OLD name exists
-- and the NEW one does not, so re-running is safe and a fresh database is untouched.
-- Nothing here drops or alters data. Index/constraint renames are cosmetic (db push would
-- otherwise recreate them under the new names — also non-destructive, just noisier).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('"RushProject"') IS NOT NULL AND to_regclass('"BookisdomProject"') IS NULL THEN
    ALTER TABLE "RushProject" RENAME TO "BookisdomProject";
    ALTER TABLE "BookisdomProject" RENAME CONSTRAINT "RushProject_pkey" TO "BookisdomProject_pkey";
    ALTER TABLE "BookisdomProject" RENAME CONSTRAINT "RushProject_userId_fkey" TO "BookisdomProject_userId_fkey";
    ALTER INDEX IF EXISTS "RushProject_shareToken_key" RENAME TO "BookisdomProject_shareToken_key";
  END IF;

  IF to_regclass('"RushProjectVersion"') IS NOT NULL AND to_regclass('"BookisdomProjectVersion"') IS NULL THEN
    ALTER TABLE "RushProjectVersion" RENAME TO "BookisdomProjectVersion";
    ALTER TABLE "BookisdomProjectVersion" RENAME CONSTRAINT "RushProjectVersion_pkey" TO "BookisdomProjectVersion_pkey";
    ALTER TABLE "BookisdomProjectVersion" RENAME CONSTRAINT "RushProjectVersion_projectId_fkey" TO "BookisdomProjectVersion_projectId_fkey";
  END IF;

  IF to_regclass('"OracleReading"') IS NOT NULL AND to_regclass('"LifemapReading"') IS NULL THEN
    ALTER TABLE "OracleReading" RENAME TO "LifemapReading";
    ALTER TABLE "LifemapReading" RENAME CONSTRAINT "OracleReading_pkey" TO "LifemapReading_pkey";
    ALTER TABLE "LifemapReading" RENAME CONSTRAINT "OracleReading_userId_fkey" TO "LifemapReading_userId_fkey";
    ALTER INDEX IF EXISTS "OracleReading_shareToken_key" RENAME TO "LifemapReading_shareToken_key";
  END IF;
END $$;
