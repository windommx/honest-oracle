import { OracleInput, OracleResult, OracleTone } from "@/lib/honest-oracle/types";

function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function scoreTone(score: number): OracleTone {
  if (score >= 70) return "good";
  if (score >= 45) return "warn";
  return "danger";
}

const SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

const HOUSE_TITLES = [
  "ตัวตน",
  "ทรัพย์สิน",
  "การสื่อสาร",
  "บ้านและราก",
  "ความรัก/ความสร้างสรรค์",
  "งานประจำ/สุขภาพ",
  "คู่สัมพันธ์",
  "การเปลี่ยนผ่าน",
  "การเรียนรู้/การเดินทาง",
  "อาชีพ/ชื่อเสียง",
  "เครือข่าย/มิตรภาพ",
  "จิตใต้สำนึก/การพักฟื้น",
];

const HOUSE_KEYWORDS: string[][] = [
  ["identity", "agency", "boundaries"],
  ["money", "value", "stability"],
  ["learning", "voice", "siblings"],
  ["home", "family", "security"],
  ["joy", "romance", "craft"],
  ["discipline", "routine", "health"],
  ["partnership", "contract", "balance"],
  ["transformation", "debt", "healing"],
  ["meaning", "travel", "belief"],
  ["career", "status", "direction"],
  ["community", "influence", "friends"],
  ["rest", "intuition", "closure"],
];

const PLANETS = [
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto",
] as const;

function pick<T>(rnd: () => number, list: T[]): T {
  return list[Math.floor(rnd() * list.length)] as T;
}

function buildSignature(seedSource: string) {
  const h = fnv1a32(seedSource).toString(16).padStart(8, "0");
  return `HO-${h.slice(0, 4).toUpperCase()}-${h.slice(4).toUpperCase()}`;
}

function buildEventAnchors(timeline: OracleResult["timeline"]) {
  const sorted = [...timeline].sort((a, b) => b.score - a.score);
  const best = sorted.slice(0, 4).map((x) => ({ age: x.age, tone: x.tone, score: x.score }));
  const worst = sorted
    .slice(-4)
    .map((x) => ({ age: x.age, tone: x.tone, score: x.score }))
    .reverse();

  const turning: Array<{ age: number; tone: OracleTone; score: number }> = [];
  for (let i = 2; i < timeline.length - 2; i++) {
    const p = timeline[i - 1]!;
    const c = timeline[i]!;
    const n = timeline[i + 1]!;
    if ((c.score > p.score && c.score > n.score) || (c.score < p.score && c.score < n.score)) {
      turning.push({ age: c.age, tone: c.tone, score: c.score });
    }
  }

  return {
    best,
    worst,
    turning: turning.slice(0, 12),
  };
}

function generateTopicLines(params: {
  rnd: () => number;
  minLines: number;
  topicTitle: string;
  topicFocus: string[];
  identity: string;
  anchors: ReturnType<typeof buildEventAnchors>;
  dominantElement: string;
  strongestHouse: { house: number; title: string; score: number };
}) {
  const {
    rnd,
    minLines,
    topicTitle,
    topicFocus,
    identity,
    anchors,
    dominantElement,
    strongestHouse,
  } = params;

  const openers = [
    "ภาพที่เห็นชัดคือ",
    "สัญญาณเด่นในช่วงนี้คือ",
    "จุดที่ต้องจับตาเป็นพิเศษคือ",
    "รูปแบบที่เกิดซ้ำกับชีวิตคุณคือ",
    "แรงขับพื้นฐานที่พาคุณตัดสินใจคือ",
  ];
  const actions = [
    "ให้เริ่มด้วยการเขียนแผน 90 วันแบบลงเวลา",
    "ให้คุยกับคนที่เกี่ยวข้องแบบตรงประเด็นภายใน 7 วัน",
    "ให้แบ่งงานใหญ่เป็น sprint รายสัปดาห์",
    "ให้ยืนยันตัวเลขและทรัพยากรก่อน commit",
    "ให้ตรวจภาระงานที่ทำให้คุณหลุดโฟกัสแล้วตัดออกทันที",
  ];
  const outcomes = [
    "ผลที่ตามมาคือคุณจะคุมเกมได้ดีขึ้น",
    "ผลที่ตามมาคือความเสี่ยงจะลดลงอย่างเห็นภาพ",
    "ผลที่ตามมาคือความสัมพันธ์จะนิ่งขึ้นและสื่อสารง่ายขึ้น",
    "ผลที่ตามมาคือเงินและเวลาเริ่มกลับมาอยู่ในกรอบ",
    "ผลที่ตามมาคือคุณเห็นทางเลือกใหม่ที่เคยไม่ชัด",
  ];

  const sourceAges = [
    ...anchors.best.map((a) => a.age),
    ...anchors.worst.map((a) => a.age),
    ...anchors.turning.map((a) => a.age),
  ];
  const ages = sourceAges.length > 0 ? sourceAges : [18, 24, 30, 36, 42, 50, 60, 72];

  const lines: string[] = [];
  for (let i = 0; i < minLines; i++) {
    const age = ages[i % ages.length]!;
    const focus = topicFocus[i % topicFocus.length]!;
    const opener = pick(rnd, openers);
    const action = pick(rnd, actions);
    const outcome = pick(rnd, outcomes);
    lines.push(
      `บรรทัดที่ ${i + 1}: ${opener} ช่วงอายุ ${age} ปีของ ${identity} จะเด่นเรื่อง "${focus}" เชื่อมกับธาตุหลัก ${dominantElement} และภพที่แข็งแรงที่สุดคือภพ ${strongestHouse.house} (${strongestHouse.title}) คะแนน ${strongestHouse.score}/100; ${action} เพื่อรับมือหัวข้อ ${topicTitle}; ${outcome}.`
    );
  }
  return lines;
}

function generateActionPlanLines(params: {
  rnd: () => number;
  minLines: number;
  identity: string;
  dominantElement: string;
  strongestHouse: { house: number; title: string };
}) {
  const { rnd, minLines, identity, dominantElement, strongestHouse } = params;
  const timeboxes = ["วันนี้", "ภายใน 48 ชั่วโมง", "ภายใน 7 วัน", "ภายใน 14 วัน", "ภายใน 30 วัน"];
  const tasks = [
    "สรุปเป้าหมายหลัก 1 เป้าหมายและเป้ารอง 2 เป้าหมายแบบวัดผลได้",
    "ทำรายการความเสี่ยง 5 ข้อพร้อมวิธีลดผลกระทบ",
    "คุยกับคนสำคัญ 1 คนเพื่อ reset ความคาดหวังร่วมกัน",
    "จัดตาราง deep work 90 นาทีอย่างน้อยสัปดาห์ละ 4 ครั้ง",
    "ทำงบประมาณรายเดือนพร้อมเพดานค่าใช้จ่ายส่วนตัว",
    "กำหนดขอบเขตงานที่ไม่รับเพิ่มอย่างชัดเจน",
    "ตั้งระบบติดตามสุขภาพ นอน ออกกำลัง และความเครียด",
    "ทบทวนงานที่ไม่สอดคล้องเป้าหมายแล้วหยุดอย่างเป็นระบบ",
    "เตรียมแผนสำรอง A/B สำหรับเหตุการณ์ไม่คาดคิด",
    "บันทึกบทเรียนรายสัปดาห์ 3 ข้อเพื่อปรับพฤติกรรม",
  ];
  const why = [
    "เพื่อปิดช่องโหว่การตัดสินใจที่ใช้อารมณ์มากเกินไป",
    "เพื่อคุมความเสี่ยงก่อนขยายความเร็ว",
    "เพื่อให้การสื่อสารไม่คลาดเคลื่อนในจุดสำคัญ",
    "เพื่อให้ทรัพยากรเวลาและพลังงานไม่รั่ว",
    "เพื่อสร้างจังหวะเติบโตที่สม่ำเสมอและยั่งยืน",
  ];

  const lines: string[] = [];
  for (let i = 0; i < minLines; i++) {
    lines.push(
      `แผนปฏิบัติข้อ ${i + 1}: ${pick(rnd, timeboxes)} ให้ ${identity} ${pick(
        rnd,
        tasks
      )}; เหตุผล: ${pick(rnd, why)} โดยยึดโหมดธาตุ ${dominantElement} และแกนชีวิตภพ ${
        strongestHouse.house
      } (${strongestHouse.title}).`
    );
  }
  return lines;
}

export function generateOracleReading(input: OracleInput): OracleResult {
  const seedSource = [
    input.inputName.trim().toLowerCase(),
    input.birthDate.toISOString().slice(0, 10),
    (input.birthTime ?? "").trim(),
    (input.birthPlace ?? "").trim().toLowerCase(),
    (input.profileKey ?? "").trim().toLowerCase(),
  ].join("|");

  const seed = fnv1a32(seedSource);
  const rnd = mulberry32(seed);

  const elementRaw = {
    fire: rnd(),
    earth: rnd(),
    air: rnd(),
    water: rnd(),
  };
  const sum =
    elementRaw.fire + elementRaw.earth + elementRaw.air + elementRaw.water || 1;

  const elements = {
    fire: Math.round((elementRaw.fire / sum) * 100),
    earth: Math.round((elementRaw.earth / sum) * 100),
    air: Math.round((elementRaw.air / sum) * 100),
    water: Math.round((elementRaw.water / sum) * 100),
  };
  const adjust = 100 - (elements.fire + elements.earth + elements.air + elements.water);
  if (adjust !== 0) {
    const keys: Array<keyof typeof elements> = ["fire", "earth", "air", "water"];
    const k = keys[Math.floor(rnd() * keys.length)];
    elements[k] = clamp(elements[k] + adjust, 0, 100);
  }

  const houses = Array.from({ length: 12 }, (_, i) => {
    const score = Math.round(35 + rnd() * 65);
    return {
      house: i + 1,
      title: HOUSE_TITLES[i] ?? `House ${i + 1}`,
      score,
      keywords: HOUSE_KEYWORDS[i] ?? [],
    };
  });

  const planets = PLANETS.map((planet) => {
    const sign = SIGNS[Math.floor(rnd() * SIGNS.length)] ?? "Aries";
    const degree = Math.floor(rnd() * 30);
    const house = 1 + Math.floor(rnd() * 12);
    return { planet, sign, degree, house };
  });

  const base = Math.round(
    0.45 * (houses.reduce((a, h) => a + h.score, 0) / houses.length) +
      0.35 * (elements.fire + elements.earth + elements.air + elements.water) / 4 +
      0.2 * (40 + rnd() * 60)
  );

  const timeline = Array.from({ length: 100 }, (_, age) => {
    const wave =
      16 * Math.sin((age / 11) * Math.PI * 2) +
      10 * Math.sin((age / 27) * Math.PI * 2);
    const noise = (rnd() - 0.5) * 18;
    const score = Math.round(clamp(base + wave + noise, 0, 100));
    const tone = scoreTone(score);

    const title =
      tone === "good"
        ? "จังหวะเติบโต"
        : tone === "warn"
          ? "จังหวะทบทวน"
          : "จังหวะระวัง";

    const body =
      tone === "good"
        ? "เหมาะกับการขยับเป้าหมายทีละขั้น สร้างความต่อเนื่อง และขยายเครือข่าย"
        : tone === "warn"
          ? "เหมาะกับการจัดลำดับความสำคัญ ลดภาระที่ไม่จำเป็น และสื่อสารให้ชัด"
          : "เหมาะกับการรักษาวินัยพื้นฐาน ลดความเสี่ยง และขอความช่วยเหลือเมื่อจำเป็น";

    return { age, score, tone, title, body };
  });

  const points = timeline.map((t) => t.score);
  const min = Math.min(...points);
  const max = Math.max(...points);

  const overallScore = Math.round(clamp(base, 0, 100));
  const tone = scoreTone(overallScore);
  const headline =
    tone === "good"
      ? "ภาพรวมเอื้อต่อการเติบโตแบบยั่งยืน"
      : tone === "warn"
        ? "ภาพรวมต้องชนะด้วยระบบและความสม่ำเสมอ"
        : "ภาพรวมต้องจัดการความเสี่ยงก่อนความเร็ว";

  const dominantElement = (Object.entries(elements).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "fire") as "fire" | "earth" | "air" | "water";
  const strongestHouse = [...houses].sort((a, b) => b.score - a.score)[0] ?? {
    house: 1,
    title: "ตัวตน",
    score: 50,
    keywords: [],
  };
  const anchors = buildEventAnchors(timeline);
  const identity = input.inputName.trim() || "ผู้ใช้งาน";
  const signature = buildSignature(seedSource);

  const identityLines = generateTopicLines({
    rnd,
    minLines: 30,
    topicTitle: "ตัวตนและการตัดสินใจ",
    topicFocus: [
      "ความมั่นใจในบทบาทหลัก",
      "ขอบเขตส่วนตัวกับคนรอบตัว",
      "การรับมือแรงกดดันจากความคาดหวัง",
      "การตัดสินใจเมื่อข้อมูลไม่ครบ",
      "การรักษาวินัยในวันที่แรงตก",
      "การวางจุดยืนโดยไม่ปะทะเกินจำเป็น",
    ],
    identity,
    anchors,
    dominantElement,
    strongestHouse,
  });

  const careerLines = generateTopicLines({
    rnd,
    minLines: 30,
    topicTitle: "งาน การเงิน และการเติบโต",
    topicFocus: [
      "จังหวะเปลี่ยนบทบาทงาน",
      "การต่อรองผลตอบแทนและมูลค่าตัวเอง",
      "การสร้างรายได้หลายช่องทาง",
      "การจัดพอร์ตความเสี่ยงรายได้",
      "การเลือกโปรเจกต์ที่คุ้มแรง",
      "การวางเงินสดสำรองเพื่อรองรับเหตุฉุกเฉิน",
    ],
    identity,
    anchors,
    dominantElement,
    strongestHouse,
  });

  const relationshipLines = generateTopicLines({
    rnd,
    minLines: 30,
    topicTitle: "ความสัมพันธ์ ครอบครัว และเครือข่าย",
    topicFocus: [
      "การสื่อสารความต้องการที่แท้จริง",
      "การรักษาสมดุลงานกับคนสำคัญ",
      "การตั้งขอบเขตกับความสัมพันธ์ที่กินพลัง",
      "การขอความช่วยเหลืออย่างมีศักดิ์ศรี",
      "การซ่อมความไว้วางใจหลังความขัดแย้ง",
      "การสร้างเครือข่ายที่พาเติบโตระยะยาว",
    ],
    identity,
    anchors,
    dominantElement,
    strongestHouse,
  });

  const criticalEventLines = generateTopicLines({
    rnd,
    minLines: 30,
    topicTitle: "เหตุการณ์สำคัญและจุดเปลี่ยน",
    topicFocus: [
      "ช่วงต้องเลือกทางที่ไม่สามารถเอาทุกอย่างพร้อมกัน",
      "ช่วงที่ต้องตัดสินใจเรื่องงาน/เงินระดับใหญ่",
      "ช่วงที่ความสัมพันธ์สะเทือนและต้องคุยจริงจัง",
      "ช่วงที่ต้องย้ายบทบาทหรือย้ายที่อยู่",
      "ช่วงที่ต้องปิดโปรเจกต์เดิมเพื่อเปิดรอบใหม่",
      "ช่วงที่ต้องดูแลสุขภาพอย่างมีวินัยสูง",
    ],
    identity,
    anchors,
    dominantElement,
    strongestHouse,
  });

  const actionPlanLines = generateActionPlanLines({
    rnd,
    minLines: 40,
    identity,
    dominantElement,
    strongestHouse,
  });

  return {
    version: "2026-05-04",
    seed: seedSource,
    summary: {
      overallScore,
      tone,
      headline,
      note:
        "ผลลัพธ์นี้เป็นแบบจำลองเชิงโครงสร้างเพื่อช่วยสะท้อนแนวโน้ม ไม่ใช่คำทำนายหรือคำรับรองผลในชีวิตจริง",
    },
    elements,
    planets,
    houses,
    timeline,
    graph: { min, max, points },
    personalizedReport: {
      signature,
      topics: [
        { key: "identity", title: "ตัวตนและการตัดสินใจเชิงลึก", lines: identityLines },
        { key: "career", title: "งาน/การเงินเชิงลึก", lines: careerLines },
        { key: "relationship", title: "ความสัมพันธ์เชิงลึก", lines: relationshipLines },
        { key: "critical_events", title: "เหตุการณ์สำคัญที่ต้องจับตา", lines: criticalEventLines },
      ],
      actionPlan: {
        title: "แนวทางแก้ไขเฉพาะตัว (ทำได้จริงทีละขั้น)",
        lines: actionPlanLines,
      },
    },
  };
}
