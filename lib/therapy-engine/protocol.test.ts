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

describe("the plan names the band it actually read", () => {
  it("a PHQ-9 of 15 is called moderately severe, not severe", () => {
    // The tier came from `total >= 15`, and 15 is a different band in each
    // instrument: GAD-7 15 is severe, PHQ-9 15 is moderately severe. The rule
    // told the user their score was "in the severe range" while the assessment
    // page beside it correctly said "ค่อนข้างรุนแรง".
    const phq = score("phq9", [3, 3, 3, 3, 2, 1, 0, 0, 0]);
    expect(phq.total).toBe(15);
    expect(phq.band.id).toBe("moderatelySevere");

    const plan = buildPlan({ scores: [phq] });
    expect(plan.tier).toBe("clinician-led");
    expect(plan.rulesTh[0]).toContain(phq.band.th);
    expect(plan.rulesTh[0], "still claims the severe band").not.toContain("ช่วงรุนแรง");
  });

  it("a GAD-7 of 15 IS severe, and says so", () => {
    const gad = score("gad7", [3, 3, 3, 2, 2, 1, 1]);
    expect(gad.total).toBe(15);
    expect(gad.band.id).toBe("severe");
    expect(buildPlan({ scores: [gad] }).rulesTh[0]).toContain(gad.band.th);
  });

  it("the tier thresholds are unchanged by the rewrite", () => {
    // Filled from the front, three at a time — every item has a 0-3 scale, and
    // spreading a remainder onto one item puts it out of range. Filling from
    // the front also leaves PHQ-9 item 9 at zero for every total used here, so
    // the safety override never confounds the threshold being measured.
    const tierFor = (id: "phq9" | "gad7", total: number) => {
      const items = id === "phq9" ? 9 : 7;
      const responses = new Array(items).fill(0);
      let left = total;
      for (let i = 0; i < items && left > 0; i++) {
        responses[i] = Math.min(3, left);
        left -= responses[i];
      }
      const s = score(id, responses);
      expect(s.total, `could not build a ${id} of ${total}`).toBe(total);
      return buildPlan({ scores: [s] }).tier;
    };
    expect(tierFor("phq9", 4)).toBe("self-help");
    expect(tierFor("phq9", 9)).toBe("self-help");
    expect(tierFor("phq9", 10)).toBe("guided");
    expect(tierFor("phq9", 14)).toBe("guided");
    expect(tierFor("phq9", 15)).toBe("clinician-led");
    expect(tierFor("gad7", 9)).toBe("self-help");
    expect(tierFor("gad7", 10)).toBe("guided");
    expect(tierFor("gad7", 15)).toBe("clinician-led");
  });
});

describe("CBT-I joins the plan in evidence order", () => {
  it("a strong-grade step does not end up behind an emerging-grade one", () => {
    // It was pushed onto an already-sorted list, under a heading that says the
    // order comes from the evidence table and not from what this app can
    // deliver.
    const calm = score("phq9", [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const plan = buildPlan({ scores: [calm], sleepDisturbed: true });
    const order = { strong: 0, good: 1, moderate: 2, emerging: 3 };
    const grades = plan.steps.map((s) => order[s.intervention.grade]);
    for (let i = 1; i < grades.length; i++) {
      expect(
        grades[i],
        `${plan.steps[i].intervention.id} (${plan.steps[i].intervention.grade}) came after ` +
          `${plan.steps[i - 1].intervention.id} (${plan.steps[i - 1].intervention.grade})`
      ).toBeGreaterThanOrEqual(grades[i - 1]);
    }
    expect(plan.steps.some((s) => s.intervention.id === "cbti")).toBe(true);
  });
});
