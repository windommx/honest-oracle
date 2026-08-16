import { describe, it, expect } from "vitest";
import {
  SYMPTOM_LADDER, route, formatRoute, routableModuleIds, unroutedModuleIds, NON_GOALS, R0_ID,
} from "./router";
import { MODULE_CATALOG } from "./modules";

describe("ladder integrity", () => {
  it("every rung points at modules that actually exist", () => {
    const known = new Set(MODULE_CATALOG.map((m) => m.id));
    for (const id of routableModuleIds()) expect(known.has(id)).toBe(true);
  });

  it("ids are stable handles, NOT positions — a later rung may sit early", () => {
    // Renumbering on insert would invalidate every id anyone has quoted. Position carries
    // the semantics (fix-this-first order); the id is only a handle. R21 (writer's block)
    // was added after R20 and belongs above R1, so it sits first while keeping its id.
    expect(SYMPTOM_LADDER[0].id).toBe("R21");
    const nums = SYMPTOM_LADDER.map((r) => Number(r.id.slice(1)));
    expect(nums).not.toEqual([...nums].sort((a, b) => a - b)); // deliberately unsorted
    expect(Math.max(...nums)).toBe(SYMPTOM_LADDER.length); // no gaps: ids 1..n all present
  });

  it("rung ids are unique and every rung carries keywords and a reason", () => {
    const ids = SYMPTOM_LADDER.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(R0_ID); // R0 is the absence of a rung, never a row
    for (const r of SYMPTOM_LADDER) {
      expect(r.keywords.length).toBeGreaterThan(0);
      expect(r.why.length).toBeGreaterThan(20);
      expect(r.th.length).toBeGreaterThan(0);
      expect(r.en.length).toBeGreaterThan(0);
    }
  });

  it("every rung's own label routes back to itself — the anti-theft net", () => {
    // A rung whose canonical phrasing routes somewhere else is broken by construction:
    // the label is what the UI shows as a sample chip, so the user clicks it and lands
    // in the wrong place. This is also the guard that catches a NEW rung's keywords
    // stealing an OLD rung's route — the failure mode that has bitten this ladder three
    // times (สาร inside สารคดี, "เขียนเสร็จแล้ว" taking R20, "น่าเบื่อ" taking R12).
    //
    // Whole labels only. Labels enumerate ("ชื่อ / สถานที่ / ไทม์ไลน์ ไม่ตรงกันข้ามบท" is one
    // predicate over three nouns), so splitting on " / " would assert that bare nouns
    // route — a demand the ladder deliberately does not meet.
    for (const r of SYMPTOM_LADDER) {
      expect(route(r.th).primary?.rung.id, `${r.id} "${r.th}" was stolen or matched nothing`).toBe(r.id);
    }
  });

  // A curated regression corpus, NOT a claim of completeness. Thai keywords match as
  // substrings, so a short fragment can fire inside a common word from another domain.
  // Every entry here is a real Thai word that DID fire, or was checked because it shares
  // a fragment with a keyword. The list grows when a collision is found — that is its job.
  const HAZARD_WORDS = [
    "ปกติ", "ปกครอง", "ปกป้อง",   // contained "ปก" (cover) → routed to BLURB
    "ช้าง",                        // contained "ช้า" (slow) → routed to NIS_PACING
    "อุปมา", "ปมด้อย",             // contained "ปม" (plot knot) → routed to NIS_FORESHADOW
    "ตันหยง", "กัปตัน", "กัปตันมากับเรือ",  // contained "ตัน" (blocked) — กัปตัน also defeats "ตันมาก"
    "สารพัด", "สาระแน",            // the "สาร" family that produced the first shipped collision
    //  (สารบัญ left out on purpose: it is now a legitimate R25 keyword — a pre-publish check covers the ToC)
    "จังหวัด", "ชื่อเสียง", "สอบถาม", "ประกาศ", "ท้องถิ่น",
  ];

  it("no keyword fires inside a common unrelated Thai word", () => {
    for (const w of HAZARD_WORDS) {
      const r = route(w);
      expect(r.primary, `"${w}" wrongly routed to ${r.primary?.rung.id} via "${r.primary?.matched.join(",")}"`).toBeNull();
    }
  });

  it("records the one collision we accept, with its reason", () => {
    // "อืด" (sluggish) fires inside ท้องอืด (bloated stomach). Kept deliberately: "อืด" is
    // the natural Thai word for a sagging middle, and a digestive complaint will not appear
    // in a manuscript-symptom description. Recorded rather than hidden — if this ever bites,
    // the fix is to qualify it ("เรื่องอืด") exactly as ช้า/ตัน/ปม/ปก were qualified above.
    expect(route("ท้องอืด").primary?.rung.primary).toBe("NIS_PACING");
  });

  it("no rung lists its own primary in also or runFirst", () => {
    for (const r of SYMPTOM_LADDER) {
      expect(r.also).not.toContain(r.primary);
      expect(r.runFirst ?? []).not.toContain(r.primary);
    }
  });

  it("a prerequisite is never a rung that depends on it (no cycles)", () => {
    const primaryOf = new Map(SYMPTOM_LADDER.map((r) => [r.primary, r]));
    for (const r of SYMPTOM_LADDER) {
      for (const p of r.runFirst ?? []) {
        const upstream = primaryOf.get(p);
        if (upstream) expect(upstream.runFirst ?? []).not.toContain(r.primary);
      }
    }
  });
});

describe("routing is deterministic", () => {
  it("same input returns an identical result every run", () => {
    const s = "บทที่ 7 มันแบน อ่านแล้วไม่รู้สึกอะไรเลย";
    const a = JSON.stringify(route(s));
    for (let i = 0; i < 5; i++) expect(JSON.stringify(route(s))).toBe(a);
  });

  it("formatRoute emits no timestamp or random token", () => {
    const md = formatRoute("ตัวละครพูดเหมือนกันหมด");
    expect(md).not.toMatch(/20\d{2}-\d{2}-\d{2}/);
    expect(md).not.toMatch(/\b[0-9a-f]{16,}\b/);
  });
});

describe("symptom → module", () => {
  const cases: [string, string][] = [
    ["ยังไม่มีโครงเรื่องเลย ไม่รู้จะเริ่มยังไง", "STRUCTURE"],
    ["ชื่อเมืองสะกดไม่เหมือนกันในแต่ละบท", "WORLD_CODEX"],
    ["ตัวละครพูดเหมือนกันหมด ปิดชื่อแล้วแยกไม่ออก", "VOICE_SHEET"],
    ["พระเอกไม่เปลี่ยนเลย จบเล่มยังเป็นคนเดิม", "CHAR_ARC"],
    ["บทนี้มันแบนมาก เหมือนไม่มีอะไรเกิดขึ้น", "SCENE"],
    ["อ่านแล้วไม่อิน เข้าไม่ถึงตัวละคร", "IMMERSION"],
    ["จบบทแล้ววางได้ ไม่มีใครอ่านต่อ", "HOOK_CRAFT"],
    ["กลางเรื่องหย่อนมาก แล้วเร่งตอนจบ", "NIS_PACING"],
    ["ปูปมไว้แล้วไม่เก็บสักอัน", "NIS_FORESHADOW"],
    ["อ่านแล้วรู้เลยว่า AI เขียน ภาษาเรียบเป็นแม่พิมพ์", "ANTI_SLOP"],
    ["เขียนยาวเกิน เยิ่นเย้อ ตัดเองไม่ลง", "CUT_PASS"],
    ["ใช้ราชาศัพท์ถูกไหม แล้วคำทับศัพท์สะกดไม่นิ่ง", "THAI_QA"],
    ["อยากให้ตัวละครพูดภาษาอีสาน", "DIALECT_ISAN"],
    ["เขียนไซไฟ อยากให้ฟิสิกส์ไม่หลุด", "HARD_SF"],
    ["เขียนซีรีส์หลายเล่ม กลัวหลุดข้ามเล่ม", "SAGA_CONTINUITY"],
    ["สารคดี กลัวอ้างอิงไม่แน่น", "FACT_CHECK"],
    ["เขียนเสร็จแล้วแต่ขายไม่ออก ชื่อเรื่องกับเรื่องย่อแย่", "BLURB"],
  ];
  for (const [symptom, expected] of cases) {
    it(`"${symptom.slice(0, 34)}…" → ${expected}`, () => {
      expect(route(symptom).primary?.rung.primary).toBe(expected);
    });
  }

  const addedLater: [string, string][] = [
    ["ไอเดียตันมาก คิดไม่ออกเลย นั่งมองหน้าจอ", "BRAINSTORM"],
    ["เขียนมาถึงบทที่ 30 แล้วจำไม่ได้ว่าเกิดอะไรมาบ้าง", "RECAP"],
    ["แก่นเรื่องหลุด motif หายไปกลางเล่ม", "NIS_THEME"],
    ["เขียนหนังสือสอน แต่คนอ่านแล้วทำตามไม่ได้", "PEDAGOGY"],
    ["เขียนเสร็จแล้ว กำลังจะส่งพิมพ์ ต้องตรวจอะไรบ้าง", "QUALITY_GATE"],
    ["จะส่งสำนักพิมพ์ ต้องเขียนจดหมายเสนอต้นฉบับ", "SUBMISSION"],
  ];
  for (const [symptom, expected] of addedLater) {
    it(`"${symptom.slice(0, 34)}…" → ${expected}`, () => {
      expect(route(symptom).primary?.rung.primary).toBe(expected);
    });
  }

  it("routes English symptoms too", () => {
    expect(route("all my characters sound alike").primary?.rung.primary).toBe("VOICE_SHEET");
    expect(route("the middle drags badly").primary?.rung.primary).toBe("NIS_PACING");
  });
});

describe("the audit trail", () => {
  it("reports exactly which keywords fired, and they really are in the input", () => {
    const r = route("จบบทแล้ววางได้ทุกที");
    expect(r.primary!.matched.length).toBeGreaterThan(0);
    for (const k of r.primary!.matched) {
      expect("จบบทแล้ววางได้ทุกที".toLowerCase()).toContain(k.toLowerCase());
    }
  });

  it("formatRoute shows the matched keywords so the route can be re-derived", () => {
    const md = formatRoute("ตัวละครพูดเหมือนกันหมด");
    expect(md).toContain("คำที่ทำให้เข้าขั้นนี้");
    expect(md).toContain("พูดเหมือนกัน");
    expect(md).toContain("VOICE_SHEET");
  });
});

describe("competing rungs are disclosed, never swallowed", () => {
  it("a multi-symptom description keeps every match, first as primary", () => {
    const r = route("บทมันแบน แล้วก็อ่านแล้วรู้ว่า AI เขียน ตัวละครพูดเหมือนกันหมดด้วย");
    expect(r.primary!.rung.primary).toBe("VOICE_SHEET"); // R3 is highest on the ladder
    const secondaryPrimaries = r.secondary.map((s) => s.rung.primary);
    expect(secondaryPrimaries).toContain("SCENE");     // R5 also matched
    expect(secondaryPrimaries).toContain("ANTI_SLOP"); // R13 also matched
    // and all three reach the caller
    expect(r.modules).toEqual(expect.arrayContaining(["VOICE_SHEET", "SCENE", "ANTI_SLOP"]));
  });

  it("a genuinely ambiguous sentence resolves by position and discloses the loser", () => {
    // "เขียนไปเรื่อย" is a real no-outline signal (R1) and this sentence also names a
    // theme problem (R23). Position decides — structure is fixed before theme — but the
    // competing read is surfaced, so the writer can overrule the ladder.
    const r = route("เขียนไปเรื่อยจนลืมว่าจะพูดเรื่องอะไร แก่นเรื่องหลุด");
    expect(r.primary!.rung.primary).toBe("STRUCTURE");
    expect(r.secondary.map((s) => s.rung.primary)).toContain("NIS_THEME");
    expect(r.modules).toContain("NIS_THEME");
  });

  it("short Thai fragments do not fire inside unrelated words", () => {
    // regressions that shipped once: "สาร" inside สารคดี, "เขียนเสร็จแล้ว" stealing R20
    expect(route("สารคดี กลัวอ้างอิงไม่แน่น").primary?.rung.primary).toBe("FACT_CHECK");
    expect(route("เขียนเสร็จแล้วแต่ขายไม่ออก ชื่อเรื่องแย่").primary?.rung.primary).toBe("BLURB");
  });

  it("secondary rungs stay in ladder order", () => {
    const r = route("ไม่มีโครง ตัวละครพูดเหมือนกัน บทแบน ยาวเกิน");
    const order = SYMPTOM_LADDER.map((x) => x.id);
    const seen = [r.primary!.rung.id, ...r.secondary.map((s) => s.rung.id)];
    const positions = seen.map((id) => order.indexOf(id));
    for (let i = 1; i < positions.length; i++) expect(positions[i]).toBeGreaterThan(positions[i - 1]);
  });

  it("modules are deduped while keeping primary first", () => {
    const r = route("ตัวละครพูดเหมือนกันหมด บทสนทนาน่าเบื่อพูดวนไปวนมา");
    expect(r.modules[0]).toBe("VOICE_SHEET");
    expect(new Set(r.modules).size).toBe(r.modules.length);
  });
});

describe("prerequisites", () => {
  it("surfaces what must exist first, and never one already routed to", () => {
    const r = route("พระเอกไม่เปลี่ยนเลย ไม่มีพัฒนาการ");
    expect(r.runFirst).toContain("STRUCTURE");
    const both = route("ไม่มีโครงเรื่อง แล้วพระเอกก็ไม่เปลี่ยนเลย");
    expect(both.modules).toContain("STRUCTURE");
    expect(both.runFirst).not.toContain("STRUCTURE"); // already in the plan — not a blocker
  });
});

describe("R0 — no force-fit", () => {
  it("returns nothing rather than the nearest rung when nothing matches", () => {
    const r = route("วันนี้อากาศดีมาก");
    expect(r.primary).toBeNull();
    expect(r.secondary).toHaveLength(0);
    expect(r.modules).toHaveLength(0);
    expect(r.noMatch).toBeTruthy();
  });

  it("the no-match message tells the user to add a rung, not to accept a guess", () => {
    const r = route("xyzzy");
    expect(r.noMatch).toContain("ไม่เดา");
    expect(r.noMatch).toContain("เพิ่มขั้นใหม่");
    expect(formatRoute("xyzzy")).toContain(R0_ID);
  });

  it("empty input is R0, not a crash and not rung 1", () => {
    for (const s of ["", "   ", "\n\t"]) {
      expect(route(s).primary).toBeNull();
    }
  });
});

describe("keyword matching rules", () => {
  it("ASCII keywords respect word boundaries", () => {
    // "arc" is an R4 keyword; it must not fire inside "search" or "March"
    expect(route("I searched everywhere in March").primary).toBeNull();
    expect(route("the character arc is missing").primary?.rung.primary).toBe("CHAR_ARC");
  });

  it("is case-insensitive for ASCII", () => {
    expect(route("SOUNDS LIKE AI").primary?.rung.primary).toBe("ANTI_SLOP");
    expect(route("sounds like ai").primary?.rung.primary).toBe("ANTI_SLOP");
  });

  it("Thai matches as a substring, since Thai has no word boundaries", () => {
    expect(route("รู้สึกว่าบทมันแบนๆนะ").primary?.rung.primary).toBe("SCENE");
  });

  it("survives particle insertion — the failure mode long Thai phrases have", () => {
    // Thai writers drop particles inside a phrase ("รู้เลยว่า" for "รู้ว่า"), which breaks
    // any keyword stored as a full sentence. Guard: every rung keeps at least one short
    // fragment, so a rung never depends solely on a phrase that a single particle defeats.
    for (const r of SYMPTOM_LADDER) {
      const thai = r.keywords.filter((k) => /[฀-๿]/.test(k));
      if (thai.length === 0) continue;
      const shortest = Math.min(...thai.map((k) => k.replace(/\s/g, "").length));
      expect(shortest, `rung ${r.id} has only long Thai phrases`).toBeLessThanOrEqual(12);
    }
    // the case that actually caught this
    expect(route("อ่านแล้วรู้เลยว่า AI เขียน").primary?.rung.primary).toBe("ANTI_SLOP");
    expect(route("อ่านแล้วก็รู้สึกเลยว่า AI เขียน").primary?.rung.primary).toBe("ANTI_SLOP");
  });
});

describe("honest self-disclosure", () => {
  it("reports which modules no rung reaches, instead of implying full coverage", () => {
    const unrouted = unroutedModuleIds();
    // The ladder is a triage front door, not an index of all 61 — assert that
    // it is genuinely partial and that the partiality is queryable.
    expect(unrouted.length).toBeGreaterThan(0);
    expect(routableModuleIds().length + unrouted.length).toBe(MODULE_CATALOG.length);
    // Request-shaped modules (you ask for them; they are not symptoms) stay unrouted.
    expect(unrouted).toContain("TRANSLATE");
  });

  it("records why each part of the source pattern was not adopted", () => {
    expect(NON_GOALS.length).toBeGreaterThanOrEqual(4);
    for (const n of NON_GOALS) {
      expect(n.what.length).toBeGreaterThan(0);
      expect(n.why.length).toBeGreaterThan(40);
    }
    // the self-evolving KB is refused on determinism grounds — the core contract
    const evolving = NON_GOALS.find((n) => /self-evolving/i.test(n.what))!;
    expect(evolving.why).toMatch(/reproducib|determinis|different routes/i);
  });
});
