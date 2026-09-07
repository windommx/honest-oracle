import { describe, it, expect } from "vitest";
import {
  IDLE,
  completedMinutes,
  elapsedMs,
  elapsedSeconds,
  isRunning,
  pause,
  reset,
  start,
  type ClockState,
} from "./_session-clock";

const MIN = 60_000;
const T0 = 1_700_000_000_000;

describe("session clock", () => {
  it("starts idle", () => {
    expect(isRunning(IDLE)).toBe(false);
    expect(elapsedMs(IDLE, T0)).toBe(0);
  });

  it("counts the live segment while running", () => {
    const c = start(IDLE, T0);
    expect(isRunning(c)).toBe(true);
    expect(elapsedMs(c, T0 + 90_000)).toBe(90_000);
    expect(elapsedSeconds(c, T0 + 90_000)).toBe(90);
  });

  it("banks the live segment on pause", () => {
    const c = pause(start(IDLE, T0), T0 + 5 * MIN);
    expect(isRunning(c)).toBe(false);
    expect(c.bankedMs).toBe(5 * MIN);
    // Time passing while paused adds nothing.
    expect(elapsedMs(c, T0 + 60 * MIN)).toBe(5 * MIN);
  });

  it("adds across pause and resume", () => {
    let c = pause(start(IDLE, T0), T0 + 5 * MIN); // 5 min banked
    c = start(c, T0 + 30 * MIN); // resumed 25 minutes later
    expect(elapsedMs(c, T0 + 33 * MIN)).toBe(8 * MIN); // 5 banked + 3 live
  });

  it("a second start does not discard the segment in progress", () => {
    // A double-tapped play button must not silently reset the clock.
    const c = start(start(IDLE, T0), T0 + 2 * MIN);
    expect(elapsedMs(c, T0 + 3 * MIN)).toBe(3 * MIN);
  });

  it("pausing twice does not double-count", () => {
    const once = pause(start(IDLE, T0), T0 + 4 * MIN);
    expect(pause(once, T0 + 9 * MIN)).toEqual(once);
  });

  it("survives a clock that jumps backwards", () => {
    // NTP correction, or a laptop waking with a stale timestamp. Negative
    // elapsed would show as a negative session length.
    const c = start(IDLE, T0);
    expect(elapsedMs(c, T0 - 60_000)).toBe(0);
    expect(pause(c, T0 - 60_000).bankedMs).toBe(0);
  });

  it("reset returns to idle", () => {
    expect(reset()).toEqual(IDLE);
  });
});

describe("completedMinutes — the number written to the adherence log", () => {
  /** The regression this module was extracted for. */
  it("counts a running session stopped by the button", () => {
    // The bug: the stop handler read only the banked total, which is still zero
    // for a session that never paused. Twenty minutes of listening logged as 0.
    const running = start(IDLE, T0);
    expect(completedMinutes(running, T0 + 20 * MIN, 20)).toBe(20);
  });

  it("counts a session that ran, paused, and resumed before stopping", () => {
    let c = pause(start(IDLE, T0), T0 + 8 * MIN);
    c = start(c, T0 + 10 * MIN);
    expect(completedMinutes(c, T0 + 14 * MIN, 20)).toBe(12);
  });

  it("rounds down — a logged minute is a minute actually sat through", () => {
    const c = start(IDLE, T0);
    expect(completedMinutes(c, T0 + 5 * MIN + 59_000, 20)).toBe(5);
  });

  it("logs zero for an abandoned session rather than dropping it", () => {
    const c = start(IDLE, T0);
    expect(completedMinutes(c, T0 + 40_000, 20)).toBe(0);
  });

  it("never exceeds the planned length", () => {
    // The session-log API rejects completedMin > plannedMin, so an overrun from
    // a slow timer tick must be capped here rather than 400ing on sync.
    const c = start(IDLE, T0);
    expect(completedMinutes(c, T0 + 45 * MIN, 20)).toBe(20);
  });

  it("never goes negative", () => {
    const c: ClockState = { bankedMs: 0, startedAt: T0 + 10 * MIN };
    expect(completedMinutes(c, T0, 20)).toBe(0);
  });
});
