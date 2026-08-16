// ╔══════════════════════════════════════════════════════════════════╗
// ║  ROUTER — อาการ → โมดูล. A deterministic symptom ladder.          ║
// ║                                                                    ║
// ║  Rush ships 61 modules. Until now the only way in was              ║
// ║  defaultGroupsFor(bookType) — routing by CATEGORY ("you are        ║
// ║  writing a novel, here is the fiction pack"). That answers a       ║
// ║  question nobody asks. What a writer actually says is a SYMPTOM:   ║
// ║  "บทที่ 7 มันแบน", "ตัวละครพูดเหมือนกันหมด", "อ่านแล้วรู้ว่า AI เขียน".  ║
// ║                                                                    ║
// ║  Pattern adopted from zhaoxuya520/reverse-skill (MIT), whose       ║
// ║  MASTER-ROUTING.md is an ordered keyword ladder R1..Rn with an     ║
// ║  R0 fallback and the rule "if route not matched → propose a new    ║
// ║  skill, do NOT force-fit." The security content is irrelevant      ║
// ║  here; the ROUTING SHAPE is the transferable part, and it happens  ║
// ║  to satisfy Rush's own contract — table-driven, first-match-wins,  ║
// ║  no model judgment, same input → same route, every run.           ║
// ║                                                                    ║
// ║  Three deliberate departures from the source, all in the same      ║
// ║  direction (make the decision auditable, not just fast):           ║
// ║   1. route() returns the MATCHED KEYWORDS. You can re-derive why   ║
// ║      it landed where it did instead of trusting the ladder.        ║
// ║   2. Competing rungs are RETURNED, not hidden. First match is      ║
// ║      primary; every other match is listed. A symptom description   ║
// ║      that hits four rungs is a fact about the manuscript, and      ║
// ║      swallowing three of them would be a silent truncation.        ║
// ║   3. runFirst prerequisites are DATA. Routing someone to CHAR_ARC  ║
// ║      when they have no outline wastes their time.                  ║
// ║                                                                    ║
// ║  NOT adopted, on purpose — see NON_GOALS at the bottom.            ║
// ╚══════════════════════════════════════════════════════════════════╝

import { MODULE_CATALOG } from "./modules";

export interface Rung {
  /** Stable id (R1, R2, …). Quotable in a bug report; never renumbered on insert. */
  id: string;
  /** The symptom in the writer's own words — Thai first, because they are. */
  th: string;
  en: string;
  /** Trigger terms. Thai matches as a substring (no word boundaries in Thai);
   *  ASCII matches on word boundaries so "art" never fires inside "heart". */
  keywords: string[];
  /** The one module to open. */
  primary: string;
  /** Modules that address the same symptom from another angle. */
  also: string[];
  /** Modules that should already exist — routing past a missing prerequisite
   *  produces confident output built on nothing. */
  runFirst?: string[];
  /** Why this symptom routes here. Auditable: disagree with the row, not the black box. */
  why: string;
}

/** The ladder. ORDER IS SEMANTIC: earlier rungs win the primary slot. Ordered by how
 *  early the symptom must be fixed — a book with no structure cannot be line-edited into
 *  one, so foundation rungs sit above polish rungs.
 *
 *  IDS ARE STABLE AND DO NOT TRACK POSITION. A rung added later keeps its next-free id
 *  and is inserted wherever it belongs (R21 sits first, below). Renumbering would be
 *  tidier to read and would silently invalidate every id anyone has quoted in a bug
 *  report or a note to themselves. Position is the semantics; the id is the handle. */
export const SYMPTOM_LADDER: Rung[] = [
  {
    id: "R21",
    th: "ตัน / คิดไม่ออก / นั่งมองหน้าจอเปล่า / ไอเดียซ้ำเดิม",
    en: "Blocked — out of ideas, or every idea is the same idea",
    keywords: ["ไอเดียตัน", "สมองตัน", "พล็อตตัน", "เขียนตัน", "สมองตื้อ", "คิดไม่ออก", "เขียนไม่ลง", "อะไรไม่ออก", "พล็อตไม่ออก", "มโนไม่ออก", "นึกภาพไม่ออก", "เขียนค้าง", "ดองต้นฉบับ", "เขียนแล้วลบ", "ต่อไม่ถูก", "ต้นชนปลาย", "กระดาษเปล่า", "ไม่รู้จะเขียน", "มุกซ้ำ", "พล็อตซ้ำ", "ไอเดียเดิม", "blank page", "creative block", "idea block", "can't start", "cant start", "dead end", "same idea", "uninspired", "stalled", "ไม่มีไอเดีย", "ไอเดียซ้ำ", "นึกไม่ออก", "เขียนไม่ออก", "มองหน้าจอ", "หมดมุก", "blocked", "writer's block", "writers block", "stuck", "out of ideas", "no ideas"],
    primary: "BRAINSTORM",
    also: ["CONFLICT_MAP", "GENRE_CORE", "STRUCTURE"],
    why:
      "Sits above R1 because being blocked is upstream of being unoutlined — you cannot plan " +
      "a book you cannot think about. Verbalized sampling spreads the options deliberately; " +
      "the repetitive first idea is usually the mode of the distribution, not the best one.",
  },
  {
    id: "R1",
    th: "ยังไม่มีโครง / ไม่รู้จะเริ่มยังไง / เขียนไปเรื่อย ๆ แล้วหลง",
    en: "No outline yet — writing blind",
    keywords: ["ไม่มีโครง", "ไม่รู้จะเริ่ม", "เริ่มยังไง", "วางโครง", "หลงทาง", "เขียนไปเรื่อย", "outline", "where to start", "no plot"],
    primary: "STRUCTURE",
    also: ["GENRE_CORE", "CONFLICT_MAP"],
    why: "Every other module assumes a spine to attach to. This is the only rung with no prerequisite.",
  },
  {
    id: "R2",
    th: "ชื่อ / สถานที่ / ไทม์ไลน์ ไม่ตรงกันข้ามบท — ลืมว่าตั้งไว้ว่าอะไร",
    en: "Names, places or timeline contradict across chapters",
    keywords: ["ไม่ตรงกัน", "ขัดกัน", "ขัดแย้ง", "สะกดไม่เหมือน", "ลืมว่าตั้ง", "ไทม์ไลน์", "timeline", "continuity", "contradict", "inconsistent"],
    primary: "WORLD_CODEX",
    also: ["NIS_PLOT", "SAGA_CONTINUITY"],
    why: "A contradiction is a canon problem, not a prose problem. Declare the canon first; the codex audit then counts the conflicts instead of guessing at them.",
  },
  {
    id: "R22",
    th: "เขียนมาถึงบทที่ 30 แล้วจำไม่ได้ว่าเกิดอะไรมาบ้าง",
    en: "Deep into the draft and losing track of what already happened",
    keywords: ["จำไม่ได้", "ลืมไปแล้วว่า", "เรื่องเก่า", "ย้อนไปอ่าน", "สรุปเรื่อง", "บทก่อนหน้า", "จำไม่ไหว", "จำชื่อไม่ได้", "จำรายละเอียด", "ใครเป็นใคร", "ไล่อ่าน", "กลับไปอ่าน", "ย้อนกลับไปดู", "ตอนก่อนหน้า", "สรุปเนื้อ", "สรุปย้อนหลัง", "ทวนเรื่อง", "ปะติดปะต่อ", "จับต้นชนปลาย", "ตัวละครเยอะ", "ลืมพล็อต", "recap", "lost track", "what happened", "too long to remember", "previously on", "story so far", "catch up", "keep track", "running summary", "cant remember", "can't remember"],
    primary: "RECAP",
    also: ["WORLD_CODEX", "SERIES_BIBLE"],
    why:
      "A carry-forward summary is the fix for a context window — the writer's or the model's. " +
      "Distinct from R2: nothing contradicts yet, the writer simply cannot hold it all.",
  },
  {
    id: "R3",
    th: "ตัวละครพูดเหมือนกันหมด / ปิดชื่อแล้วแยกไม่ออกว่าใครพูด",
    en: "All characters sound the same",
    keywords: ["พูดเหมือนกัน", "เสียงเหมือนกัน", "แยกไม่ออกว่าใครพูด", "ตัวละครไม่ต่าง", "same voice", "sound alike", "indistinguishable"],
    primary: "VOICE_SHEET",
    also: ["NIS_DIALOGUE", "DIALOGUE"],
    runFirst: ["STRUCTURE"],
    why: "Voice is assigned before it is polished. A voice sheet is the reference the dialogue pass edits against.",
  },
  {
    id: "R4",
    th: "ตัวละครไม่เปลี่ยน — จบเล่มแล้วยังเป็นคนเดิม",
    en: "Character does not change across the book",
    keywords: ["ไม่เปลี่ยน", "ไม่โต", "ไม่พัฒนา", "คนเดิม", "arc", "ไม่มีพัฒนาการ", "flat character", "no growth"],
    primary: "CHAR_ARC",
    also: ["PSYCH_ARC", "NIS_CHARACTER"],
    runFirst: ["STRUCTURE"],
    why: "An arc is a plotted sequence of changes keyed to beats — it is designed against the outline, not discovered in the draft.",
  },
  {
    id: "R5",
    th: "บทมันแบน / เนือย / อ่านแล้วเหมือนไม่มีอะไรเกิดขึ้น",
    en: "The chapter is flat — nothing seems to happen",
    keywords: ["แบน", "เนือย", "ไม่มีอะไรเกิดขึ้น", "จืด", "ไม่มีอะไร", "flat", "boring", "nothing happens", "dull"],
    primary: "SCENE",
    also: ["CONFLICT_MAP", "HOOK_CRAFT", "NIS_PACING"],
    why: "Flatness is usually a missing want/obstacle, not weak wording. Rebuild the scene unit before rewriting sentences.",
  },
  {
    id: "R6",
    th: "อ่านแล้วไม่อิน / ไม่รู้สึกอะไร / เหมือนดูอยู่ห่าง ๆ",
    en: "Reader stays outside — nothing lands emotionally",
    keywords: ["ไม่อิน", "ไม่รู้สึก", "ห่างเหิน", "อยู่ห่าง", "เข้าไม่ถึง", "ไม่ดึงดูด", "not immersed", "distant", "detached", "no emotion"],
    primary: "IMMERSION",
    also: ["SENSORY", "NIS_SHOW", "QUIET_SCENE"],
    why: "Distance is adjustable and measurable-adjacent: the psychic-distance ladder names which rung the prose sits on, and sensory density is a count Rush actually reports.",
  },
  {
    id: "R7",
    th: "บอกอารมณ์ตรง ๆ / 'เธอรู้สึกเศร้า' / telling ไม่ใช่ showing",
    en: "Emotions are named instead of shown",
    keywords: ["บอกอารมณ์", "telling", "showing", "show don't tell", "บอกความรู้สึก", "รู้สึกเศร้า", "อธิบายอารมณ์"],
    primary: "NIS_SHOW",
    also: ["SENSORY", "IMMERSION"],
    why: "Rush counts filter verbs and named emotions per 100 words, so this symptom has a direct Tier-1 readout — fix it against the count, not against a vibe.",
  },
  {
    id: "R8",
    th: "จบบทแล้ววางได้ — คนอ่านไม่กดอ่านตอนต่อไป",
    en: "Chapters end soft; readers put the book down",
    keywords: ["จบบท", "วางได้", "ไม่อ่านต่อ", "ปิดบท", "cliffhanger", "คลิฟ", "hook", "chapter ending", "put it down"],
    primary: "HOOK_CRAFT",
    also: ["SCENE", "NIS_PACING"],
    why: "Where a chapter cuts and what question it leaves open are both countable facts about the text. (What a reader will DO next is not — see REFUSED_CONSTRUCTS.)",
  },
  {
    id: "R9",
    th: "เรื่องช้า / กลางเรื่องหย่อน / เร่งตอนจบ",
    en: "Pacing sags in the middle or rushes the end",
    keywords: ["ช้าไป", "ช้ามาก", "เรื่องช้า", "ดำเนินช้า", "หย่อน", "อืด", "กลางเรื่อง", "เร่ง", "จังหวะ", "pacing", "saggy middle", "rushed ending", "drags"],
    primary: "NIS_PACING",
    also: ["STRUCTURE", "CUT_PASS"],
    runFirst: ["STRUCTURE"],
    why: "Pacing is judged per act against the book's own measured averages, which requires knowing where the acts are.",
  },
  {
    id: "R10",
    th: "ปูไว้แล้วไม่เก็บ / เก็บโดยไม่เคยปู",
    en: "Setups never pay off, or payoffs arrive unplanted",
    keywords: ["ปูแล้วไม่เก็บ", "ไม่เคยปู", "ไม่เก็บ", "เก็บปม", "ปมค้าง", "ปมที่ปู", "foreshadow", "payoff", "setup", "ค้างคา", "loose end", "unresolved"],
    primary: "NIS_FORESHADOW",
    also: ["WORLD_CODEX", "NIS_PLOT"],
    why: "Rush already tracks threads that are introduced and then never traced again — this rung points at that existing audit.",
  },
  {
    id: "R23",
    th: "แก่นเรื่องหลุด / ลืมว่าจะพูดเรื่องอะไร / motif หายกลางเล่ม",
    en: "The theme drifts — motifs appear early then vanish",
    // "สาร" (message) was tried and removed: it is a substring of สารคดี (nonfiction),
    // สารบัญ, สารพัด. Short Thai fragments buy robustness against particle insertion but
    // cost precision — a fragment that lives inside common unrelated words must go.
    keywords: ["แก่นเรื่อง", "แก่นหลุด", "แกนเรื่อง", "ไม่มีแก่น", "ธีม", "จะสื่ออะไร", "หลงประเด็น", "หลุดประเด็น", "ไม่มีประเด็น", "คติสอนใจ", "สั่งสอนคนอ่าน", "เล่าไปทำไม", "โผล่ครั้งเดียว", "จบแล้วไม่ได้อะไร", "motif", "theme", "themes", "thematic", "leitmotif", "symbol", "symbolism", "controlling idea", "moral of the story", "preachy", "didactic", "สัญลักษณ์", "จะพูดเรื่องอะไร", "หายกลางเล่ม"],
    primary: "NIS_THEME",
    also: ["NIS_FORESHADOW", "WORLD_CODEX"],
    why:
      "Rush counts theme-term occurrences per chapter, so 'the motif disappears after chapter 9' " +
      "is a distribution you can look at — not a feeling. The judgment of whether it MATTERS " +
      "stays with the writer; the engine only shows where the term went quiet.",
  },
  {
    id: "R11",
    th: "POV สลับมั่ว / เข้าหัวหลายคนในฉากเดียว",
    en: "POV slips — head-hopping inside one scene",
    keywords: ["pov", "มุมมอง", "สลับมุมมอง", "head-hop", "head hopping", "เข้าหัว", "สรรพนามสับสน", "point of view"],
    primary: "NIS_POV",
    also: ["IMMERSION"],
    why: "A POV break is locatable in the text; it is a boundary violation, not a matter of taste.",
  },
  {
    id: "R12",
    th: "บทสนทนาน่าเบื่อ / พูดวนไปวนมา / ตัวละครอธิบายให้คนอ่านฟัง",
    en: "Dialogue is circular or turns into exposition",
    keywords: ["บทสนทนา", "บทพูด", "พูดวน", "อธิบายให้คนอ่าน", "exposition", "as you know", "on the nose", "dialogue"],
    primary: "NIS_DIALOGUE",
    also: ["DIALOGUE", "VOICE_SHEET"],
    why: "Rush counts dialogue ratio and repeated-line fatigue; the module works against those counts.",
  },
  {
    id: "R13",
    th: "อ่านแล้วรู้เลยว่า AI เขียน / ภาษาเรียบเป็นแม่พิมพ์ / คลิเช",
    en: "It reads as machine-written — smooth, safe, cliché",
    // Thai keywords are stored as the SHORTEST STABLE FRAGMENT, never as a full phrase:
    // writers insert particles freely ("รู้เลยว่า", "รู้สึกเลยว่า"), so "รู้ว่า ai" misses
    // what "ai เขียน" catches. Fragments keep the match re-derivable by eye; fuzzy
    // matching would not.
    keywords: ["ai เขียน", "aiเขียน", "เอไอเขียน", "ภาษาแข็ง", "ภาษาเรียบ", "แม่พิมพ์", "คลิเช", "เรียบเกิน", "ปลอดภัยเกิน", "ai slop", "sounds like ai", "generic", "cliche", "cliché"],
    primary: "ANTI_SLOP",
    also: ["ANTI_SAFE", "VOICE_FP", "LINE_EDIT"],
    why: "Rush matches a fixed cliché lexicon, so the hits are re-derivable line by line. The score for 'is this AI-written' is refused — the LIST of hits is not.",
  },
  {
    id: "R14",
    th: "ยาวเกิน / เยิ่นเย้อ / ตัดเองไม่ลง",
    en: "Overwritten — cannot bring myself to cut",
    keywords: ["ยาวเกิน", "เยิ่นเย้อ", "ตัดไม่ลง", "ตัดเองไม่ลง", "ตัดทิ้งไม่ลง", "ฟุ่มเฟือย", "น้ำเยอะ", "wordy", "bloated", "too long", "cut", "trim"],
    primary: "CUT_PASS",
    also: ["LINE_EDIT", "READABILITY"],
    why: "A stated reduction target turns cutting into a mechanical pass instead of a series of individual heartbreaks.",
  },
  {
    id: "R15",
    th: "ภาษาไทยผิดระดับ / ราชาศัพท์ / คำทับศัพท์สะกดไม่นิ่ง",
    en: "Thai register or transliteration is inconsistent",
    keywords: ["ราชาศัพท์", "ระดับภาษา", "ทับศัพท์", "สะกด", "ภาษาไทยผิด", "คำสุภาพ", "thai register", "transliteration"],
    primary: "THAI_QA",
    also: ["THAI_SOUND", "LINE_EDIT"],
    why: "Register and transliteration are convention-checkable against a declared standard, unlike 'good Thai'.",
  },
  {
    id: "R16",
    th: "อยากให้ตัวละครพูดภาษาถิ่น — อีสาน / คำเมือง / ปักษ์ใต้",
    en: "Dialogue needs a regional Thai voice",
    keywords: ["อีสาน", "คำเมือง", "ภาษาเหนือ", "ปักษ์ใต้", "ภาษาใต้", "ภาษาถิ่น", "isan", "lanna", "dialect"],
    primary: "DIALECT_ISAN",
    also: ["DIALECT_NORTH", "DIALECT_SOUTH", "VOICE_SHEET"],
    why: "Primary is Isan only because the ladder must name one; the ALSO row carries the other two and the writer picks by region. This rung is a menu, not a verdict.",
  },
  {
    id: "R17",
    th: "นิยายวิทยาศาสตร์ — อยากให้ฟิสิกส์ไม่หลุด",
    en: "Sci-fi premise needs to survive physics",
    keywords: ["ไซไฟ", "วิทยาศาสตร์", "อวกาศ", "ยานอวกาศ", "ฟิสิกส์", "sci-fi", "scifi", "science fiction", "spaceship", "physics", "hard sf"],
    primary: "HARD_SF",
    also: ["WORLD_CODEX", "GENRE_CORE"],
    why: "Seven checkable constraints, each mined for the scene it forces — constraint becomes drama instead of homework.",
  },
  {
    id: "R18",
    th: "หลายเล่ม / หลายซีซั่น / ภาคต่อ — กลัวหลุดข้ามเล่ม",
    en: "Multi-book or multi-season continuity",
    keywords: ["หลายเล่ม", "ภาคต่อ", "ซีซั่น", "ซีรีส์", "ข้ามเล่ม", "saga", "series", "sequel", "season", "multi-book"],
    primary: "SAGA_CONTINUITY",
    also: ["SAGA_ARCHITECT", "SERIES_BIBLE", "WORLD_CODEX"],
    runFirst: ["WORLD_CODEX"],
    why: "Cross-book tracking needs a per-book canon to compare; analyzeSaga consumes an ordered series of codices.",
  },
  {
    id: "R19",
    th: "ข้อมูล / อ้างอิงไม่แน่น — กลัวเขียนผิดข้อเท็จจริง (สารคดี)",
    en: "Nonfiction claims are not sourced",
    keywords: ["อ้างอิง", "ข้อเท็จจริง", "แหล่งข้อมูล", "สารคดี", "งานวิจัย", "fact check", "citation", "source", "nonfiction", "evidence"],
    primary: "FACT_CHECK",
    also: ["EVIDENCE", "ARG_MAP"],
    why: "Claim-by-claim sourcing, plus the replication check for findings that circulate after failing to replicate.",
  },
  {
    id: "R24",
    th: "เขียนหนังสือสอน/how-to แต่คนอ่านแล้วทำตามไม่ได้",
    en: "Instructional book that readers cannot actually follow",
    keywords: ["สอน", "how-to", "howto", "ฮาวทู", "ทำตามไม่ได้", "ทำตามไม่ถูก", "ทำตามยาก", "แต่ทำไม่ได้", "แล้วทำไม่ได้", "ทำจริงไม่ได้", "ทำไม่เป็น", "อ่านแล้วงง", "ต้องทำอะไรต่อ", "ขั้นตอนไม่ชัด", "ไม่มีขั้นตอน", "ข้ามขั้นตอน", "ไม่มีตัวอย่าง", "มีแต่ทฤษฎี", "นามธรรมเกิน", "นำไปใช้ไม่ได้", "ไม่เข้าใจ", "คู่มือ", "อธิบายไม่ชัด", "แบบฝึกหัด", "teach", "tutorial", "instructional", "cannot follow"],
    primary: "PEDAGOGY",
    also: ["CASE_STUDY", "READABILITY", "ARG_MAP"],
    why:
      "Instructional failure is structural: no stated objective, no worked example, no retrieval " +
      "practice. Those are present-or-absent facts about the chapter, checkable one by one.",
  },
  {
    id: "R25",
    th: "เขียนเสร็จแล้ว กำลังจะส่งพิมพ์ — ต้องตรวจอะไรบ้างก่อน",
    en: "Manuscript finished — what must be checked before publishing",
    // "เขียนเสร็จแล้ว" was tried and removed: it is equally true of R20 (finished, now
    // sell it) and this rung sits higher, so it stole every marketing route. The signal
    // that actually separates them is the CHECKING intent, not the finishing.
    keywords: ["ก่อนส่งพิมพ์", "ก่อนตีพิมพ์", "จะพิมพ์", "ตรวจก่อน", "เช็คก่อน", "ตรวจครั้งสุดท้าย", "ตรวจอะไรบ้าง", "ตรวจทาน", "พิสูจน์อักษร", "ตรวจปรู๊ฟ", "ตรวจคำผิด", "ส่งโรงพิมพ์", "จัดรูปเล่ม", "สารบัญ", "หน้าลิขสิทธิ์", "หน้าปกใน", "เช็กลิสต์", "เช็คลิสต์", "ตกหล่น", "pre-publish", "final check", "checklist", "before publishing", "ready to publish"],
    primary: "QUALITY_GATE",
    also: ["NIS_PLOT", "WORLD_CODEX", "ANTI_SLOP", "CUT_PASS"],
    why:
      "A pass/fail gate over checks that are each countable. It reports which checks failed and " +
      "why — never a readiness score, because 'is this book good enough' is not a number.",
  },
  {
    id: "R26",
    th: "จะส่งสำนักพิมพ์ / หาบรรณาธิการ / เขียนจดหมายเสนอต้นฉบับ",
    en: "Submitting to a publisher or agent",
    keywords: ["สำนักพิมพ์", "สนพ", "บรรณาธิการ", "เสนอต้นฉบับ", "ส่งต้นฉบับ", "รับต้นฉบับ", "รับพิจารณา", "จดหมายเสนอ", "เรื่องย่อส่งสนพ", "เอเจนต์", "ส่งประกวด", "ค่าลิขสิทธิ์", "ประวัตินักเขียน", "query letter", "cover letter", "query letter", "agent", "publisher", "synopsis", "submission"],
    primary: "SUBMISSION",
    also: ["BLURB", "TITLE"],
    why:
      "A query pack is a different artifact from retail copy: it addresses one professional reader, " +
      "not a browsing shopper. R20 covers the shop listing; this covers the pitch.",
  },
  {
    id: "R20",
    th: "เขียนเสร็จแล้วแต่ขายไม่ออก / ชื่อเรื่อง / ปก / เรื่องย่อ",
    en: "Finished but not selling — title, blurb, cover, metadata",
    keywords: ["ชื่อเรื่อง", "เรื่องย่อ", "หน้าปก", "ปกหนังสือ", "ออกแบบปก", "ขายไม่ออก", "การตลาด", "คีย์เวิร์ด", "title", "blurb", "cover", "kdp", "metadata", "marketing"],
    primary: "BLURB",
    also: ["TITLE", "KDP_META", "COVER_ART"],
    why: "Listing craft is separable from manuscript craft. Rush reports what the metadata contains — never a projected sales rank.",
  },
];

/** The R0 fallback, named so it can be quoted like any other rung. */
export const R0_ID = "R0";

export interface RouteHit {
  rung: Rung;
  /** Exactly which keywords fired — the audit trail. Deduped, in ladder order. */
  matched: string[];
}

export interface RouteResult {
  /** First matching rung, or null when nothing matched (R0). */
  primary: RouteHit | null;
  /** Every OTHER rung that also matched, in ladder order. Never silently dropped. */
  secondary: RouteHit[];
  /** Modules to open, primary first, deduped: primary.primary → primary.also → secondary primaries. */
  modules: string[];
  /** Prerequisites gathered from every hit rung, deduped, minus modules already routed to. */
  runFirst: string[];
  /** R0 only: what to do instead of accepting a wrong answer. */
  noMatch: string | null;
}

const ASCII_ONLY = /^[\x20-\x7e]+$/;

/** Does this keyword occur in the normalized haystack?
 *  Thai has no word boundaries, so Thai terms match as substrings. ASCII terms match on
 *  word boundaries so short words never fire inside longer ones. */
function hits(haystack: string, keyword: string): boolean {
  if (ASCII_ONLY.test(keyword)) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack);
  }
  return haystack.includes(keyword);
}

/** Lowercase, collapse whitespace. Deliberately does NOT strip Thai tone marks:
 *  that would need a normalizer whose choices we would then have to disclose, and the
 *  ladder is meant to be re-derivable by eye. */
function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Route a writer's own description of the problem to modules.
 *
 * Deterministic and total: same string → same result, every run, no clock, no randomness,
 * no model call. When nothing matches it returns R0 with a proposal — it does NOT hand
 * back the nearest rung. A confidently wrong route costs more than an admitted miss.
 */
export function route(symptom: string): RouteResult {
  const hay = normalize(symptom);
  const all: RouteHit[] = [];

  for (const rung of SYMPTOM_LADDER) {
    const matched: string[] = [];
    for (const k of rung.keywords) {
      if (hits(hay, normalize(k))) matched.push(k);
    }
    if (matched.length > 0) all.push({ rung, matched });
  }

  if (all.length === 0) {
    return {
      primary: null,
      secondary: [],
      modules: [],
      runFirst: [],
      noMatch:
        "ไม่เข้าเงื่อนไขข้อไหนในบันได (R0) — ระบบจะไม่เดาโมดูลที่ใกล้เคียงให้. " +
        "บอกอาการเป็นสิ่งที่คุณสังเกตเห็นในต้นฉบับ (เช่น 'จบบทแล้ววางได้', 'ชื่อเมืองสะกดไม่เหมือนกัน') " +
        "หรือเปิด MODULE_CATALOG ดูเองทั้ง 61 ตัว. ถ้าอาการนี้เกิดซ้ำ ๆ แปลว่าบันไดขาดขั้น — ควรเพิ่มขั้นใหม่ ไม่ใช่ยัดให้เข้าขั้นเดิม.",
    };
  }

  const [primary, ...secondary] = all;
  const modules: string[] = [];
  const push = (id: string) => { if (!modules.includes(id)) modules.push(id); };
  push(primary.rung.primary);
  primary.rung.also.forEach(push);
  secondary.forEach((h) => push(h.rung.primary));

  const runFirst: string[] = [];
  for (const h of all) {
    for (const p of h.rung.runFirst ?? []) {
      if (!runFirst.includes(p) && !modules.includes(p)) runFirst.push(p);
    }
  }

  return { primary, secondary, modules, runFirst, noMatch: null };
}

/** Every module id the ladder can emit — used by the integrity test to prove no rung
 *  points at a module that does not exist. */
export function routableModuleIds(): string[] {
  const out: string[] = [];
  const add = (id: string) => { if (!out.includes(id)) out.push(id); };
  for (const r of SYMPTOM_LADDER) {
    add(r.primary);
    r.also.forEach(add);
    (r.runFirst ?? []).forEach(add);
  }
  return out.sort();
}

/** Which of the 61 modules no rung reaches. Not a defect — plenty of modules answer a
 *  request ("write me a scene") rather than a symptom ("this scene is flat"). Exposed so
 *  the gap is visible instead of assumed away. */
export function unroutedModuleIds(): string[] {
  const reachable = new Set(routableModuleIds());
  return MODULE_CATALOG.map((m) => m.id).filter((id) => !reachable.has(id)).sort();
}

/** Render a route as text for the CLI / UI. Shows the matched keywords, because a router
 *  you cannot audit is just a slower guess. */
export function formatRoute(symptom: string): string {
  const r = route(symptom);
  const name = (id: string) => MODULE_CATALOG.find((m) => m.id === id)?.name ?? id;

  if (!r.primary) {
    return `## เราต์: ${R0_ID} — ไม่พบขั้นที่ตรง\n\n${r.noMatch}`;
  }

  const lines: string[] = [];
  lines.push(`## เราต์: ${r.primary.rung.id} — ${r.primary.rung.th}`);
  lines.push("");
  lines.push(`**เปิดตัวนี้ก่อน:** \`${r.primary.rung.primary}\` — ${name(r.primary.rung.primary)}`);
  lines.push(`**ทำไม:** ${r.primary.rung.why}`);
  lines.push("");
  lines.push(`**คำที่ทำให้เข้าขั้นนี้:** ${r.primary.matched.join(", ")}  ← ตรวจย้อนได้เอง`);

  if (r.primary.rung.also.length > 0) {
    lines.push("");
    lines.push(`**มุมอื่นของอาการเดียวกัน:** ${r.primary.rung.also.map((a) => `\`${a}\` (${name(a)})`).join(" · ")}`);
  }
  if (r.runFirst.length > 0) {
    lines.push("");
    lines.push(`**ต้องมีก่อน:** ${r.runFirst.map((p) => `\`${p}\` (${name(p)})`).join(" · ")} — ข้ามขั้นนี้แล้วผลลัพธ์จะมั่นใจบนความว่างเปล่า`);
  }
  if (r.secondary.length > 0) {
    lines.push("");
    lines.push(`**ขั้นอื่นที่ก็เข้าเงื่อนไขด้วย** (ไม่ตัดทิ้ง — คุณเลือกเอง):`);
    for (const s of r.secondary) {
      lines.push(`- ${s.rung.id} ${s.rung.th} → \`${s.rung.primary}\` (จาก: ${s.matched.join(", ")})`);
    }
  }
  return lines.join("\n");
}

// ── Deliberately NOT adopted from the source pack ───────────────────────────────
/** Recorded so the omissions are decisions, not oversights. */
export const NON_GOALS: { what: string; why: string }[] = [
  {
    what: "Self-evolving knowledge base / field journal",
    why:
      "The source advertises it; fetching the repo shows the directory exists with no documented " +
      "recording or reuse mechanism — a stated goal, not a shipped feature, so there is nothing to " +
      "copy. It also conflicts head-on with Rush's contract: a router that learns returns different " +
      "routes for the same sentence over time, which is exactly the non-reproducibility we refuse " +
      "in LLM scoring. If Rush ever learns from usage, it will be a versioned ladder edit in git " +
      "that you can diff — not a silent mutation.",
  },
  {
    what: "AI Bootstrap — installing toolchains and MCP servers on demand",
    why:
      "Coherent for a pentest pack that needs IDA or Frida present. Rush emits text and makes zero " +
      "network calls; there is no toolchain to bootstrap. Adding one would break the property that " +
      "makes the engine auditable.",
  },
  {
    what: "Ops contracts (scope gate, evidence chain, case timeline)",
    why:
      "Built for authorized-testing accountability — proving what you touched and when. A novel " +
      "manuscript has no scope boundary to breach. Rush's equivalent already exists and is narrower: " +
      "declared canon + a deterministic audit you can re-run.",
  },
  {
    what: "The star/fork/trending badges",
    why:
      "Popularity is not a design argument. (Noted also because the screenshot and the search index " +
      "disagreed on the star count — badge numbers are cached artifacts, not verified facts.)",
  },
];
