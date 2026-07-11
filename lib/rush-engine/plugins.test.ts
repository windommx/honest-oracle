import { describe, it, expect } from "vitest";
import { validatePlugin, pluginPrompts, pluginLexiconTerms } from "./plugins";

const good = {
  manifest: { id: "bl-genre-pack", name: "BL Genre Pack", version: "1.0.0", author: "somchai" },
  promptModules: [
    { id: "bl-tension", name: "BL Tension Beats", group: "craft", body: "Map the slow-burn tension beats for a BL romance..." },
  ],
  lexicons: [
    { lang: "th", sense: "touch", terms: ["ระริก", "สั่นระริก"] },
    { lang: "th", terms: ["ใจเต้นไม่เป็นจังหวะ"] }, // AI-tell (no sense)
  ],
};

describe("validatePlugin", () => {
  it("accepts a well-formed declarative plugin", () => {
    const res = validatePlugin(good);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.plugin.manifest.id).toBe("bl-genre-pack");
      expect(res.plugin.promptModules).toHaveLength(1);
      expect(res.plugin.lexicons).toHaveLength(2);
    }
  });

  it("rejects a bad manifest and bad modules with specific errors", () => {
    const res = validatePlugin({ manifest: { id: "Bad Id!", name: "", version: "x" }, promptModules: [{ id: "ok", name: "n", group: "craft", body: "short" }] });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.includes("id"))).toBe(true);
      expect(res.errors.some((e) => e.includes("version"))).toBe(true);
      expect(res.errors.some((e) => e.includes("body"))).toBe(true);
    }
  });

  it("ignores unknown/code-like fields — data only, nothing runs", () => {
    const res = validatePlugin({ ...good, onload: "() => fetch('evil')", eval: "danger", scripts: ["x"] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(Object.keys(res.plugin)).toEqual(["manifest", "promptModules", "lexicons"]);
  });
});

describe("pluginPrompts / pluginLexiconTerms", () => {
  it("namespaces prompt ids by plugin", () => {
    const res = validatePlugin(good);
    if (!res.ok) throw new Error("fixture invalid");
    const prompts = pluginPrompts([res.plugin]);
    expect(prompts[0].id).toBe("bl-genre-pack:bl-tension");
    expect(prompts[0].pluginId).toBe("bl-genre-pack");
  });

  it("routes lexicon terms to the right sense / AI-tell bucket", () => {
    const res = validatePlugin(good);
    if (!res.ok) throw new Error("fixture invalid");
    const { sensory, aiTells } = pluginLexiconTerms([res.plugin], "th");
    expect(sensory.touch).toContain("ระริก");
    expect(aiTells).toContain("ใจเต้นไม่เป็นจังหวะ");
    expect(pluginLexiconTerms([res.plugin], "en").aiTells).toHaveLength(0); // lang-filtered
  });
});
