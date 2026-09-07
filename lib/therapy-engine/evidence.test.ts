import { describe, it, expect } from "vitest";
import {
  EVIDENCE_GRADES,
  GRADE_ORDER,
  INTERVENTIONS,
  VERIFICATION_NOTE,
  byGrade,
  getIntervention,
  selfAdministered,
} from "./evidence";

describe("evidence catalog — no unsourced recommendation ships", () => {
  it("every intervention carries at least one citation", () => {
    // The rule the 'evidence-based' claim rests on. A recommendation with no
    // source is a build failure, not a TODO.
    for (const i of INTERVENTIONS) {
      expect(i.citations.length, `${i.id} has no citation`).toBeGreaterThan(0);
    }
  });

  it("every citation names authors, a year and a venue", () => {
    for (const i of INTERVENTIONS) {
      for (const c of i.citations) {
        expect(c.authors.length, `${i.id}`).toBeGreaterThan(3);
        expect(c.year, `${i.id}`).toBeGreaterThan(1980);
        expect(c.year, `${i.id}`).toBeLessThanOrEqual(new Date().getFullYear());
        expect(c.venue.length, `${i.id}`).toBeGreaterThan(3);
      }
    }
  });

  it("a quoted effect always names its metric — never a bare number", () => {
    // "-7.73" means nothing without "STAI units". A number without its metric is
    // decoration wearing the costume of measurement.
    for (const i of INTERVENTIONS) {
      for (const c of i.citations) {
        if (!c.effect) continue;
        expect(c.effect.metric.length, `${i.id}`).toBeGreaterThan(2);
        expect(Number.isFinite(c.effect.value), `${i.id}`).toBe(true);
      }
    }
  });

  it("ids are unique", () => {
    const ids = INTERVENTIONS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("evidence grades — the grade is not ours to award", () => {
  it("every grade in use is defined, with its requirement stated", () => {
    for (const i of INTERVENTIONS) {
      const g = EVIDENCE_GRADES[i.grade];
      expect(g, `${i.id}: undefined grade ${i.grade}`).toBeDefined();
      expect(g.requiresTh.length).toBeGreaterThan(10);
    }
  });

  it("GRADE_ORDER covers every defined grade, strongest first", () => {
    expect([...GRADE_ORDER].sort()).toEqual(Object.keys(EVIDENCE_GRADES).sort());
    const stars = GRADE_ORDER.map((g) => EVIDENCE_GRADES[g].stars);
    expect(stars).toEqual([...stars].sort((a, b) => b - a));
  });

  it("a 'strong' grade is backed by a synthesis, not a single trial", () => {
    // The grade definition requires a systematic review / meta-analysis. This
    // checks the entries actually meet the bar they claim.
    for (const i of INTERVENTIONS.filter((x) => x.grade === "strong")) {
      const synthesis = i.citations.some((c) =>
        /review|meta-analysis|guideline/i.test(`${c.title} ${c.venue}`)
      );
      expect(synthesis, `${i.id} is graded 'strong' without a synthesis citation`).toBe(true);
    }
  });

  it("binaural beats stay at 'emerging' — easy to generate is not the same as proven", () => {
    // The catalog's own honesty test: the intervention this app could most
    // trivially deliver is the one with the weakest grade, and it stays there.
    const b = getIntervention("binaural");
    expect(b?.grade).toBe("emerging");
    expect(b?.selfAdministered).toBe(true);
  });

  it("an associational finding is not graded above 'emerging'", () => {
    // White 2019 is cross-sectional. Correlation graded as causation would be
    // exactly the fake rigor this repo exists to refuse.
    const nature = getIntervention("nature");
    expect(nature?.grade).toBe("emerging");
    expect(nature?.limitationTh).toContain("ไม่ใช่ 'สาเหตุ'");
  });
});

describe("evidence catalog — stating what we cannot do", () => {
  it("every intervention states a limitation", () => {
    for (const i of INTERVENTIONS) {
      expect(i.limitationTh.length, `${i.id} has no stated limitation`).toBeGreaterThan(20);
    }
  });

  it("music therapy admits that app-generated sound is not what was studied", () => {
    // The single most tempting overclaim in a music-therapy app.
    const music = getIntervention("music-listening");
    expect(music?.limitationTh).toContain("เสียงที่แอปนี้สร้างขึ้นเองไม่ใช่สิ่งเดียวกัน");
  });

  it("an empty harms list is never presented as proof of safety", () => {
    for (const i of INTERVENTIONS) {
      if (i.harms.length === 0) {
        expect(i.harmsNote.length, `${i.id} claims no harms with no explanation`).toBeGreaterThan(10);
      }
    }
  });

  it("prescription-only treatments are not marked self-administered", () => {
    expect(getIntervention("ssri")?.selfAdministered).toBe(false);
    expect(getIntervention("cbt")?.selfAdministered).toBe(false);
    expect(getIntervention("cbti")?.selfAdministered).toBe(false);
    expect(selfAdministered().map((i) => i.id)).not.toContain("ssri");
  });

  it("the medication entry refuses to name a drug or a dose", () => {
    const ssri = getIntervention("ssri")!;
    expect(ssri.dose).toBeNull();
    expect(ssri.limitationTh).toContain("ไม่แนะนำขนาดยา");
  });

  it("the catalog states its own provenance", () => {
    expect(VERIFICATION_NOTE).toContain("ไม่ใช่ข้อความจากผู้วิจัยต้นทาง");
    expect(VERIFICATION_NOTE).toContain("ไม่ใช่การวินิจฉัย");
  });
});

describe("dose", () => {
  it("a dose range is ordered low → high and positive", () => {
    for (const i of INTERVENTIONS) {
      if (!i.dose) continue;
      const [lo, hi] = i.dose.minutesPerSession;
      expect(lo, `${i.id}`).toBeGreaterThan(0);
      expect(hi, `${i.id}`).toBeGreaterThanOrEqual(lo);
      expect(i.dose.sessionsPerWeek, `${i.id}`).toBeGreaterThan(0);
      expect(i.dose.sessionsPerWeek, `${i.id}`).toBeLessThanOrEqual(7);
    }
  });

  it("byGrade partitions the catalog with nothing lost", () => {
    const total = GRADE_ORDER.reduce((n, g) => n + byGrade(g).length, 0);
    expect(total).toBe(INTERVENTIONS.length);
  });
});
