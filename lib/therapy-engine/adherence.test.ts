import { describe, it, expect } from "vitest";
import {
  MIN_WEEKS_FOR_PATTERN,
  WEEK_MS,
  bucketByWeek,
  byKind,
  summariseAdherence,
  type SessionRecord,
} from "./adherence";

const DAY = 86_400_000;
const START = 1_700_000_000_000;

const session = (dayIndex: number, over: Partial<SessionRecord> = {}): SessionRecord => ({
  at: START + dayIndex * DAY,
  kind: "music",
  plannedMin: 20,
  completedMin: 20,
  ...over,
});

const window = (weeks: number) => [START, START + weeks * WEEK_MS] as const;

describe("bucketing by week", () => {
  it("materialises every week in the window, not just the ones with data", () => {
    // THE point of the module. Six sessions over three months plotted only
    // where they happened is six points in a row, and a lapsed course looks
    // identical to a kept one.
    const weeks = bucketByWeek([session(0), session(56)], ...window(9));
    expect(weeks.length).toBe(9);
    expect(weeks.filter((w) => w.empty).length).toBe(7);
  });

  it("an empty week carries zero rather than being absent", () => {
    const weeks = bucketByWeek([session(0)], ...window(3));
    expect(weeks[1]).toMatchObject({ sessions: 0, completedMin: 0, completionRate: 0, empty: true });
  });

  it("puts each session in the week it happened in", () => {
    const weeks = bucketByWeek([session(0), session(6), session(7), session(13)], ...window(2));
    expect(weeks[0].sessions).toBe(2);
    expect(weeks[1].sessions).toBe(2);
  });

  it("the window is the caller's, so a lapse stays visible at the end", () => {
    // Deriving the window from first-to-last session would end the chart at
    // the last session and delete the lapse from the picture.
    const weeks = bucketByWeek([session(0)], ...window(8));
    expect(weeks.length).toBe(8);
    expect(weeks[weeks.length - 1].empty).toBe(true);
  });

  it("drops sessions outside the window rather than folding them into an edge", () => {
    const weeks = bucketByWeek(
      [session(-7), session(3), session(100)],
      ...window(4)
    );
    expect(weeks.reduce((n, w) => n + w.sessions, 0)).toBe(1);
  });

  it("indexes the weeks so a caller need not redo date arithmetic", () => {
    const weeks = bucketByWeek([], ...window(5));
    expect(weeks.map((w) => w.index)).toEqual([0, 1, 2, 3, 4]);
    expect(weeks[3].startAt).toBe(START + 3 * WEEK_MS);
  });

  it("returns nothing for a window that does not go forwards", () => {
    expect(bucketByWeek([session(0)], START, START)).toEqual([]);
    expect(bucketByWeek([session(0)], START, START - WEEK_MS)).toEqual([]);
  });
});

describe("completion against what was planned", () => {
  it("an abandoned session is a fraction of itself, not a whole one", () => {
    const weeks = bucketByWeek([session(0, { plannedMin: 20, completedMin: 5 })], ...window(1));
    expect(weeks[0].completionRate).toBeCloseTo(0.25, 6);
  });

  it("a week is the ratio of its totals, not the mean of its sessions", () => {
    // 5/20 and 20/20 average to 0.625 per session but are 25/40 of the week.
    const weeks = bucketByWeek(
      [session(0, { completedMin: 5 }), session(1, { completedMin: 20 })],
      ...window(1)
    );
    expect(weeks[0].completionRate).toBeCloseTo(25 / 40, 6);
  });

  it("never divides by zero into a template", () => {
    const weeks = bucketByWeek([session(0, { plannedMin: 0, completedMin: 0 })], ...window(1));
    expect(weeks[0].completionRate).toBe(0);
    expect(Number.isFinite(weeks[0].completionRate)).toBe(true);
  });

  it("ignores negative minutes instead of subtracting them from the total", () => {
    const weeks = bucketByWeek([session(0, { completedMin: -30 })], ...window(1));
    expect(weeks[0].completedMin).toBe(0);
  });
});

describe("the summary", () => {
  it("counts empty weeks in the weekly mean", () => {
    // 60 minutes in week one and nothing for seven more is 7.5 min/week, not
    // 60. Excluding the empty weeks inflates it by however long the lapse was.
    const s = summariseAdherence([session(0, { completedMin: 60, plannedMin: 60 })], ...window(8));
    expect(s.meanMinutesPerWeek).toBeCloseTo(60 / 8, 6);
    expect(s.emptyWeeks).toBe(7);
    expect(s.noteTh).toContain("สูงกว่าความจริง");
  });

  it("reports the overall completion rate across the window", () => {
    const s = summariseAdherence(
      [session(0, { plannedMin: 20, completedMin: 10 }), session(8, { plannedMin: 20, completedMin: 20 })],
      ...window(3)
    );
    expect(s.totalPlannedMin).toBe(40);
    expect(s.totalCompletedMin).toBe(30);
    expect(s.completionRate).toBeCloseTo(0.75, 6);
  });

  it("a current streak ends when the practising does", () => {
    // Three weeks on, then three weeks off. "Current" has to read zero or the
    // number is worthless.
    const s = summariseAdherence([session(0), session(7), session(14)], ...window(6));
    expect(s.longestStreakWeeks).toBe(3);
    expect(s.currentStreakWeeks).toBe(0);
  });

  it("a streak running to the end of the window is current", () => {
    const s = summariseAdherence([session(7), session(14), session(21)], ...window(4));
    expect(s.currentStreakWeeks).toBe(3);
    expect(s.longestStreakWeeks).toBe(3);
  });

  it("the longest streak survives a later, shorter one", () => {
    const s = summariseAdherence(
      [session(0), session(7), session(14), session(28), session(42)],
      ...window(7)
    );
    expect(s.longestStreakWeeks).toBe(3);
    expect(s.currentStreakWeeks).toBe(1);
  });

  it("says when the window is too short to read as a pattern", () => {
    const s = summariseAdherence([session(0)], ...window(2));
    expect(s.weeks.length).toBeLessThan(MIN_WEEKS_FOR_PATTERN);
    expect(s.noteTh).toContain("สั้นเกิน");
  });

  it("an empty course reports zeros, not NaN", () => {
    const s = summariseAdherence([], ...window(6));
    expect(s.totalSessions).toBe(0);
    expect(s.completionRate).toBe(0);
    expect(s.meanMinutesPerWeek).toBe(0);
    expect(s.currentStreakWeeks).toBe(0);
    for (const v of [s.completionRate, s.meanMinutesPerWeek]) expect(Number.isFinite(v)).toBe(true);
  });

  it("is deterministic — no clock is read", () => {
    const input = [session(0), session(9), session(20)];
    const a = JSON.stringify(summariseAdherence(input, ...window(5)));
    const b = JSON.stringify(summariseAdherence(input, ...window(5)));
    expect(a).toBe(b);
  });
});

describe("splitting by what was practised", () => {
  it("keeps music and breathing apart", () => {
    // Different interventions with different evidence behind them; one
    // combined minute count hides which of the two someone actually does.
    const split = byKind([
      session(0, { kind: "music", completedMin: 30 }),
      session(1, { kind: "breath", completedMin: 5 }),
      session(2, { kind: "breath", completedMin: 5 }),
    ]);
    expect(split.music).toEqual({ sessions: 1, completedMin: 30 });
    expect(split.breath).toEqual({ sessions: 2, completedMin: 10 });
  });

  it("reports zeros for a kind nobody practised", () => {
    const split = byKind([session(0, { kind: "music" })]);
    expect(split.breath).toEqual({ sessions: 0, completedMin: 0 });
  });

  it("ignores a record whose kind it does not know", () => {
    const split = byKind([session(0, { kind: "yoga" as SessionRecord["kind"] })]);
    expect(split.music.sessions).toBe(0);
    expect(split.breath.sessions).toBe(0);
  });
});
