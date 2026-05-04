export const KALAIGANI: Record<string, string[]> = {
  sunday: ["ศ", "ษ", "ส", "ห", "ฬ", "ฮ"],
  monday: ["อ", "ะ", "ั", "า", "ิ", "ี", "ึ", "ื", "ุ", "ู", "เ", "แ", "โ", "ใ", "ไ"],
  tuesday: ["ก", "ข", "ค", "ฆ", "ง"],
  wednesday_day: ["จ", "ฉ", "ช", "ซ", "ฌ", "ญ"],
  wednesday_night: ["บ", "ป", "ผ", "ฝ", "พ", "ฟ", "ภ", "ม"],
  thursday: ["ด", "ต", "ถ", "ท", "ธ", "น"],
  friday: ["ย", "ร", "ล", "ว"],
  saturday: ["ฎ", "ฏ", "ฐ", "ฑ", "ฒ", "ณ"],
};

export const STROKE_VALUES: Record<string, number> = {
  ก: 1, ข: 2, ค: 3, ฆ: 4, ง: 5,
  จ: 1, ฉ: 2, ช: 3, ซ: 4, ฌ: 5, ญ: 6,
  ฎ: 7, ฏ: 8, ฐ: 9, ฑ: 1, ฒ: 2, ณ: 3,
  ด: 4, ต: 5, ถ: 6, ท: 7, ธ: 8, น: 9,
  บ: 1, ป: 2, ผ: 3, ฝ: 4, พ: 5, ฟ: 6, ภ: 7, ม: 8,
  ย: 1, ร: 2, ล: 3, ว: 4, ศ: 5, ษ: 6, ส: 7, ห: 8, ฬ: 9, ฮ: 9, อ: 0,
};

export const WARAKKASA: Record<string, string[]> = {
  bari: ["ย", "ร", "ล", "ว"],
  ayu: ["จ", "ฉ", "ช", "ซ", "ฌ", "ญ"],
  decha: ["ก", "ข", "ค", "ฆ", "ง"],
  si: ["ศ", "ษ", "ส", "ห", "ฬ", "ฮ"],
  mula: ["ด", "ต", "ถ", "ท", "ธ", "น"],
  utsaha: ["บ", "ป", "ผ", "ฝ", "พ", "ฟ", "ภ", "ม"],
  montri: ["ด", "ต", "ถ", "ท", "ธ", "น"],
};

export const PHONETIC_TYPES = {
  plosive: ["ก", "ข", "ค", "ฆ", "ง", "จ", "ฉ", "ช", "ซ", "ฌ", "ญ", "ด", "ต", "ถ", "ท", "ธ", "บ", "ป", "ผ", "พ", "ฟ", "ภ"],
  nasal: ["ม", "ณ", "ญ", "ง", "น"],
  liquid: ["ร", "ล", "ห", "ฬ"],
  fricative: ["ศ", "ษ", "ส", "ห", "ฮ"],
};

export const LUCKY_NUMBERS = [14, 19, 24, 36, 41, 45, 50, 51, 54, 55, 56, 59, 65];

export type DayOfWeek = "sunday" | "monday" | "tuesday" | "wednesday_day" | "wednesday_night" | "thursday" | "friday" | "saturday";

export type Gender = "male" | "female" | "neutral";

export interface AnalysisResult {
  totalScore: number;
  kalaiganiScore: number;
  numerologyScore: number;
  taksaScore: number;
  phoneticScore: number;
  elementScore: number;
  details: {
    kalaigani: {
      violations: string[];
      forbiddenLetters: string[];
    };
    numerology: {
      totalStrokes: number;
      isLucky: boolean;
    };
    taksa: {
      covered: string[];
      missing: string[];
    };
    phonetic: {
      syllables: number;
      vowelComplexity: number;
      length: number;
    };
    element: {
      elements: string[];
      hasConflict: boolean;
    };
  };
}

export interface CorporateAnalysisResult {
  cai: number;
  s1: number;
  s2: number;
  s3: number;
  elementBalance: number;
  taksaMatrix: {
    bari: number;
    ayu: number;
    decha: number;
    si: number;
    mula: number;
    utsaha: number;
    montri: number;
  };
  phoneticPricing: string;
  memorabilityScore: number;
  resonanceTriangle: {
    founder: number;
    industry: number;
    audience: number;
    isBalanced: boolean;
  };
  warnings: string[];
  recommendations: string[];
}

export interface ChildNamingResult {
  recommendedLetters: string[];
  avoidedLetters: string[];
  targetNumber: number;
  ayatana: number;
  warakkasaEmphasis: string[];
  suggestedNames: Array<{
    name: string;
    meaning: string;
    score: number;
    strokes: number;
  }>;
}

export interface RenameAnalysisResult {
  currentNameAnalysis: AnalysisResult;
  problemAreas: string[];
  targetGoals: string[];
  recommendedWarakkasa: string[];
  targetNumber: number;
  targetAyatana: number;
  suggestedNewNames: Array<{
    name: string;
    meaning: string;
    score: number;
    transition: string;
  }>;
  softTransitionTips: string[];
}

function getForbiddenLetters(day: DayOfWeek): string[] {
  const forbidden: string[] = [];
  
  Object.entries(KALAIGANI).forEach(([key, letters]) => {
    if (key !== day) {
      forbidden.push(...letters);
    }
  });
  
  return [...new Set(forbidden)];
}

export function checkKalaigani(name: string, day: DayOfWeek): { violations: string[]; forbiddenLetters: string[] } {
  const forbiddenLetters = getForbiddenLetters(day);
  const nameChars = name.split("");
  const violations: string[] = [];
  const foundForbidden: string[] = [];
  
  nameChars.forEach((char, index) => {
    const isEdge = index === 0 || index === nameChars.length - 1;
    if (forbiddenLetters.includes(char)) {
      violations.push(char + (isEdge ? " (ตำแหน่งขอบ)" : ""));
      foundForbidden.push(char);
    }
  });
  
  return {
    violations: [...new Set(foundForbidden)],
    forbiddenLetters: [...new Set(foundForbidden)],
  };
}

export function calculateNumerology(name: string): { totalStrokes: number; isLucky: boolean } {
  let total = 0;
  const chars = name.split("");
  
  chars.forEach((char) => {
    const value = STROKE_VALUES[char];
    if (value !== undefined) {
      total += value;
    }
  });
  
  while (total > 9 && total !== 11 && total !== 22 && total !== 33) {
    total = String(total).split("").reduce((sum, digit) => sum + parseInt(digit), 0);
  }
  
  const finalValue = total;
  const isLucky = LUCKY_NUMBERS.includes(finalValue) || 
                  name.split("").reduce((sum, c) => sum + (STROKE_VALUES[c] || 0), 0) % 9 === 0;
  
  return { totalStrokes: finalValue, isLucky };
}

export function checkTaksa(name: string): { covered: string[]; missing: string[] } {
  const nameChars = name.split("");
  const covered: string[] = [];
  
  Object.entries(WARAKKASA).forEach(([key, letters]) => {
    const found = nameChars.some(char => letters.includes(char));
    if (found) {
      covered.push(key);
    }
  });
  
  const allGroups = Object.keys(WARAKKASA);
  const missing = allGroups.filter(g => !covered.includes(g));
  
  return { covered, missing };
}

export function analyzePhonetic(name: string): { syllables: number; vowelComplexity: number; length: number } {
  const vowels = ["ะ", "ั", "า", "ิ", "ี", "ึ", "ื", "ุ", "ู", "เ", "แ", "โ", "ใ", "ไ", "็"];
  let syllables = 0;
  let vowelCount = 0;
  const chars = name.split("");
  
  let prevWasVowel = false;
  chars.forEach((char) => {
    const isVowel = vowels.includes(char);
    if (isVowel) vowelCount++;
    if (isVowel && !prevWasVowel) syllables++;
    prevWasVowel = isVowel;
  });
  
  syllables = Math.max(1, syllables);
  
  const vowelComplexity = vowelCount > 3 ? 2 : vowelCount > 1 ? 1 : 0;
  
  return {
    syllables,
    vowelComplexity,
    length: chars.length,
  };
}

export function analyzeElement(name: string): { elements: string[]; hasConflict: boolean } {
  const fire = ["ก", "ข", "ค", "ฆ", "ง"];
  const earth = ["จ", "ฉ", "ช", "ซ", "ฌ", "ญ", "ฎ", "ฏ", "ฐ", "ฑ", "ฒ", "ณ"];
  const water = ["ด", "ต", "ถ", "ท", "ธ", "น"];
  const wind = ["บ", "ป", "ผ", "ฝ", "พ", "ฟ", "ภ", "ม"];
  const tree = ["ย", "ร", "ล", "ว", "ศ", "ษ", "ส", "ห", "ฬ", "ฮ"];
  
  const chars = name.split("");
  const elements: string[] = [];
  
  if (chars.some(c => fire.includes(c))) elements.push("ไฟ");
  if (chars.some(c => earth.includes(c))) elements.push("ดิน");
  if (chars.some(c => water.includes(c))) elements.push("น้ำ");
  if (chars.some(c => wind.includes(c))) elements.push("ลม");
  if (chars.some(c => tree.includes(c))) elements.push("ไม้");
  
  const hasConflict = (elements.includes("ไฟ") && elements.includes("น้ำ"));
  
  return { elements, hasConflict };
}

export function calculateMCAScore(name: string, day: DayOfWeek): AnalysisResult {
  const kalaigani = checkKalaigani(name, day);
  const numerology = calculateNumerology(name);
  const taksa = checkTaksa(name);
  const phonetic = analyzePhonetic(name);
  const element = analyzeElement(name);
  
  const kalaiganiScore = Math.max(0, 100 - (kalaigani.violations.length * 25) - (kalaigani.forbiddenLetters.length > 0 ? 10 : 0));
  
  const numerologyValue = numerology.totalStrokes;
  let numerologyScore = 20;
  if (numerologyValue === 1 || numerologyValue === 5 || numerologyValue === 6) numerologyScore = 100;
  else if (numerologyValue === 3 || numerologyValue === 7 || numerologyValue === 8 || numerologyValue === 9) numerologyScore = 80;
  else if (numerologyValue === 2 || numerologyValue === 4) numerologyScore = 60;
  if (numerology.isLucky) numerologyScore = Math.min(100, numerologyScore + 20);
  
  const coverageCount = taksa.covered.length;
  let taksaScore = (coverageCount / 6) * 100;
  if (kalaigani.violations.length > 0) taksaScore -= 30;
  taksaScore = Math.max(0, taksaScore);
  
  const CFI = Math.max(0, Math.min(1, 
    (1 - phonetic.syllables / 5) * 
    (1 - phonetic.vowelComplexity / 3) * 
    (1 - phonetic.length / 20)
  ));
  const phoneticScore = CFI * 100;
  
  let elementScore = element.elements.length * 25;
  if (element.hasConflict) elementScore -= 20;
  elementScore = Math.max(0, elementScore);
  
  const totalScore = Math.round(
    (kalaiganiScore * 0.25) +
    (numerologyScore * 0.25) +
    (taksaScore * 0.20) +
    (phoneticScore * 0.15) +
    (elementScore * 0.15)
  );
  
  return {
    totalScore,
    kalaiganiScore: Math.round(kalaiganiScore),
    numerologyScore: Math.round(numerologyScore),
    taksaScore: Math.round(taksaScore),
    phoneticScore: Math.round(phoneticScore),
    elementScore: Math.round(elementScore),
    details: {
      kalaigani,
      numerology,
      taksa,
      phonetic,
      element,
    },
  };
}

export function calculateShadowPower4(name: string, surname: string, birthDate: string): { s1: number; s2: number; s3: number; s4: number } {
  const chars = name.split("");
  let s1 = 0;
  chars.forEach((char, index) => {
    s1 += (STROKE_VALUES[char] || 0) * (index + 1);
  });
  s1 = s1 % 9;
  if (s1 === 0) s1 = 9;
  
  const dateParts = birthDate.split("/");
  let s2 = 0;
  dateParts.forEach(part => {
    s2 += parseInt(part) || 0;
  });
  s2 = s2 % 9;
  if (s2 === 0) s2 = 9;
  
  let s3 = (s1 * s2) % 12;
  if (s3 === 0) s3 = 12;
  
  const agePlanet = getAgePlanet();
  let s4 = (s3 * agePlanet) % 9;
  if (s4 === 0) s4 = 9;
  
  return { s1, s2, s3, s4 };
}

function getAgePlanet(): number {
  return 5;
}

export function getElementFromDay(day: DayOfWeek): string {
  const elements: Record<string, string> = {
    sunday: "ไฟ",
    monday: "น้ำ",
    tuesday: "ไฟ",
    wednesday_day: "ดิน",
    wednesday_night: "ดิน",
    thursday: "ดิน",
    friday: "ลม",
    saturday: "ทอง",
  };
  return elements[day] || "ดิน";
}

export function getElementFromNumber(num: number): string {
  if ([1, 3].includes(num)) return "ไฟ";
  if ([2, 6].includes(num)) return "น้ำ";
  if ([4, 8].includes(num)) return "ดิน";
  if ([5, 9].includes(num)) return "ทอง";
  return "ลม";
}

export function analyzeCorporateName(
  brandName: string,
  founderBirthday: string,
  industryType: string,
  targetAudience: string
): CorporateAnalysisResult {
  const brandNumerology = calculateNumerology(brandName);
  const brandPhonetic = analyzePhonetic(brandName);
  const brandElement = analyzeElement(brandName);
  
  const s1 = brandNumerology.totalStrokes;
  
  const dateParts = founderBirthday.split("/");
  let s2 = 0;
  dateParts.forEach(part => {
    s2 += parseInt(part) || 0;
  });
  s2 = s2 % 9;
  if (s2 === 0) s2 = 9;
  
  let s3 = (s1 * s2 + 5) % 12;
  if (s3 === 0) s3 = 12;
  
  const elementBalance = calculateElementBalance(brandElement.elements, industryType);
  
  const taksa = checkTaksa(brandName);
  const taksaMatrix = {
    bari: taksa.covered.includes("bari") ? 100 : 0,
    ayu: taksa.covered.includes("ayu") ? 100 : 0,
    decha: taksa.covered.includes("decha") ? 100 : 0,
    si: taksa.covered.includes("si") ? 100 : 0,
    mula: taksa.covered.includes("mula") ? 100 : 0,
    utsaha: taksa.covered.includes("utsaha") ? 100 : 0,
    montri: taksa.covered.includes("montri") ? 100 : 0,
  };
  
  const phoneticPricing = getPhoneticPricing(brandPhonetic);
  
  const memorabilityScore = calculateMemorabilityScore(brandPhonetic);
  
  const resonanceTriangle = calculateResonanceTriangle(s1, s2, industryType, targetAudience);
  
  const cai = Math.round((0.3 * s1 * 10) + (0.2 * s2 * 10) + (0.3 * s3 * 8.33) + (0.2 * elementBalance * 25));
  
  const warnings: string[] = [];
  const recommendations: string[] = [];
  
  if ([3, 4, 7, 8, 10, 12].includes(s3)) {
    warnings.push("S3 ตกในช่วงดาวให้โทษ - ควรเลื่อนฤกษ์เปิดตัว");
    recommendations.push("ใช้การันต์หรือฉนวนธาตุดินกลางชื่อ");
  }
  
  if (brandElement.hasConflict) {
    warnings.push("ธาตุขัดแย้งในชื่อ - ไฟ vs น้ำ");
    recommendations.push("ปรับสมดุลธาตุด้วยธาตุฉนวน");
  }
  
  if (memorabilityScore < 0.65) {
    warnings.push("Memorability Score ต่ำ - จดจำยาก");
    recommendations.push("ลดความซับซ้อนของพยางค์");
  }
  
  if (cai < 72) {
    warnings.push("CAI ต่ำกว่าเกณฑ์ (7.2/10)");
    recommendations.push("ปรับเลขศาสตร์หรือธาตุให้สมดุล");
  }
  
  return {
    cai,
    s1,
    s2,
    s3,
    elementBalance,
    taksaMatrix,
    phoneticPricing,
    memorabilityScore: Math.round(memorabilityScore * 100),
    resonanceTriangle,
    warnings,
    recommendations,
  };
}

function calculateElementBalance(elements: string[], industryType: string): number {
  const industryElements: Record<string, string[]> = {
    tech: ["ไฟ", "ทอง"],
    realestate: ["ดิน"],
    healthcare: ["น้ำ", "ไม้"],
    finance: ["ทอง", "ไฟ"],
    retail: ["ไม้", "น้ำ"],
    education: ["ไม้", "ดิน"],
    hospitality: ["ไฟ", "น้ำ"],
    manufacturing: ["ไฟ", "ดิน"],
  };
  
  const targetElements = industryElements[industryType] || ["ไฟ", "ทอง"];
  let score = 0;
  
  elements.forEach(el => {
    if (targetElements.includes(el)) {
      score += 20;
    }
  });
  
  return Math.min(100, score);
}

function getPhoneticPricing(phonetic: { syllables: number; vowelComplexity: number; length: number }): string {
  const hasPlosive = false;
  if (hasPlosive) return "Premium";
  if (phonetic.syllables <= 2) return "Stable";
  return "Accessible";
}

function calculateMemorabilityScore(phonetic: { syllables: number; vowelComplexity: number; length: number }): number {
  const ms = (1 - phonetic.syllables / 4) * (1 - phonetic.vowelComplexity / 3) * (0.8 + 0.2);
  return Math.max(0, Math.min(1, ms));
}

function calculateResonanceTriangle(founderEnergy: number, industryElement: number, targetAudience: string, industry: string): { founder: number; industry: number; audience: number; isBalanced: boolean } {
  const founder = founderEnergy * 10;
  const industryCalc = industryElement * 10;
  const audience = targetAudience.length > 0 ? 70 : 50;
  
  const isBalanced = Math.abs(founder - industryCalc) <= 20 && Math.abs(industryCalc - audience) <= 20;
  
  return {
    founder: Math.round(founder),
    industry: Math.round(industryCalc),
    audience: Math.round(audience),
    isBalanced,
  };
}

export function analyzeChildName(
  gender: Gender,
  birthDay: DayOfWeek,
  parentGoals: string[]
): ChildNamingResult {
  const recommendedLetters = getRecommendedLettersForChild(gender, birthDay);
  const avoidedLetters = getForbiddenLetters(birthDay);
  
  const targetNumber = getTargetNumberForGoals(parentGoals);
  
  const ayatana = getAyatanaForGoals(parentGoals);
  
  const warakkasaEmphasis = getWarakkasaEmphasisForGoals(parentGoals);
  
  const suggestedNames = generateChildNameSuggestions(recommendedLetters, gender, targetNumber);
  
  return {
    recommendedLetters,
    avoidedLetters,
    targetNumber,
    ayatana,
    warakkasaEmphasis,
    suggestedNames,
  };
}

function getRecommendedLettersForChild(gender: Gender, birthDay: DayOfWeek): string[] {
  const maleLetters: Record<DayOfWeek, string[]> = {
    sunday: ["ธ", "ภ", "ส", "ร", "ล", "ว"],
    monday: ["ก", "จ", "ด", "ต", "ถ", "ท"],
    tuesday: ["ป", "ฐ", "ณ", "ฎ", "ฏ", "ก"],
    wednesday_day: ["น", "ว", "ย", "ร", "ล"],
    wednesday_night: ["ธ", "ม", "ล", "ร", "ย"],
    thursday: ["ด", "ต", "น", "ถ", "ท", "ธ"],
    friday: ["ย", "ร", "ล", "ว", "ศ", "ส"],
    saturday: ["ฎ", "ฐ", "ณ", "ฏ", "ฑ", "ฒ"],
  };
  
  const femaleLetters: Record<DayOfWeek, string[]> = {
    sunday: ["ศ", "ส", "ห", "ษ", "ฬ", "ฮ"],
    monday: ["จ", "ฉ", "ช", "ญ", "ซ"],
    tuesday: ["ก", "ข", "ค", "ง", "ฆ"],
    wednesday_day: ["จ", "ช", "ญ", "ซ", "ฌ"],
    wednesday_night: ["บ", "ป", "ภ", "พ", "ฟ"],
    thursday: ["ด", "ต", "ธ", "ถ", "ญ"],
    friday: ["ย", "ร", "ล", "ว", "ศ", "ส"],
    saturday: ["ฎ", "ฏ", "ฐ", "ฑ", "ฒ", "ณ"],
  };
  
  if (gender === "male") return maleLetters[birthDay] || maleLetters.sunday;
  if (gender === "female") return femaleLetters[birthDay] || femaleLetters.sunday;
  return [...maleLetters[birthDay], ...femaleLetters[birthDay]];
}

function getTargetNumberForGoals(goals: string[]): number {
  if (goals.includes("สุขภาพ")) return 19;
  if (goals.includes("การเรียน")) return 14;
  if (goals.includes("การเงิน")) return 45;
  if (goals.includes("ความสัมพันธ์")) return 24;
  if (goals.includes("ภาวะผู้นำ")) return 15;
  return 36;
}

function getAyatanaForGoals(goals: string[]): number {
  if (goals.includes("สุขภาพ")) return 1;
  if (goals.includes("การเรียน")) return 7;
  if (goals.includes("การเงิน")) return 2;
  if (goals.includes("ความสัมพันธ์")) return 6;
  if (goals.includes("ภาวะผู้นำ")) return 8;
  return 6;
}

function getWarakkasaEmphasisForGoals(goals: string[]): string[] {
  if (goals.includes("สุขภาพ")) return ["ayu", "mula"];
  if (goals.includes("การเรียน")) return ["montri", "utsaha"];
  if (goals.includes("การเงิน")) return ["mula", "si"];
  if (goals.includes("ความสัมพันธ์")) return ["bari", "si"];
  if (goals.includes("ภาวะผู้นำ")) return ["decha", "montri"];
  return ["bari", "si"];
}

function generateChildNameSuggestions(letters: string[], gender: Gender, targetNumber: number): Array<{ name: string; meaning: string; score: number; strokes: number }> {
  const sampleNames: Record<string, Array<{ name: string; meaning: string }>> = {
    male: [
      { name: "ธัชพล", meaning: "ผู้มีกำลังแห่งความสำเร็จ" },
      { name: "กันต์สิริ", meaning: "ผู้เป็นมิ่งขวัญและสิริมงคล" },
      { name: "ปวรกฤษฎิ์", meaning: "ฉลาดยอดเยี่ยมและมั่นคง" },
      { name: "ณัฐวริศ", meaning: "ผู้รู้และมีความเจริญ" },
      { name: "ธนพล", meaning: "ผู้มีกำลังแห่งทรัพย์" },
      { name: "ดนัยธน", meaning: "ลูกชายผู้มั่นคงในทรัพย์" },
      { name: "ยศกร", meaning: "ผู้สร้างเกียรติยศ" },
      { name: "ฐกฤต", meaning: "ผู้ตั้งมั่นและประเสริฐ" },
    ],
    female: [
      { name: "ศิรินทร", meaning: "ผู้ทรงไว้ซึ่งสิริมงคลอันยิ่งใหญ่" },
      { name: "จิราภา", meaning: "แสงสว่างที่เที่ยงแท้" },
      { name: "กัลยา", meaning: "ผู้ประพฤติดีและงดงาม" },
      { name: "จามจุรี", meaning: "ดอกไม้แห่งความอ่อนโยนและปัญญา" },
      { name: "ภัสสร", meaning: "ความสว่างและเสน่ห์" },
      { name: "ธัญญา", meaning: "ผู้มีบุญและทรัพย์สิน" },
      { name: "รินรดา", meaning: "ผู้ยินดีในความรักและความสุข" },
      { name: "ฐิตาภา", meaning: "ผู้มีฐานมั่นคงและสว่างไสว" },
    ],
  };
  
  const names = gender === "male" ? sampleNames.male : sampleNames.female;
  
  return names.slice(0, 5).map(n => {
    const strokes = calculateTotalStrokes(n.name);
    return {
      ...n,
      score: strokes === targetNumber ? 100 : strokes % 9 === targetNumber % 9 ? 80 : 60,
      strokes,
    };
  });
}

function calculateTotalStrokes(name: string): number {
  let total = 0;
  name.split("").forEach(char => {
    total += STROKE_VALUES[char] || 0;
  });
  return total;
}

export function analyzeRename(
  currentName: string,
  currentSurname: string,
  birthDay: DayOfWeek,
  goals: string[]
): RenameAnalysisResult {
  const fullName = currentName + currentSurname;
  const currentAnalysis = calculateMCAScore(fullName, birthDay);
  
  const problemAreas: string[] = [];
  
  if (currentAnalysis.details.kalaigani.violations.length > 0) {
    problemAreas.push("มีกาลกิณีต้องห้าม");
  }
  if (currentAnalysis.details.numerology.totalStrokes < 5) {
    problemAreas.push("เลขศาสตร์ต่ำกว่าเกณฑ์");
  }
  if (currentAnalysis.details.taksa.missing.length > 3) {
    problemAreas.push("วรรคทักษาครอบคลุมน้อย");
  }
  if (currentAnalysis.details.element.hasConflict) {
    problemAreas.push("ธาตุขัดแย้งในชื่อปัจจุบัน");
  }
  
  const targetGoals = goals;
  const recommendedWarakkasa = getWarakkasaEmphasisForGoals(goals);
  const targetNumber = getTargetNumberForGoals(goals);
  const targetAyatana = getAyatanaForGoals(goals);
  
  const suggestedNewNames = generateRenameSuggestions(currentName, currentSurname, birthDay, targetNumber, goals);
  
  const softTransitionTips = [
    "คงชื่อเดิมบางส่วนเป็นชื่อกลาง",
    "ใช้ชื่อเล่นคู่กันช่วงปรับตัว 1-3 เดือน",
    "เปลี่ยนช่วงเปลี่ยนระดับชั้นเรียนหรือปิดเทอม",
    "แจ้งโรงเรียน ธนาคาร บัตรประชาชนล่วงหน้า",
  ];
  
  return {
    currentNameAnalysis: currentAnalysis,
    problemAreas,
    targetGoals,
    recommendedWarakkasa,
    targetNumber,
    targetAyatana,
    suggestedNewNames,
    softTransitionTips,
  };
}

function generateRenameSuggestions(
  currentName: string,
  currentSurname: string,
  birthDay: DayOfWeek,
  targetNumber: number,
  goals: string[]
): Array<{ name: string; meaning: string; score: number; transition: string }> {
  const suggestions = [
    { name: currentName + "ธร", meaning: "เพิ่มความมั่นคง", transition: "เพิ่มอักษร ธ ท้ายชื่อเดิม" },
    { name: "นร" + currentName.slice(1), meaning: "เสริมภาวะผู้นำ", transition: "เปลี่ยนตัวนำหน้าเป็น นร" },
    { name: currentName + "วิศ", meaning: "เสริมเสน่ห์และการยอมรับ", transition: "เพิ่มอักษร ศ ท้ายชื่อ" },
  ];
  
  return suggestions.map(s => ({
    ...s,
    score: 75 + Math.random() * 20,
  }));
}

export function calculateMCAI(
  corporateData: {
    brandName: string;
    domain: string;
    legalClearance: boolean;
    phoneticScore: number;
    cai: number;
    elementBalance: number;
  }
): number {
  const { legalClearance, phoneticScore, cai, elementBalance } = corporateData;
  
  const legalScore = legalClearance ? 100 : 50;
  const linguisticScore = phoneticScore;
  const astroScore = cai >= 72 ? 100 : cai >= 60 ? 70 : 40;
  const marketingScore = 70;
  const elementScore = elementBalance;
  const psychScore = 80;
  
  const mcai = 
    (legalScore * 0.20) +
    (linguisticScore * 0.20) +
    (astroScore * 0.15) +
    (marketingScore * 0.20) +
    (elementScore * 0.15) +
    (psychScore * 0.10);
  
  return Math.round(mcai);
}
