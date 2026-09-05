import { describe, it, expect } from "vitest";
import { MODULE_META } from "./catalog-meta";
import { MODULE_CATALOG } from "./modules";

describe("catalog metadata is the single source of truth", () => {
  it("every metadata row has a builder, and every builder a row", () => {
    // MODULE_CATALOG is now BUILT from MODULE_META. If the two halves drift — a module
    // added to one side only — the catalog would carry an undefined build fn and fail at
    // generation time instead of here.
    expect(MODULE_CATALOG).toHaveLength(MODULE_META.length);
    for (const m of MODULE_CATALOG) {
      expect(typeof m.build, `${m.id} has no builder`).toBe("function");
    }
    expect(MODULE_CATALOG.map((m) => m.id)).toEqual(MODULE_META.map((m) => m.id));
  });

  it("metadata carries no builder reference — that is the whole point", () => {
    // Importing MODULE_META must not pull in modules.ts. If a `build` key ever appears
    // here, the light pages silently start paying for all 61 prompt builders again.
    for (const m of MODULE_META) {
      expect(m, `${m.id} leaked a builder into the metadata`).not.toHaveProperty("build");
    }
  });

  it("metadata rows are complete and uniquely identified", () => {
    const ids = MODULE_META.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MODULE_META) {
      expect(m.name.length, m.id).toBeGreaterThan(0);
      expect(m.description.length, m.id).toBeGreaterThan(0);
      expect(m.usage.length, m.id).toBeGreaterThan(0);
      expect(m.group.length, m.id).toBeGreaterThan(0);
    }
  });
});
