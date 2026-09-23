"use client"

/**
 * Agent Skill Tree — แผนผังความสามารถของเอเจนต์ในแพลตฟอร์ม (4 หมวด)
 *
 * กรอบหมวดปรับจากโพสต์ "20 Skills สำหรับ AI Agent" — Research / Engineering /
 * Create / Grow+Ship — แต่เนื้อหาชี้ความสามารถ "จริง" ของระบบนี้ โดยสถานะแต่ละโหนด
 * derive สดจาก API (unlocked / shadow / locked / down) ตามกติกาใน
 * src/lib/skills/capabilities.ts — ไม่มีป้ายตาย ไม่มีกล่องดำ
 */

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, BrainCircuit, RefreshCw } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import type { AuditResponse, OverviewResponse, SignalsResponse } from "@/lib/momentum/contracts"
import type { SniperReport } from "@/lib/sniper/types"
import {
  SKILL_CATEGORIES,
  SKILL_NODES,
  THREE_QUESTIONS,
  UNLOCK_QUEUE,
  MATRIX_CELLS,
  type SkillLive,
  type SkillStatus,
} from "@/lib/skills/capabilities"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const BADGE_SHADOW_CLS = "shadow-[0_1px_2px_rgba(16,24,40,0.06)]"

const STATUS_META: Record<SkillStatus, { label: string; cls: string }> = {
  unlocked: { label: "UNLOCKED", cls: `border-neon-green/40 bg-neon-green/10 text-neon-green ${BADGE_SHADOW_CLS}` },
  shadow: { label: "SHADOW", cls: `border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan ${BADGE_SHADOW_CLS}` },
  locked: { label: "LOCKED", cls: `border-neon-amber/40 bg-neon-amber/10 text-neon-amber ${BADGE_SHADOW_CLS}` },
  down: { label: "DOWN", cls: `border-neon-rose/40 bg-neon-rose/10 text-neon-rose ${BADGE_SHADOW_CLS}` },
}

function statusOf(node: (typeof SKILL_NODES)[number], l: SkillLive): SkillStatus {
  if (node.live) return node.live(l)
  return node.base
}

function StatusBadge({ s }: { s: SkillStatus }) {
  const m = STATUS_META[s]
  return <Badge className={`shrink-0 font-mono text-[9px] ${m.cls}`}>{m.label}</Badge>
}

export default function SkillsTab({ onGoTo }: { onGoTo: (tab: string) => void }) {
  const ov = useApi<OverviewResponse>("/api/overview")
  const sig = useApi<SignalsResponse>("/api/signals")
  const audit = useApi<AuditResponse>("/api/events/audit")

  // Sniper คำนวณหนัก — ดึงตามหลังแบบเดียวกับ Command Center
  const [sniperUrl, setSniperUrl] = useState<string | null>(null)
  useEffect(() => {
    const t = window.setTimeout(() => setSniperUrl("/api/sniper"), 1_200)
    return () => window.clearTimeout(t)
  }, [])
  const sniper = useApi<SniperReport>(sniperUrl)

  const loading = (ov.loading && !ov.data) || (audit.loading && !audit.data)

  const live: SkillLive = useMemo(
    () => ({
      rowsRaw: ov.data?.rowsRaw ?? null,
      dqFlags: ov.data ? ov.data.dqFlags.length : null,
      gtaaReady: ov.data ? ov.data.gtaa != null : null,
      gtaaReal: ov.data?.gtaa ? !/synthetic/i.test(ov.data.gtaa.source) : null,
      // โครงสร้าง OHLC "พร้อม" เมื่อ watchlist มีหุ้นที่มี OHLC จริงอย่างน้อย 1 ตัว — DB ว่าง/CSV ไม่มี open,high,low = ยังไม่พร้อม
      sniperReady: sniper.data ? sniper.data.meta.hasOhlcCount > 0 : sniperUrl !== null && sniper.error ? null : false,
      stopsReady: null,
      auditOk: audit.data ? audit.data.ok : null,
      decisions: sig.data ? sig.data.stockToday.length : null,
      promoted: sig.data ? (sig.data.policy?.promoted.length ?? 0) : null,
      positions: ov.data ? ov.data.positions : null,
    }),
    [ov.data, audit.data, sig.data, sniper.data, sniper.error, sniperUrl],
  )

  const grouped = useMemo(
    () =>
      SKILL_CATEGORIES.map((c) => ({
        cat: c,
        nodes: SKILL_NODES.filter((n) => n.cat === c.id),
      })),
    [],
  )

  const counts = useMemo(() => {
    const c = { unlocked: 0, shadow: 0, locked: 0, down: 0 }
    for (const n of SKILL_NODES) c[statusOf(n, live)] += 1
    return c
  }, [live])

  const total = SKILL_NODES.length
  const pct = (n: number) => `${(n / total) * 100}%`

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 w-full rounded-xl" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )

  if (ov.error && !ov.data)
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>โหลดแผนผังความสามารถไม่สำเร็จ</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>{ov.error}</span>
          <Button variant="outline" size="sm" onClick={() => ov.refetch()}>
            <RefreshCw aria-hidden /> ลองใหม่
          </Button>
        </AlertDescription>
      </Alert>
    )

  return (
    <div className="space-y-5">
      {/* ---------- Root banner — Jev capability root ---------- */}
      <Card className="min-w-0 neon-card-purple">
        <CardContent className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-[auto_1fr_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-neon-purple/30 bg-neon-purple/10 text-neon-purple">
              <BrainCircuit className="size-7" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-neon-purple">
                CAPABILITY ROOT
              </p>
              <p className="text-xl font-bold leading-tight">Jev — เอเจนต์ของระบบนี้</p>
              <p className="truncate text-xs text-muted-foreground">
                {total} ความสามารถ × 4 หมวด — สถานะอ่านสดจาก API ทุกครั้งที่เปิดหน้า
              </p>
            </div>
          </div>

          <div className="min-w-0 space-y-2">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-foreground/[0.06]" aria-hidden>
              <div className="h-full bg-neon-green" style={{ width: pct(counts.unlocked) }} />
              <div className="h-full bg-neon-cyan" style={{ width: pct(counts.shadow) }} />
              <div className="h-full bg-neon-amber" style={{ width: pct(counts.locked) }} />
              <div className="h-full bg-neon-rose" style={{ width: pct(counts.down) }} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>🟢 ปลดล็อก {counts.unlocked}</span>
              <span>🔹 เงา {counts.shadow}</span>
              <span>🟡 ล็อก {counts.locked}</span>
              <span>🔴 ดาวน์ {counts.down}</span>
            </div>
          </div>

          <div className="min-w-0 lg:w-64">
            <p className="text-xs leading-5 text-muted-foreground">
              กรอบ 4 หมวดปรับจากแผนผัง “20 Skills ของ AI Agent” — แต่ที่นี่ไม่ได้ชูเครื่องมือภายนอก
              ทุกโหนดคือสิ่งที่โมดูลในระบบนี้ทำได้จริง (หรือล็อกพร้อมเงื่อนไขเปิด)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ---------- 4 หมวด ---------- */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {grouped.map(({ cat, nodes }) => {
          const catCounts = { unlocked: 0, shadow: 0, locked: 0, down: 0 }
          for (const n of nodes) catCounts[statusOf(n, live)] += 1
          return (
            <Card key={cat.id} className="min-w-0">
              <CardHeader className="pb-2">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <CardTitle className="min-w-0 truncate text-sm font-bold">{cat.name}</CardTitle>
                  <Badge variant="outline" className="shrink-0 font-mono text-[9px]">
                    {cat.code}
                  </Badge>
                </div>
                <CardDescription className="line-clamp-2">{cat.tagline}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {nodes.map((n) => {
                  const s = statusOf(n, live)
                  const clickable = Boolean(n.evidenceTab)
                  const body = (
                    <>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="w-5 shrink-0 font-mono text-[10px] text-muted-foreground">
                          {String(n.no).padStart(2, "0")}
                        </span>
                        <n.icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-xs font-bold">{n.name}</span>
                        <StatusBadge s={s} />
                      </div>
                      <p className="min-w-0 truncate text-[11px] text-muted-foreground">{n.role}</p>
                      {s === "locked" && n.unlock ? (
                        <p className="text-[10px] leading-4 text-neon-amber">🔓 เปิดเมื่อ: {n.unlock}</p>
                      ) : s === "down" ? (
                        <p className="text-[10px] leading-4 text-neon-rose">ข้อมูล/API ไม่พร้อมตอนนี้ — เปิดแท็บเกี่ยวข้องเพื่อตรวจ</p>
                      ) : (
                        <p className="line-clamp-2 text-[10px] leading-4 text-muted-foreground">{n.value}</p>
                      )}
                    </>
                  )
                  return clickable ? (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => n.evidenceTab && onGoTo(n.evidenceTab)}
                      aria-label={`${n.name} — เปิดหลักฐานที่แท็บ ${n.evidenceTab}`}
                      className="block w-full min-w-0 space-y-1 rounded-lg border border-border bg-foreground/[0.02] p-2.5 text-left transition-colors hover:border-neon-cyan/40 hover:bg-neon-cyan/[0.04]"
                    >
                      {body}
                    </button>
                  ) : (
                    <div key={n.id} className="w-full min-w-0 space-y-1 rounded-lg border border-border bg-foreground/[0.02] p-2.5">
                      {body}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* ---------- คิวปลดล็อกถัดไป ---------- */}
      <Card className="min-w-0 neon-card-green">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">🔓 คิวปลดล็อกถัดไป (ลงทะเบียนล่วงหน้า)</CardTitle>
          <CardDescription>
            เรียงตามลำดับที่ตกลงไว้ใน worklog — แต่ละรายการมีเงื่อนไขก่อนเปิดชัดเจน ไม่เปิดเพราะ “อยากทำ”
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {UNLOCK_QUEUE.map((u, i) => (
            <div
              key={u.skillId}
              className="flex min-w-0 gap-2.5 rounded-lg border border-border bg-foreground/[0.02] p-3"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neon-green/30 bg-neon-green/10 font-mono text-[10px] font-bold text-neon-green">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold">{u.title}</p>
                <p className="text-[11px] leading-4 text-muted-foreground">
                  <span className="font-medium text-neon-amber">เงื่อนไข:</span> {u.condition}
                </p>
                <p className="text-[11px] leading-4 text-muted-foreground">
                  <span className="font-medium text-neon-green">ค่าที่ได้:</span> {u.value}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-11 shrink-0 self-center sm:h-8"
                onClick={() =>
                  onGoTo(u.skillId === "tick-l2" ? "sniper" : u.skillId === "alerts" ? "overview" : "gtaa")
                }
              >
                ดูโหนด →
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ---------- 3 คำถามก่อนเลือกพัฒนา + เมทริกซ์ ---------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0 neon-card-cyan">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">🎯 3 คำถามก่อนเลือกพัฒนาโหนดใหม่</CardTitle>
            <CardDescription>ปรับจากกรอบเลือก skill ของโพสต์ต้นทาง — เริ่มจากงานที่ติดจริง ไม่ใช่ติดตั้งเพลิน</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {THREE_QUESTIONS.map((x, i) => (
              <div key={x.q} className="flex min-w-0 gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neon-cyan/30 bg-neon-cyan/10 font-mono text-[10px] font-bold text-neon-cyan">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{x.q}</p>
                  <p className="text-[11px] leading-4 text-muted-foreground">{x.hint}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">🧮 เมทริกซ์ตัดสินใจ (ความถี่ × ความยาก)</CardTitle>
            <CardDescription>โหนดไหนควรสร้างเป็นระบบ — ดูจากช่องที่มันอยู่</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid min-w-0 grid-cols-[auto_1fr_1fr] gap-1.5 text-[11px]">
              <div />
              <div className="text-center font-semibold text-muted-foreground">งานง่าย</div>
              <div className="text-center font-semibold text-muted-foreground">งานยาก</div>
              <div className="flex items-center font-semibold text-muted-foreground">ถี่</div>
              <div className="rounded-lg border border-neon-green/30 bg-neon-green/[0.06] p-2.5 font-medium">{MATRIX_CELLS.freqEasy}</div>
              <div className="rounded-lg border border-neon-cyan/30 bg-neon-cyan/[0.06] p-2.5 font-medium">{MATRIX_CELLS.freqHard}</div>
              <div className="flex items-center font-semibold text-muted-foreground">นานครั้ง</div>
              <div className="rounded-lg border border-border bg-foreground/[0.02] p-2.5 text-muted-foreground">{MATRIX_CELLS.rareEasy}</div>
              <div className="rounded-lg border border-neon-amber/30 bg-neon-amber/[0.06] p-2.5 text-neon-amber">{MATRIX_CELLS.rareHard}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---------- หมายเหตุความจริงใจ ---------- */}
      <p className="text-[11px] leading-5 text-muted-foreground">
        หมายเหตุ: กรอบ 4 หมวด (Research / Engineering / Create / Grow+Ship) อ้างอิงแนวคิดจากโพสต์ “20 Skills
        สำหรับ AI Agent” — แผนที่นี้ใช้เป็นโครงจัดความสามารถของแพลตฟอร์มนี้เท่านั้น เครื่องมือภายนอกที่ยังไม่ได้ทดสอบ
        จะไม่ถูกนับเป็นโหนด UNLOCKED · สถานะ DOWN หมายถึง “โมดูลมีอยู่ แต่ข้อมูลที่ต้องพึ่งไม่พร้อมตอนนี้”
        ไม่ใช่โมดูลเสียเสมอไป
      </p>
    </div>
  )
}
