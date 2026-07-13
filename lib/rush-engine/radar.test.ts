import { describe, it, expect } from "vitest";
import { continuityRadar, sceneReadout } from "./radar";
import { analyzeThai } from "./thai-analyzer";
import { sensoryDensity } from "./sensory";

describe("continuityRadar", () => {
  it("flags a canon name that never appears (Thai)", () => {
    const text = "## บทที่ 1\nเดนโอเดินทางกับริน";
    const f = continuityRadar(text, ["เดนโอ", "ริน", "อัลฟริด"], "th");
    expect(f.some((x) => x.kind === "unused-canon" && x.term === "อัลฟริด")).toBe(true);
    expect(f.some((x) => x.term === "เดนโอ")).toBe(false); // present → not flagged
  });

  it("flags a repeated off-canon name — the AI slipped a rename in", () => {
    // "กรรณ" is used but not in canon (the character should be เดนโอ).
    const text = "## บทที่ 1\nกรรณเดินมา กรรณยิ้ม กรรณพูด\n## บทที่ 2\nกรรณกลับบ้าน";
    const f = continuityRadar(text, ["เดนโอ", "ริน"], "th");
    expect(f.some((x) => x.kind === "off-canon" && x.term === "กรรณ")).toBe(true);
  });

  it("English: repeated proper nouns outside canon are flagged, structural words are not", () => {
    const text = "## 1\nMira met Zephyr. Zephyr smiled. Zephyr left. The end.";
    const f = continuityRadar(text, ["Mira"], "en");
    expect(f.some((x) => x.kind === "off-canon" && x.term === "Zephyr")).toBe(true);
    expect(f.some((x) => x.term === "The")).toBe(false);
  });
});

describe("sceneReadout", () => {
  it("returns real measured signals — not invented 0-100 scores", () => {
    const scene = "แสงจ้าเป็นประกาย เสียงดังก้อง \"เธอมาทำไม\" เขาถาม เธอเงียบ รู้สึกกลัวจับใจ";
    const sens = sensoryDensity(scene, "th");
    const r = sceneReadout(scene, analyzeThai, sens.per1k);
    expect(r.words).toBeGreaterThan(0);
    expect(typeof r.rhythmCv).toBe("number");
    expect(typeof r.dialogueRatio).toBe("number");
    // no field named momentum/clarity/tension exists — by design
    expect(Object.keys(r)).not.toContain("momentum");
  });
});
