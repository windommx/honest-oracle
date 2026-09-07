// ╔══════════════════════════════════════════════════════════════════╗
// ║  SESSION CLOCK — one way to ask how long this session has run.    ║
// ║                                                                    ║
// ║  This exists because the player got it wrong. The clock lived in   ║
// ║  two refs — banked minutes and the timestamp the current run began ║
// ║  — and the render loop read BOTH while the stop handler read only  ║
// ║  the banked one. So a session that ran 20 minutes and was stopped  ║
// ║  by the button logged ZERO: nothing had folded the live segment    ║
// ║  into the bank. Only the runs-to-completion path happened to set   ║
// ║  the bank first, which is why it looked fine.                       ║
// ║                                                                    ║
// ║  Silent, and worse than an obvious break: the adherence log is the ║
// ║  one number on the progress page that is supposed to be a direct   ║
// ║  count of what the user actually did, and it was reporting zero    ║
// ║  for every completed session.                                      ║
// ║                                                                    ║
// ║  The fix is structural rather than a patch. `elapsedMs` is the     ║
// ║  ONLY way to read the clock and it always includes the live        ║
// ║  segment, so there is no longer a half-reading to accidentally     ║
// ║  take. Pure functions over a plain value, and the caller supplies  ║
// ║  `now`, so the whole thing is unit-testable without a timer.       ║
// ╚══════════════════════════════════════════════════════════════════╝

export interface ClockState {
  /** Milliseconds banked from run segments that have already ended. */
  bankedMs: number;
  /** Epoch ms at which the current run segment began; null when not running. */
  startedAt: number | null;
}

export const IDLE: ClockState = { bankedMs: 0, startedAt: null };

export const isRunning = (s: ClockState): boolean => s.startedAt !== null;

/** Begin (or resume) running. Starting an already-running clock is a no-op
 *  rather than a restart — a double-tapped play button must not discard the
 *  segment in progress. */
export function start(s: ClockState, now: number): ClockState {
  return isRunning(s) ? s : { ...s, startedAt: now };
}

/** Stop running, folding the live segment into the bank. */
export function pause(s: ClockState, now: number): ClockState {
  if (!isRunning(s)) return s;
  return { bankedMs: s.bankedMs + Math.max(0, now - s.startedAt!), startedAt: null };
}

/** Total elapsed: banked plus whatever the current segment has run.
 *  The only reader of this clock, by design. */
export function elapsedMs(s: ClockState, now: number): number {
  return s.bankedMs + (isRunning(s) ? Math.max(0, now - s.startedAt!) : 0);
}

export const elapsedSeconds = (s: ClockState, now: number): number => elapsedMs(s, now) / 1000;

/** Whole minutes completed, capped at the planned length.
 *
 *  Rounded DOWN, not to nearest: a session logged as "20 นาที" should be twenty
 *  minutes the user actually sat through. Rounding up flatters the adherence
 *  number, which is the one figure on the progress page that exists to be
 *  unflattering when the truth is. */
export function completedMinutes(s: ClockState, now: number, capMinutes: number): number {
  return Math.min(Math.max(0, capMinutes), Math.floor(elapsedMs(s, now) / 60_000));
}

/** Back to zero — a finished session, or a switch to a different one. */
export const reset = (): ClockState => IDLE;
