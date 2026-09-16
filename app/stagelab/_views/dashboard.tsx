"use client";

import { useMemo } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ProgressBar,
  ScorePill,
  Skeleton,
  StageBadge,
  StatCard,
  Td,
  Th,
  TableWrap,
  ViewHeader,
  toneOfSign,
  type Tone,
} from "../_ui";
import {
  patch,
  post,
  put,
  useAction,
  useOptimisticFlags,
  useResource,
  type StageSession,
} from "../_api";
import { ACTION_TYPE_META, fmt, fmtBaht, fmtPct } from "@/lib/stagelab/utils";
import type { ViewKey } from "../_nav";

interface Overview {
  weekOf: string;
  hasScored: boolean;
  review: { setIndex: number; breadthPct: number; notes: string | null };
  marketScore: { score: number; max: number; stageLabel: string; equityPct: string; recommendation: string };
  sectors: { id: number; name: string; stage: number; rsVsSet: number; score: number }[];
  watchlist: {
    id: number; symbol: string; sector: string; stage: number; priority: string;
    entryPrice: number; stopLoss: number; targetPrice: number; rsScore: number; fundScore: number;
  }[];
  positions: {
    id: number; symbol: string; quantity: number; entryPrice: number; currentPrice: number;
    currentStage: number; stopLoss: number;
  }[];
  stats: {
    portfolioValue: number; unrealized: number; realized: number;
    openCount: number; closedCount: number; winRatePct: number | null; avgOpenPnlPct: number;
  };
  actions: { id: number; type: string; content: string; done: boolean }[];
  checklist: { id: number; label: string; done: boolean }[];
}

function scoreTone(score: number): Tone {
  if (score >= 8) return "good";
  if (score >= 6) return "warn";
  if (score >= 4) return "late";
  return "bad";
}

export default function DashboardView({
  session,
  onNavigate,
  onSessionChange,
}: {
  session: StageSession;
  onNavigate: (v: ViewKey) => void;
  onSessionChange: () => void;
}) {
  const { data, loading, error, reload } = useResource<Overview>("/overview");
  const { busy, run } = useAction();
  const flags = useOptimisticFlags();

  const dailyDone = useMemo(
    () => (data ? data.checklist.filter((c) => c.done).length : 0),
    [data],
  );

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        title="โหลดภาพรวมไม่สำเร็จ"
        hint={error ?? undefined}
        action={
          <Button variant="primary" size="sm" onClick={() => void reload()}>
            ลองใหม่
          </Button>
        }
      />
    );
  }

  const { stats, marketScore } = data;

  return (
    <div className="space-y-5">
      <ViewHeader
        title="ภาพรวม"
        subtitle={`สัปดาห์ของ ${data.weekOf} · ${marketScore.stageLabel}`}
        actions={
          <>
            <Button size="sm" onClick={() => onNavigate("weekly")}>
              เริ่มรอบทบทวน
            </Button>
            <Button size="sm" variant="primary" onClick={() => onNavigate("screener")}>
              เปิด Screener
            </Button>
          </>
        }
      />

      {session.isEmpty && (
        <FirstRun
          onLoaded={async () => {
            // Both: the session drives the banner, the overview drives the page.
            await reload();
            onSessionChange();
          }}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Market Score"
          value={data.hasScored ? `${marketScore.score}/${marketScore.max}` : "—"}
          sub={data.hasScored ? `สัดส่วนหุ้นแนะนำ ${marketScore.equityPct}` : "ยังไม่ได้ให้คะแนนสัปดาห์นี้"}
          tone={data.hasScored ? scoreTone(marketScore.score) : "neutral"}
        />
        <StatCard label="มูลค่าพอร์ต" value={fmtBaht(stats.portfolioValue)} sub={`${stats.openCount} สถานะเปิด`} />
        <StatCard
          label="กำไร/ขาดทุนที่ยังไม่ปิด"
          value={fmtBaht(stats.unrealized)}
          sub={stats.openCount > 0 ? `เฉลี่ย ${fmtPct(stats.avgOpenPnlPct)}` : "ยังไม่มีสถานะเปิด"}
          tone={toneOfSign(stats.unrealized)}
        />
        <StatCard
          label="Win Rate"
          value={stats.winRatePct === null ? "—" : `${fmt(stats.winRatePct, 0)}%`}
          sub={`ปิดแล้ว ${stats.closedCount} ไม้ · รับรู้ ${fmtBaht(stats.realized)}`}
          tone={stats.winRatePct === null ? "neutral" : stats.winRatePct >= 50 ? "good" : "bad"}
        />
      </div>

      {data.hasScored ? (
        <div
          className={`rounded-xl border px-4 py-3 ${
            marketScore.score >= 6
              ? "border-emerald-500/30 bg-emerald-500/5"
              : marketScore.score >= 4
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-red-500/30 bg-red-500/5"
          }`}
        >
          <p className="text-sm text-zinc-200">{marketScore.recommendation}</p>
          <p className="mt-1 font-mono text-xs tabular-nums text-zinc-400">
            SET {fmt(data.review.setIndex)} · Breadth {fmt(data.review.breadthPct, 0)}%
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
          <p className="text-sm text-zinc-300">
            ยังไม่ได้ให้คะแนนตลาดของสัปดาห์นี้ — ระบบจะไม่เดาให้
            เพราะคะแนนตลาดคือสิ่งที่กำหนดสัดส่วนหุ้นในพอร์ตทั้งหมด
          </p>
          <Button size="sm" variant="primary" onClick={() => onNavigate("weekly")}>
            ให้คะแนนตลาด
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="กลุ่มอุตสาหกรรมนำตลาด"
          subtitle="อันดับจากคะแนนที่คุณให้ไว้ในรอบทบทวน"
          action={
            <Button size="sm" variant="subtle" onClick={() => onNavigate("weekly")}>
              จัดอันดับ
            </Button>
          }
        >
          {data.sectors.length === 0 ? (
            <EmptyState title="ยังไม่ได้จัดอันดับกลุ่ม" hint="ขั้นที่ 2 ของรอบทบทวนคือการให้คะแนนแต่ละกลุ่ม" />
          ) : (
            <ul className="space-y-1.5">
              {data.sectors.slice(0, 5).map((s, i) => (
                <li
                  key={s.id}
                  className={`flex items-center gap-3 rounded-lg border-l-2 bg-zinc-800/30 px-3 py-2 ${
                    s.score >= 4 ? "border-emerald-500" : s.score <= 2 ? "border-red-500" : "border-zinc-600"
                  }`}
                >
                  <span className="w-4 font-mono text-xs text-zinc-400">{i + 1}</span>
                  <span className="flex-1 text-sm font-medium text-zinc-100">{s.name}</span>
                  <StageBadge stage={s.stage} short />
                  <span className={`font-mono text-xs tabular-nums ${s.rsVsSet >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {fmtPct(s.rsVsSet)}
                  </span>
                  <ScorePill label="คะแนน" value={s.score} max={5} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Watchlist ลำดับ A"
          subtitle="รายการที่พร้อมเข้าก่อนใคร"
          action={
            <Button size="sm" variant="subtle" onClick={() => onNavigate("watchlist")}>
              ดูทั้งหมด
            </Button>
          }
        >
          {data.watchlist.length === 0 ? (
            <EmptyState
              title="ยังไม่มีรายการเฝ้าดู"
              hint="รัน Screener แล้วกดเพิ่มหุ้นที่ผ่าน Funnel เข้ามาที่นี่"
              action={
                <Button size="sm" onClick={() => onNavigate("screener")}>
                  เปิด Screener
                </Button>
              }
            />
          ) : (
            <TableWrap minWidth={520}>
              <thead>
                <tr>
                  <Th>หุ้น</Th>
                  <Th align="right">เข้า</Th>
                  <Th align="right">Stop</Th>
                  <Th align="right">เป้า</Th>
                  <Th align="right">R:R</Th>
                </tr>
              </thead>
              <tbody>
                {data.watchlist.slice(0, 6).map((w) => {
                  const risk = w.entryPrice - w.stopLoss;
                  const reward = w.targetPrice - w.entryPrice;
                  const rr = risk > 0 ? reward / risk : 0;
                  return (
                    <tr key={w.id}>
                      <Td>
                        <span className="font-mono font-medium text-zinc-100">{w.symbol}</span>
                        <span className="ml-2 text-xs text-zinc-400">{w.sector}</span>
                      </Td>
                      <Td align="right" mono>{fmt(w.entryPrice)}</Td>
                      <Td align="right" mono className="text-red-400">{fmt(w.stopLoss)}</Td>
                      <Td align="right" mono className="text-emerald-400">{fmt(w.targetPrice)}</Td>
                      <Td align="right">
                        <Badge tone={rr >= 2 ? "good" : rr >= 1.5 ? "warn" : "bad"}>{fmt(rr, 1)}</Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card
          title="แผนปฏิบัติสัปดาห์นี้"
          subtitle="ขั้นที่ 5 ของรอบทบทวน"
          action={
            <Button size="sm" variant="subtle" onClick={() => onNavigate("weekly")}>
              แก้ไขแผน
            </Button>
          }
        >
          {data.actions.length === 0 ? (
            <EmptyState title="ยังไม่มีแผนของสัปดาห์นี้" hint="จบรอบทบทวนด้วยการเขียนสิ่งที่จะทำจริง" />
          ) : (
            <ul className="space-y-1.5">
              {data.actions.slice(0, 6).map((a) => {
                const meta = ACTION_TYPE_META[a.type] ?? { label: a.type, badge: "" };
                return (
                  <li key={a.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                    <input
                      type="checkbox"
                      checked={flags.valueOf(`action-${a.id}`, a.done)}
                      onChange={(e) =>
                        void flags.toggle(`action-${a.id}`, e.target.checked, async () => {
                          await put("/actions", { id: a.id, done: e.target.checked });
                          await reload();
                        })
                      }
                      aria-label={`ทำเครื่องหมาย ${a.content}`}
                      className="h-5 w-5 shrink-0 accent-emerald-500"
                    />
                    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.7rem] ${meta.badge}`}>
                      {meta.label}
                    </span>
                    <span
                      className={`flex-1 text-sm ${
                        flags.valueOf(`action-${a.id}`, a.done) ? "text-zinc-400 line-through" : "text-zinc-200"
                      }`}
                    >
                      {a.content}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title="เช็คลิสต์ประจำวัน"
          subtitle={`${dailyDone}/${data.checklist.length} เสร็จสิ้น`}
          action={
            <Button
              size="sm"
              variant="subtle"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await post("/checklists", { category: "DAILY" });
                  await reload();
                }, "รีเซ็ตเช็คลิสต์แล้ว")
              }
            >
              เริ่มรอบใหม่
            </Button>
          }
        >
          <div className="mb-3">
            <ProgressBar value={dailyDone} max={Math.max(1, data.checklist.length)} />
          </div>
          <ul className="space-y-1">
            {data.checklist.map((c) => (
              <li key={c.id} className="flex items-center gap-2.5 py-1">
                <input
                  type="checkbox"
                  checked={flags.valueOf(`check-${c.id}`, c.done)}
                  onChange={(e) =>
                    void flags.toggle(`check-${c.id}`, e.target.checked, async () => {
                      await patch("/checklists", { id: c.id, done: e.target.checked });
                      await reload();
                    })
                  }
                  aria-label={c.label}
                  className="h-5 w-5 shrink-0 accent-emerald-500"
                />
                <span
                  className={`text-sm ${
                    flags.valueOf(`check-${c.id}`, c.done) ? "text-zinc-400 line-through" : "text-zinc-200"
                  }`}
                >
                  {c.label}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {data.positions.length > 0 && (
        <Card
          title="สถานะที่เปิดอยู่"
          action={
            <Button size="sm" variant="subtle" onClick={() => onNavigate("portfolio")}>
              จัดการพอร์ต
            </Button>
          }
        >
          <TableWrap minWidth={640}>
            <thead>
              <tr>
                <Th>หุ้น</Th>
                <Th align="right">เข้า</Th>
                <Th align="right">ปัจจุบัน</Th>
                <Th align="right">P/L</Th>
                <Th align="center">Stage</Th>
                <Th align="right">ห่าง Stop</Th>
              </tr>
            </thead>
            <tbody>
              {data.positions.map((p) => {
                const pl = ((p.currentPrice - p.entryPrice) / p.entryPrice) * 100;
                const toStop = p.stopLoss > 0 ? (p.currentPrice / p.stopLoss - 1) * 100 : null;
                return (
                  <tr key={p.id}>
                    <Td>
                      <span className="font-mono font-medium text-zinc-100">{p.symbol}</span>
                      <span className="ml-2 text-xs text-zinc-400">{p.quantity.toLocaleString()} หุ้น</span>
                    </Td>
                    <Td align="right" mono>{fmt(p.entryPrice)}</Td>
                    <Td align="right" mono>{fmt(p.currentPrice)}</Td>
                    <Td align="right" mono className={pl >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {fmtPct(pl)}
                    </Td>
                    <Td align="center"><StageBadge stage={p.currentStage} short /></Td>
                    <Td
                      align="right"
                      mono
                      className={
                        toStop === null ? "text-zinc-400" : toStop < 0 ? "text-red-400" : toStop < 5 ? "text-amber-400" : "text-zinc-300"
                      }
                    >
                      {toStop === null ? "—" : fmtPct(toStop)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}

/** Shown once, while the customer's book is still empty. */
function FirstRun({ onLoaded }: { onLoaded: () => Promise<void> }) {
  const { busy, run } = useAction();
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-4">
      <h2 className="text-sm font-semibold text-emerald-200">เริ่มต้นใช้งาน</h2>
      <p className="mt-1 max-w-2xl text-xs text-zinc-300">
        บัญชีนี้ยังไม่มีข้อมูลการเทรด — ตั้งใจให้เป็นแบบนั้น เพราะพอร์ตและ Journal คือบันทึกจริงของคุณ
        เริ่มจากรอบทบทวนได้เลย หรือจะโหลดข้อมูลตัวอย่างไว้ดูหน้าตาระบบก่อนก็ได้ (ลบทิ้งภายหลังได้)
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await post("/bootstrap", { action: "demo" });
              await onLoaded();
            }, "โหลดข้อมูลตัวอย่างแล้ว")
          }
        >
          โหลดข้อมูลตัวอย่าง
        </Button>
      </div>
    </div>
  );
}
