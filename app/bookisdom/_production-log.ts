// Production log — client-side (IndexedDB via Dexie) tracker for what a writer ACTUALLY
// spent and ACTUALLY measured on a project, per project. Same no-server-LLM, local-first
// principle as _manuscript-store.ts, and the same honesty rule as the rest of Bookisdom:
// every number here is either something the writer typed in themselves (a cost, an
// impression count) or simple disclosed arithmetic on those numbers (a rate). Nothing here
// is estimated, benchmarked against an invented threshold, or turned into a verdict — no
// "healthy / at risk" traffic light, because no credible industry number backs one. If the
// writer wants to compare a rate to a target, that target is THEIRS to set and read, not
// ours to assert.

import Dexie, { type Table } from "dexie";

export interface CostEntry {
  id: string;
  projectId: string;
  createdAt: number;
  amountThb: number;
  label: string;
}

export interface MetricEntry {
  id: string;
  projectId: string;
  createdAt: number;
  impressions: number;
  clicks: number;
  sales: number;
  /** Optional — omit rather than guess when not tracked. */
  avgStars?: number;
  note: string;
}

class ProductionLogDB extends Dexie {
  costEntries!: Table<CostEntry, string>;
  metricEntries!: Table<MetricEntry, string>;
  constructor() {
    super("bookisdom-production-log");
    this.version(1).stores({
      costEntries: "id, projectId, createdAt",
      metricEntries: "id, projectId, createdAt",
    });
  }
}

let dbInstance: ProductionLogDB | null = null;
function db(): ProductionLogDB | null {
  if (typeof indexedDB === "undefined") return null; // SSR / no-IndexedDB environments
  if (!dbInstance) dbInstance = new ProductionLogDB();
  return dbInstance;
}

const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// ── cost log ─────────────────────────────────────────────────────────────
export async function addCostEntry(projectId: string, amountThb: number, label: string): Promise<CostEntry> {
  const entry: CostEntry = { id: newId(), projectId, createdAt: Date.now(), amountThb, label };
  await db()?.costEntries.put(entry);
  return entry;
}
export async function listCostEntries(projectId: string): Promise<CostEntry[]> {
  const rows = (await db()?.costEntries.where("projectId").equals(projectId).toArray()) ?? [];
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}
export async function deleteCostEntry(id: string): Promise<void> {
  await db()?.costEntries.delete(id);
}

// ── launch-metric log ────────────────────────────────────────────────────
export async function addMetricEntry(
  projectId: string,
  input: { impressions: number; clicks: number; sales: number; avgStars?: number; note: string }
): Promise<MetricEntry> {
  const entry: MetricEntry = { id: newId(), projectId, createdAt: Date.now(), ...input };
  await db()?.metricEntries.put(entry);
  return entry;
}
export async function listMetricEntries(projectId: string): Promise<MetricEntry[]> {
  const rows = (await db()?.metricEntries.where("projectId").equals(projectId).toArray()) ?? [];
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}
export async function deleteMetricEntry(id: string): Promise<void> {
  await db()?.metricEntries.delete(id);
}

// ── pure math — disclosed formula, never a verdict ──────────────────────
export interface MetricRates {
  ctrPercent: number | null;      // clicks / impressions * 100; null when impressions is 0 (undefined, not 0%)
  conversionPercent: number | null; // sales / clicks * 100; null when clicks is 0
}
/** Rounds to 2 decimal places for display; returns null (not 0) when the denominator is
 *  zero — a rate with no observations is UNDEFINED, not "0% conversion". */
export function computeMetricRates(e: Pick<MetricEntry, "impressions" | "clicks" | "sales">): MetricRates {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    ctrPercent: e.impressions > 0 ? round2((e.clicks / e.impressions) * 100) : null,
    conversionPercent: e.clicks > 0 ? round2((e.sales / e.clicks) * 100) : null,
  };
}

export interface CostSummary {
  total: number;
  average: number; // 0 when there are no entries — a real average of an empty set is undefined,
                    // but callers only render this when entries.length > 0, so 0 never surfaces.
  count: number;
}
export function summarizeCosts(entries: CostEntry[]): CostSummary {
  const total = entries.reduce((s, e) => s + e.amountThb, 0);
  return { total, average: entries.length ? Math.round(total / entries.length) : 0, count: entries.length };
}
