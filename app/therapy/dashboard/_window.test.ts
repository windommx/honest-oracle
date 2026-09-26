import { describe, it, expect } from "vitest";
import {
  dashboardWindow,
  earliestRecord,
  nightsWithinWindow,
  withinWindow,
} from "./_window";
import type { SleepDiaryEntry } from "@/lib/therapy-engine/sleep";

const DAY = 86_400_000;
/** A Thursday at 07:24 UTC — deliberately BEFORE midday, which is when the
 *  bug this file exists for used to appear. */
const NOW = Date.parse("2026-09-26T07:24:00Z");

/** UTC, so the test does not depend on the runner's timezone. */
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const night = (date: string): SleepDiaryEntry => ({
  date,
  timeInBedMin: 480,
  sleepLatencyMin: 20,
  wakeAfterSleepOnsetMin: 20,
  terminalWakefulnessMin: 10,
  awakenings: 1,
});

describe("the window itself", () => {
  it("counts back the requested number of days", () => {
    const w = dashboardWindow(NOW, 30, NOW - 400 * DAY);
    expect(w.end).toBe(NOW);
    expect(w.start).toBe(NOW - 30 * DAY);
  });

  it("reaches the earliest record when asked for everything", () => {
    const earliest = NOW - 400 * DAY;
    expect(dashboardWindow(NOW, 0, earliest).start).toBe(earliest);
  });

  it("never starts in the future, even with no records at all", () => {
    expect(dashboardWindow(NOW, 0, NOW + DAY).start).toBe(NOW);
  });

  it("finds the earliest across every store", () => {
    const earliest = earliestRecord(
      [{ at: NOW - 10 * DAY }],
      [{ at: NOW - 50 * DAY }, { at: NOW - 2 * DAY }]
    );
    expect(earliest).toBe(NOW - 50 * DAY);
  });

  it("reports no earliest rather than Infinity when there is nothing", () => {
    expect(Number.isNaN(earliestRecord([], []))).toBe(true);
  });
});

describe("rows that carry a moment", () => {
  it("keeps what is inside and drops what is not", () => {
    const w = dashboardWindow(NOW, 30, NOW);
    const kept = withinWindow(
      [{ at: NOW - 40 * DAY }, { at: NOW - 10 * DAY }, { at: NOW + DAY }],
      w
    );
    expect(kept.length).toBe(1);
  });

  it("includes both ends", () => {
    const w = dashboardWindow(NOW, 30, NOW);
    expect(withinWindow([{ at: w.start }, { at: w.end }], w).length).toBe(2);
  });
});

describe("the sleep diary, which carries a date and not a moment", () => {
  it("keeps TODAY'S night when the page is opened before midday", () => {
    // The bug. Parsing the date at noon put today's entry in the future for
    // anyone looking in the morning, so the most recent night — the one
    // people open the page to see — vanished until lunchtime.
    const w = dashboardWindow(NOW, 30, NOW);
    const today = toDate(NOW);
    expect(new Date(NOW).getUTCHours()).toBeLessThan(12);
    expect(nightsWithinWindow([night(today)], w, toDate).map((n) => n.date)).toEqual([today]);
  });

  it("keeps the night at the far edge of the window", () => {
    const w = dashboardWindow(NOW, 30, NOW);
    const edge = toDate(w.start);
    expect(nightsWithinWindow([night(edge)], w, toDate).length).toBe(1);
  });

  it("drops a night before the window", () => {
    const w = dashboardWindow(NOW, 30, NOW);
    expect(nightsWithinWindow([night(toDate(NOW - 31 * DAY))], w, toDate).length).toBe(0);
  });

  it("drops a night dated in the future", () => {
    const w = dashboardWindow(NOW, 30, NOW);
    expect(nightsWithinWindow([night(toDate(NOW + DAY))], w, toDate).length).toBe(0);
  });

  it("keeps every night of a 20-night diary inside a 90-day window", () => {
    // The end-to-end shape the browser check caught: 20 seeded nights had to
    // come back as 20, and came back as 19.
    const w = dashboardWindow(NOW, 90, NOW);
    const diary = Array.from({ length: 20 }, (_, i) => night(toDate(NOW - i * DAY)));
    expect(nightsWithinWindow(diary, w, toDate).length).toBe(20);
  });

  it("uses the caller's timezone rather than UTC", () => {
    // A night logged at 6am must not be dated yesterday because the server is
    // hours ahead. The formatter is injected so this is the caller's choice.
    // +17h from 07:24Z lands past midnight, so the two formatters really do
    // disagree about what day it is — which is the situation being tested.
    const ahead = (ms: number) => new Date(ms + 17 * 3_600_000).toISOString().slice(0, 10);
    const w = dashboardWindow(NOW, 30, NOW);
    expect(ahead(NOW)).not.toBe(toDate(NOW));
    expect(nightsWithinWindow([night(ahead(NOW))], w, ahead).length).toBe(1);
    // And the same row is rejected by the other timezone's reading of it.
    expect(nightsWithinWindow([night(ahead(NOW))], w, toDate).length).toBe(0);
  });
});
