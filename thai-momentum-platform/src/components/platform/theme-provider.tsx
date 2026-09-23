"use client"

/**
 * ThemeProvider — ธีม Gold Ivory (สว่าง) / Gold Night (มืด) / ตามระบบ
 *
 * - next-themes ใส่คลาส `dark` บน <html> ด้วย inline script ที่รันระหว่าง parse HTML → ไม่มีแฟลชตอนโหลด
 * - จำค่าที่ผู้ใช้เลือกใน localStorage ("theme") · ค่าเริ่มต้น = ตามระบบปฏิบัติการ
 * - React 19 เตือนใน dev เมื่อ render <script> ฝั่ง client — ตาม Next 16 guide ("Preventing Flash"):
 *   ส่ง type="text/javascript" ตอน SSR และ "text/plain" ตอน client (next-themes ใส่ suppressHydrationWarning ให้แล้ว)
 */

import type { ReactNode } from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

export const THEME_STORAGE_KEY = "theme"

export default function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey={THEME_STORAGE_KEY}
      scriptProps={{ type: typeof window === "undefined" ? "text/javascript" : "text/plain" }}
    >
      {children}
    </NextThemesProvider>
  )
}
