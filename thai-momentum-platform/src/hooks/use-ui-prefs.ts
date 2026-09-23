"use client"

/**
 * ค่าตั้งค่าระดับ shell ที่จำไว้ในเครื่องผู้ใช้ (localStorage — ครอบ try/catch ทุกครั้งใน useLocalPref)
 *
 * - โหมด Simple / Pro  (ค่าเริ่มต้น Pro — ผู้ใช้เดิมไม่เห็นแท็บหายหลังอัปเดต)
 * - คู่มือเริ่มต้น (first-run welcome) แสดงแล้วหรือยัง — ระหว่าง SSR ถือว่า "เห็นแล้ว" กันแฟลชของผู้ใช้เดิม
 */

import { UI_MODES, type UiMode } from "@/components/platform/nav-config"
import { useLocalPref } from "./use-local-pref"

export const UI_MODE_KEY = "tpx.ui-mode.v1"
export const ONBOARDING_KEY = "tpx.onboarding.v1"

const ONBOARDING_STATES = ["done", "new"] as const
type OnboardingState = (typeof ONBOARDING_STATES)[number]

export function useUiMode(): [UiMode, (m: UiMode) => void] {
  return useLocalPref<UiMode>(UI_MODE_KEY, UI_MODES, "pro")
}

/** [seen, markSeen] — seen = ผู้ใช้กด "ไม่ต้องแสดงอีก" แล้ว */
export function useOnboardingSeen(): [boolean, (seen: boolean) => void] {
  const [state, setState] = useLocalPref<OnboardingState>(ONBOARDING_KEY, ONBOARDING_STATES, "new", "done")
  return [state === "done", (seen: boolean) => setState(seen ? "done" : "new")]
}
