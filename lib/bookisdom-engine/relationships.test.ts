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

describe("cast-aware overlap subtraction (audit elevation)", () => {
  it("Thai: a short name inside a longer CAST name is not over-counted, no phantom node", () => {
    // แอน inside แอนนา and สม inside สมชาย are subtracted; a real standalone แอน still counts;
    // เอิ่ม run together with an ordinary verb (เอิ่มพูด) is KEPT — recall preserved.
    const g = characterGraph("บทที่ 1\n\nแอนนาเดินกับสมชาย แล้วเอิ่มพูดว่าแอนอยู่ไหน", ["แอน", "แอนนา", "สม", "สมชาย", "เอิ่ม"], "th");
    const m = new Map(g.nodes.map((n) => [n.name, n.mentions]));
    expect(m.get("สม")).toBeUndefined();     // only ever inside สมชาย → dropped
    expect(m.get("แอน")).toBe(1);            // the one standalone occurrence
    expect(m.get("แอนนา")).toBe(1);
    expect(m.get("เอิ่ม")).toBe(1);          // run-together but not inside another cast name
  });
  it("English keeps word boundaries: Sam is not found inside 'same'", () => {
    const g = characterGraph("Chapter 1\n\nAnna met Sam. Ann waved. It was the same day.", ["Ann", "Anna", "Sam"], "en");
    const m = new Map(g.nodes.map((n) => [n.name, n.mentions]));
    expect(m.get("Sam")).toBe(1);   // not 2 — "same" excluded
    expect(m.get("Ann")).toBe(1);   // not found inside "Anna"
    expect(m.get("Anna")).toBe(1);
  });
});
