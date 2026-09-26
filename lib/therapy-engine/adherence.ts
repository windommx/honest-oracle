// ╔══════════════════════════════════════════════════════════════════╗
// ║  ADHERENCE — what was actually done, counted honestly.            ║
// ║                                                                    ║
// ║  The number a wellness app usually shows is total minutes, which   ║
// ║  only ever goes up and therefore cannot report a bad month. The    ║
// ║  quantity that matters clinically is DOSE OVER TIME: forty         ║
// ║  minutes a week for six weeks and four hours in one Sunday are     ║
// ║  the same total and are not the same treatment.                    ║
// ║                                                                    ║
// ║  So everything here is bucketed by week, and the central rule is:  ║
// ║                                                                    ║
// ║      A WEEK WITH NO SESSIONS IS A ZERO, NOT A GAP.                 ║
// ║                                                                    ║
// ║  Plotting only the weeks that have data draws a flattering line    ║
// ║  through the ones that do not — six sessions over three months     ║
// ║  becomes six points in a row, and a chart of a lapsed course looks ║
// ║  identical to a chart of a kept one. Empty weeks are materialised  ║
// ║  and carry zero, which is what makes the picture truthful and is   ║
// ║  the one thing this module would be useless without.               ║
// ║                                                                    ║
// ║  The other rule: completion is measured against what was PLANNED   ║
// ║  at the time, which the session record stores. A session where     ║
// ║  someone set twenty minutes and stopped at five is 25% of that     ║
// ║  session, and saying so is the point — adherence data exists to    ║
// ║  be looked at when something is not working.                       ║
// ╚══════════════════════════════════════════════════════════════════╝

/** One completed (or abandoned) practice session, as the store holds it. */
export interface SessionRecord {
  /** Epoch milliseconds. The caller supplies it; this module reads no clock. */
  at: number;
  kind: "music" | "breath";
  plannedMin: number;
  completedMin: number;
}

export interface WeekBucket {
  /** Epoch ms of the week's first day, local midnight as the caller defined it. */
  startAt: number;
  /** 0-based index from the first week of the window, so a caller can position
   *  a bar without doing date arithmetic in a render. */
  index: number;
  sessions: number;
  plannedMin: number;
  completedMin: number;
  /** completed ÷ planned, 0..1. Zero for a week with no sessions — NOT null
   *  and not omitted, because a week nobody practised is a real data point
   *  about the course. */
  completionRate: number;
  /** True when the week had no sessions at all. Distinct from a week that was
   *  attempted and abandoned, which is a different clinical picture. */
  empty: boolean;
}

export const WEEK_MS = 7 * 86_400_000;

export interface AdherenceSummary {
  weeks: WeekBucket[];
  totalSessions: number;
  totalCompletedMin: number;
  totalPlannedMin: number;
  /** Across the whole window: completed ÷ planned. Zero when nothing was
   *  planned, rather than NaN reaching a template. */
  completionRate: number;
  /** Mean completed minutes per week, counting empty weeks. The qualifier is
   *  the whole point: excluding them inflates this by however long the lapse
   *  was. */
  meanMinutesPerWeek: number;
  /** Consecutive weeks with at least one session, counting back from the last
   *  week of the window. */
  currentStreakWeeks: number;
  longestStreakWeeks: number;
  /** Weeks in the window with no session. */
  emptyWeeks: number;
  noteTh: string;
}

/** Minimum weeks before a weekly pattern is worth reading at all. Four weeks is
 *  the shortest window in which "a lapse" and "a slow start" look different. */
export const MIN_WEEKS_FOR_PATTERN = 4;

const empty = (startAt: number, index: number): WeekBucket => ({
  startAt,
  index,
  sessions: 0,
  plannedMin: 0,
  completedMin: 0,
  completionRate: 0,
  empty: true,
});

/**
 * Bucket sessions into consecutive weeks.
 *
 * `windowStart` and `windowEnd` are supplied rather than derived from the data
 * so that the window is the caller's editorial decision and is visible in the
 * output. Deriving it from first-to-last session would make the window shrink
 * whenever someone stops practising — the chart would end at the last session
 * and the lapse would disappear from it, which is precisely the failure this
 * module is built to avoid.
 */
export function bucketByWeek(
  sessions: readonly SessionRecord[],
  windowStart: number,
  windowEnd: number
): WeekBucket[] {
  if (!(windowEnd > windowStart)) return [];
  const count = Math.max(1, Math.ceil((windowEnd - windowStart) / WEEK_MS));
  const buckets: WeekBucket[] = [];
  for (let i = 0; i < count; i++) buckets.push(empty(windowStart + i * WEEK_MS, i));

  for (const s of sessions) {
    if (s.at < windowStart || s.at >= windowEnd) continue;
    const i = Math.floor((s.at - windowStart) / WEEK_MS);
    if (i < 0 || i >= buckets.length) continue;
    const b = buckets[i];
    b.sessions += 1;
    b.plannedMin += Math.max(0, s.plannedMin);
    b.completedMin += Math.max(0, s.completedMin);
    b.empty = false;
  }

  for (const b of buckets) {
    b.completionRate = b.plannedMin > 0 ? b.completedMin / b.plannedMin : 0;
  }
  return buckets;
}

/** Longest and current runs of non-empty weeks. Current counts back from the
 *  END of the window, so a streak that ended three weeks ago reads as zero —
 *  which is what "current" has to mean for the number to be useful. */
function streaks(weeks: readonly WeekBucket[]): { current: number; longest: number } {
  let longest = 0;
  let run = 0;
  for (const w of weeks) {
    run = w.empty ? 0 : run + 1;
    if (run > longest) longest = run;
  }
  let current = 0;
  for (let i = weeks.length - 1; i >= 0 && !weeks[i].empty; i--) current++;
  return { current, longest };
}

export function summariseAdherence(
  sessions: readonly SessionRecord[],
  windowStart: number,
  windowEnd: number
): AdherenceSummary {
  const weeks = bucketByWeek(sessions, windowStart, windowEnd);
  const totalSessions = weeks.reduce((n, w) => n + w.sessions, 0);
  const totalCompletedMin = weeks.reduce((n, w) => n + w.completedMin, 0);
  const totalPlannedMin = weeks.reduce((n, w) => n + w.plannedMin, 0);
  const { current, longest } = streaks(weeks);
  const emptyWeeks = weeks.filter((w) => w.empty).length;

  return {
    weeks,
    totalSessions,
    totalCompletedMin,
    totalPlannedMin,
    completionRate: totalPlannedMin > 0 ? totalCompletedMin / totalPlannedMin : 0,
    meanMinutesPerWeek: weeks.length > 0 ? totalCompletedMin / weeks.length : 0,
    currentStreakWeeks: current,
    longestStreakWeeks: longest,
    emptyWeeks,
    noteTh:
      weeks.length < MIN_WEEKS_FOR_PATTERN
        ? `มีข้อมูล ${weeks.length} สัปดาห์ — ยังสั้นเกินกว่าจะอ่านเป็นรูปแบบการฝึกได้`
        : `นับจาก ${weeks.length} สัปดาห์ รวมสัปดาห์ที่ไม่ได้ฝึก ${emptyWeeks} สัปดาห์ด้วย — ` +
          `ค่าเฉลี่ยที่ตัดสัปดาห์ว่างออกจะสูงกว่าความจริง`,
  };
}

/** Sessions split by what they were. Music and breathing are different
 *  interventions with different evidence behind them; one combined minute
 *  count would hide which of the two someone actually does. */
export function byKind(sessions: readonly SessionRecord[]): Record<
  SessionRecord["kind"],
  { sessions: number; completedMin: number }
> {
  const out = {
    music: { sessions: 0, completedMin: 0 },
    breath: { sessions: 0, completedMin: 0 },
  };
  for (const s of sessions) {
    const bucket = out[s.kind];
    if (!bucket) continue;
    bucket.sessions += 1;
    bucket.completedMin += Math.max(0, s.completedMin);
  }
  return out;
}
