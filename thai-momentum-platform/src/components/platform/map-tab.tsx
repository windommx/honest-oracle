"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, Map as MapIcon } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import type { DatesResponse, MapResponse } from "@/lib/momentum/contracts"
import { TH_TOP_N } from "@/lib/config/thai"
import MomentumMap from "./momentum-map"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

export default function MapTab() {
  const { data: datesData } = useApi<DatesResponse>("/api/dates")
  const dates = datesData?.dates ?? []
  const [picked, setPicked] = useState<string | null>(null)
  const active = picked ?? dates[0] ?? null
  const { data: map, loading, error, refetch } = useApi<MapResponse>(
    active ? `/api/map?date=${active}` : null
  )

  const idx = active ? dates.indexOf(active) : -1
  const go = (delta: number) => {
    if (idx < 0) return
    const next = dates[idx + delta]
    if (next) setPicked(next)
  }

  const uniqueCount = new Set((map?.columns ?? []).flatMap((c) => c.items.map((i) => i.symbol))).size

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <MapIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
          <span className="text-sm font-semibold">Momentum Map</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            โผ Top-{TH_TOP_N} ข้าม 7 timeframe · หุ้นซ้ำ = สีเดียวกัน + เส้นเชื่อม · หุ้นไม่ซ้ำ = สีเทา
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => go(1)} disabled={idx < 0 || idx + 1 >= dates.length} aria-label="วันก่อนหน้า">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {/* value ต้องเป็น string ตั้งแต่ render แรก ("" = แสดง placeholder) — undefined → string
                ทำให้ Radix เตือน uncontrolled → controlled ทุกครั้งที่รายการวันที่โหลดเสร็จ */}
            <Select value={active ?? ""} onValueChange={(v) => setPicked(v)}>
              <SelectTrigger className="w-[150px]" aria-label="เลือกวันที่">
                <SelectValue placeholder="เลือกวันที่" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {/* ทุกวันที่ที่ปุ่ม ‹ › ไปถึงได้ (API จำกัด 400) — เดิมตัดที่ 250 ทำให้ช่องเลือกว่างเปล่าเมื่อย้อนเกิน */}
                {dates.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => go(-1)} disabled={idx <= 0} aria-label="วันถัดไป">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {datesData && dates.length === 0 && (
        <Alert>
          <span>ยังไม่มีข้อมูล snapshot — สร้างข้อมูลตัวอย่างหรือนำเข้าข้อมูลจริงก่อน แล้ว Momentum Map จะแสดงอัตโนมัติ</span>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <span>{error}</span>
          <Button variant="outline" size="sm" className="ml-3" onClick={refetch}>
            ลองใหม่
          </Button>
        </Alert>
      )}

      {loading && !map && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-[520px] w-full" />
          </CardContent>
        </Card>
      )}

      {map && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono">{map.date}</Badge>
              <Badge variant="secondary">หุ้นรวม {uniqueCount} ตัว</Badge>
              <Badge className="bg-neon-green/10 text-neon-green border-neon-green/40 shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
                ซ้ำข้ามโผ {map.repeated.length} ตัว
              </Badge>
            </div>
            <MomentumMap columns={map.columns} colors={map.colors} repeated={map.repeated} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
