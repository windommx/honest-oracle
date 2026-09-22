"use client"

import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { CpcvResponse } from "@/lib/momentum/contracts"

/**
 * CpcvCharts — ภาพการกระจายผล CPCV (หัวใจของ Combinatorial CV คือ "การกระจาย"
 * ไม่ใช่ตัวเลขเดียว): hit/AUC/Long−Short gap ต่อ path + histogram ของ hit
 * ธีม neon ตามแพลตฟอร์ม · เรนเดอร์เฉพาะเมื่อมี pathRows
 */

const TOOLTIP_STYLE = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  fontSize: 12,
  color: "#0f172a",
  boxShadow: "0 4px 12px rgba(16,24,40,0.08)",
} as const

const TICK = { fill: "#64748b", fontSize: 10 } as const
const GRID = "rgba(100,116,139,0.18)"
const GREEN = "#059669"
const ROSE = "#e11d48"
const CYAN = "#0891b2"
const MAGENTA = "#db2777"
const AMBER = "#d97706"
const PURPLE = "#7c3aed"

function ChartFrame({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-foreground/[0.03] p-3">
      <p className="text-xs font-medium text-foreground">{title}</p>
      {sub && <p className="mb-1 text-[11px] text-muted-foreground">{sub}</p>}
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children as never}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function CpcvCharts({ result }: { result: CpcvResponse }) {
  const rows = result.pathRows
  if (rows.length === 0) return null

  const gate = result.params.hitGate * 100
  const meanHit = result.meanHit * 100

  // ---------- ข้อมูลต่อ path ----------
  const hitData = rows.map((r) => ({
    name: `#${r.path}`,
    hit: +(r.hit * 100).toFixed(2),
  }))
  const aucData = rows.map((r) => ({ name: `#${r.path}`, auc: +r.auc.toFixed(3) }))
  const gapData = rows.map((r) => ({ name: `#${r.path}`, gap: +r.gap.toFixed(2) }))

  const hitLo = Math.min(...hitData.map((d) => d.hit))
  const hitHi = Math.max(...hitData.map((d) => d.hit))

  // ---------- histogram ของ hit (8 ถัง) ----------
  const BINS = 8
  const span = Math.max(hitHi - hitLo, 0.5) // กันช่วงเป็นศูนย์เมื่อค่าเท่ากันหมด
  const lo = hitLo - span * 0.05
  const w = (span * 1.1) / BINS
  const hist = Array.from({ length: BINS }, (_, i) => ({
    name: `${(lo + i * w).toFixed(1)}`,
    count: 0,
  }))
  for (const d of hitData) {
    const idx = Math.min(BINS - 1, Math.max(0, Math.floor((d.hit - lo) / w)))
    hist[idx].count++
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ChartFrame title="Hit rate ต่อ path (%)" sub={`gate ${gate.toFixed(0)}% · mean ${meanHit.toFixed(1)}% — เส้นประคือเกณฑ์และค่าเฉลี่ย`}>
        <BarChart data={hitData} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
          <XAxis dataKey="name" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} domain={[Math.floor(hitLo - 4), Math.ceil(hitHi + 4)]} />
          <Tooltip
            cursor={{ fill: "rgba(100,116,139,0.12)" }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(v) => [`${Number(v).toFixed(2)}%`, "hit"]}
          />
          <ReferenceLine y={gate} stroke={AMBER} strokeDasharray="4 3" label={{ value: "gate", fill: AMBER, fontSize: 10, position: "right" }} />
          <ReferenceLine y={+meanHit.toFixed(2)} stroke={CYAN} strokeDasharray="4 3" label={{ value: "mean", fill: CYAN, fontSize: 10, position: "right" }} />
          <Bar dataKey="hit" radius={[3, 3, 0, 0]}>
            {hitData.map((d, i) => (
              <Cell key={i} fill={d.hit > gate ? GREEN : ROSE} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ChartFrame>

      <ChartFrame title="Long − Short gap ต่อ path (%)" sub={`เฉลี่ย ${result.avgGap >= 0 ? "+" : ""}${result.avgGap.toFixed(2)}% — บวก = โมเดลแยกฝั่งได้จริง`}>
        <BarChart data={gapData} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
          <XAxis dataKey="name" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(100,116,139,0.12)" }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(v) => [`${Number(v).toFixed(2)}%`, "gap"]}
          />
          <ReferenceLine y={0} stroke="rgba(100,116,139,0.45)" />
          <ReferenceLine y={+result.avgGap.toFixed(2)} stroke={CYAN} strokeDasharray="4 3" label={{ value: "avg", fill: CYAN, fontSize: 10, position: "right" }} />
          <Bar dataKey="gap" radius={[3, 3, 0, 0]}>
            {gapData.map((d, i) => (
              <Cell key={i} fill={d.gap >= 0 ? GREEN : ROSE} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ChartFrame>

      <ChartFrame title="Histogram — การกระจายของ Hit (%)" sub="CPCV ให้ 'การกระจาย' ไม่ใช่ตัวเลขเดียว — ยิ่งกระจุกขวายิ่งดี">
        <BarChart data={hist} margin={{ top: 8, right: 4, bottom: 0, left: -22 }} barCategoryGap="12%">
          <XAxis dataKey="name" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(100,116,139,0.12)" }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(v) => [`${v} paths`, "จำนวน"]}
            labelFormatter={(l) => `hit ≥ ${l}%`}
          />
          <Bar dataKey="count" fill={MAGENTA} fillOpacity={0.85} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartFrame>

      <ChartFrame title="AUC ต่อ path" sub={`mean ${result.meanAuc.toFixed(3)} · pooled ${result.pooledAuc.toFixed(3)} — >0.5 = มีอำนาจจำแนก`}>
        <BarChart data={aucData} margin={{ top: 8, right: 4, bottom: 0, left: -22 }}>
          <XAxis dataKey="name" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} domain={[0.4, 0.62]} />
          <Tooltip
            cursor={{ fill: "rgba(100,116,139,0.12)" }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(v) => [Number(v).toFixed(3), "AUC"]}
          />
          <ReferenceLine y={0.5} stroke={AMBER} strokeDasharray="4 3" label={{ value: "0.5", fill: AMBER, fontSize: 10, position: "right" }} />
          <ReferenceLine y={+result.meanAuc.toFixed(3)} stroke={PURPLE} strokeDasharray="4 3" label={{ value: "mean", fill: PURPLE, fontSize: 10, position: "right" }} />
          <Bar dataKey="auc" fill={CYAN} fillOpacity={0.85} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartFrame>
    </div>
  )
}
