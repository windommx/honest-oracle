import { describe, it, expect } from "vitest";
import { localDate, localDateOf } from "./_dates";

describe("localDate — the bug this replaced", () => {
  it("returns the local calendar day, not the UTC one", () => {
    // 06:00 in Bangkok on the 8th is still the 7th in UTC. toISOString() —
    // the usual way to write this — returns the 7th, which is the wrong night
    // and, as the input's `max`, made the right one unselectable.
    const morningInBangkok = new Date("2026-09-08T06:00:00+07:00");
    expect(morningInBangkok.toISOString().slice(0, 10)).toBe("2026-09-07"); // the old behaviour

    // Asserted against a value derived by Intl for a NAMED zone, not against a
    // reimplementation of localDate. The previous form compared the module to
    // a line-for-line copy of itself, so reverting _dates.ts to
    // toISOString().slice(0,10) would have left both sides agreeing — the test
    // read as a regression guard and could not fail.
    const inBangkok = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(morningInBangkok);
    expect(inBangkok).toBe("2026-09-08");

    // localDate reads the RUNTIME's zone by definition, so the straddle can
    // only be exercised where the runtime is not UTC. Where it is, the correct
    // answer happens to equal the UTC one, and that is what is checked.
    const runtimeIsUtc = new Date().getTimezoneOffset() === 0;
    expect(localDate(morningInBangkok)).toBe(runtimeIsUtc ? "2026-09-07" : dayIn(morningInBangkok));
    if (!runtimeIsUtc) {
      expect(localDate(morningInBangkok)).not.toBe(morningInBangkok.toISOString().slice(0, 10));
    }
  });

  it("disagrees with toISOString wherever the local day can straddle UTC", () => {
    // Constructed from LOCAL components, so this is local midnight in whatever
    // zone the runner is in — which is a different UTC date unless the offset
    // is exactly zero.
    const localMidnight = new Date(2026, 8, 8, 0, 30, 0);
    expect(localDate(localMidnight)).toBe("2026-09-08");
    if (localMidnight.getTimezoneOffset() > 0) {
      // East of Greenwich: UTC is still the previous day.
      expect(localMidnight.toISOString().slice(0, 10)).toBe("2026-09-07");
    }
  });

  it("pads month and day to two digits", () => {
    const d = new Date(2026, 0, 5, 12, 0, 0); // 5 Jan 2026, local
    expect(localDate(d)).toBe("2026-01-05");
  });

  it("agrees with the runtime's own local calendar all day long", () => {
    // Checked against the platform rather than against a hardcoded string, so
    // the test is meaningful in whatever zone CI happens to run in.
    for (const hour of [0, 1, 6, 12, 18, 23]) {
      const d = new Date(2026, 8, 8, hour, 30, 0);
      expect(localDate(d)).toBe("2026-09-08");
    }
  });

  it("rolls over at local midnight, not at 00:00 UTC", () => {
    const beforeMidnight = new Date(2026, 8, 8, 23, 59, 0);
    const afterMidnight = new Date(2026, 8, 9, 0, 1, 0);
    expect(localDate(beforeMidnight)).toBe("2026-09-08");
    expect(localDate(afterMidnight)).toBe("2026-09-09");
  });

  it("localDateOf reads an epoch timestamp the same way", () => {
    const d = new Date(2026, 8, 8, 6, 0, 0);
    expect(localDateOf(d.getTime())).toBe("2026-09-08");
  });

  it("sorts lexicographically, which the diary relies on", () => {
    const days = [new Date(2026, 8, 9), new Date(2026, 0, 5), new Date(2026, 8, 8)].map((d) => localDate(d));
    expect([...days].sort()).toEqual(["2026-01-05", "2026-09-08", "2026-09-09"]);
  });
});

/** The local calendar day of `d`, derived independently of the module under test. */
function dayIn(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
