// ╔══════════════════════════════════════════════════════════════════╗
// ║  DATES — a calendar day is a LOCAL fact, not a UTC one.           ║
// ║                                                                    ║
// ║  `new Date().toISOString().slice(0, 10)` is the usual way to get   ║
// ║  "today", and it is wrong for every user east of Greenwich in the  ║
// ║  early morning. In Bangkok (UTC+7) it returns YESTERDAY until      ║
// ║  07:00 local.                                                      ║
// ║                                                                    ║
// ║  That window is exactly when a sleep diary is filled in. The date  ║
// ║  field defaulted to the wrong night, and because the same helper   ║
// ║  fed the input's `max`, the user could not even correct it —       ║
// ║  today was not selectable. Two nights then collided on one date    ║
// ║  key, and upsert-by-date silently overwrote one of them.           ║
// ║                                                                    ║
// ║  "The night I slept" has no meaning in UTC, so these read the      ║
// ║  local calendar. en-CA is used only because it formats as          ║
// ║  YYYY-MM-DD; the locale is a formatting trick, not a language      ║
// ║  choice, and the value never reaches the user as prose.            ║
// ╚══════════════════════════════════════════════════════════════════╝

/** The local calendar date of `d`, as YYYY-MM-DD. */
export function localDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The local calendar date of an epoch-ms timestamp. */
export const localDateOf = (ms: number): string => localDate(new Date(ms));
