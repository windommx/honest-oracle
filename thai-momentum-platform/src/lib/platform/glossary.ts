/**
 * อภิธานศัพท์ภาษาไทย — คำศัพท์ quant/การเทรดที่ปรากฏในแพลตฟอร์ม
 *
 * หลักการเขียน (ลงทะเบียนไว้ที่นี่ที่เดียว):
 * - th      = ความหมายสั้น 1–2 ประโยค ภาษาคนทั่วไปอ่านเข้าใจ แต่ต้องถูกต้องตามนิยามทางสถิติ
 * - why     = ทำไมสำคัญ "ในระบบนี้" (เกณฑ์/การตัดสินใจที่ผูกกับคำนี้)
 * - example = ตัวอย่างตัวเลขที่จับต้องได้
 * - เกณฑ์ตัวเลขที่อ้างถึง (เช่น |meanIC| > 0.02, |ICIR| > 0.25, n ≥ 120) ตรงกับที่แท็บต่าง ๆ แสดง
 *
 * ใช้คู่กับ <Term id="ic">IC</Term> (src/components/platform/glossary.tsx) และแผงค้นหา "อภิธานศัพท์"
 */

export type GlossaryCategory = "signal" | "research" | "risk" | "market" | "system"

export const GLOSSARY_CATEGORY_LABEL: Record<GlossaryCategory, string> = {
  signal: "สัญญาณ",
  research: "งานวิจัย/ทดสอบ",
  risk: "ความเสี่ยง",
  market: "ตลาด/เทรนด์",
  system: "ระบบ",
}

export interface GlossaryEntry {
  /** รหัสอ้างอิง (ตัวพิมพ์เล็ก) — ใช้กับ <Term id> */
  id: string
  /** คำที่แสดง เช่น "IC" */
  term: string
  /** ชื่อเต็ม (อังกฤษ) */
  full: string
  category: GlossaryCategory
  /** ความหมายสั้นภาษาไทย */
  th: string
  /** ทำไมสำคัญในระบบนี้ */
  why: string
  /** ตัวอย่าง */
  example: string
  /** คำค้นเพิ่มเติม (ไทย/อังกฤษ) */
  aliases?: string[]
  /** แท็บที่เกี่ยวข้องมากที่สุด (ค่า value ใน nav-config) */
  tab?: string
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  // ───────────────────────────── สัญญาณ ─────────────────────────────
  {
    id: "ic",
    term: "IC",
    full: "Information Coefficient",
    category: "signal",
    th: "ค่าสหสัมพันธ์แบบอันดับ (Spearman) ระหว่างคะแนนสัญญาณวันนี้ กับผลตอบแทนล่วงหน้าของหุ้นทุกตัวในวันเดียวกัน — วัดว่าสัญญาณ “เรียงอันดับหุ้นถูก” แค่ไหน",
    why: "เป็นด่านแรกก่อนให้สัญญาณมีสิทธิ์ออกเสียงใน Jev — เกณฑ์ของระบบคือ |meanIC| > 0.02 (ค่าเฉลี่ย IC รายวัน)",
    example: "meanIC = 0.04 ที่ถือ 10 วัน แปลว่าหุ้นที่สัญญาณให้คะแนนสูงมีแนวโน้มทำผลตอบแทน 10 วันถัดไปดีกว่าเล็กน้อยแต่สม่ำเสมอ (ในโลกจริง IC 0.05 ถือว่าดีมาก)",
    aliases: ["meanIC", "rank IC", "information coefficient", "สหสัมพันธ์"],
    tab: "signals",
  },
  {
    id: "icir",
    term: "ICIR",
    full: "IC Information Ratio",
    category: "signal",
    th: "ค่าเฉลี่ยของ IC หารด้วยส่วนเบี่ยงเบนมาตรฐานของ IC รายวัน — วัด “ความสม่ำเสมอ” ของสัญญาณ ไม่ใช่แค่ความแรง",
    why: "IC สูงแต่แกว่งแรงเชื่อถือไม่ได้ — ระบบต้องการ |ICIR| > 0.25 ร่วมกับ n ≥ 120 วัน จึงจะ PROMOTE",
    example: "meanIC 0.03 และ SD ของ IC 0.10 → ICIR = 0.30 ผ่านเกณฑ์ · ถ้า SD 0.20 → ICIR 0.15 ไม่ผ่าน",
    aliases: ["ic ir", "information ratio"],
    tab: "signals",
  },
  {
    id: "t-stat",
    term: "t",
    full: "t-statistic",
    category: "signal",
    th: "ค่าเฉลี่ย IC อยู่ห่างจากศูนย์กี่เท่าของความคลาดเคลื่อนมาตรฐาน (ประมาณ ICIR × √n) — ยิ่งห่างศูนย์ ยิ่งไม่น่าเกิดจากโชค",
    why: "ใช้แยกสัญญาณจริงออกจากสัญญาณฟลุ๊ค — โดยทั่วไป |t| ≥ 2 ถือว่ามีนัยสำคัญที่ระดับประมาณ 95%",
    example: "ICIR 0.3 จากข้อมูล n = 120 วัน → t ≈ 0.3 × √120 ≈ 3.3",
    aliases: ["t stat", "นัยสำคัญ", "significance"],
    tab: "signals",
  },
  {
    id: "hit-rate",
    term: "Hit rate",
    full: "Hit rate / Win rate",
    category: "signal",
    th: "สัดส่วนครั้งที่ถูกทิศ — ใน IC Report คือสัดส่วนวันที่ IC เป็นบวก · ในการเทรดคือสัดส่วนไม้ที่ชนะ",
    why: "มากกว่า 0.5 = ถูกบ่อยกว่าผิด แต่ต้องดูคู่กับขนาดกำไร/ขาดทุนเสมอ (ชนะบ่อยแต่ขาดทุนหนักก็ติดลบได้)",
    example: "hit 0.58 = 58% ของวันทดสอบ สัญญาณเรียงอันดับหุ้นถูกทิศ",
    aliases: ["hit", "win rate", "winRate", "อัตราชนะ"],
    tab: "signals",
  },
  {
    id: "verdict",
    term: "PROMOTE / KILL",
    full: "IC verdict — PROMOTE · FLIP-CHECK · KILL",
    category: "signal",
    th: "คำตัดสินของ IC Report — PROMOTE = ผ่านเกณฑ์ครบ ได้สิทธิ์ออกเสียง · FLIP-CHECK = มีพลังแต่ทิศกลับจากที่คาด ต้องตรวจก่อน · KILL = น้ำหนัก 0",
    why: "กันสัญญาณที่ไม่มีหลักฐานเข้ามาปนการตัดสินใจ — ผลบันทึกเป็น policy ให้ Jev ใช้ในรอบถัดไปอัตโนมัติ",
    example: "สัญญาณ mfd ได้ PROMOTE ที่ hold 10 วัน → Jev ใช้น้ำหนักของ mfd เมื่อให้คะแนนหุ้นรอบหน้า",
    aliases: ["promote", "kill", "flip-check", "flip check", "คำตัดสิน"],
    tab: "signals",
  },
  {
    id: "mfd",
    term: "MFD",
    full: "Money Flow Divergence",
    category: "signal",
    th: "อันดับโมเมนตัมราคา ลบ อันดับเงินไหลเข้า ของหุ้นตัวเดียวกัน — บอกว่าราคากับเงินทุน “ไปทางเดียวกันไหม”",
    why: "ราคาขึ้นแต่เงินไม่ตาม (MFD สูง) = distribution มักนำราคาลง 2–4 สัปดาห์ ระบบบล็อกการซื้อ · เงินเข้าแต่ราคายังไม่ขึ้น (MFD ติดลบ) = accumulation",
    example: "MFD = +0.50 แปลว่าอันดับราคาแรงกว่าอันดับเงินไหลมาก → เสี่ยงถูกเทขาย",
    aliases: ["money flow", "เงินไหล", "distribution", "accumulation"],
    tab: "signals",
  },
  {
    id: "confluence",
    term: "Confluence",
    full: "Confluence 3 ชั้น",
    category: "signal",
    th: "จำนวนชั้นยืนยันที่เห็นตรงกัน — เทรนด์กรอบใหญ่ × โครงสร้างราคา × เงินไหล (order flow)",
    why: "สัญญาณที่หลายชั้นยืนยันพร้อมกันน่าเชื่อถือกว่าชั้นเดียว — เป็นคะแนนส่วนหนึ่งของสัญญาณเรือธง",
    example: "ผ่าน 3/3 ชั้น = ได้คะแนน confluence เต็มในสายพานคัดกรอง",
    aliases: ["ยืนยันหลายชั้น"],
    tab: "flagship",
  },

  // ───────────────────────────── ตลาด / เทรนด์ ─────────────────────────────
  {
    id: "momentum",
    term: "Momentum",
    full: "Price momentum",
    category: "market",
    th: "ปรากฏการณ์ที่หุ้นซึ่งขึ้นแรงกว่าตลาดในช่วงที่ผ่านมา (เช่น 1–12 เดือน) มีแนวโน้มทำผลงานดีกว่าต่อไปอีกระยะหนึ่ง",
    why: "เป็นแกนของทั้งแพลตฟอร์ม — Momentum Map, สัญญาณ และสัญญาณเรือธงล้วนเริ่มจากการจัดอันดับโมเมนตัม",
    example: "หุ้นที่ติด Top-20 พร้อมกันทั้งกรอบ 20, 40 และ 80 วัน = โมเมนตัมต่อเนื่องหลายกรอบเวลา",
    aliases: ["โมเมนตัม", "แรงส่ง"],
    tab: "map",
  },
  {
    id: "timeframe",
    term: "Timeframe",
    full: "กรอบเวลา 5/10/20/40/80/160/300 วัน",
    category: "market",
    th: "ช่วงเวลาย้อนหลังที่ใช้วัดผลตอบแทนเพื่อจัดอันดับโมเมนตัม — Momentum Map ใช้ 7 กรอบตั้งแต่ 5 ถึง 300 วันทำการ",
    why: "หุ้นที่ติดโผหลายกรอบพร้อมกันมีเทรนด์ที่แข็งแรงและทนกว่าหุ้นที่ติดกรอบเดียว",
    example: "บน Momentum Map หุ้นที่ซ้ำหลายคอลัมน์ได้สีเดียวกันพร้อมเส้นเชื่อม หุ้นไม่ซ้ำเป็นสีเทา",
    aliases: ["tf", "กรอบเวลา", "ช่วงเวลา"],
    tab: "map",
  },
  {
    id: "regime",
    term: "Regime",
    full: "Market regime",
    category: "market",
    th: "สภาวะของตลาดโดยรวม — risk_on (เปิดรับความเสี่ยง) / neutral / risk_off (ป้องกัน) คำนวณจากคะแนน Regime Composite",
    why: "กำหนดงบความเสี่ยงรวม (gross) ของทั้งพอร์ต และเป็น 1 ใน 3 ประตูของโหมดวันนี้ในหน้าภาพรวม",
    example: "Regime Composite = 0.35·breadthZ + 0.25·crossZ + 0.20·(1−2·volPct) + 0.20·overlapZ → ได้ 0.8 = risk_on",
    aliases: ["risk on", "risk off", "risk_on", "risk_off", "สภาวะตลาด", "regime score"],
    tab: "signals",
  },
  {
    id: "gross",
    term: "Gross ×",
    full: "Gross exposure multiplier",
    category: "risk",
    th: "ตัวคูณงบเงินลงทุนรวมเทียบกับแผนปกติ (0–1.5 เท่า) ที่ปรับต่อเนื่องตาม regime แทนการสวิตช์เข้า/ออกทั้งก้อน",
    why: "เร่งเมื่อตลาดเอื้อ ผ่อนเมื่อตลาดแย่ — ลดความเสียหายช่วงตลาดขาลงโดยไม่ต้องทายจุดกลับตัว",
    example: "gross ×0.6 = ใช้เงินลงทุน 60% ของแผนปกติ ส่วนที่เหลือถือเงินสด",
    aliases: ["gross budget", "grossMult", "exposure", "งบความเสี่ยง"],
    tab: "signals",
  },
  {
    id: "breadth",
    term: "Breadth",
    full: "Market breadth",
    category: "market",
    th: "ความกว้างของตลาด — สัดส่วนหุ้นทั้งตลาดที่ราคาอยู่เหนือเส้นค่าเฉลี่ย เช่น MA20 / MA50 / MA200",
    why: "ดัชนีขึ้นแต่ breadth ลดลง = หุ้นใหญ่ไม่กี่ตัวลากตลาด เป็นสัญญาณเตือนล่วงหน้า (breadth breakdown มักนำ SET 1–3 วัน)",
    example: "เหนือ MA20 = 72% → หุ้นส่วนใหญ่ของตลาดอยู่ในขาขึ้นระยะสั้น",
    aliases: ["ความกว้างตลาด", "b20", "b50", "b200"],
    tab: "signals",
  },
  {
    id: "ma",
    term: "MA20/50/200",
    full: "Moving average 20 / 50 / 200 วัน",
    category: "market",
    th: "เส้นค่าเฉลี่ยราคาปิดย้อนหลัง 20, 50 และ 200 วัน — ใช้วัดเทรนด์ระยะสั้น กลาง และยาว",
    why: "ราคาเหนือเส้น = เทรนด์ขึ้นของกรอบนั้น — ใช้ทั้งใน breadth และด่านคุณภาพเทรนด์ของสัญญาณเรือธง",
    example: "ราคาเหนือ MA200 แต่ต่ำกว่า MA20 = ขาขึ้นใหญ่ที่กำลังพักตัวระยะสั้น",
    aliases: ["moving average", "sma", "เส้นค่าเฉลี่ย", "ma20", "ma50", "ma200"],
  },
  {
    id: "thrust",
    term: "Thrust",
    full: "Breadth thrust (5 วัน)",
    category: "market",
    th: "การเปลี่ยนแปลงของ breadth ภายใน 5 วัน — วัดว่าหุ้นทั้งตลาดกำลังพลิกขึ้น/ลงพร้อมกันเร็วแค่ไหน",
    why: "breadth พุ่งแรงในเวลาสั้นมักเกิดช่วงต้นของขาขึ้นรอบใหม่",
    example: "thrust5 = +0.10 = สัดส่วนหุ้นเหนือเส้นค่าเฉลี่ยเพิ่ม 10 จุดใน 5 วัน",
    aliases: ["thrust5", "breadth thrust"],
    tab: "signals",
  },
  {
    id: "hmm",
    term: "HMM",
    full: "Hidden Markov Model",
    category: "market",
    th: "โมเดลสถิติที่สมมติว่าตลาดสลับไปมาระหว่าง “สภาวะที่มองไม่เห็นโดยตรง” (เช่น สงบ / ผันผวน) แล้วประเมินความน่าจะเป็นว่าวันนี้อยู่สภาวะไหนจากผลตอบแทนและความผันผวน",
    why: "ใช้เป็นเอนจิน regime สากล — เมื่อความน่าจะเป็นของสภาวะผันผวนสูงขึ้น ระบบลดความเสี่ยงอัตโนมัติ",
    example: "P(สภาวะผันผวน) = 0.8 → ลดน้ำหนักการลงทุนลงจนกว่าความน่าจะเป็นจะกลับมาต่ำ",
    aliases: ["hidden markov", "hmm regime"],
    tab: "gtaa",
  },
  {
    id: "residual-momentum",
    term: "Residual momentum",
    full: "Residual (idiosyncratic) momentum",
    category: "market",
    th: "โมเมนตัมหลังตัดผลของตลาดและกลุ่มอุตสาหกรรมออก เหลือเฉพาะส่วนที่เป็นของหุ้นตัวนั้นจริง ๆ",
    why: "ผันผวนน้อยกว่าโมเมนตัมดิบ และไม่พังหนักตอนตลาดกลับตัวแรง (momentum crash)",
    example: "หุ้นขึ้น 20% ขณะที่กลุ่มขึ้น 18% → residual momentum เพียงราว 2%",
    aliases: ["idiosyncratic momentum", "โมเมนตัมส่วนเฉพาะ"],
  },
  {
    id: "fip",
    term: "FIP",
    full: "Frog-in-the-pan",
    category: "market",
    th: "วัดว่าโมเมนตัมเกิดแบบ “ค่อย ๆ ต่อเนื่อง” (บวกเล็ก ๆ หลายวัน) หรือ “กระโดดทีเดียว” จากข่าว",
    why: "โมเมนตัมแบบค่อยเป็นค่อยไปมักอยู่นานกว่า เพราะนักลงทุนตอบสนองต่อข้อมูลที่มาทีละน้อยช้ากว่า",
    example: "ขึ้น 15% จาก 60 วันที่บวกเล็ก ๆ ได้คะแนนดีกว่าขึ้น 15% จากข่าววันเดียว",
    aliases: ["frog in the pan", "กบในหม้อ"],
  },
  {
    id: "w52",
    term: "52-week high",
    full: "Nearness to 52-week high",
    category: "market",
    th: "ราคาปัจจุบันเทียบกับจุดสูงสุดในรอบ 52 สัปดาห์ (1 ปี)",
    why: "หุ้นที่ใกล้จุดสูงสุดรอบปีมักไปต่อ เพราะนักลงทุนยึดจุดอ้างอิงเดิมจนตอบสนองข่าวดีช้า",
    example: "ราคาอยู่ที่ 98% ของ high 52 สัปดาห์ = ได้คะแนนสูงในเอนจินนี้",
    aliases: ["52w", "จุดสูงสุด 52 สัปดาห์", "new high"],
  },
  {
    id: "csad",
    term: "CSAD",
    full: "Cross-Sectional Absolute Deviation (herding)",
    category: "market",
    th: "ค่าเบี่ยงเบนสัมบูรณ์ของผลตอบแทนหุ้นแต่ละตัวจากผลตอบแทนตลาด — ใช้ตรวจภาวะนักลงทุน “แห่ตามกัน” (herding)",
    why: "ตลาดเคลื่อนแรงแต่ CSAD ไม่เพิ่มตาม = ทุกตัววิ่งพร้อมกัน เสี่ยงกลับตัวรุนแรง",
    example: "SET ร่วง 3% และหุ้นเกือบทุกตัวร่วงใกล้เคียงกัน (CSAD ต่ำผิดปกติ) = สัญญาณแห่ขาย",
    aliases: ["herding", "แห่ตามกัน"],
  },
  {
    id: "signed-flow",
    term: "Order flow",
    full: "Signed order flow",
    category: "market",
    th: "ปริมาณซื้อ − ขาย โดยประมาณจากทิศทางราคาของแต่ละช่วงการซื้อขาย",
    why: "บอกแรงซื้อ/ขายจริงเบื้องหลังการเคลื่อนของราคา — SET Sniper ใช้ร่วมกับโครงสร้างราคาหาจุดเข้า",
    example: "ราคาทรงตัวแต่ flow เป็นบวกต่อเนื่องหลายวัน = มีผู้เล่นทยอยเก็บของ",
    aliases: ["flow", "signed flow", "แรงซื้อขาย"],
    tab: "sniper",
  },
  {
    id: "ict",
    term: "ICT",
    full: "Inner Circle Trader concepts (Order block · FVG · Liquidity)",
    category: "market",
    th: "ชุดแนวคิดโครงสร้างราคา — order block = โซนที่รายใหญ่เคยเข้าเทรด · FVG = ช่องว่างราคาที่ยังไม่ถูกเติม · liquidity = จุดที่ stop กระจุกตัว",
    why: "SET Sniper ใช้ร่วมกับ order flow เพื่อหาจุดเข้าที่ความเสี่ยงต่ำและกำหนด stop ได้ชัด",
    example: "ราคาย่อกลับมาทดสอบ order block ขาขึ้น พร้อม flow เป็นบวก = จุดเข้าที่ Sniper มองหา",
    aliases: ["order block", "fvg", "fair value gap", "liquidity", "smc"],
    tab: "sniper",
  },

  // ───────────────────────────── งานวิจัย / ทดสอบ ─────────────────────────────
  {
    id: "cpcv",
    term: "CPCV",
    full: "Combinatorial Purged Cross-Validation",
    category: "research",
    th: "แบ่งข้อมูลตามเวลาเป็นหลายกลุ่ม แล้วทดสอบ “ทุกการผสม” ของกลุ่มทดสอบ โดยตัดข้อมูลที่ช่วงผลลัพธ์คาบเกี่ยวกัน (purge) และเว้นระยะหลังชุดทดสอบ (embargo)",
    why: "ได้ผลทดสอบหลายเส้นทางแทน backtest เส้นเดียวที่อาจฟลุ๊ค และกันข้อมูลอนาคตรั่วเข้าการฝึกโมเดล",
    example: "แบ่ง 6 กลุ่ม เลือกทดสอบทีละ 2 กลุ่ม → 15 ชุดทดสอบ แล้วดูว่า hit rate ผ่าน gate กี่ชุด",
    aliases: ["cross validation", "purged", "ครอสวาลิเดชัน"],
    tab: "research",
  },
  {
    id: "purge-embargo",
    term: "Purge / Embargo",
    full: "Purging & embargo",
    category: "research",
    th: "Purge = ตัดตัวอย่างฝึกที่ช่วงเวลาผลลัพธ์ทับกับชุดทดสอบ · Embargo = เว้นช่วงเวลาหลังชุดทดสอบไม่นำมาฝึก",
    why: "ถ้าไม่ตัด โมเดลจะ “เห็นอนาคต” ผ่านป้ายผลที่คาบเกี่ยวกัน ทำให้ผล backtest ดีเกินจริง",
    example: "ถือ 10 วัน → ตัดตัวอย่าง 10 วันก่อนชุดทดสอบ และเว้นอีก 1–2% ของข้อมูลหลังชุดทดสอบ",
    aliases: ["purging", "embargo", "look-ahead", "ข้อมูลรั่ว"],
    tab: "research",
  },
  {
    id: "meta-labeling",
    term: "Meta-labeling",
    full: "Meta-labeling",
    category: "research",
    th: "โมเดลชั้นที่สองที่ไม่ทายทิศทางราคา แต่ทายว่า “สัญญาณของโมเดลหลักครั้งนี้จะสำเร็จไหม” แล้วใช้ความน่าจะเป็นนั้นปรับขนาดไม้",
    why: "ลดขนาดไม้คุณภาพต่ำ เพิ่มไม้ที่มั่นใจ โดยไม่ต้องแก้สัญญาณหลัก — ระบบใช้ปรับขนาดไม้ของ Jev ×0.5–1.5",
    example: "สัญญาณซื้อเข้ามา meta-model ให้ P(สำเร็จ) = 0.62 → ขยายขนาดไม้ขึ้นเล็กน้อย",
    aliases: ["meta label", "meta model", "metaPass"],
    tab: "research",
  },
  {
    id: "triple-barrier",
    term: "Triple barrier",
    full: "Triple-barrier labeling",
    category: "research",
    th: "การติดป้ายผลของไม้ด้วย 3 เส้น — เป้ากำไร, จุดตัดขาดทุน และเวลาหมดอายุ — ราคาแตะเส้นไหนก่อน ป้ายผลคือเส้นนั้น",
    why: "สะท้อนการเทรดจริง (มี stop และเป้า) ได้ดีกว่าวัดแค่ผลตอบแทน ณ วันที่ N",
    example: "ตั้ง +6% / −3% / 10 วัน → ราคาแตะ −3% ในวันที่ 4 ก่อน = ป้ายผล “แพ้”",
    aliases: ["barrier", "labeling", "ติดป้ายผล"],
    tab: "research",
  },
  {
    id: "walk-forward",
    term: "Walk-forward",
    full: "Walk-forward analysis",
    category: "research",
    th: "ทดสอบแบบเดินหน้า — ปรับพารามิเตอร์ด้วยข้อมูลอดีต แล้ววัดผลกับช่วงถัดไปที่โมเดลยังไม่เคยเห็น เลื่อนหน้าต่างไปเรื่อย ๆ",
    why: "จำลองการใช้งานจริงและจับ overfitting ได้ดีกว่าการทดสอบข้อมูลทั้งก้อนครั้งเดียว",
    example: "ฝึก 2018–2020 → ทดสอบ 2021 → เลื่อนเป็นฝึก 2019–2021 → ทดสอบ 2022",
    aliases: ["walkforward", "out-of-sample", "oos"],
    tab: "gtaa",
  },
  {
    id: "overfitting",
    term: "Overfitting / PBO",
    full: "Overfitting · Probability of Backtest Overfitting",
    category: "research",
    th: "Overfitting = จูนกลยุทธ์จนจำ noise ของข้อมูลอดีต ผล backtest สวยแต่ใช้จริงพัง · PBO = ความน่าจะเป็นที่กลยุทธ์ที่ดีที่สุดใน backtest จะแย่กว่าค่ากลางเมื่อเจอข้อมูลใหม่",
    why: "เป็นเหตุผลที่ระบบบังคับ pre-registration, CPCV และ walk-forward ก่อนเชื่อผลใด ๆ",
    example: "ลอง 200 ชุดพารามิเตอร์แล้วเลือกตัวที่ Sharpe สูงสุด → ผลนั้นมักเกินจริงอย่างมาก",
    aliases: ["pbo", "overfit", "curve fitting", "จูนเกิน"],
    tab: "research",
  },
  {
    id: "prereg",
    term: "Pre-registration",
    full: "Pre-registration (ลงทะเบียนล่วงหน้า)",
    category: "research",
    th: "ประกาศสมมติฐาน เกณฑ์ผ่าน/ตก และวิธีวัดผล “ก่อน” เห็นผลทดสอบ และห้ามแก้ย้อนหลัง",
    why: "กันการเลื่อนเสาประตูหลังเห็นข้อมูล ซึ่งเป็นต้นเหตุหลักของ overfitting — ทุกเกณฑ์ในแพลตฟอร์มลงทะเบียนไว้ล่วงหน้า",
    example: "ประกาศก่อนว่าจะรับ Bayes stop ก็ต่อเมื่อ Sharpe ดีกว่า fixed stop ≥ 0.2 และ n ≥ 100",
    aliases: ["prereg", "pre-registered", "ลงทะเบียนล่วงหน้า"],
    tab: "research",
  },
  {
    id: "brier",
    term: "Brier",
    full: "Brier score",
    category: "research",
    th: "ค่าเฉลี่ยของ (ความน่าจะเป็นที่ทาย − ผลจริง 0 หรือ 1)² — วัดว่าความมั่นใจที่โมเดลบอกตรงกับความจริงแค่ไหน",
    why: "ยิ่งต่ำยิ่งดี: 0 = สมบูรณ์แบบ · 0.25 = เท่ากับทาย 50/50 ทุกครั้ง — Shadow Lab ใช้ตัดสินเมื่อมีผลอย่างน้อย 10 แถว",
    example: "ทายว่าชนะ 70% แล้วชนะจริง → (0.7 − 1)² = 0.09 · ถ้าแพ้ → (0.7 − 0)² = 0.49",
    aliases: ["brier score", "calibration", "ความแม่นของความน่าจะเป็น"],
    tab: "lab",
  },
  {
    id: "shadow",
    term: "Shadow mode",
    full: "Shadow mode (โหมดเงา)",
    category: "research",
    th: "รันกฎหรือกลยุทธ์ใหม่คู่ขนานกับระบบจริง บันทึกผลทุกครั้ง แต่ไม่ให้ส่งผลกับพอร์ต",
    why: "เก็บหลักฐานจากข้อมูลจริงก่อนเปิดใช้ — ความผิดพลาดระหว่างทดลองไม่มีต้นทุน",
    example: "GTAA รันแบบ shadow — แนะนำเงินสด 50% แต่ยังไม่เขียนทับ gross ของระบบหุ้นไทย",
    aliases: ["shadow", "โหมดเงา", "shadow lab"],
    tab: "lab",
  },
  {
    id: "ab-test",
    term: "A/B shadow",
    full: "Paired A/B shadow test",
    category: "research",
    th: "เปรียบเทียบกฎเดิม (A) กับกฎใหม่ (B) บนสัญญาณชุดเดียวกันแบบจับคู่ ทีละรายการ",
    why: "รู้ว่ากฎใหม่ดีกว่าจริงหลังหักต้นทุนก่อนสลับใช้ — เกณฑ์ของระบบ: paired n ≥ 100 และส่วนต่างเฉลี่ย > 0 หลังค่าธรรมเนียม 55bps",
    example: "v2 − v1 = +0.4% ต่อไม้ จาก 120 คู่ → ผ่านเกณฑ์ โปรโมทกฎ v2",
    aliases: ["ab", "a/b", "paired", "เปรียบเทียบกฎ"],
    tab: "signals",
  },
  {
    id: "evidence-night",
    term: "Evidence Night",
    full: "Evidence Night (H1–H4)",
    category: "research",
    th: "พิธีตรวจหลักฐานประจำรอบ — ทดสอบสมมติฐาน H1–H4 ที่ลงทะเบียนไว้ ออกคำตัดสิน แล้วปรับ config อัตโนมัติพร้อมบันทึก audit",
    why: "ทุกการเปลี่ยนกฎของระบบต้องมีหลักฐานรองรับและตรวจย้อนได้",
    example: "H2 ไม่ผ่านรอบนี้ → ระบบปิดสัญญาณที่เกี่ยวข้องจนกว่าหลักฐานรอบถัดไปจะดีขึ้น",
    aliases: ["h1", "h2", "h3", "h4", "evidence", "หลักฐาน"],
    tab: "evidence",
  },
  {
    id: "sharpe",
    term: "Sharpe",
    full: "Sharpe ratio",
    category: "research",
    th: "ผลตอบแทนส่วนเกินเฉลี่ย ÷ ความผันผวนของผลตอบแทน (ปรับเป็นรายปี) — ผลตอบแทนต่อหน่วยความเสี่ยง",
    why: "ใช้เทียบกลยุทธ์ที่เสี่ยงไม่เท่ากันอย่างยุติธรรม — เกณฑ์รับ Bayes stop และ GTAA อิง Sharpe",
    example: "ผลตอบแทนเกินเงินสด 15%/ปี ที่ความผันผวน 15%/ปี → Sharpe = 1.0",
    aliases: ["sharpe ratio", "ชาร์ป"],
    tab: "backtest",
  },

  // ───────────────────────────── ความเสี่ยง ─────────────────────────────
  {
    id: "max-dd",
    term: "Max drawdown",
    full: "Maximum drawdown (MaxDD)",
    category: "risk",
    th: "การลดลงมากที่สุดของมูลค่าพอร์ต จากจุดสูงสุดเดิมลงไปถึงจุดต่ำสุดถัดมา",
    why: "บอกความเจ็บปวดที่แย่ที่สุดที่ต้องทนได้ — ใช้ตั้งเพดานความเสี่ยงและ kill switch รายสัปดาห์",
    example: "พอร์ตจาก 1.2 ล้าน ลงไปต่ำสุด 0.9 ล้าน ก่อนฟื้น = MaxDD −25%",
    aliases: ["drawdown", "maxdd", "dd", "ขาดทุนสะสมสูงสุด"],
    tab: "backtest",
  },
  {
    id: "bayes-stop",
    term: "Bayes stop",
    full: "Bayesian stop-loss",
    category: "risk",
    th: "จุดตัดขาดทุนที่คำนวณจากความน่าจะเป็นแบบเบย์ ว่าไม้ที่ติดลบถึงระดับหนึ่ง “น่าจะเป็นไม้แพ้” แค่ไหน เทียบกับมูลค่าคาดหวังของการถือต่อ",
    why: "stop อิงหลักฐานจากไม้ในอดีตของระบบเอง แทนตัวเลขตายตัวอย่าง −10% — รับใช้จริงเมื่อผ่านเกณฑ์ลงทะเบียนล่วงหน้า",
    example: "P(แพ้ | ติดลบ 7%) = 0.7 และมูลค่าคาดหวังของการถือต่อติดลบ → ตัดขาดทุนที่ 7%",
    aliases: ["bayesian stop", "bayesT", "bayesR", "จุดตัดขาดทุน", "stop loss"],
    tab: "stops",
  },
  {
    id: "s-star",
    term: "s*",
    full: "Optimal stop level",
    category: "risk",
    th: "ระดับการติดลบของไม้ (จากจุดซื้อ) ที่ Bayes stop คำนวณว่าให้ผลคาดหวังดีที่สุด",
    why: "ใช้เป็นเส้นตัดขาดทุนของไม้ใหม่เมื่อ policy ถูกรับใช้งาน",
    example: "s* = 8.5% → ขายเมื่อราคาต่ำกว่าจุดซื้อ 8.5%",
    aliases: ["s star", "sOpt", "optimal stop"],
    tab: "stops",
  },
  {
    id: "posterior",
    term: "Posterior",
    full: "Posterior probability",
    category: "risk",
    th: "ความน่าจะเป็นที่อัปเดตแล้วหลังเห็นข้อมูลใหม่ (ความเชื่อเดิม × ความน่าจะเป็นของข้อมูลที่เห็น)",
    why: "หัวใจของ Bayes stop — เปลี่ยนความเชื่อเรื่องไม้ตามราคาที่เกิดขึ้นจริงอย่างมีระบบ",
    example: "ก่อนเห็นข้อมูลเชื่อว่าไม้แพ้ 40% · หลังราคาลง 7% อัปเดตเป็น 70% (posterior)",
    aliases: ["bayes", "prior", "ความน่าจะเป็นภายหลัง"],
    tab: "stops",
  },
  {
    id: "vol-managed",
    term: "Vol-managed",
    full: "Volatility-managed sizing",
    category: "risk",
    th: "ปรับขนาดการลงทุนผกผันกับความผันผวน — ผันผวนสูงลดขนาด ผันผวนต่ำเพิ่มขนาด",
    why: "ทำให้ความเสี่ยงของพอร์ตคงที่ขึ้น และมักช่วยให้ Sharpe ดีขึ้นในระยะยาว",
    example: "ความผันผวนตลาดพุ่งจาก 15% เป็น 30% → ลดน้ำหนักการลงทุนลงราวครึ่งหนึ่ง",
    aliases: ["volatility targeting", "vol target", "volPct", "ความผันผวน"],
  },
  {
    id: "hrp",
    term: "HRP",
    full: "Hierarchical Risk Parity",
    category: "risk",
    th: "วิธีจัดน้ำหนักพอร์ตที่จัดกลุ่มสินทรัพย์ที่เคลื่อนไหวคล้ายกันเป็นลำดับชั้น แล้วแบ่งความเสี่ยงระหว่างกลุ่มให้สมดุล",
    why: "ทนทานกว่า mean-variance แบบดั้งเดิม เพราะไม่ต้องทายผลตอบแทนและไม่ไวต่อ noise ของข้อมูล",
    example: "หุ้นพลังงาน 3 ตัวที่ขึ้นลงพร้อมกันถูกนับเป็นกลุ่มเดียว จึงไม่ได้น้ำหนักรวมมากเกินไป",
    aliases: ["risk parity", "จัดสรรพอร์ต"],
    tab: "portfolio",
  },
  {
    id: "eff-n",
    term: "Effective N",
    full: "Effective number of positions (1 / Σw²)",
    category: "risk",
    th: "จำนวนตำแหน่ง “ที่มีผลจริง” หลังคิดการกระจุกตัวของน้ำหนัก คำนวณจาก 1 ÷ ผลรวมของน้ำหนักยกกำลังสอง",
    why: "ถือ 10 ตัวแต่เงินกระจุกอยู่ 2 ตัว = ไม่ได้กระจายความเสี่ยงจริง — แสดงใน Risk Radar",
    example: "น้ำหนักเท่ากัน 10 ตัว → effN = 10 · ตัวหนึ่ง 55% ที่เหลือ 9 ตัวละ 5% → effN ≈ 3",
    aliases: ["effn", "diversification", "การกระจายตัว"],
    tab: "portfolio",
  },
  {
    id: "breaker",
    term: "Circuit breaker",
    full: "Circuit breaker ระดับ 0–3",
    category: "risk",
    th: "ตัวตัดวงจรความเสี่ยงของ SET Sniper ประเมินจากการร่วงของตลาดใน 1 วันและ 5 วัน — ระดับ 0 ปกติ ถึง 3 รุนแรง",
    why: "ระดับสูงขึ้น = ลดขนาดหรือหยุดการเข้าไม้ใหม่อัตโนมัติ และเป็น 1 ใน 3 ประตูของโหมดวันนี้",
    example: "ตลาดร่วงแรงผิดปกติในวันเดียว → breaker ขึ้นระดับ 2 ระบบลดขนาดไม้ใหม่",
    aliases: ["breaker", "เบรกเกอร์", "ตัดวงจร"],
    tab: "sniper",
  },
  {
    id: "expectancy",
    term: "Expectancy (R)",
    full: "Expectancy in R-multiples",
    category: "risk",
    th: "ผลตอบแทนเฉลี่ยต่อไม้ในหน่วย R โดย 1R = จำนวนเงินที่ยอมเสี่ยงต่อไม้ (ระยะถึงจุดตัดขาดทุน)",
    why: "เป็นบวก = กลยุทธ์มีความได้เปรียบระยะยาว ไม่ว่าอัตราชนะจะสูงหรือต่ำ",
    example: "expectancy +0.3R และเสี่ยงไม้ละ 1,000 บาท → คาดหวังกำไรเฉลี่ยไม้ละ 300 บาท",
    aliases: ["r multiple", "cumR", "ค่าคาดหวัง"],
    tab: "lab",
  },

  // ───────────────────────────── ระบบ ─────────────────────────────
  {
    id: "human-gate",
    term: "Human Gate",
    full: "Human Gate (ด่านอนุมัติโดยมนุษย์)",
    category: "system",
    th: "ทุกคำสั่งที่ Jev เสนอต้องรอให้คุณกดอนุมัติก่อนเข้าพอร์ต — ไม่อนุมัติ = ไม่เกิดอะไรขึ้น (default-deny)",
    why: "AI ช่วยวิเคราะห์และให้เหตุผล แต่คนเป็นผู้ตัดสินใจและรับผิดชอบเสมอ",
    example: "Jev เสนอซื้อหุ้นตัวหนึ่ง 5% ของพอร์ต → อยู่ในคิว “รออนุมัติ” จนกว่าคุณจะกดยืนยันหรือปฏิเสธ",
    aliases: ["gate", "อนุมัติ", "รออนุมัติ", "approval"],
    tab: "jev",
  },
  {
    id: "paper",
    term: "Paper mode",
    full: "Paper trading (พอร์ตกระดาษ)",
    category: "system",
    th: "ทุกคำสั่งในแพลตฟอร์มเป็นการจำลอง — ไม่มีการส่งคำสั่งซื้อขายจริงและไม่ใช้เงินจริง",
    why: "ทดลองระบบและเรียนรู้ได้โดยไม่เสี่ยงเงิน — ตัวเลขทุกตัวเป็นผลจำลอง ไม่ใช่คำแนะนำการลงทุน",
    example: "พอร์ตแสดงกำไร 3% = กำไรจำลองจากราคาปิดในฐานข้อมูล ไม่ใช่เงินในบัญชีจริง",
    aliases: ["paper", "จำลอง", "พอร์ตกระดาษ", "paper trading"],
    tab: "portfolio",
  },
  {
    id: "gtaa",
    term: "GTAA",
    full: "Global Tactical Asset Allocation (Faber)",
    category: "system",
    th: "กลยุทธ์หมุนสินทรัพย์ทั่วโลกรายเดือน — ถือเฉพาะสินทรัพย์ที่ราคาอยู่เหนือเส้นเฉลี่ย 10 เดือน (SMA10) เลือก Top-6 ตามโมเมนตัม ส่วนที่เหลือถือเงินสด",
    why: "กฎเรียบง่ายที่ช่วยหลบตลาดหมีใหญ่ — ในระบบนี้ทำงานแบบ shadow และเป็น 1 ใน 3 ประตูของโหมดวันนี้",
    example: "SPY หลุด SMA10 ณ สิ้นเดือน → ย้ายส่วนนั้นไปถือ BIL (เงินสด) ในเดือนถัดไป",
    aliases: ["faber", "sma10", "top-6", "asset allocation"],
    tab: "gtaa",
  },
  {
    id: "dq",
    term: "DQ",
    full: "Data Quality",
    category: "system",
    th: "การตรวจคุณภาพข้อมูลราคา — วันที่หาย ราคากระโดดผิดปกติ ปริมาณเป็นศูนย์ ข้อมูลซ้ำ ฯลฯ",
    why: "ข้อมูลเสีย = สัญญาณผิดทั้งระบบ — ต้องแก้ flag ก่อนเชื่อผลของทุกแท็บ",
    example: "flag “ราคา 0 บาท 3 แถว” → นำเข้าข้อมูลวันนั้นใหม่ก่อนดูสัญญาณ",
    aliases: ["data quality", "คุณภาพข้อมูล", "flag"],
    tab: "data",
  },
]

export const GLOSSARY_BY_ID: Readonly<Record<string, GlossaryEntry>> = Object.fromEntries(
  GLOSSARY.map((e) => [e.id, e]),
)

export function findTerm(id: string): GlossaryEntry | undefined {
  return GLOSSARY_BY_ID[id.toLowerCase()]
}

const norm = (s: string) => s.normalize("NFC").toLowerCase().trim()

/** ค้นหาจากคำ/ชื่อเต็ม/คำพ้อง/คำอธิบาย — คำที่ตรงหัวคำขึ้นก่อน · ว่าง = ทั้งหมดตามลำดับเดิม */
export function searchGlossary(query: string, category?: GlossaryCategory | "all"): GlossaryEntry[] {
  const q = norm(query)
  const pool = GLOSSARY.filter((e) => !category || category === "all" || e.category === category)
  if (!q) return [...pool]
  const scored: { e: GlossaryEntry; s: number }[] = []
  for (const e of pool) {
    const head = [e.term, e.id, ...(e.aliases ?? [])].map(norm)
    let s = 0
    if (head.some((h) => h === q)) s = 4
    else if (head.some((h) => h.startsWith(q))) s = 3
    else if (head.some((h) => h.includes(q)) || norm(e.full).includes(q)) s = 2
    else if (norm(e.th).includes(q) || norm(e.why).includes(q) || norm(e.example).includes(q)) s = 1
    if (s > 0) scored.push({ e, s })
  }
  return scored.sort((a, b) => b.s - a.s).map((x) => x.e)
}
