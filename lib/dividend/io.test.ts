import { describe, it, expect } from "vitest";
import { parseCsv, parseJson, parseAny, csvTemplate, splitCsvLine, runScreen, runValidation, formatScreenMarkdown, formatBenchmarkMarkdown, REQUIRED_COLUMNS, ALL_COLUMNS } from "./io";
import { syntheticUniverse } from "./fixtures";
import { healthy, priorYear } from "./testkit";
import type { AnnualRecord } from "./types";

function toCsv(rows: AnnualRecord[]): string {
  const cols = ALL_COLUMNS;
  const line = (r: AnnualRecord) => cols.map((c) => { const v = (r as unknown as Record<string, unknown>)[c]; return v === undefined ? "" : String(v); }).join(",");
  return [cols.join(","), ...rows.map(line)].join("\n");
}

describe("CSV / JSON parsing", () => {
  it("round-trips records through the template columns", () => {
    const rows = [priorYear(), healthy()];
    const { records, errors } = parseCsv(toCsv(rows));
    expect(errors).toEqual([]);
    expect(records).toHaveLength(2);
    expect(records[1].eps).toBe(1);
    expect(records[1].sector).toBe("utilities");
    expect(records[0].fiscalYear).toBe(2024);
  });

  it("handles quoted fields, thousands separators, comments and blank optionals", () => {
    const csv = `${csvTemplate()}"ACME, Inc.",2025,"1,000",150,10,100,1,140,40,50,1000,300,150,400,200,100,300,100,0.5,10,,,,,,,,,\n# a comment\n`;
    const { records, errors } = parseCsv(csv);
    expect(errors).toEqual([]);
    expect(records[0].ticker).toBe("ACME, Inc.");
    expect(records[0].revenue).toBe(1000);
    expect(records[0].grossProfit).toBeUndefined();
    expect(splitCsvLine('a,"b ""q"" c",d')).toEqual(["a", 'b "q" c', "d"]);
  });

  it("names the missing required columns and drops (not guesses) bad rows", () => {
    expect(parseCsv("ticker,fiscalYear\nA,2020").errors[0]).toMatch(/missing required columns: revenue/);
    const good = toCsv([healthy()]);
    const bad = good + "\n" + good.split("\n")[1].replace("1000,300", "abc,300");
    const { records, errors } = parseCsv(bad);
    expect(records).toHaveLength(1);
    expect(errors[0]).toMatch(/line 3: totalAssets is not a number/);
  });

  it("parses JSON arrays and { records } and sniffs the format", () => {
    const j = parseJson(JSON.stringify({ records: [healthy()] }));
    expect(j.records).toHaveLength(1);
    expect(parseAny(JSON.stringify([healthy()])).records).toHaveLength(1);
    expect(parseAny(toCsv([healthy()])).records).toHaveLength(1);
    expect(parseJson("{nope").errors[0]).toMatch(/invalid JSON/);
    expect(parseJson('{"x":1}').errors[0]).toMatch(/expected an array/);
    expect(parseJson('[{"ticker":"A"}]').errors[0]).toMatch(/missing fiscalYear/);
  });

  it("the template lists every required column first", () => {
    expect(csvTemplate().split(",").slice(0, REQUIRED_COLUMNS.length)).toEqual([...REQUIRED_COLUMNS]);
  });
});

describe("platform run", () => {
  const u = syntheticUniverse({ firms: 12, years: 8, seed: 3, noise: 0.1 });

  it("screens every ticker, counts finals, selects a portfolio and reports it", () => {
    const run = runScreen(u, { portfolio: { maxPositions: 5, maxPerSector: 2, minYield: null, allowWatch: false } });
    expect(run.universe.tickers).toBe(12);
    expect(run.universe.years).toEqual([2010, 2017]);
    const total = run.counts.sustain + run.counts.watch + run.counts["at-risk"] + run.counts.avisaya;
    expect(total).toBe(12);
    expect(run.selection.holdings.length).toBeLessThanOrEqual(5);
    const md = formatScreenMarkdown(run);
    expect(md).toMatch(/^# Dividend screen — 12 tickers, 96 filings, FY2010–2017/);
    expect(md).toMatch(/Counts, not a verdict/);
    expect(md).toMatch(/## Portfolio/);
    expect(md).toMatch(/Ranking key:/);
  });

  it("is deterministic end to end", () => {
    expect(formatScreenMarkdown(runScreen(u))).toBe(formatScreenMarkdown(runScreen(u)));
  });

  it("runs the validation harness for strict and broad predictors and formats it", () => {
    const v = runValidation(syntheticUniverse({ firms: 20, years: 10, seed: 5, noise: 0.1 }), { draws: 20 });
    expect(v.cases).toBeGreaterThan(0);
    expect(v.strict.baselines.map((b) => b.name)).toEqual(["never-cut", "loss-only", "payout>1"]);
    const md = formatBenchmarkMarkdown(v);
    expect(md).toMatch(/# Validation — \d+ labelled cases/);
    expect(md).toMatch(/verdict\(at-risk\)/);
    expect(md).toMatch(/verdict\(at-risk\|watch\)/);
    expect(md).toMatch(/ADEQUATE/);
  });
});
