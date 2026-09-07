// ╔══════════════════════════════════════════════════════════════════╗
// ║  SLEEP — measured, not scored.                                    ║
// ║                                                                    ║
// ║  instruments.ts explains why the PSQI and the ISI are absent: both ║
// ║  are under copyright, and we will not reproduce an instrument we   ║
// ║  have no licence for. The replacement is not a home-made scale —   ║
// ║  inventing "MindBridge Sleep Score 0–100" would trade a licensing  ║
// ║  problem for an epistemic one. It is the sleep diary itself: raw   ║
// ║  quantities the sleeper reports about their own night.             ║
// ║                                                                    ║
// ║  That leaves every number here on solid ground:                    ║
// ║   · TIB / SOL / WASO are reported observations (direct).           ║
// ║   · TST and sleep efficiency are ARITHMETIC on those, by the same  ║
// ║     formula the sleep literature uses, printed below (derived).    ║
// ║   · The reference thresholds are the conventional research         ║
// ║     cut-offs, cited — not tuned by us to make a graph look good.   ║
// ║                                                                    ║
// ║  Sleep efficiency is also the one number here that is genuinely    ║
// ║  actionable: it is the quantity CBT-I's sleep-restriction step     ║
// ║  titrates against.                                                 ║
// ╚══════════════════════════════════════════════════════════════════╝

/** One night, as the sleeper reports it. Every field is minutes except the count. */
export interface SleepDiaryEntry {
  /** ISO date (YYYY-MM-DD) of the morning being reported. */
  date: string;
  /** Time in bed: lights-out to final get-up. */
  timeInBedMin: number;
  /** Sleep onset latency: how long it took to fall asleep. */
  sleepLatencyMin: number;
  /** Wake after sleep onset: total minutes awake between falling asleep and the
   *  final awakening. */
  wakeAfterSleepOnsetMin: number;
  /** Minutes awake in bed after the final awakening, before getting up. */
  terminalWakefulnessMin: number;
  awakenings: number;
}

export interface SleepMetrics {
  /** Total sleep time = TIB − SOL − WASO − terminal wakefulness. */
  totalSleepMin: number;
  /** Sleep efficiency = TST ÷ TIB × 100, to 1dp. */
  efficiencyPct: number;
  /** The formula, spelled out — the number should be re-derivable by the reader. */
  formulaTh: string;
}

/** Conventional research thresholds. These are the quantitative criteria used to
 *  define clinically significant insomnia in sleep research and in the CBT-I
 *  literature — they are not thresholds we chose. */
export const SLEEP_REFERENCE = {
  /** Sleep efficiency at or above this is the usual "normal" reference. */
  efficiencyPct: 85,
  /** Sleep onset latency above this is the usual quantitative criterion. */
  latencyMin: 30,
  /** WASO above this is the usual quantitative criterion. */
  wasoMin: 30,
  /** Nights per week at which the criteria are usually applied. */
  nightsPerWeek: 3,
  sourceTh:
    "เกณฑ์เชิงปริมาณที่ใช้กันทั่วไปในงานวิจัยการนอน (ใช้เวลาหลับ >30 นาที หรือตื่นกลางดึกรวม >30 นาที " +
    "อย่างน้อย 3 คืน/สัปดาห์) และประสิทธิภาพการนอน ≥85% เป็นค่าอ้างอิงที่ใช้ใน CBT-I",
} as const;

const round1 = (n: number) => Number(n.toFixed(1));

/** True when the diary entry is internally consistent — the awake minutes cannot
 *  exceed the time in bed. An impossible night is rejected rather than producing
 *  a negative total sleep time that would then be graphed as if it were real. */
export function isValidEntry(e: SleepDiaryEntry): boolean {
  const parts = [e.timeInBedMin, e.sleepLatencyMin, e.wakeAfterSleepOnsetMin, e.terminalWakefulnessMin, e.awakenings];
  if (!parts.every((n) => Number.isFinite(n) && n >= 0)) return false;
  if (e.timeInBedMin <= 0 || e.timeInBedMin > 24 * 60) return false;
  const awake = e.sleepLatencyMin + e.wakeAfterSleepOnsetMin + e.terminalWakefulnessMin;
  return awake <= e.timeInBedMin;
}

export function metricsFor(e: SleepDiaryEntry): SleepMetrics {
  if (!isValidEntry(e)) {
    throw new RangeError("sleep diary entry is not internally consistent (awake minutes exceed time in bed)");
  }
  const totalSleepMin = e.timeInBedMin - e.sleepLatencyMin - e.wakeAfterSleepOnsetMin - e.terminalWakefulnessMin;
  return {
    totalSleepMin,
    efficiencyPct: round1((totalSleepMin / e.timeInBedMin) * 100),
    formulaTh:
      `เวลานอนจริง = ${e.timeInBedMin} − ${e.sleepLatencyMin} − ${e.wakeAfterSleepOnsetMin} − ` +
      `${e.terminalWakefulnessMin} = ${totalSleepMin} นาที · ประสิทธิภาพการนอน = ${totalSleepMin} ÷ ${e.timeInBedMin} × 100`,
  };
}

export interface SleepSummary {
  nights: number;
  meanEfficiencyPct: number;
  meanTotalSleepMin: number;
  /** Nights meeting the conventional quantitative criteria for disturbed sleep. */
  nightsAboveLatencyThreshold: number;
  nightsAboveWasoThreshold: number;
  /** True when the diary meets the conventional frequency criterion. Presented as
   *  "worth discussing with a clinician", never as a diagnosis of insomnia. */
  meetsFrequencyCriterion: boolean;
  /** Honest caveat when there is too little data to say anything. */
  noteTh: string;
}

/** Summarise a diary. Returns a zero-night summary rather than throwing on an
 *  empty diary — a new user has no nights yet, and that is not an error. */
export function summarise(entries: readonly SleepDiaryEntry[]): SleepSummary {
  const valid = entries.filter(isValidEntry);
  if (valid.length === 0) {
    return {
      nights: 0,
      meanEfficiencyPct: 0,
      meanTotalSleepMin: 0,
      nightsAboveLatencyThreshold: 0,
      nightsAboveWasoThreshold: 0,
      meetsFrequencyCriterion: false,
      noteTh: "ยังไม่มีบันทึกการนอน — บันทึกอย่างน้อย 7 คืนจึงจะเห็นแนวโน้มได้",
    };
  }

  const metrics = valid.map(metricsFor);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const overLatency = valid.filter((e) => e.sleepLatencyMin > SLEEP_REFERENCE.latencyMin).length;
  const overWaso = valid.filter((e) => e.wakeAfterSleepOnsetMin > SLEEP_REFERENCE.wasoMin).length;

  return {
    nights: valid.length,
    meanEfficiencyPct: round1(mean(metrics.map((m) => m.efficiencyPct))),
    meanTotalSleepMin: Math.round(mean(metrics.map((m) => m.totalSleepMin))),
    nightsAboveLatencyThreshold: overLatency,
    nightsAboveWasoThreshold: overWaso,
    // The frequency criterion is defined per week, so it only means anything once
    // a week of nights exists.
    meetsFrequencyCriterion:
      valid.length >= 7 && Math.max(overLatency, overWaso) >= SLEEP_REFERENCE.nightsPerWeek,
    noteTh:
      valid.length < 7
        ? `มี ${valid.length} คืน — เกณฑ์เชิงปริมาณนับเป็น "คืนต่อสัปดาห์" จึงยังสรุปไม่ได้จนกว่าจะครบ 7 คืน`
        : SLEEP_REFERENCE.sourceTh,
  };
}
