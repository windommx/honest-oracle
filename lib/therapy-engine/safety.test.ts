import { describe, it, expect } from "vitest";
import { CRISIS_RESOURCES, assessSafety, selfHelpIsSufficient } from "./safety";
import { score } from "./scoring";

const gad7 = (...r: number[]) => score("gad7", r);
const phq9 = (...r: number[]) => score("phq9", r);

describe("safety — item 9 is checked before any total", () => {
  it("raises crisis on a minimal total when item 9 is endorsed", () => {
    // The exact case an app that routes on the sum gets wrong: total 1 of 27,
    // band "minimal", and the person has reported thoughts of self-harm.
    const s = phq9(0, 0, 0, 0, 0, 0, 0, 0, 1);
    expect(s.total).toBe(1);
    expect(s.band.id).toBe("minimal");

    const result = assessSafety([s]);
    expect(result.level).toBe("crisis");
    expect(result.resources.length).toBeGreaterThan(0);
  });

  it("raises crisis at the faintest endorsement, not only at 'nearly every day'", () => {
    for (const v of [1, 2, 3]) {
      expect(assessSafety([phq9(0, 0, 0, 0, 0, 0, 0, 0, v)]).level).toBe("crisis");
    }
  });

  it("crisis outranks urgent when both rules fire", () => {
    const s = phq9(3, 3, 3, 3, 3, 3, 3, 3, 3); // 27: severe AND item 9 endorsed
    const result = assessSafety([s]);
    expect(result.level).toBe("crisis");
    expect(result.reasonsTh.length).toBeGreaterThan(1); // both rules recorded
  });
});

describe("safety — score-band rules", () => {
  it("urgent at the top PHQ-9 band without item 9", () => {
    const s = phq9(3, 3, 3, 3, 3, 3, 2, 0, 0); // 20, item 9 = 0
    expect(s.total).toBe(20);
    expect(assessSafety([s]).level).toBe("urgent");
  });

  it("urgent at the top GAD-7 band", () => {
    expect(assessSafety([gad7(3, 3, 3, 3, 3, 0, 0)]).level).toBe("urgent");
  });

  it("advised at the screening cut-point", () => {
    expect(assessSafety([gad7(2, 2, 2, 2, 2, 0, 0)]).level).toBe("advised");
  });

  it("none below the cut-point, with no resources rendered", () => {
    const result = assessSafety([gad7(1, 1, 0, 0, 0, 0, 0), phq9(1, 0, 0, 0, 0, 0, 0, 0, 0)]);
    expect(result.level).toBe("none");
    expect(result.resources).toEqual([]);
  });

  it("takes the highest level across several instruments", () => {
    const calm = gad7(0, 0, 0, 0, 0, 0, 0);
    const severe = phq9(3, 3, 3, 3, 3, 3, 2, 0, 0);
    expect(assessSafety([calm, severe]).level).toBe("urgent");
  });

  it("names the rule that fired, so routing is auditable", () => {
    const r = assessSafety([phq9(0, 0, 0, 0, 0, 0, 0, 0, 2)]);
    expect(r.reasonsTh.join(" ")).toContain("ข้อ 9");
  });
});

describe("safety — what the engine refuses to claim", () => {
  it("never says the user is safe, even at a score of zero", () => {
    const r = assessSafety([phq9(0, 0, 0, 0, 0, 0, 0, 0, 0)]);
    expect(r.note).toContain("ไม่ได้แปลว่าปลอดภัย");
    expect(r.note).toContain("ไม่สามารถทำนายความเสี่ยงได้");
  });

  it("self-help is never offered as sufficient during a crisis", () => {
    expect(selfHelpIsSufficient("crisis")).toBe(false);
    expect(selfHelpIsSufficient("urgent")).toBe(false);
    expect(selfHelpIsSufficient("advised")).toBe(true);
    expect(selfHelpIsSufficient("none")).toBe(true);
  });

  it("an empty score set is 'none', not a crash", () => {
    expect(assessSafety([]).level).toBe("none");
  });
});

describe("crisis resources", () => {
  it("every line has a dialable number and stated hours", () => {
    expect(CRISIS_RESOURCES.length).toBeGreaterThanOrEqual(3);
    for (const r of CRISIS_RESOURCES) {
      expect(r.phone, r.th).toMatch(/^[0-9-]+$/);
      expect(r.hoursTh.length, r.th).toBeGreaterThan(0);
    }
  });

  it("includes the 24-hour national mental-health line", () => {
    const line = CRISIS_RESOURCES.find((r) => r.phone === "1323");
    expect(line).toBeDefined();
    expect(line!.hoursTh).toContain("24");
  });
});
