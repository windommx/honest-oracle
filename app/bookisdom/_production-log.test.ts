// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  addCostEntry, listCostEntries, deleteCostEntry,
  addMetricEntry, listMetricEntries, deleteMetricEntry,
  computeMetricRates, summarizeCosts,
} from "./_production-log";

describe("computeMetricRates — disclosed arithmetic, never a verdict", () => {
  it("computes CTR and conversion as plain percentages", () => {
    expect(computeMetricRates({ impressions: 1000, clicks: 20, sales: 2 })).toEqual({
      ctrPercent: 2, conversionPercent: 10,
    });
  });

  it("a zero denominator is an UNDEFINED rate (null), never a lying 0%", () => {
    // Reachable: a writer logs a day with zero impressions tracked yet, or zero clicks.
    // Reporting 0% for "no data" would misrepresent an unmeasured day as a failed one.
    expect(computeMetricRates({ impressions: 0, clicks: 0, sales: 0 })).toEqual({
      ctrPercent: null, conversionPercent: null,
    });
    expect(computeMetricRates({ impressions: 100, clicks: 0, sales: 0 }).conversionPercent).toBeNull();
  });

  it("rounds to 2 decimal places without floating-point noise", () => {
    const r = computeMetricRates({ impressions: 3, clicks: 1, sales: 1 });
    expect(r.ctrPercent).toBe(33.33);
    expect(r.conversionPercent).toBe(100);
  });
});

describe("summarizeCosts — real sum and average over what the writer actually entered", () => {
  it("sums and averages, rounding the average to a whole baht", () => {
    const entries = [
      { id: "1", projectId: "p", createdAt: 1, amountThb: 100, label: "a" },
      { id: "2", projectId: "p", createdAt: 2, amountThb: 250, label: "b" },
      { id: "3", projectId: "p", createdAt: 3, amountThb: 50, label: "c" },
    ];
    expect(summarizeCosts(entries)).toEqual({ total: 400, average: 133, count: 3 });
  });

  it("an empty log summarizes to zero, not NaN", () => {
    expect(summarizeCosts([])).toEqual({ total: 0, average: 0, count: 0 });
  });
});

describe("cost log storage — per-project isolation and real persistence", () => {
  beforeEach(async () => {
    // fresh IndexedDB per test via fake-indexeddb/auto's implicit reset is not automatic;
    // use distinct project ids per test instead to avoid cross-test bleed.
  });

  it("round-trips an entry and lists newest first", async () => {
    const pid = `proj-${Date.now()}-${Math.random()}`;
    await addCostEntry(pid, 500, "เขียนบทที่ 1-3");
    await new Promise((r) => setTimeout(r, 2));
    await addCostEntry(pid, 300, "ภาพปก");
    const rows = await listCostEntries(pid);
    expect(rows).toHaveLength(2);
    expect(rows[0].label).toBe("ภาพปก"); // newest first
    expect(rows.map((r) => r.amountThb).sort()).toEqual([300, 500]);
  });

  it("only returns entries for the requested project", async () => {
    const pidA = `proj-a-${Date.now()}`;
    const pidB = `proj-b-${Date.now()}`;
    await addCostEntry(pidA, 100, "a-only");
    await addCostEntry(pidB, 200, "b-only");
    expect((await listCostEntries(pidA)).map((r) => r.label)).toEqual(["a-only"]);
    expect((await listCostEntries(pidB)).map((r) => r.label)).toEqual(["b-only"]);
  });

  it("delete actually removes the entry", async () => {
    const pid = `proj-del-${Date.now()}`;
    const entry = await addCostEntry(pid, 999, "ลบทีหลัง");
    expect(await listCostEntries(pid)).toHaveLength(1);
    await deleteCostEntry(entry.id);
    expect(await listCostEntries(pid)).toHaveLength(0);
  });
});

describe("metric log storage", () => {
  it("round-trips a metric entry including the optional avgStars", async () => {
    const pid = `proj-m-${Date.now()}`;
    await addMetricEntry(pid, { impressions: 500, clicks: 12, sales: 1, avgStars: 4.6, note: "สัปดาห์แรก" });
    const rows = await listMetricEntries(pid);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ impressions: 500, clicks: 12, sales: 1, avgStars: 4.6, note: "สัปดาห์แรก" });
  });

  it("omitting avgStars leaves it undefined, not a guessed 0", async () => {
    const pid = `proj-m2-${Date.now()}`;
    await addMetricEntry(pid, { impressions: 10, clicks: 1, sales: 0, note: "" });
    const [row] = await listMetricEntries(pid);
    expect(row.avgStars).toBeUndefined();
  });

  it("delete removes a metric entry", async () => {
    const pid = `proj-m3-${Date.now()}`;
    const entry = await addMetricEntry(pid, { impressions: 1, clicks: 1, sales: 1, note: "" });
    await deleteMetricEntry(entry.id);
    expect(await listMetricEntries(pid)).toHaveLength(0);
  });
});
