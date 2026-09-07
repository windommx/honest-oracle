import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The migration cannot run here (no database), so the test pins what CAN be checked
// statically: every rename pair is present, guarded, and nothing is destructive.
const sql = readFileSync(join(process.cwd(), "prisma", "manual", "2026-09-rebrand-rename.sql"), "utf8");
const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

describe("rebrand rename migration", () => {
  it("renames every model the rebrand touched, to the names the schema now declares", () => {
    for (const [oldName, newName] of [["RushProject", "BookisdomProject"], ["RushProjectVersion", "BookisdomProjectVersion"], ["OracleReading", "LifemapReading"]]) {
      expect(sql).toContain(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`);
      expect(schema).toContain(`model ${newName} {`);
      expect(schema).not.toContain(`model ${oldName} {`);
    }
  });
  it("every rename is guarded (old exists AND new does not) so it is idempotent and safe on a fresh DB", () => {
    const renames = (sql.match(/ALTER TABLE "(\w+)" RENAME TO/g) ?? []).length;
    const guards = (sql.match(/IF to_regclass\('"\w+"'\) IS NOT NULL AND to_regclass\('"\w+"'\) IS NULL THEN/g) ?? []).length;
    expect(renames).toBe(3); expect(guards).toBe(3);
  });
  it("contains no destructive statement", () => {
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE)\b/i);
  });
  it("is wired as an npm script and the schema declares no @@map that would make the rename wrong", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    expect(pkg.scripts["db:rename"]).toContain("scripts/db-rename.ts");
    expect(schema).not.toContain("@@map(");
  });
});
