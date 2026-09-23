"use client"

// การ์ด "ดึงข้อมูลจริงจาก feed" — แท็บข้อมูล
// Yahoo: ดึงจาก server ได้ทันที · SET (settfex) / Settrade: แสดงคำสั่งให้รันบนเครื่องผู้ใช้
// ทุกแหล่งแสดง "ความจริงของข้อมูล" (dataNote) เสมอ — ไม่มีแหล่งไหนถูกติดป้ายว่าทางการโดยไม่ใช่

import { useState } from "react"
import { AlertTriangle, CheckCircle2, Globe2, Loader2, XCircle } from "lucide-react"

import { useApi } from "@/hooks/use-api"
import { useToast } from "@/hooks/use-toast"
import type { FeedFetchResponse, FeedInfoResponse, FeedRange, FeedSource } from "@/lib/momentum/contracts"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

const RANGES: { value: FeedRange; label: string }[] = [
  { value: "6mo", label: "6 เดือน" },
  { value: "1y", label: "1 ปี" },
  { value: "2y", label: "2 ปี (แนะนำ)" },
  { value: "3y", label: "3 ปี" },
  { value: "5y", label: "5 ปี" },
  { value: "max", label: "ทั้งหมด" },
]

function countSymbols(text: string): number {
  return text.split(/[\s,;]+/).filter((t) => t.trim()).length
}

export default function FeedCard({ onIngested }: { onIngested?: () => void }) {
  const { toast } = useToast()
  const info = useApi<FeedInfoResponse>("/api/feed")
  const [source, setSource] = useState<FeedSource>("yahoo")
  const [symbolsText, setSymbolsText] = useState<string | null>(null) // null = ยังไม่แก้ → ใช้ preset แรก
  const [range, setRange] = useState<FeedRange>("2y")
  const [adjusted, setAdjusted] = useState(true)
  const [replaceDemo, setReplaceDemo] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<FeedFetchResponse | null>(null)
  const [failure, setFailure] = useState<{ message: string; detail: FeedFetchResponse | null } | null>(null)

  const presets = info.data?.presets ?? []
  const sources = info.data?.sources ?? []
  const current = sources.find((s) => s.id === source)
  const text = symbolsText ?? presets[0]?.symbols.join(", ") ?? ""
  const nSymbols = countSymbols(text)

  async function run() {
    if (running || nSymbols === 0) return
    setRunning(true)
    setResult(null)
    setFailure(null)
    try {
      const r = await fetch("/api/feed/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "yahoo", symbols: text, range, adjusted, replaceDemo }),
      })
      // proxy/gateway timeout ตอบเป็น HTML ไม่ใช่ JSON — แสดงสถานะ HTTP แทนข้อความ JSON parse error
      const j = ((await r.json().catch(() => null)) ?? { error: `HTTP ${r.status}` }) as FeedFetchResponse & { error?: string }
      if (!r.ok || !j.ok) {
        setFailure({ message: j.error ?? j.message ?? `HTTP ${r.status}`, detail: j.reports ? j : null })
        toast({ variant: "destructive", title: "ดึงข้อมูลไม่สำเร็จ", description: j.error ?? j.message ?? `HTTP ${r.status}` })
        return
      }
      setResult(j)
      toast({ title: "นำเข้าข้อมูลจริงสำเร็จ 🌐", description: j.message })
      onIngested?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "เกิดข้อผิดพลาดไม่ทราบสาเหตุ"
      setFailure({ message: msg, detail: null })
      toast({ variant: "destructive", title: "ดึงข้อมูลไม่สำเร็จ", description: msg })
    } finally {
      setRunning(false)
    }
  }

  const reports = (result ?? failure?.detail)?.reports ?? []
  const failedReports = reports.filter((r) => !r.ok)
  const warnReports = reports.filter((r) => r.ok && r.warnings.length > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe2 className="size-4 text-neon-cyan" /> ดึงข้อมูลจริงจาก feed
        </CardTitle>
        <CardDescription>
          แทนข้อมูล demo ด้วยราคาหุ้นไทยจริง — ทุกแหล่งเข้าท่อเดียวกับ CSV (indicator · โผ · sector · audit
          provenance) และมีป้ายความจริงของข้อมูลกำกับ
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {info.loading ? (
          <Skeleton className="h-40 w-full" />
        ) : info.error ? (
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>โหลดทะเบียนแหล่งข้อมูลไม่สำเร็จ</AlertTitle>
            <AlertDescription>{info.error}</AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>แหล่งข้อมูล</Label>
                <Select value={source} onValueChange={(v) => setSource(v as FeedSource)} disabled={running}>
                  <SelectTrigger className="h-11 sm:h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sources.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                        {s.serverSide ? "" : " · รันบนเครื่องคุณ"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>ช่วงย้อนหลัง</Label>
                <Select value={range} onValueChange={(v) => setRange(v as FeedRange)} disabled={running || source !== "yahoo"}>
                  <SelectTrigger className="h-11 sm:h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RANGES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {current && (
              <Alert>
                <AlertTriangle className="text-neon-amber" />
                <AlertTitle>ความจริงของข้อมูล — {current.label}</AlertTitle>
                <AlertDescription>
                  <span>{current.dataNote}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{current.howTo}</span>
                </AlertDescription>
              </Alert>
            )}

            {source === "yahoo" ? (
              <>
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label>รายชื่อหุ้น (ชื่อย่อบน SET คั่นด้วย , หรือขึ้นบรรทัดใหม่ · พิมพ์ชื่อ preset ได้)</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {presets.map((p) => (
                        <Button
                          key={p.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          title={p.description}
                          disabled={running}
                          onClick={() => setSymbolsText(p.symbols.join(", "))}
                        >
                          {p.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <Textarea
                    value={text}
                    onChange={(e) => setSymbolsText(e.target.value)}
                    className="h-28 font-mono text-xs"
                    placeholder="PTT, KBANK, CPALL, ADVANC …"
                    disabled={running}
                  />
                  <div className="text-xs text-muted-foreground">
                    {nSymbols} ตัว · Yahoo ใช้ suffix .BK ให้อัตโนมัติ · รายชื่อ preset เป็นค่าตั้งต้น ปรับตามองค์ประกอบดัชนีล่าสุดได้
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                    <span>
                      ปรับราคาด้วยปันผล/สปลิต (adjclose)
                      <span className="block text-[11px] text-muted-foreground">โมเมนตัมข้ามวัน XD ไม่กระโดด</span>
                    </span>
                    <Switch checked={adjusted} onCheckedChange={setAdjusted} disabled={running} />
                  </label>
                  <label className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                    <span>
                      ล้างข้อมูล demo ก่อนนำเข้า
                      <span className="block text-[11px] text-muted-foreground">
                        ลบราคา/โผ/พอร์ตกระดาษของหุ้นจำลอง + CrossAsset จำลอง (SPX/USDTHB/GOLD) — คง audit ไว้ · ใช้ข้อมูลข้ามตลาดจริงด้วย bun run fetch:cross
                      </span>
                    </span>
                    <Switch checked={replaceDemo} onCheckedChange={setReplaceDemo} disabled={running} />
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={run} disabled={running || nSymbols === 0} className="min-h-11 sm:min-h-9">
                    {running ? (
                      <>
                        <Loader2 className="animate-spin" />
                        กำลังดึง {nSymbols} ตัว… (ทีละตัว กัน rate limit)
                      </>
                    ) : (
                      <>
                        <Globe2 />
                        ดึงข้อมูลจริงและนำเข้า
                      </>
                    )}
                  </Button>
                  {replaceDemo && !running && (
                    <Badge variant="outline" className="border-neon-amber/40 bg-neon-amber/10 text-neon-amber">
                      จะล้างข้อมูล demo
                    </Badge>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-2 rounded-md border border-border bg-foreground/[0.03] p-3 text-sm">
                <div className="font-medium">แหล่งนี้รันบนเครื่องคุณ แล้วส่งเข้าแพลตฟอร์มผ่าน POST /api/feed/ingest</div>
                <pre className="overflow-x-auto rounded bg-muted p-3 text-[11px] leading-5">
                  {source === "set"
                    ? `pip install "settfex>=0.24"            # ต้องการ Python 3.11+
cd thai-momentum-platform/lab
python fetch_set_feed.py --index SET50 --period 3Y --post http://localhost:3000 --replace-demo
# เพิ่ม --ohlc-from-yahoo (pip install yfinance) เพื่อผสาน open/high/low ให้ SET Sniper`
                    : `pip install settrade-v2                 # ต้องมีบัญชี Settrade Open API กับโบรกเกอร์ที่รองรับ
cd thai-momentum-platform/lab
python fetch_settrade_feed.py --symbols PTT,KBANK,CPALL --limit 500 --post http://localhost:3000
# --symbols ต้องเป็นชื่อหุ้นคั่นด้วย , (ไม่ขยายชื่อดัชนี เช่น SET50 ให้)
# เทมเพลตอยู่ในไฟล์ — กรอก app_id / app_secret / broker_id / app_code ของคุณ`}
                </pre>
                <div className="text-xs text-muted-foreground">
                  รายละเอียดและข้อจำกัดของทุกแหล่ง: docs/research/market-feed.md
                </div>
              </div>
            )}
          </>
        )}

        {failure && (
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>ดึงข้อมูลไม่สำเร็จ</AlertTitle>
            <AlertDescription>{failure.message}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert>
            <CheckCircle2 className="text-neon-green" />
            <AlertTitle>นำเข้าข้อมูลจริงสำเร็จ</AlertTitle>
            <AlertDescription>
              <span>{result.message}</span>
              <span className="font-mono text-xs">
                ตัวที่ได้ {result.fetched}/{result.requested} · แถว {result.rowsFetched.toLocaleString()} · โผ{" "}
                {result.ingest?.snapDates ?? 0} วัน{result.ingest?.latestDate ? ` (ล่าสุด ${result.ingest.latestDate})` : ""} ·
                sector {result.sectorRows} ตัว · {(result.tookMs / 1000).toFixed(1)}s
                {result.replacedDemo ? " · ล้าง demo แล้ว" : ""}
              </span>
              {result.notes.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                  {result.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        )}

        {(failedReports.length > 0 || warnReports.length > 0) && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium">
              รายงานรายตัว — ล้มเหลว {failedReports.length} · มีคำเตือน {warnReports.length}
            </div>
            <ScrollArea className="max-h-56 rounded-md border border-border">
              <ul className="divide-y divide-border text-xs">
                {failedReports.map((r) => (
                  <li key={r.symbol} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                    <XCircle className="size-3.5 shrink-0 text-neon-rose" />
                    <span className="font-mono font-semibold">{r.symbol}</span>
                    <span className="text-muted-foreground">{r.error}</span>
                  </li>
                ))}
                {warnReports.map((r) => (
                  <li key={r.symbol} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                    <AlertTriangle className="size-3.5 shrink-0 text-neon-amber" />
                    <span className="font-mono font-semibold">{r.symbol}</span>
                    <span className="text-muted-foreground">
                      {r.bars} แท่ง ({r.firstDate} → {r.lastDate}) · {r.warnings.join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
