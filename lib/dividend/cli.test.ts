import { describe, it, expect } from "vitest";
import { runCli } from "./cli";
import { ALL_COLUMNS } from "./io";
import { healthy, priorYear } from "./testkit";
import type { AnnualRecord } from "./types";

const csv = (rows: AnnualRecord[]) =>
  [ALL_COLUMNS.join(","), ...rows.map((r) => ALL_COLUMNS.map((c) => { const v = (r as unknown as Record<string, unknown>)[c]; return v === undefined ? "" : String(v); }).join(","))].join("\n");

const files: Record<string, string> = {
  "good.csv": csv([priorYear({ fiscalYear: 2023 }), priorYear(), healthy()]),
  "bad.csv": "ticker,fiscalYear\nA,2020",
  "loss.json": JSON.stringify([priorYear({ fiscalYear: 2023 }), priorYear(), healthy({ netIncome: -5, eps: -0.05 })]),
};
const io = { read: (p: string) => { if (!(p in files)) throw new Error("ENOENT"); return files[p]; } };

describe("dividend CLI", () => {
  it("prints help and the CSV template", () => {
    expect(runCli([], io).stdout).toMatch(/USAGE/);
    expect(runCli(["help"], io).code).toBe(0);
    expect(runCli(["template"], io).stdout.split(",")[0]).toBe("ticker");
  });

  it("screens a CSV into a Markdown report with the verdict and the portfolio", () => {
    const r = runCli(["screen", "good.csv"], io);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).toMatch(/# Dividend screen — 1 tickers, 3 filings, FY2023–2025/);
    expect(r.stdout).toMatch(/\| GOOD \| 2025 \| sustain \| sustain \| 8\/8 \|/);
    expect(r.stdout).toMatch(/## Portfolio \(1 names/);
  });

  it("emits JSON with --json and honours portfolio flags", () => {
    const r = runCli(["screen", "loss.json", "--json", "--max", "3", "--allow-watch"], io);
    const run = JSON.parse(r.stdout);
    expect(run.results[0].final).toBe("at-risk");
    expect(run.options.portfolio.maxPositions).toBe(3);
    expect(run.options.portfolio.allowWatch).toBe(true);
    expect(run.selection.excluded[0].reason).toMatch(/at-risk: loss/);
  });

  it("fails loudly on missing files, bad headers and unknown commands", () => {
    expect(runCli(["screen", "nope.csv"], io)).toMatchObject({ code: 2 });
    expect(runCli(["screen", "bad.csv"], io).stderr).toMatch(/missing required columns/);
    expect(runCli(["screen"], io).stderr).toMatch(/missing input file/);
    expect(runCli(["frobnicate"], io).code).toBe(1);
  });

  it("demo screens a synthetic universe and labels it as synthetic; --validate appends the harness", () => {
    const r = runCli(["demo", "--firms", "8", "--years", "6", "--validate", "--draws", "10"], io);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/# Dividend screen — 8 tickers, 48 filings/);
    expect(r.stdout).toMatch(/# Validation —/);
    expect(r.stdout).toMatch(/SYNTHETIC universe/);
  });
});
