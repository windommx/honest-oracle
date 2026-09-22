"use client"

import { useState, type ChangeEvent } from "react"
import { CheckCircle2, Loader2, Upload, XCircle } from "lucide-react"

import { useApi, postJson } from "@/hooks/use-api"
import FeedCard from "@/components/platform/feed-card"
import { useToast } from "@/hooks/use-toast"
import type {
  DatesResponse,
  DqResponse,
  IngestResponse,
  SeedResponse,
} from "@/lib/momentum/contracts"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"

const CSV_FORMATS = `date,symbol,close,val,liq5,ret5,ret10,ret20,ret40,ret80,ret160,ret300  (snapshot รายวัน)
date,symbol,close,volume  (history backfill)`

// object ที่ได้จาก useApi<T> (ยกขึ้นไปที่ DataTab เพื่อให้ refetch หลัง ingest ได้จริง)
type ApiResult<T> = ReturnType<typeof useApi<T>>

// ---------- Card 1: Demo seed ----------

function DemoSeedCard() {
  const { toast } = useToast()
  const [days, setDays] = useState(520)
  const [symbols, setSymbols] = useState(240)
  const [seeding, setSeeding] = useState(false)

  async function handleSeed() {
    if (seeding) return
    setSeeding(true)
    try {
      const res = await postJson<SeedResponse>("/api/seed", { days, symbols })
      toast({
        title: "สร้างข้อมูลตัวอย่างสำเร็จ 🎲",
        description: `raw ${res.rawRows.toLocaleString()} แถว · snapshot ${res.snapRows.toLocaleString()} แถว · ใช้เวลา ${(res.tookMs / 1000).toFixed(1)} วินาที`,
      })
    } catch (e) {
      toast({
        variant: "destructive",
        title: "สร้างข้อมูลไม่สำเร็จ",
        description: e instanceof Error ? e.message : "เกิดข้อผิดพลาดไม่ทราบสาเหตุ",
      })
    } finally {
      setSeeding(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>🎲 ข้อมูลตัวอย่าง (Demo)</CardTitle>
        <CardDescription>
          สร้างตลาดจำลอง 240 หุ้น × 520 วันทำการ พร้อม momentum regime ฝังไว้ —
          เหมาะสำหรับทดลองใช้ทุกฟีเจอร์ทันที
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">จำนวนวัน</Label>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))} disabled={seeding}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="เลือกวัน" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="300">300 วัน</SelectItem>
                <SelectItem value="520">520 วัน</SelectItem>
                <SelectItem value="700">700 วัน</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">จำนวนหุ้น</Label>
            <Select value={String(symbols)} onValueChange={(v) => setSymbols(Number(v))} disabled={seeding}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="เลือกหุ้น" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="120">120 หุ้น</SelectItem>
                <SelectItem value="240">240 หุ้น</SelectItem>
                <SelectItem value="320">320 หุ้น</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={seeding}>
                {seeding ? (
                  <>
                    <Loader2 className="animate-spin" />
                    กำลังสร้าง (~10 วินาที)
                  </>
                ) : (
                  "สร้าง / สร้างใหม่"
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>ยืนยันการสร้างข้อมูลตัวอย่าง?</AlertDialogTitle>
                <AlertDialogDescription>
                  การดำเนินการนี้จะลบข้อมูลเดิมทั้งหมดในระบบ รวมถึงพอร์ตกระดาษ การตัดสินใจของ
                  Jev และ Gate ที่รออนุมัติ แล้วสร้างชุดข้อมูลใหม่ {days} วัน × {symbols} หุ้น
                  แทนที่ (ใช้เวลาประมาณ 10 วินาที) คุณแน่ใจหรือไม่?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                <AlertDialogAction onClick={handleSeed}>ยืนยัน สร้างข้อมูล</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {seeding && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            กำลังสร้างข้อมูลตัวอย่าง (~10 วินาที) — อย่าปิดหน้านี้จนกว่าจะเสร็จ
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- Card 2: CSV ingest ----------

function CsvIngestCard({ onIngested }: { onIngested?: () => void }) {
  const { toast } = useToast()
  const [csvText, setCsvText] = useState("")
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<IngestResponse | null>(null)

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setCsvText(String(reader.result ?? ""))
      toast({
        title: "อ่านไฟล์สำเร็จ",
        description: `${file.name} · ${(file.size / 1024).toFixed(1)} KB — ตรวจข้อความแล้วกดนำเข้าข้อมูล`,
      })
    }
    reader.onerror = () => {
      toast({
        variant: "destructive",
        title: "อ่านไฟล์ไม่สำเร็จ",
        description: `ไม่สามารถอ่านไฟล์ ${file.name} ได้`,
      })
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  async function handleIngest() {
    if (!csvText.trim() || importing) return
    setImporting(true)
    try {
      const res = await postJson<IngestResponse>("/api/ingest", { csv: csvText })
      setResult(res)
      toast({
        title: "นำเข้าข้อมูลสำเร็จ 📥",
        description: res.message || `เพิ่ม ${res.insertedRaw.toLocaleString()} แถว`,
      })
      // ข้อมูลเปลี่ยน → ให้แท็บโหลดวันที่ + DQ ใหม่
      onIngested?.()
    } catch (e) {
      toast({
        variant: "destructive",
        title: "นำเข้าไม่สำเร็จ",
        description: e instanceof Error ? e.message : "เกิดข้อผิดพลาดไม่ทราบสาเหตุ",
      })
    } finally {
      setImporting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>📥 นำเข้า CSV จาก AmiBroker</CardTitle>
        <CardDescription>
          นำเข้าข้อมูลจริงจาก AmiBroker — รองรับ 2 ฟอร์แมต วางข้อความลงช่องด้านล่าง หรือเลือกไฟล์ .csv
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <pre className="overflow-x-auto rounded bg-muted p-3 text-[11px] leading-4">
          {CSV_FORMATS}
        </pre>
        <Input
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          disabled={importing}
        />
        <Textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder="วางข้อมูล CSV ที่นี่… (หัวคอลัมน์ 1 บรรทัด + ข้อมูล 1 แถวต่อหุ้นต่อวัน)"
          className="h-40 font-mono text-xs"
          disabled={importing}
        />
        <div className="flex items-center gap-3">
          <Button onClick={handleIngest} disabled={!csvText.trim() || importing}>
            {importing ? (
              <>
                <Loader2 className="animate-spin" />
                กำลังนำเข้า…
              </>
            ) : (
              <>
                <Upload />
                นำเข้าข้อมูล
              </>
            )}
          </Button>
          {csvText.trim() && !importing && (
            <span className="text-xs text-muted-foreground">
              ~{csvText.trim().split("\n").length.toLocaleString()} บรรทัดพร้อมนำเข้า
            </span>
          )}
        </div>
        {result && (
          <Alert>
            <CheckCircle2 className="text-neon-green" />
            <AlertTitle>นำเข้าสำเร็จ</AlertTitle>
            <AlertDescription>
              <span>{result.message}</span>
              <span className="font-mono text-xs">
                raw +{result.insertedRaw.toLocaleString()} · update{" "}
                {result.updatedRows.toLocaleString()} แถว · rebuild snapshot{" "}
                {result.snapDates.length} วัน
                {result.snapDates.length > 0
                  ? ` (ล่าสุด ${result.snapDates[result.snapDates.length - 1]})`
                  : ""}{" "}
                · {(result.tookMs / 1000).toFixed(1)}s
              </span>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- Card 3: DQ ----------

function DqCard({ dq }: { dq: ApiResult<DqResponse> }) {
  const checks = dq.data?.checks ?? []
  const allOk = checks.length > 0 && checks.every((c) => c.ok)
  const failCount = checks.filter((c) => !c.ok).length

  return (
    <Card>
      <CardHeader>
        <CardTitle>🩺 คุณภาพข้อมูล (DQ)</CardTitle>
        <CardDescription>ตรวจสอบความถูกต้องของข้อมูลในระบบโดยอัตโนมัติ</CardDescription>
        <CardAction>
          {dq.data ? (
            allOk ? (
              <Badge
                variant="outline"
                className="border-neon-green/40 bg-neon-green/10 text-neon-green"
              >
                ผ่านทั้งหมด
              </Badge>
            ) : (
              <Badge variant="destructive">{failCount} ข้อไม่ผ่าน</Badge>
            )
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent>
        {dq.loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : dq.error ? (
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>โหลดผลตรวจ DQ ไม่สำเร็จ</AlertTitle>
            <AlertDescription>{dq.error}</AlertDescription>
          </Alert>
        ) : checks.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            ยังไม่มีข้อมูล — สร้างข้อมูลตัวอย่างหรือนำเข้า CSV ก่อน
          </div>
        ) : (
          <div className="space-y-3">
            {checks.map((c) => (
              <div key={c.name} className="flex items-start gap-2.5">
                {c.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-neon-green" />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-neon-rose" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-tight">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- Card 4: Dates ----------

function DatesCard({ dates }: { dates: ApiResult<DatesResponse> }) {
  const last12 = dates.data ? dates.data.dates.slice(-12).reverse() : []

  return (
    <Card>
      <CardHeader>
        <CardTitle>📅 วันที่ในระบบ</CardTitle>
        <CardDescription>วันทำการล่าสุดที่มี snapshot ในฐานข้อมูล</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {dates.loading ? (
          <Skeleton className="h-24 w-full" />
        ) : dates.error ? (
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>โหลดวันที่ไม่สำเร็จ</AlertTitle>
            <AlertDescription>{dates.error}</AlertDescription>
          </Alert>
        ) : !dates.data ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            ยังไม่มีข้อมูล
          </div>
        ) : (
          <>
            <div>
              <div className="font-mono text-2xl font-bold tracking-tight">
                {dates.data.latest ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground">รวม {dates.data.count} วัน</div>
            </div>
            {last12.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {last12.map((d) => (
                  <Badge key={d} variant="outline" className="font-mono text-[10px]">
                    {d}
                  </Badge>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- Main tab ----------

export default function DataTab() {
  // ยก dates/dq ขึ้นมาที่นี่ — ingest สำเร็จแล้ว refetch ที่เดียว ทุกการ์ดอัปเดต
  const dates = useApi<DatesResponse>("/api/dates")
  const dq = useApi<DqResponse>("/api/dq")

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <DemoSeedCard />
        <CsvIngestCard
          onIngested={() => {
            dates.refetch()
            dq.refetch()
          }}
        />
        <FeedCard
          onIngested={() => {
            dates.refetch()
            dq.refetch()
          }}
        />
        <DqCard dq={dq} />
        <DatesCard dates={dates} />
      </div>
    </div>
  )
}
