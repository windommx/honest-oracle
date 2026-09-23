"use client"

// ============================================================
// Momentum Map — แผนผังโมเมนตัม 7 timeframe (5/10/20/40/80/160/300 วัน)
// Pure SVG (ไม่ใช้ recharts) — จุด = อันดับหุ้นในแต่ละ timeframe
// เส้นเชื่อมหุ้นที่ติดหลาย timeframe, หุ้นไม่ซ้ำ = สีเทากลาง (SINGLETON_COLOR)
// ============================================================

import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react"
import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { MapColumn } from "@/lib/momentum/contracts"
import { SINGLETON_COLOR } from "@/lib/palette"
import { cn } from "@/lib/utils"

export interface MomentumMapProps {
  columns: MapColumn[] // [{tf:5, items:[{symbol,rank,ret}]}, ...] always 7 columns
  colors: Record<string, string> // symbol → hex สำหรับหุ้นที่ซ้ำเท่านั้น
  repeated: string[] // symbols ที่ปรากฏ ≥2 columns
  compact?: boolean // เวอร์ชันย่อ (overview card) — ไม่มี controls, มี scroll
  className?: string
}

// ---------- geometry ----------

interface Geo {
  colW: number
  rowH: number
  headerH: number
  leftPad: number
  rightPad: number
  r: number
  hitR: number
  fontHeader: number
  fontLabel: number
  lineW: number
}

const GEO_FULL: Geo = {
  colW: 150,
  rowH: 26,
  headerH: 46,
  leftPad: 64,
  rightPad: 90,
  r: 4,
  hitR: 10,
  fontHeader: 13,
  fontLabel: 11,
  lineW: 1.4,
}

const GEO_COMPACT: Geo = {
  colW: 104,
  rowH: 15,
  headerH: 30,
  leftPad: 44,
  rightPad: 64,
  r: 2.6,
  hitR: 7,
  fontHeader: 10,
  fontLabel: 8.5,
  lineW: 1,
}

// ---------- internal types ----------

interface MapPoint {
  tf: number
  col: number
  rank: number
  ret: number
  x: number
  y: number
}

interface TipState {
  symbol: string
  tf: number
  rank: number
  ret: number
  x: number
  y: number
}

const SEARCH_SENTINEL = "__search__"

const LEGEND_MAX = 12

export default function MomentumMap({
  columns,
  colors,
  repeated,
  compact = false,
  className,
}: MomentumMapProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [onlyRepeated, setOnlyRepeated] = useState(false)
  const [tip, setTip] = useState<TipState | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const geo = compact ? GEO_COMPACT : GEO_FULL

  const repeatedSet = useMemo(() => new Set(repeated), [repeated])

  // symbol → points (เรียงตาม tf) + พิกัด x/y ใน svg
  const symbolPoints = useMemo(() => {
    const map = new Map<string, MapPoint[]>()
    const xFor = (col: number) => geo.leftPad + col * geo.colW + geo.colW / 2
    const yFor = (rank: number) => geo.headerH + (rank - 1) * geo.rowH + geo.rowH / 2
    columns.forEach((col, ci) => {
      for (const it of col.items) {
        const p: MapPoint = {
          tf: col.tf,
          col: ci,
          rank: it.rank,
          ret: it.ret,
          x: xFor(ci),
          y: yFor(it.rank),
        }
        const arr = map.get(it.symbol)
        if (arr) arr.push(p)
        else map.set(it.symbol, [p])
      }
    })
    map.forEach((arr) => arr.sort((a, b) => a.tf - b.tf))
    return map
  }, [columns, geo])

  const allSymbols = useMemo(() => Array.from(symbolPoints.keys()), [symbolPoints])

  // empty guard: columns ว่าง หรือทุก column ไม่มี items
  const hasData = allSymbols.length > 0

  const q = query.trim().toLowerCase()
  const matching = useMemo(() => {
    if (!q) return null
    const pool = new Set<string>([...allSymbols, ...repeated])
    return new Set(Array.from(pool).filter((s) => s.toLowerCase().includes(q)))
  }, [q, allSymbols, repeated])

  // หุ้นที่ปักหมุดไว้ไม่มีในวันที่เลือกใหม่ → ไม่ต้องหรี่ทั้งแผนที่ (เดิมทุกจุดจางเหลือ 0.15 และไม่มีปุ่มให้ยกเลิก)
  const pinnedActive = pinned !== null && symbolPoints.has(pinned) ? pinned : null
  const activeSymbol = pinnedActive ?? hovered ?? (q ? SEARCH_SENTINEL : null)

  // แสดงเฉพาะหุ้นซ้ำเมื่อเปิดสวิตช์ (singleton ถูกตัดออกทั้งหมด)
  const renderList = useMemo(
    () =>
      Array.from(symbolPoints.entries()).filter(
        ([sym]) => !onlyRepeated || repeatedSet.has(sym)
      ),
    [symbolPoints, onlyRepeated, repeatedSet]
  )

  const opacityFor = (sym: string): number => {
    if (!activeSymbol) return 1
    if (activeSymbol === SEARCH_SENTINEL) return matching?.has(sym) ? 1 : 0.12
    return sym === activeSymbol ? 1 : 0.15
  }
  const dimStyle = (sym: string): CSSProperties => ({
    opacity: opacityFor(sym),
    transition: "opacity .15s",
  })

  const colorOf = (sym: string) => colors[sym] ?? SINGLETON_COLOR

  const showTip = (e: ReactMouseEvent<SVGCircleElement>, sym: string, p: MapPoint) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    const w = rect?.width ?? 0
    const h = rect?.height ?? 0
    const rawX = rect ? e.clientX - rect.left : 0
    const rawY = rect ? e.clientY - rect.top : 0
    let x = rawX + 14
    if (x > w - 170) x = Math.max(8, w - 170)
    let y = rawY + 14
    if (y + 84 > h) y = Math.max(8, rawY - 86)
    setTip({ symbol: sym, tf: p.tf, rank: p.rank, ret: p.ret, x, y })
  }

  // ---------- empty state ----------

  if (!hasData) {
    return (
      <div className={cn("relative", className)}>
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          ไม่มีข้อมูลสำหรับวันนี้
        </div>
      </div>
    )
  }

  const nCols = Math.max(1, columns.length)
  const svgWidth = geo.leftPad + geo.colW * nCols + geo.rightPad
  // ความสูงตามอันดับสูงสุดที่มีจริง — TOPN ใน contracts (30) ≠ จำนวนอันดับที่ระบบสร้างจริง (TH_TOP_N)
  // เดิมเหลือแถวว่างท้ายกราฟ และถ้าอันดับเกิน 30 จุดจะล้นกรอบ svg (มองไม่เห็น)
  let maxRank = 1
  for (const pts of symbolPoints.values()) for (const p of pts) if (p.rank > maxRank) maxRank = p.rank
  const svgHeight = geo.headerH + maxRank * geo.rowH + 12

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      {/* ---------- controls (full mode only) ---------- */}
      {!compact && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาหุ้น เช่น cnt"
              aria-label="ค้นหาหุ้นใน momentum map"
              className="h-9 w-48 pl-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="mm-only-repeated"
              checked={onlyRepeated}
              onCheckedChange={setOnlyRepeated}
              aria-label="เฉพาะหุ้นซ้ำ"
            />
            <Label
              htmlFor="mm-only-repeated"
              className="cursor-pointer text-xs font-normal text-muted-foreground"
            >
              เฉพาะหุ้นซ้ำ
            </Label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {repeated.slice(0, LEGEND_MAX).map((sym) => {
              const active = pinned === sym
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => setPinned((prev) => (prev === sym ? null : sym))}
                  aria-pressed={active}
                  className={cn(
                    "flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
                    active
                      ? "border-neon-cyan/60 bg-neon-cyan/15 ring-1 ring-neon-cyan/40 shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
                      : "border-border bg-foreground/[0.04] hover:bg-foreground/[0.07]"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: colorOf(sym) }}
                  />
                  <span className="font-mono text-foreground">{sym}</span>
                </button>
              )
            })}
            {repeated.length > LEGEND_MAX && (
              <span className="text-xs text-muted-foreground">
                +{repeated.length - LEGEND_MAX}
              </span>
            )}
          </div>

          <span className="text-xs text-muted-foreground">
            หุ้นซ้ำ {repeated.length} ตัว — สีตามความถี่ · หุ้นไม่ซ้ำ = เทา
          </span>
        </div>
      )}

      {/* ---------- svg chart ---------- */}
      <div
        className={
          compact ? "max-h-[440px] overflow-x-auto overflow-y-auto" : "overflow-x-auto"
        }
      >
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          role="img"
          aria-label="Momentum map ตำแหน่งอันดับหุ้นข้าม timeframe"
          onMouseLeave={() => {
            setHovered(null)
            setTip(null)
          }}
          className="block"
        >
          {/* column headers */}
          {columns.map((col, i) => (
            <text
              key={`header-${col.tf}-${i}`}
              x={geo.leftPad + i * geo.colW + geo.colW / 2}
              y={geo.headerH - 18}
              textAnchor="middle"
              fontSize={geo.fontHeader}
              fontWeight={600}
              fill="#64748b"
            >
              {col.tf}D
            </text>
          ))}

          {/* divider under header — full width */}
          <line
            x1={0}
            y1={geo.headerH}
            x2={svgWidth}
            y2={geo.headerH}
            stroke="rgba(100,116,139,0.22)"
            strokeWidth={1}
          />

          {/* faint vertical separators between columns */}
          {columns.slice(1).map((col, idx) => {
            const x = geo.leftPad + (idx + 1) * geo.colW
            return (
              <line
                key={`sep-${col.tf}-${idx}`}
                x1={x}
                y1={0}
                x2={x}
                y2={svgHeight}
                stroke="rgba(100,116,139,0.1)"
                strokeWidth={1}
              />
            )
          })}

          {/* connector lines — drawn BEFORE dots */}
          <g fill="none">
            {renderList.map(([sym, pts]) =>
              pts.length >= 2 ? (
                <polyline
                  key={`line-${sym}`}
                  points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                  stroke={colorOf(sym)}
                  strokeWidth={geo.lineW}
                  strokeOpacity={0.42}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                  style={dimStyle(sym)}
                />
              ) : null
            )}
          </g>

          {/* dots */}
          <g stroke="rgba(255,255,255,0.95)" strokeWidth={1}>
            {renderList.map(([sym, pts]) =>
              pts.map((p) => (
                <circle
                  key={`dot-${sym}-${p.col}`}
                  cx={p.x}
                  cy={p.y}
                  r={geo.r}
                  fill={colorOf(sym)}
                  pointerEvents="none"
                  style={dimStyle(sym)}
                />
              ))
            )}
          </g>

          {/* labels — rightmost column flips anchor เพื่อไม่ให้ตัดขอบ */}
          <g style={{ fontFamily: "var(--font-mono), ui-monospace, monospace" }}>
            {renderList.map(([sym, pts]) =>
              pts.map((p) => {
                const rightmost = p.col === columns.length - 1
                return (
                  <text
                    key={`label-${sym}-${p.col}`}
                    x={rightmost ? p.x - 8 : p.x + 8}
                    y={p.y + 3.5}
                    textAnchor={rightmost ? "end" : "start"}
                    fontSize={geo.fontLabel}
                    fill={colors[sym] ?? "#94a3b8"}
                    pointerEvents="none"
                    style={dimStyle(sym)}
                  >
                    {sym}
                  </text>
                )
              })
            )}
          </g>

          {/* invisible hit targets — เพิ่ม touch target + interaction */}
          <g fill="transparent">
            {renderList.map(([sym, pts]) =>
              pts.map((p) => (
                <circle
                  key={`hit-${sym}-${p.col}`}
                  cx={p.x}
                  cy={p.y}
                  r={geo.hitR}
                  className="cursor-pointer"
                  style={dimStyle(sym)}
                  onMouseEnter={(e) => {
                    setHovered(sym)
                    showTip(e, sym, p)
                  }}
                  onMouseMove={(e) => showTip(e, sym, p)}
                  onMouseLeave={() => {
                    setHovered((h) => (h === sym ? null : h))
                    setTip(null)
                  }}
                  onClick={() => setPinned((prev) => (prev === sym ? null : sym))}
                />
              ))
            )}
          </g>
        </svg>
      </div>

      {/* ---------- tooltip ---------- */}
      {tip && (
        <div
          className="pointer-events-none absolute z-50 rounded-md border border-neon-cyan/30 bg-popover/95 px-3 py-2 text-xs text-foreground shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
          style={{ left: tip.x, top: tip.y }}
        >
          <div className="font-mono text-sm font-bold leading-5">{tip.symbol}</div>
          <div className="text-muted-foreground">
            {tip.tf} วัน · อันดับ #{tip.rank}
          </div>
          <div className={tip.ret >= 0 ? "font-medium text-neon-green" : "font-medium text-neon-rose"}>
            ผลตอบแทน {tip.ret >= 0 ? "+" : ""}
            {tip.ret.toFixed(1)}%
          </div>
        </div>
      )}
    </div>
  )
}
