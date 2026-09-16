// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  CSV serialisation.                                                      ║
// ║                                                                          ║
// ║  Two things here are not optional and are routinely got wrong:           ║
// ║                                                                          ║
// ║   1. FORMULA INJECTION. A spreadsheet treats a cell beginning with        ║
// ║      = + - @ (or tab / carriage return) as a formula. Every string in     ║
// ║      this export — symbols, notes, journal lessons — is typed by a user,  ║
// ║      and the file is opened by that user or someone they send it to.      ║
// ║      `=HYPERLINK("http://evil","click")` in a shared watchlist note is a  ║
// ║      working attack, so risky cells are prefixed with an apostrophe,      ║
// ║      which spreadsheets strip on display and treat as text.               ║
// ║                                                                          ║
// ║   2. THE BOM. Excel on Windows decodes a CSV as the system codepage       ║
// ║      unless the file opens with a UTF-8 byte-order mark. Without it,      ║
// ║      every Thai character in the file becomes mojibake — which, for a     ║
// ║      product whose entire UI is Thai, means the export is useless to      ║
// ║      most of the people paying for it.                                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/** Characters a spreadsheet may read as the start of a formula. */
const FORMULA_LEAD = /^[=+\-@\t\r]/

/** Characters that force RFC 4180 quoting. */
const NEEDS_QUOTES = /[",\r\n]/

export type CsvValue = string | number | boolean | Date | null | undefined

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''

  // Neutralise before quoting: the apostrophe has to land inside the quotes.
  const text = FORMULA_LEAD.test(value) ? `'${value}` : value
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function csvRow(values: CsvValue[]): string {
  return values.map(csvCell).join(',')
}

/** UTF-8 BOM. See the header note — without it Excel mangles every Thai row. */
export const UTF8_BOM = '﻿'

export interface CsvColumn<T> {
  /** Header text, in Thai to match the UI the numbers were read from. */
  header: string
  value: (row: T) => CsvValue
}

/**
 * Serialise rows to a complete CSV document.
 *
 * CRLF line endings, per RFC 4180 — Excel accepts LF but some older importers
 * do not, and nothing accepts CRLF badly.
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [csvRow(columns.map((c) => c.header))]
  for (const row of rows) lines.push(csvRow(columns.map((c) => c.value(row))))
  return UTF8_BOM + lines.join('\r\n') + '\r\n'
}

/** A filename that sorts chronologically and survives every filesystem. */
export function csvFilename(dataset: string, at = new Date()): string {
  const stamp = at.toISOString().slice(0, 10)
  return `stagelab-${dataset}-${stamp}.csv`
}
