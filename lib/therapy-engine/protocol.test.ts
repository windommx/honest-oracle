import { describe, it, expect } from "vitest";
import { buildPlan } from "./protocol";
import { score } from "./scoring";

const gad7 = (...r: number[]) => score("gad7", r);
const phq9 = (...r: number[]) => score("phq9", r);
const calm = () => [gad7(0, 0, 0, 0, 0, 0, 0), phq9(0, 0, 0, 0, 0, 0, 0, 0, 0)];

describe("care plan tiers", () => {
  it("self-help below the screening cut-point", () => {
    const plan = buildPlan({ scores: calm() });
    expect(plan.tier).toBe("self-help");
    expect(plan.steps.every((s) => !s.informationalOnly)).toBe(true);
  });

  it("guided at the cut-point", () => {
    expect(buildPlan({ scores: [gad7(2, 2, 2, 2, 2, 0, 0)] }).tier).toBe("guided");
  });

  it("clinician-led in the top severity band", () => {
    expect(buildPlan({ scores: [gad7(3, 3, 3, 3, 3, 0, 0)] }).tier).toBe("clinician-led");
  });

  it("takes the highest tier across instruments", () => {
    const plan = buildPlan({ scores: [gad7(0, 0, 0, 0, 0, 0, 0), phq9(3, 3, 3, 3, 3, 0, 0, 0, 0)] });
    expect(plan.tier).toBe("clinician-led");
  });
});

describe("safety outranks the plan", () => {
  it("a minimal total with item 9 endorsed still becomes clinician-led", () => {
    // Score says "minimal", the safety rule says otherwise, and the safety rule
    // wins. An app that answers this with a breathing exercise has made a
    // safety error, not a UX one.
    const plan = buildPlan({ scores: [phq9(0, 0, 0, 0, 0, 0, 0, 0, 1)] });
    expect(plan.tier).toBe("clinician-led");
    expect(plan.safety.level).toBe("crisis");
  });

  it("leads with getting help, not with self-help, during a crisis", () => {
    const plan = buildPlan({ scores: [phq9(0, 0, 0, 0, 0, 0, 0, 0, 3)] });
    expect(plan.headlineTh).toContain("ติดต่อขอความช่วยเหลือก่อน");
    expect(plan.safety.resources.length).toBeGreaterThan(0);
    // The first step offered is a treatment a clinician leads, not a self-help task.
    expect(plan.steps[0].informationalOnly).toBe(true);
  });

  it("records that the safety rule, not the score, set the tier", () => {
    const plan = buildPlan({ scores: [phq9(0, 0, 0, 0, 0, 0, 0, 0, 1)] });
    expect(plan.rulesTh.join(" ")).toContain("ระดับความปลอดภัยอยู่เหนือผลคะแนน");
  });

  it("safety never loosens a tier that the score already tightened", () => {
    const plan = buildPlan({ scores: [gad7(3, 3, 3, 3, 3, 3, 3)] });
    expect(plan.tier).toBe("clinician-led");
  });
});

describe("plan contents", () => {
  it("orders self-help steps by evidence grade, strongest first", () => {
    // The ranking is the evidence table filtered — not a list tuned to what the
    // app happens to be able to deliver.
    const plan = buildPlan({ scores: calm() });
    const grades = plan.steps.map((s) => s.intervention.grade);
    const rank = { strong: 0, good: 1, moderate: 2, emerging: 3 };
    expect(grades.map((g) => rank[g])).toEqual([...grades.map((g) => rank[g])].sort((a, b) => a - b));
  });

  it("puts the easiest-to-generate intervention last, because its evidence is weakest", () => {
    const plan = buildPlan({ scores: calm() });
    expect(plan.steps[plan.steps.length - 1].intervention.id).toBe("binaural");
  });

  it("marks treatments the app cannot deliver as informational", () => {
    const plan = buildPlan({ scores: [gad7(3, 3, 3, 3, 3, 0, 0)] });
    const cbt = plan.steps.find((s) => s.intervention.id === "cbt");
    expect(cbt?.informationalOnly).toBe(true);
  });

  it("states the medication dose as prescriber-set, never as a number", () => {
    const plan = buildPlan({ scores: [gad7(3, 3, 3, 3, 3, 0, 0)] });
    const ssri = plan.steps.find((s) => s.intervention.id === "ssri")!;
    expect(ssri.doseTh).toContain("แพทย์");
    expect(ssri.doseTh).not.toMatch(/\d+\s*(mg|มก)/);
  });

  it("builds each dose sentence from the intervention's own dose record", () => {
    const plan = buildPlan({ scores: calm() });
    const music = plan.steps.find((s) => s.intervention.id === "music-listening")!;
    expect(music.doseTh).toContain("20–40 นาที");
    expect(music.doseTh).toContain("ทุกวัน");
  });

  it("adds CBT-I when the sleep diary meets the frequency criterion", () => {
    const plan = buildPlan({ scores: calm(), sleepDisturbed: true });
    expect(plan.steps.some((s) => s.intervention.id === "cbti")).toBe(true);
    expect(plan.rulesTh.join(" ")).toContain("CBT-I");
  });

  it("omits CBT-I when sleep is not flagged", () => {
    expect(buildPlan({ scores: calm() }).steps.some((s) => s.intervention.id === "cbti")).toBe(false);
  });
});

describe("what the plan says about itself", () => {
  it("re-assesses at two weeks — the instruments' own recall window", () => {
    // Retaking sooner re-measures the same fortnight the items ask about.
    expect(buildPlan({ scores: calm() }).reassessInWeeks).toBe(2);
  });

  it("always ships the rules that produced it", () => {
    const plan = buildPlan({ scores: calm() });
    expect(plan.rulesTh.length).toBeGreaterThan(0);
  });

  it("always disclaims diagnosis and expert assessment", () => {
    const plan = buildPlan({ scores: calm() });
    expect(plan.disclaimersTh.join(" ")).toContain("ไม่ใช่การวินิจฉัย");
    expect(plan.disclaimersTh.join(" ")).toContain("ไม่ได้ปรับตามสิ่งที่แอปนี้ให้บริการ");
  });

  it("is deterministic", () => {
    expect(buildPlan({ scores: calm() })).toEqual(buildPlan({ scores: calm() }));
  });
});
