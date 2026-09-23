"use client"

/**
 * ErrorBoundary — กันพังเป็นช่อง ๆ (หลักการแพลตฟอร์ม: "GTAA ล้ม = การ์ดหาย ระบบหลักเดินต่อ")
 *
 * - variant "tab"    : ครอบเนื้อหาแท็บใน app-shell (key ต่อแท็บ → สลับแท็บแล้วรีเซ็ตเอง)
 *                      แท็บไหน render พัง = เห็นการ์ดแจ้ง + ปุ่มลองใหม่ ส่วน sidebar/header/dock ยังใช้ได้
 * - variant "module" : ครอบ body ของ FeatureModule แต่ละโมดูล — โมดูลเดียวพัง ไม่ลากทั้งแดชบอร์ด
 * - "ลองใหม่" = ล้าง error แล้ว mount ลูกใหม่ทั้งชุด (state/fetch เริ่มใหม่) — React ต้องใช้ class component
 *   (React log error ที่จับได้ให้เองแล้ว จึงไม่ log ซ้ำ)
 */

import { Component, type ReactNode } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

interface ErrorBoundaryProps {
  /** ชื่อส่วนที่ครอบ (ชื่อแท็บ/โมดูล) — แสดงบนการ์ดแจ้ง */
  label: string
  variant?: "tab" | "module"
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  private retry = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const { label, variant = "tab" } = this.props
    const message = error.message || String(error)

    if (variant === "module") {
      return (
        <div
          role="alert"
          className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-neon-rose/35 bg-neon-rose/[0.04] px-4 py-3 text-center"
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold text-neon-rose">
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
            โมดูลนี้แสดงผลไม่สำเร็จ — โมดูลอื่นยังทำงานปกติ
          </p>
          <p className="line-clamp-2 max-w-full break-all font-mono text-[10px] text-muted-foreground">{message}</p>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 sm:h-7" onClick={this.retry}>
            <RefreshCw className="size-3.5" aria-hidden />
            ลองใหม่
          </Button>
        </div>
      )
    }

    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>แท็บ “{label}” แสดงผลไม่สำเร็จ</AlertTitle>
        <AlertDescription className="space-y-2">
          <p className="break-all font-mono text-xs">{message}</p>
          <p className="text-xs text-muted-foreground">
            เมนูและแท็บอื่นยังใช้งานได้ตามปกติ — กดลองใหม่ หรือสลับไปแท็บอื่นแล้วกลับมา
          </p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={this.retry}>
            <RefreshCw aria-hidden /> ลองใหม่
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
}
