"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Crown, Download, Droplets, LayoutDashboard, LogOut } from "lucide-react";
import { api } from "./_api";

/** Module chrome: suite crumb, module name, CSV export, account + sign-out. Hidden in print. */
export function ModuleNav({ active = "app" }: { active?: "app" | "report" }) {
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;
  return (
    <nav className="no-print sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-slate-600 transition hover:text-slate-900" aria-label="กลับหน้าหลัก NaraSuite">
            <Crown className="h-5 w-5 text-[#c9a84c]" aria-hidden />
            <span className="hidden text-sm font-semibold sm:inline">NaraSuite</span>
          </Link>
          <span className="text-slate-300" aria-hidden>
            /
          </span>
          <Link href="/competency" className="flex items-center gap-1.5 font-semibold text-teal-800">
            <Droplets className="h-5 w-5" aria-hidden />
            HD Competency
          </Link>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 text-sm">
          {active === "report" && (
            <Link
              href="/competency"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-teal-600 hover:text-teal-800"
            >
              <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
              แดชบอร์ด
            </Link>
          )}
          <a
            href={api.exportUrl}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-teal-600 hover:text-teal-800"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            ส่งออก CSV
          </a>
          {email && (
            <span className="hidden max-w-[14rem] truncate text-xs text-slate-600 md:inline" title={email}>
              {email}
            </span>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            ออกจากระบบ
          </button>
        </div>
      </div>
    </nav>
  );
}
