"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Compass, Wrench, ShieldCheck, X } from "lucide-react";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  FIRST-RUN ORIENTATION — the on-ramps a newcomer cannot otherwise  ║
// ║  find.                                                             ║
// ║                                                                    ║
// ║  Measured problem, not a hunch: /bookisdom is the most-linked page in    ║
// ║  the app (8 inbound links) and it linked to /bookisdom/start,            ║
// ║  /bookisdom/explore and /bookisdom/fix ZERO times. Someone landing on the     ║
// ║  main tool met a bare configuration form with no route to the       ║
// ║  guided wizard built for exactly that person, the symptom router,   ║
// ║  or the page explaining why the numbers can be trusted. Three of    ║
// ║  five bookisdom pages were unreachable from the front door.              ║
// ║                                                                    ║
// ║  This strip is shown to a visitor with no stored drafts and no      ║
// ║  deep-link config — i.e. someone who genuinely just arrived — and   ║
// ║  is dismissible, with the dismissal remembered. The links stay      ║
// ║  reachable afterwards via the always-present compact row.           ║
// ╚══════════════════════════════════════════════════════════════════╝

const DISMISS_KEY = "bookisdom.orientation.dismissed";

/** Has the visitor dismissed the orientation strip before? Storage-failure safe. */
export function orientationDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false; // storage blocked (private mode) — show it; it is dismissible anyway
  }
}

export function dismissOrientation(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* storage blocked — the strip simply returns next visit; harmless */
  }
}

/** Test hook. */
export function _resetOrientation(): void {
  try {
    window.localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* ignore */
  }
}

const PATHS = [
  {
    href: "/bookisdom/start",
    icon: Compass,
    title: "เพิ่งเริ่ม — ไม่รู้จะตั้งค่าอะไร",
    body: "ตัวช่วยทีละขั้น เลือกประเภท → แนว → ความยาว หรือกดแม่แบบสำเร็จรูปแล้วปรับต่อ",
  },
  {
    href: "/bookisdom/fix",
    icon: Wrench,
    title: "มีต้นฉบับแล้ว แต่ติดอยู่",
    body: "พิมพ์อาการด้วยคำของคุณเอง (“จบบทแล้ววางได้”) แล้วระบบบอกว่าควรเปิดโมดูลไหน",
  },
  {
    href: "/bookisdom/honesty",
    icon: ShieldCheck,
    title: "ทำไมถึงเชื่อตัวเลขของเราได้",
    body: "ทุกตัวเลขบอกว่ามาจากการรู้แบบไหน และเราปฏิเสธคะแนน 0–100 แบบเดา",
  },
];

/**
 * The orientation strip. `show` is decided by the caller (which knows whether the visitor
 * has drafts or arrived via a deep link), so this component stays pure-ish and testable.
 */
export function FirstRunOrientation({ show }: { show: boolean }) {
  const [dismissed, setDismissed] = useState(true); // assume dismissed until mounted
  useEffect(() => setDismissed(orientationDismissed()), []);
  if (!show || dismissed) return null;
  return (
    <section
      aria-label="เริ่มต้นใช้งาน"
      className="relative rounded-2xl border border-[#1d4ed8]/30 bg-[#3c74d4]/[0.04] p-5 mb-6"
    >
      <button
        onClick={() => { dismissOrientation(); setDismissed(true); }}
        aria-label="ปิดคำแนะนำเริ่มต้น"
        className="absolute right-3 top-3 text-faint hover:text-slate-800 transition"
      >
        <X className="w-4 h-4" />
      </button>
      <h2 className="text-sm font-semibold text-slate-900 mb-1">เริ่มตรงไหนดี?</h2>
      <p className="text-[0.72rem] text-faint mb-4">
        หน้านี้คือแผงตั้งค่าแบบเต็ม — ถ้ายังไม่ชิน เริ่มจากทางลัดข้างล่างได้
      </p>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {PATHS.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="rounded-xl border border-black/10 bg-black/[0.015] p-3.5 hover:border-[#1d4ed8]/50 transition group"
          >
            <span className="flex items-center gap-2 mb-1.5">
              <p.icon className="w-4 h-4 text-[#1d4ed8]" />
              <span className="text-[0.78rem] font-medium text-slate-900 group-hover:text-[#1e40af]">{p.title}</span>
            </span>
            <span className="block text-[0.68rem] leading-snug text-faint">{p.body}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Always-present compact row so the three pages stay reachable after dismissal —
 *  the reachability half of the fix, independent of the onboarding half. */
export function OnRamps() {
  return (
    <nav aria-label="ทางลัด" className="flex flex-wrap gap-x-4 gap-y-1.5 text-[0.68rem] text-faint">
      {PATHS.map((p) => (
        <Link key={p.href} href={p.href} className="hover:text-[#1e40af] transition">
          {p.title}
        </Link>
      ))}
      <Link href="/bookisdom/explore" className="hover:text-[#1e40af] transition">
        ดูภาพรวม 8 ประเภท
      </Link>
    </nav>
  );
}
