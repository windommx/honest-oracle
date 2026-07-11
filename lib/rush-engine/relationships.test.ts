import { describe, it, expect } from "vitest";
import { characterGraph } from "./relationships";

describe("characterGraph", () => {
  it("builds nodes with mentions and edges from shared chapters (Thai)", () => {
    const text =
      "## บทที่ 1\nเอิ่มกับลีอาห์เดินทาง เอิ่มยิ้มให้ลีอาห์\n" +
      "## บทที่ 2\nเอิ่มกับลีอาห์พักผ่อน\n" +
      "## บทที่ 3\nจอมพลปรากฏตัว";
    const g = characterGraph(text, ["เอิ่ม", "ลีอาห์", "จอมพล"], "th");
    expect(g.chapters).toBe(3);
    const em = g.nodes.find((n) => n.name === "เอิ่ม")!;
    expect(em.mentions).toBe(3); // ch1 ×2, ch2 ×1
    expect(em.chapters).toEqual([1, 2]);
    // เอิ่ม & ลีอาห์ share ch1 and ch2 → weight 2
    const edge = g.edges.find((e) => (e.a === "เอิ่ม" || e.b === "เอิ่ม") && (e.a === "ลีอาห์" || e.b === "ลีอาห์"))!;
    expect(edge.weight).toBe(2);
    // จอมพล shares no chapter with the others → no edge
    expect(g.edges.some((e) => e.a === "จอมพล" || e.b === "จอมพล")).toBe(false);
  });

  it("uses word boundaries for English names", () => {
    const g = characterGraph("## 1\nAna met Mira. Ana left.\n## 2\nMira waited.", ["Ana", "Mira"], "en");
    expect(g.nodes.find((n) => n.name === "Ana")!.mentions).toBe(2);
    expect(g.edges[0].weight).toBe(1); // shared ch1 only
  });

  it("drops names that never appear", () => {
    const g = characterGraph("## 1\nเอิ่มเดินมา", ["เอิ่ม", "ผีเสื้อ"], "th");
    expect(g.nodes.map((n) => n.name)).toEqual(["เอิ่ม"]);
    expect(g.edges).toHaveLength(0);
  });
});
