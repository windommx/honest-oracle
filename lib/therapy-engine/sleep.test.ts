import { describe, it, expect } from "vitest";
import { SLEEP_REFERENCE, isValidEntry, metricsFor, summarise, type SleepDiaryEntry } from "./sleep";

const night = (over: Partial<SleepDiaryEntry> = {}): SleepDiaryEntry => ({
  date: "2026-01-01",
  timeInBedMin: 480,
  sleepLatencyMin: 20,
  wakeAfterSleepOnsetMin: 20,
  terminalWakefulnessMin: 0,
  awakenings: 1,
  ...over,
});

describe("sleep metrics — arithmetic anyone can re-derive", () => {
  it("total sleep time is time in bed minus every awake stretch", () => {
    const m = metricsFor(night()); // 480 − 20 − 20 − 0
    expect(m.totalSleepMin).toBe(440);
  });

  it("efficiency is TST ÷ TIB, to one decimal", () => {
    expect(metricsFor(night()).efficiencyPct).toBeCloseTo(91.7, 1);
  });

  it("prints the formula with the actual numbers substituted in", () => {
    // The number must be checkable by hand — that is what makes it a derived
    // quantity rather than an oracle's output.
    expect(metricsFor(night()).formulaTh).toContain("480 − 20 − 20 − 0 = 440");
  });

  it("a perfect night is 100%, never above", () => {
    const m = metricsFor(night({ sleepLatencyMin: 0, wakeAfterSleepOnsetMin: 0 }));
    expect(m.efficiencyPct).toBe(100);
  });
});

describe("sleep diary validation — an impossible night is refused", () => {
  it("rejects awake minutes exceeding time in bed", () => {
    // Without this, TST goes negative and gets graphed as if it were a real night.
    const impossible = night({ timeInBedMin: 60, sleepLatencyMin: 90 });
    expect(isValidEntry(impossible)).toBe(false);
    expect(() => metricsFor(impossible)).toThrow(RangeError);
  });

  it("rejects negative and non-finite values", () => {
    expect(isValidEntry(night({ sleepLatencyMin: -5 }))).toBe(false);
    expect(isValidEntry(night({ timeInBedMin: Number.NaN }))).toBe(false);
  });

  it("rejects more than 24 hours in bed", () => {
    expect(isValidEntry(night({ timeInBedMin: 1441 }))).toBe(false);
  });

  it("accepts a night where every minute in bed was awake", () => {
    expect(isValidEntry(night({ timeInBedMin: 100, sleepLatencyMin: 100, wakeAfterSleepOnsetMin: 0 }))).toBe(true);
  });
});

describe("diary summary", () => {
  it("an empty diary is a zero-night summary, not a crash", () => {
    const s = summarise([]);
    expect(s.nights).toBe(0);
    expect(s.meetsFrequencyCriterion).toBe(false);
    expect(s.noteTh).toContain("ยังไม่มีบันทึก");
  });

  it("skips internally inconsistent nights instead of poisoning the mean", () => {
    const s = summarise([night(), night({ timeInBedMin: 30, sleepLatencyMin: 200 })]);
    expect(s.nights).toBe(1);
  });

  it("counts nights over the conventional latency and WASO thresholds", () => {
    const s = summarise([
      night({ sleepLatencyMin: 45 }),
      night({ sleepLatencyMin: 60 }),
      night({ wakeAfterSleepOnsetMin: 50 }),
      night(),
    ]);
    expect(s.nightsAboveLatencyThreshold).toBe(2);
    expect(s.nightsAboveWasoThreshold).toBe(1);
  });

  it("withholds the weekly criterion until a week of nights exists", () => {
    // The criterion is defined as "nights per week". Applying it to three nights
    // would be reading a weekly rate off a partial week.
    const threeBadNights = [1, 2, 3].map(() => night({ sleepLatencyMin: 60 }));
    const s = summarise(threeBadNights);
    expect(s.meetsFrequencyCriterion).toBe(false);
    expect(s.noteTh).toContain("ยังสรุปไม่ได้");
  });

  it("meets the criterion at 7 nights with 3 disturbed ones", () => {
    const entries = [
      ...[1, 2, 3].map(() => night({ sleepLatencyMin: 45 })),
      ...[1, 2, 3, 4].map(() => night()),
    ];
    const s = summarise(entries);
    expect(s.nights).toBe(7);
    expect(s.meetsFrequencyCriterion).toBe(true);
    expect(s.noteTh).toBe(SLEEP_REFERENCE.sourceTh);
  });

  it("averages efficiency across valid nights", () => {
    const s = summarise([night(), night({ sleepLatencyMin: 20, wakeAfterSleepOnsetMin: 60 })]);
    // 91.7 and 83.3 → 87.5
    expect(s.meanEfficiencyPct).toBeCloseTo(87.5, 1);
    expect(s.meanTotalSleepMin).toBe(420);
  });
});

describe("reference thresholds are cited conventions, not our numbers", () => {
  it("uses the conventional research cut-offs", () => {
    expect(SLEEP_REFERENCE.efficiencyPct).toBe(85);
    expect(SLEEP_REFERENCE.latencyMin).toBe(30);
    expect(SLEEP_REFERENCE.wasoMin).toBe(30);
    expect(SLEEP_REFERENCE.nightsPerWeek).toBe(3);
    expect(SLEEP_REFERENCE.sourceTh.length).toBeGreaterThan(30);
  });
});
