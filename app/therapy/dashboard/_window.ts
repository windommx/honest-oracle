// ╔══════════════════════════════════════════════════════════════════╗
// ║  WINDOW — deciding which rows the dashboard is about.             ║
// ║                                                                    ║
// ║  Trivial-looking, and it produced the first real bug this page     ║
// ║  had, so it lives out here where tests can hold it.                ║
// ║                                                                    ║
// ║  The trap is that the three stores keep time in two different      ║
// ║  units. Assessments and sessions carry an epoch timestamp — a      ║
// ║  moment. The sleep diary carries a DATE, because a night is        ║
// ║  reported as the morning it belongs to and has no clock time at    ║
// ║  all. Filtering the diary by inventing one (parsing the date at    ║
// ║  noon, say) puts today's entry in the future for anyone looking    ║
// ║  before midday: the most recent night — the one people open the    ║
// ║  page to see — disappeared every morning and came back after       ║
// ║  lunch. Dates are compared as dates.                               ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { SleepDiaryEntry } from "@/lib/therapy-engine/sleep";

const DAY_MS = 86_400_000;

export interface Timestamped {
  at: number;
}

export interface DashboardWindow {
  start: number;
  end: number;
}

/**
 * The range the dashboard covers.
 *
 * `windowDays === 0` means the whole history, which is why `earliest` is
 * passed in: a dashboard that cannot show someone their own full course is
 * withholding their data from them, and deriving the start from a fixed number
 * of days would silently truncate anything longer.
 */
export function dashboardWindow(now: number, windowDays: number, earliest: number): DashboardWindow {
  if (windowDays <= 0) return { start: Math.min(earliest, now), end: now };
  return { start: now - windowDays * DAY_MS, end: now };
}

/** The earliest moment any record exists, or `now` when there are none. */
export function earliestRecord(...groups: readonly (readonly Timestamped[])[]): number {
  let earliest = Infinity;
  for (const group of groups) {
    for (const row of group) if (row.at < earliest) earliest = row.at;
  }
  return Number.isFinite(earliest) ? earliest : Number.NaN;
}

/** Rows that carry a moment. Inclusive at both ends. */
export function withinWindow<T extends Timestamped>(rows: readonly T[], w: DashboardWindow): T[] {
  return rows.filter((r) => r.at >= w.start && r.at <= w.end);
}

/**
 * Diary rows that carry a date.
 *
 * `toLocalDate` is injected rather than imported so the comparison happens in
 * the reader's own timezone — a night logged at 6am must not be dated
 * yesterday because the server is eight hours ahead.
 */
export function nightsWithinWindow(
  nights: readonly SleepDiaryEntry[],
  w: DashboardWindow,
  toLocalDate: (ms: number) => string
): SleepDiaryEntry[] {
  const from = toLocalDate(w.start);
  const to = toLocalDate(w.end);
  // String comparison is correct and total for ISO dates, which is the whole
  // reason the diary stores them that way.
  return nights.filter((n) => n.date >= from && n.date <= to);
}
