import type { Architecture, BookConfig, ChapterPlan } from "./types";

// Tension rises monotonically to PEAK at the climax chapter, then drops for the
// resolution — so tensionMap and the climax beat agree (was: peak landed before
// the climax, contradicting "tension escalates across acts").
function calculateTension(i: number, total: number, climaxIdx: number): number {
  if (i >= total && total > climaxIdx) return 0.5; // resolution falls back
  if (i >= climaxIdx) return 1;                    // climax peak
  return Math.round((0.3 + 0.65 * ((i - 1) / Math.max(1, climaxIdx - 1))) * 100) / 100;
}

function getMustHaves(sceneType: string): string[] {
  const map: Record<string, string[]> = {
    opening: ["compelling first line", "character desire", "world grounding", "hook"],
    setup: ["character flaw", "normal world", "relationships", "stakes hint"],
    turning_point: ["decision point", "commitment", "no return", "new world"],
    escalation: ["new challenge", "growth moment", "relationship shift", "stakes raised"],
    midpoint: ["revelation", "reversal", "stakes personal", "momentum shift"],
    complication: ["plan failure", "ally strain", "internal conflict", "dark approach"],
    dark_moment: ["lowest point", "inner demon", "seed of resolution", "choice"],
    pre_climax: ["resolve found", "final prep", "calm moment", "ready signal"],
    climax: ["final conflict", "internal test", "decisive action", "conflict resolution"],
    resolution: ["new normal", "transformation shown", "theme embodied", "final image"],
  };
  return map[sceneType] ?? ["conflict", "turning point", "sensory detail", "hook"];
}

function pickHookType(ch: number): string {
  const hooks = ["cliffhanger", "revelation", "question", "reversal", "image", "emotional", "ironic"];
  return hooks[ch % hooks.length];
}

function getNFChapterPurpose(type: string, num: number, total: number): string {
  if (num === 1) return "HOOK: Capture attention, establish the problem";
  if (num === total) return "CLOSE: Restate thesis, call to action, final story";
  const purposes: Record<string, string> = {
    story: "ILLUSTRATE: Make the problem real through narrative",
    theory: "EXPLAIN: Introduce a framework component with mechanism",
    evidence: "PROVE: Present research and data supporting a claim",
    case_study: "DEMONSTRATE: Show the framework working in reality",
    practice: "APPLY: Give reader hands-on exercise",
    counter: "REBUT: Address counter-arguments fairly",
    synthesis: "INTEGRATE: Show how all components work together",
    action: "IMPLEMENT: Structured plan for reader to take action",
    reflection: "INTERNALIZE: Connect content to reader's experience",
    introduction: "SETUP: Context, background, roadmap",
  };
  return purposes[type] ?? "DEVELOP: Advance the book's central argument";
}

function getNFMustHaves(type: string): string[] {
  const base = ["clear_purpose", "logical_flow", "engagement"];
  const extras: Record<string, string[]> = {
    introduction: ["hook", "problem_statement", "roadmap"],
    story: ["sensory_detail", "narrative_arc", "insight"],
    evidence: ["claim", "citations", "analysis"],
    theory: ["concept", "mechanism", "example", "analogy"],
    practice: ["objective", "steps", "exercise"],
    case_study: ["context", "narrative", "outcome", "lessons"],
    counter: ["steelmanning", "evidence", "rebuttal"],
    synthesis: ["review", "connections", "framework"],
    action: ["plan", "tools", "commitment"],
    reflection: ["personal_connection", "questions", "growth"],
  };
  return [...base, ...(extras[type] ?? [])];
}

// ═══════════════════════════════════════════════════════════════
//  U_2 — ARCHITECTURE (per type)
// ═══════════════════════════════════════════════════════════════

export function buildArchitecture(config: BookConfig): Architecture {
  const arch: Architecture = {
    type: config.type,
    title: config.title,
    chapters: [],
    parts: [],
  };

  switch (config.type) {
    case "novel":
      buildFictionArchitecture(arch, config);
      break;
    case "nonfiction":
      buildNonFictionArchitecture(arch, config);
      break;
    case "howto":
      buildHowToArchitecture(arch, config);
      break;
    case "kids":
      buildKidsArchitecture(arch, config);
      break;
    case "cookbook":
      buildCookbookArchitecture(arch, config);
      break;
    case "textbook":
      buildTextbookArchitecture(arch, config);
      break;
    case "memoir":
      buildMemoirArchitecture(arch, config);
      break;
    case "poetry":
      buildPoetryArchitecture(arch, config);
      break;
  }
  return arch;
}

function buildFictionArchitecture(arch: Architecture, config: BookConfig) {
  const ch = config.chapters;
  // Compute the core beat indices first, clamped & strictly ordered so every beat
  // (opening < turning_point < midpoint < dark_moment < climax < resolution) exists
  // and is correctly placed for any ch >= 6 (degrades gracefully below).
  const climaxIdx = ch >= 4 ? ch - 1 : ch;
  const darkIdx = Math.max(1, climaxIdx - 1);
  let turnIdx = Math.max(2, Math.floor(ch * 0.25) + 1);
  let midIdx = Math.max(turnIdx + 1, Math.round(ch * 0.5));
  midIdx = Math.min(midIdx, Math.max(2, darkIdx - 1));
  turnIdx = Math.min(turnIdx, Math.max(2, midIdx - 1));

  const PURPOSE: Record<string, string> = {
    opening: "HOOK: Drop reader into compelling scene",
    setup: "ESTABLISH: World, character, stakes, inciting incident",
    turning_point: "POINT OF NO RETURN: Protagonist commits",
    escalation: "ESCALATE: Rising conflict, new allies/enemies",
    midpoint: "MIDPOINT: Revelation or reversal",
    complication: "COMPLICATE: Stakes highest, dark moment approaches",
    dark_moment: "DARK NIGHT: Protagonist at lowest",
    climax: "CLIMAX: Final confrontation",
    resolution: "RESOLUTION: New normal, thematic statement",
  };
  const beatOf = (i: number): string => {
    if (i === 1) return "opening";
    if (i === ch) return "resolution";
    if (i === climaxIdx) return "climax";
    if (i === darkIdx) return "dark_moment";
    if (i === midIdx) return "midpoint";
    if (i === turnIdx) return "turning_point";
    if (i < turnIdx) return "setup";
    if (i < midIdx) return "escalation";
    return "complication";
  };
  const actOf = (st: string): number =>
    st === "opening" || st === "setup" ? 1 : st === "dark_moment" || st === "climax" || st === "resolution" ? 3 : 2;

  arch.parts = [
    { name: "Act 1: Setup", chapters: [1, Math.max(1, turnIdx - 1)], purpose: "Introduce world, characters, stakes" },
    { name: "Act 2A: Rising Action", chapters: [turnIdx, Math.max(turnIdx, midIdx - 1)], purpose: "Escalate conflict, deepen relationships" },
    { name: "Act 2B: Complications", chapters: [midIdx, Math.max(midIdx, darkIdx - 1)], purpose: "Raise stakes toward the dark moment" },
    { name: "Act 3: Climax & Resolution", chapters: [darkIdx, ch], purpose: "Dark night, climax, resolution" },
  ];

  for (let i = 1; i <= ch; i++) {
    const sceneType = beatOf(i);
    arch.chapters.push({
      number: i,
      act: actOf(sceneType),
      purpose: PURPOSE[sceneType],
      sceneType,
      wordTarget: config.wordsPerChapter,
      tensionLevel: calculateTension(i, ch, climaxIdx),
      mustHave: getMustHaves(sceneType),
      hookType: i < ch ? pickHookType(i) : null,
    });
  }

  arch.characterArcs = {
    protagonist: { start: "flawed", end: "transformed" },
    antagonist: { start: "threatening", end: "defeated/understood" },
  };
  arch.tensionMap = arch.chapters.map((c) => ({ chapter: c.number, tension: c.tensionLevel ?? 0 }));
  arch.readerJourney = {
    start: "curious, unfamiliar with world",
    milestones: [
      { after: Math.max(1, turnIdx - 1), state: "invested in protagonist" },
      { after: midIdx, state: "deeply concerned about outcome" },
      { after: darkIdx, state: "anxious, needs resolution" },
      { after: ch, state: "satisfied, emotionally moved" },
    ],
    end: "transformed by the experience",
  };
}

function buildNonFictionArchitecture(arch: Architecture, config: BookConfig) {
  const ch = config.chapters;
  arch.thesisProofMap = { mainThesis: config.thesis, proofCompleteness: 0 };

  const nfChapterTypes = [
    "introduction", "story", "evidence", "theory", "practice",
    "case_study", "evidence", "practice", "theory", "practice",
    "evidence", "counter", "synthesis", "action", "conclusion", "epilogue",
  ];

  const partSize = Math.ceil(ch / 3);
  arch.parts = [
    { name: "Foundation", chapters: [1, partSize], thesisPhase: "hook_and_context" },
    { name: "Deepening", chapters: [partSize + 1, partSize * 2], thesisPhase: "evidence_and_framework" },
    { name: "Transformation", chapters: [partSize * 2 + 1, ch], thesisPhase: "proof_and_action" },
  ];

  for (let i = 1; i <= ch; i++) {
    const chType = nfChapterTypes[(i - 1) % nfChapterTypes.length];
    arch.chapters.push({
      number: i,
      type: chType,
      purpose: getNFChapterPurpose(chType, i, ch),
      wordTarget: config.wordsPerChapter,
      mustHave: getNFMustHaves(chType),
    });
  }

  arch.evidencePlan = {
    totalSourcesNeeded: ch * 3,
    distribution: "even across chapters",
    hierarchy: ["meta_analysis", "randomized_trial", "cohort_study", "case_study", "expert_quote", "anecdote"],
  };
  arch.readerJourney = {
    start: "problem_unaware",
    milestones: [
      { after: Math.floor(ch * 0.2), state: "problem_felt" },
      { after: Math.floor(ch * 0.4), state: "framework_visible" },
      { after: Math.floor(ch * 0.6), state: "evidence_convinced" },
      { after: Math.floor(ch * 0.8), state: "ready_to_apply" },
      { after: ch, state: "transformed" },
    ],
    end: "practitioner",
  };
  arch.pedagogyPlan = {
    exercisesCount: Math.floor(ch * 0.6),
    progressiveDifficulty: true,
    includeWorkbook: ch >= 12,
    summaryEveryChapter: true,
  };
}

function buildHowToArchitecture(arch: Architecture, config: BookConfig) {
  const ch = config.chapters;
  arch.parts = [
    { name: "Getting Started", chapters: [1, Math.ceil(ch * 0.25)] },
    { name: "Core Skills", chapters: [Math.ceil(ch * 0.25) + 1, Math.ceil(ch * 0.6)] },
    { name: "Advanced Techniques", chapters: [Math.ceil(ch * 0.6) + 1, Math.ceil(ch * 0.85)] },
    { name: "Putting It All Together", chapters: [Math.ceil(ch * 0.85) + 1, ch] },
  ];
  for (let i = 1; i <= ch; i++) {
    const progress = i / ch;
    const difficulty = progress < 0.25 ? "beginner" : progress < 0.6 ? "intermediate" : progress < 0.85 ? "advanced" : "mastery";
    arch.chapters.push({
      number: i,
      type: i === 1 ? "introduction" : i === ch ? "conclusion" : "skill_step",
      difficulty,
      purpose: `Teach skill level: ${difficulty}`,
      wordTarget: config.wordsPerChapter,
      mustHave: ["materials_list", "step_by_step", "troubleshooting", "tips"],
      safetyNotes: difficulty !== "beginner",
    });
  }
}

function buildKidsArchitecture(arch: Architecture, config: BookConfig) {
  const ch = config.chapters;
  arch.parts = [{ name: "Full Story", chapters: [1, ch] }];
  for (let i = 1; i <= ch; i++) {
    arch.chapters.push({
      number: i,
      type: "page_spread",
      purpose: i === 1 ? "Introduce character & world" : i === ch ? "Satisfying resolution" : "Story progression",
      wordTarget: config.wordsPerChapter,
      illustrationNotes: true,
      readAloudQuality: true,
      mustHave: ["rhythm", "engagement", "illustration_direction"],
    });
  }
}

function buildCookbookArchitecture(arch: Architecture, config: BookConfig) {
  const ch = config.chapters;
  const categories = ["appetizers", "soups", "mains", "salads", "desserts", "breads", "sauces", "drinks", "special_occasion", "basics"];
  arch.parts = [{ name: "Complete Collection", chapters: [1, ch] }];
  for (let i = 1; i <= ch; i++) {
    const cat = categories[(i - 1) % categories.length];
    arch.chapters.push({
      number: i,
      type: "recipe_chapter",
      category: cat,
      purpose: `Chapter: ${cat.replace(/_/g, " ").replace(/\b\w/g, (s) => s.toUpperCase())}`,
      wordTarget: config.wordsPerChapter,
      recipesCount: 10, // deterministic (original used Math.random)
      mustHave: ["headnotes", "standardized_format", "chefs_tips", "photo_directions"],
    });
  }
}

function buildTextbookArchitecture(arch: Architecture, config: BookConfig) {
  const ch = config.chapters;
  arch.parts = [
    { name: "Foundations", chapters: [1, Math.ceil(ch * 0.3)] },
    { name: "Core Concepts", chapters: [Math.ceil(ch * 0.3) + 1, Math.ceil(ch * 0.7)] },
    { name: "Advanced Topics", chapters: [Math.ceil(ch * 0.7) + 1, ch] },
  ];
  for (let i = 1; i <= ch; i++) {
    arch.chapters.push({
      number: i,
      type: "lesson",
      purpose: `Lesson ${i}: Concept + Application`,
      wordTarget: config.wordsPerChapter,
      mustHave: ["learning_objectives", "explanation", "examples", "exercises", "review_questions", "summary"],
    });
  }
}

function buildMemoirArchitecture(arch: Architecture, config: BookConfig) {
  const ch = config.chapters;
  arch.parts = [
    { name: "Origins", chapters: [1, Math.ceil(ch * 0.3)] },
    { name: "Journey", chapters: [Math.ceil(ch * 0.3) + 1, Math.ceil(ch * 0.7)] },
    { name: "Transformation", chapters: [Math.ceil(ch * 0.7) + 1, ch] },
  ];
  for (let i = 1; i <= ch; i++) {
    arch.chapters.push({
      number: i,
      type: "memoir_episode",
      purpose:
        i === 1
          ? "Opening scene — drop reader into pivotal moment"
          : i === ch
          ? "Resolution — where I am now"
          : "Life episode with thematic resonance",
      wordTarget: config.wordsPerChapter,
      mustHave: ["sensory_detail", "emotional_truth", "reflection", "theme_connection"],
    });
  }
}

function buildPoetryArchitecture(arch: Architecture, config: BookConfig) {
  const ch = config.chapters;
  const sectionCount = Math.ceil(ch / 8);
  arch.parts = [];
  for (let s = 0; s < sectionCount; s++) {
    arch.parts.push({ name: `Section ${s + 1}`, chapters: [s * 8 + 1, Math.min((s + 1) * 8, ch)] });
  }
  for (let i = 1; i <= ch; i++) {
    arch.chapters.push({
      number: i,
      type: "poem",
      purpose: `Poem ${i}`,
      wordTarget: config.wordsPerChapter,
      mustHave: ["original_imagery", "intentional_line_breaks", "read_aloud_quality"],
    });
  }
}
