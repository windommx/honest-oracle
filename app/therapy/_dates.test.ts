import { describe, it, expect } from "vitest";
import { localDate, localDateOf } from "./_dates";

describe("localDate — the bug this replaced", () => {
  it("returns the local calendar day, not the UTC one", () => {
    // 06:00 in Bangkok on the 8th is still the 7th in UTC. toISOString() —
    // the usual way to write this — returns the 7th, which is the wrong night
    // and, as the input's `max`, made the right one unselectable.
    const morningInBangkok = new Date("2026-09-08T06:00:00+07:00");
    expect(morningInBangkok.toISOString().slice(0, 10)).toBe("2026-09-07"); // the old behaviour
    expect(localDate(morningInBangkok)).toBe(dayIn(morningInBangkok));
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
