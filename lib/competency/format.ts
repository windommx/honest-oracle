// ╔══════════════════════════════════════════════════════════════════╗
// ║  DATE FORMATTING — Thai, Buddhist Era, and deterministic.          ║
// ║  Intl output varies with the ICU build (and the sandbox may have   ║
// ║  no Thai locale at all), so this does the four lines by hand.      ║
// ║  Assessment dates are calendar days stored at UTC midnight; every  ║
// ║  read uses UTC getters so a Bangkok browser and a UTC server print ║
// ║  the same day.                                                     ║
// ╚══════════════════════════════════════════════════════════════════╝

export const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
] as const;

export const THAI_MONTHS_LONG = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
] as const;

function toDate(input: string | Date): Date | null {
  const d = typeof input === "string" ? new Date(input) : input;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "20 ธ.ค. 2562" (short) or "20 ธันวาคม 2562" (long). Invalid input → "-". */
export function formatThaiDate(input: string | Date, style: "short" | "long" = "short"): string {
  const d = toDate(input);
  if (!d) return "-";
  const months = style === "long" ? THAI_MONTHS_LONG : THAI_MONTHS_SHORT;
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
}

/** "YYYY-MM-DD" (UTC) for <input type="date"> values and CSV cells. */
export function toDateInputValue(input: string | Date): string {
  const d = toDate(input);
  if (!d) return "";
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${day}`;
}

/**
 * Parse an assessment date from a client.
 * - "YYYY-MM-DD" → that calendar day at UTC midnight (a real calendar check: 2023-02-30 is rejected).
 * - a full ISO datetime → that instant, unchanged.
 * Anything else → null.
 */
export function parseAssessDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
    return date;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}
