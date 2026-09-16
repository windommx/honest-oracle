"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Skeleton, StatCard, Tabs, ViewHeader } from "../_ui";
import { useResource } from "../_api";
import type { AlertItem, AlertSeverity, AlertsResponse } from "@/lib/stagelab/types";

const SEVERITY_META: Record<AlertSeverity, { label: string; tone: "bad" | "warn" | "good" | "neutral"; border: string }> = {
  critical: { label: "ต้องทำทันที", tone: "bad", border: "border-l-red-500" },
  warning: { label: "เฝ้าระวัง", tone: "warn", border: "border-l-amber-500" },
  opportunity: { label: "โอกาส", tone: "good", border: "border-l-emerald-500" },
  info: { label: "ข้อมูล", tone: "neutral", border: "border-l-zinc-600" },
};

const FILTERS = [
  { key: "all", label: "ทั้งหมด" },
  { key: "critical", label: "ต้องทำทันที" },
  { key: "warning", label: "เฝ้าระวัง" },
  { key: "opportunity", label: "โอกาส" },
] as const;

export default function AlertsView() {
  const { data, loading, error, reload } = useResource<AlertsResponse>("/alerts");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  const alerts: AlertItem[] = useMemo(() => {
    const list = data?.alerts ?? [];
    return filter === "all" ? list : list.filter((a) => a.severity === filter);
  }, [data, filter]);

  if (loading && !data) return <Skeleton className="h-96" />;

  if (error) {
    return (
      <EmptyState
        title="สแกนความเสี่ยงไม่สำเร็จ"
        hint={error}
        action={<Button size="sm" variant="primary" onClick={() => void reload()}>ลองใหม่</Button>}
      />
    );
  }

  const summary = data?.summary;

  return (
    <div className="space-y-5">
      <ViewHeader
        title="Risk Radar"
        subtitle={
          data
            ? `สแกนเมื่อ ${new Date(data.generatedAt).toLocaleString("th-TH")} · คำนวณสดทุกครั้ง ไม่มีการเก็บสถานะเตือน`
            : undefined
        }
        actions={
          <Button size="sm" onClick={() => void reload()}>
            สแกนใหม่
          </Button>
        }
      />

      {summary && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatCard label="ต้องทำทันที" value={String(summary.critical)} tone={summary.critical > 0 ? "bad" : "good"} />
          <StatCard label="เฝ้าระวัง" value={String(summary.warning)} tone={summary.warning > 0 ? "warn" : "neutral"} />
          <StatCard label="โอกาส" value={String(summary.opportunity)} tone="good" />
          <StatCard label="ข้อมูล" value={String(summary.info)} />
        </div>
      )}

      <Tabs tabs={FILTERS} active={filter} onChange={setFilter} />

      {alerts.length === 0 ? (
        <EmptyState
          title={filter === "all" ? "ไม่พบความเสี่ยงที่ต้องจัดการ" : "ไม่มีรายการในระดับนี้"}
          hint={
            filter === "all"
              ? "เรดาร์อ่านจากคะแนนตลาด พอร์ต และ Watchlist ของคุณ — ถ้ายังไม่มีข้อมูลในสามอย่างนั้น จะยังไม่มีอะไรให้เตือน"
              : undefined
          }
        />
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => {
            const meta = SEVERITY_META[a.severity];
            return (
              <li key={a.id}>
                <Card className={`border-l-4 ${meta.border}`}>
                  <div className="flex flex-wrap items-start gap-2">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    {a.symbol && <span className="font-mono text-sm font-medium text-zinc-100">{a.symbol}</span>}
                    <span className="flex-1 text-sm font-medium text-zinc-100">{a.title}</span>
                    {a.metric && (
                      <span className="font-mono text-xs tabular-nums text-zinc-300">{a.metric}</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{a.detail}</p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
