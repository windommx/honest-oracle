"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { Badge, Button, LockedPanel, Skeleton } from "../_ui";
import { GROUP_LABELS, NAV, navItem, type ViewKey } from "../_nav";
import { api, post, reportError, type StageSession } from "../_api";
import { FEATURE_LABELS } from "@/lib/stagelab/plans";

// Each view is its own chunk. The Quant Lab, the backtester and the thesis
// editor are the three largest and none of them belongs in the bundle a free
// user downloads to look at their watchlist.
const loading = () => <Skeleton className="h-96" />;
const VIEWS = {
  dashboard: dynamic(() => import("../_views/dashboard"), { loading }),
  weekly: dynamic(() => import("../_views/weekly"), { loading }),
  screener: dynamic(() => import("../_views/screener"), { loading }),
  watchlist: dynamic(() => import("../_views/watchlist"), { loading }),
  portfolio: dynamic(() => import("../_views/portfolio"), { loading }),
  journal: dynamic(() => import("../_views/journal"), { loading }),
  alerts: dynamic(() => import("../_views/alerts"), { loading }),
  thesis: dynamic(() => import("../_views/thesis"), { loading }),
  backtest: dynamic(() => import("../_views/backtest"), { loading }),
  pro: dynamic(() => import("../_views/pro"), { loading }),
  quant: dynamic(() => import("../_views/quant"), { loading }),
  tools: dynamic(() => import("../_views/tools"), { loading }),
  learn: dynamic(() => import("../_views/learn"), { loading }),
} as const;

const VIEW_PARAM = "view";

export default function StageLabApp() {
  const [session, setSession] = useState<StageSession | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [navOpen, setNavOpen] = useState(false);

  const refreshSession = useCallback(async () => {
    try {
      setSession(await api<StageSession>("/session"));
      setFailed(null);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : "เปิด StageLab ไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  // Deep links (/stagelab/app?view=quant) survive a reload, and the history
  // entry means the browser Back button walks views instead of leaving the app.
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get(VIEW_PARAM);
    if (initial && NAV.some((n) => n.key === initial)) setView(initial as ViewKey);

    const onPop = () => {
      const k = new URLSearchParams(window.location.search).get(VIEW_PARAM);
      setView(k && NAV.some((n) => n.key === k) ? (k as ViewKey) : "dashboard");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((next: ViewKey) => {
    setView(next);
    setNavOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set(VIEW_PARAM, next);
    window.history.pushState({}, "", url);
  }, []);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof NAV> = { routine: [], research: [], reference: [] };
    for (const item of NAV) groups[item.group].push(item);
    return groups;
  }, []);

  if (failed) {
    return (
      <main className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="text-lg font-semibold text-zinc-100">เปิด StageLab ไม่ได้</h1>
        <p className="mt-2 text-sm text-zinc-400">{failed}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={() => void refreshSession()}>ลองใหม่</Button>
          <a
            href="/login?callbackUrl=/stagelab/app"
            className="inline-flex min-h-11 items-center rounded-lg bg-emerald-500 px-4 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
          >
            เข้าสู่ระบบ
          </a>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto max-w-7xl space-y-4 px-4 py-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </main>
    );
  }

  const current = navItem(view);
  const unlocked = session.features.includes(current.feature);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col lg:flex-row">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        id="stagelab-nav"
        className={`${navOpen ? "block" : "hidden"} border-b border-zinc-800 px-4 py-4 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-60 lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r`}
      >
        <a href="/stagelab" className="mb-5 block">
          <span className="text-sm font-semibold tracking-tight text-emerald-400">StageLab</span>
          <span className="mt-0.5 block text-[0.65rem] text-zinc-400">Weinstein Stage Analysis</span>
        </a>

        <nav className="space-y-4">
          {(["routine", "research", "reference"] as const).map((group) => (
            <div key={group}>
              <h2 className="mb-1.5 text-[0.65rem] uppercase tracking-wider text-zinc-400">
                {GROUP_LABELS[group]}
              </h2>
              <ul className="space-y-0.5">
                {grouped[group].map((item) => {
                  const locked = !session.features.includes(item.feature);
                  return (
                    <li key={item.key}>
                      <button
                        onClick={() => navigate(item.key)}
                        aria-current={view === item.key ? "page" : undefined}
                        title={item.hint}
                        className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm transition-colors ${
                          view === item.key
                            ? "bg-emerald-500/10 text-emerald-300"
                            : "text-zinc-300 hover:bg-zinc-800/60"
                        }`}
                      >
                        <span className="flex-1 truncate">{item.label}</span>
                        {locked && (
                          <span className="text-[0.6rem] text-amber-400" aria-label="ต้องใช้แผน Pro">
                            PRO
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-6 border-t border-zinc-800 pt-4">
          <PlanPanel session={session} onChanged={refreshSession} />
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-zinc-800 bg-zinc-950/95 px-4 py-2.5 backdrop-blur">
          <button
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            aria-controls="stagelab-nav"
            className="min-h-10 rounded-lg border border-zinc-700 px-2.5 text-sm text-zinc-300 lg:hidden"
          >
            เมนู
          </button>
          <span className="flex-1 truncate text-sm font-medium text-zinc-200">{current.label}</span>
          <Badge tone={session.plan === "free" ? "neutral" : "good"}>{session.planLabel}</Badge>
          {session.plan !== "free" && (
            <span className="hidden font-mono text-[0.7rem] text-zinc-400 sm:inline">
              โควตา {session.usage.computeRemaining}
            </span>
          )}
          <button
            onClick={() => void signOut({ callbackUrl: "/stagelab" })}
            className="min-h-10 rounded-lg px-2 text-xs text-zinc-400 hover:text-zinc-100"
          >
            ออกจากระบบ
          </button>
        </header>

        <main className="px-4 py-5">
          {unlocked ? (
            renderView(view, session, navigate, refreshSession)
          ) : (
            <LockedPanel feature={FEATURE_LABELS[current.feature]} reason={current.hint} />
          )}
        </main>

        <footer className="border-t border-zinc-800 px-4 py-4 text-[0.7rem] leading-relaxed text-zinc-400">
          StageLab เป็นเครื่องมือช่วยจัดระเบียบการตัดสินใจ ไม่ใช่คำแนะนำการลงทุน
          ราคาและซีรีส์ที่ใช้ในระบบเป็นข้อมูลสังเคราะห์สำหรับการฝึกและเปรียบเทียบกฎ ไม่ใช่ราคาตลาดจริง
          การตัดสินใจซื้อขายและผลที่ตามมาเป็นของคุณเอง
        </footer>
      </div>
    </div>
  );
}

/**
 * Views take different props, so this is a switch rather than a lookup: the
 * lookup form types every view as "needs every prop any view needs".
 */
function renderView(
  view: ViewKey,
  session: StageSession,
  navigate: (v: ViewKey) => void,
  refresh: () => Promise<void>,
) {
  switch (view) {
    case "dashboard":
      return <VIEWS.dashboard session={session} onNavigate={navigate} onSessionChange={refresh} />;
    case "weekly":
      return <VIEWS.weekly session={session} onSessionChange={refresh} />;
    case "screener":
      return <VIEWS.screener onSaved={refresh} />;
    case "watchlist":
      return <VIEWS.watchlist session={session} onSessionChange={refresh} />;
    case "portfolio":
      return <VIEWS.portfolio session={session} onSessionChange={refresh} />;
    case "journal":
      return <VIEWS.journal onSessionChange={refresh} />;
    case "thesis":
      return <VIEWS.thesis session={session} onSessionChange={refresh} />;
    case "backtest":
      return <VIEWS.backtest onSessionChange={refresh} />;
    case "quant":
      return <VIEWS.quant session={session} onSessionChange={refresh} />;
    case "alerts":
      return <VIEWS.alerts />;
    case "pro":
      return <VIEWS.pro />;
    case "tools":
      return <VIEWS.tools />;
    case "learn":
      return <VIEWS.learn />;
  }
}

function PlanPanel({ session, onChanged }: { session: StageSession; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  async function upgrade() {
    setBusy(true);
    try {
      const { url } = await (await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnTo: "stagelab" }),
      })).json();
      if (url) window.location.href = url;
      else window.location.href = "/stagelab/pricing";
    } catch {
      window.location.href = "/stagelab/pricing";
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm("ล้างข้อมูล StageLab ทั้งหมดของบัญชีนี้? ย้อนกลับไม่ได้")) return;
    setBusy(true);
    try {
      await post("/bootstrap", { action: "reset" });
      await onChanged();
      window.location.reload();
    } catch (err) {
      reportError(err, "ล้างข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="truncate text-[0.7rem] text-zinc-400" title={session.user.email}>
        {session.user.email}
      </p>
      <dl className="space-y-0.5 text-[0.65rem] text-zinc-400">
        <Usage label="Watchlist" used={session.usage.watchlist} max={session.limits.watchlist} />
        <Usage label="สถานะเปิด" used={session.usage.positions} max={session.limits.positions} />
        {session.limits.theses > 0 && (
          <Usage label="Thesis" used={session.usage.theses} max={session.limits.theses} />
        )}
      </dl>
      {session.plan === "free" ? (
        <Button size="sm" variant="primary" className="w-full" disabled={busy} onClick={() => void upgrade()}>
          อัปเกรดเป็น Pro
        </Button>
      ) : (
        <p className="text-[0.65rem] text-emerald-400">โควตาประมวลผลวันนี้เหลือ {session.usage.computeRemaining}</p>
      )}
      <Button size="sm" variant="subtle" className="w-full" disabled={busy} onClick={() => void reset()}>
        ล้างข้อมูลทั้งหมด
      </Button>
    </div>
  );
}

function Usage({ label, used, max }: { label: string; used: number; max: number }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className={`font-mono tabular-nums ${used >= max ? "text-amber-400" : ""}`}>
        {used}/{max}
      </dd>
    </div>
  );
}
