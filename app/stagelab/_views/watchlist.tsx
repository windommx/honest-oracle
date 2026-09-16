"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ExportButton,
  PriorityBadge,
  ScorePill,
  SelectField,
  Skeleton,
  StageBadge,
  TableWrap,
  Tabs,
  Td,
  Th,
  ViewHeader,
} from "../_ui";
import { del, put, useAction, useResource, type StageSession } from "../_api";
import { EMPTY_DRAFT, WatchlistFormModal, type WatchlistDraft } from "./_watchlist-form";
import { fmt, rrRatio } from "@/lib/stagelab/utils";
import type { WatchlistItem } from "@/lib/stagelab/types";

interface Response {
  items: WatchlistItem[];
  limit: number;
}

const FILTERS = [
  { key: "ALL", label: "ทั้งหมด" },
  { key: "WATCHING", label: "เฝ้าดู" },
  { key: "BOUGHT", label: "ซื้อแล้ว" },
  { key: "DROPPED", label: "ปล่อย" },
] as const;

export default function WatchlistView({
  session,
  onSessionChange,
}: {
  session: StageSession;
  onSessionChange: () => void;
}) {
  const { data, loading, error, reload } = useResource<Response>("/watchlist");
  const { busy, run } = useAction(async () => {
    await reload();
  });
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("ALL");
  const [draft, setDraft] = useState<WatchlistDraft | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);
  const shown = useMemo(
    () => (filter === "ALL" ? items : items.filter((i) => i.status === filter)),
    [items, filter],
  );
  const counts = useMemo(
    () => ({
      A: items.filter((i) => i.priority === "A").length,
      B: items.filter((i) => i.priority === "B").length,
      C: items.filter((i) => i.priority === "C").length,
    }),
    [items],
  );

  async function refresh() {
    await reload();
    onSessionChange();
  }

  const atCap = items.length >= (data?.limit ?? session.limits.watchlist);

  if (loading && !data) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-5">
      <ViewHeader
        title="Watchlist"
        subtitle={`${items.length} / ${data?.limit ?? session.limits.watchlist} รายการ`}
        actions={
          <>
            <span className="flex gap-1.5">
              <Badge tone="good">A {counts.A}</Badge>
              <Badge tone="warn">B {counts.B}</Badge>
              <Badge tone="late">C {counts.C}</Badge>
            </span>
            <ExportButton dataset="watchlist" enabled={session.features.includes("export")} />
            <Button
              size="sm"
              variant="primary"
              disabled={atCap}
              title={atCap ? "ถึงเพดานของแผนแล้ว" : undefined}
              onClick={() => setDraft(EMPTY_DRAFT)}
            >
              เพิ่มรายการ
            </Button>
          </>
        }
      />

      {atCap && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          ถึงเพดาน {data?.limit} รายการของแผน {session.planLabel} — ลบรายการที่ไม่ใช้แล้ว หรืออัปเกรดเพื่อเพิ่มเพดาน
        </p>
      )}

      <Tabs tabs={FILTERS} active={filter} onChange={setFilter} />

      {error ? (
        <EmptyState
          title="โหลด Watchlist ไม่สำเร็จ"
          hint={error}
          action={<Button size="sm" variant="primary" onClick={() => void reload()}>ลองใหม่</Button>}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? "ยังไม่มีรายการเฝ้าดู" : "ไม่มีรายการในสถานะนี้"}
          hint={
            items.length === 0
              ? "เพิ่มด้วยตัวเอง หรือรัน Screener แล้วกดปุ่ม + เฝ้าดู ในตารางผลลัพธ์"
              : undefined
          }
          action={
            items.length === 0 ? (
              <Button size="sm" variant="primary" onClick={() => setDraft(EMPTY_DRAFT)}>
                เพิ่มรายการแรก
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <TableWrap minWidth={900}>
            <thead>
              <tr>
                <Th>หุ้น</Th>
                <Th align="center">Stage</Th>
                <Th>รูปแบบ</Th>
                <Th align="right">เข้า</Th>
                <Th align="right">Stop</Th>
                <Th align="right">เป้า</Th>
                <Th align="right">R:R</Th>
                <Th align="right">คะแนน</Th>
                <Th align="center">ลำดับ</Th>
                <Th align="center">สถานะ</Th>
                <Th align="right">จัดการ</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((w) => {
                const rr = rrRatio(w.entryPrice, w.stopLoss, w.targetPrice);
                return (
                  <tr key={w.id} className="hover:bg-zinc-800/30">
                    <Td>
                      <span className="font-mono font-medium text-zinc-100">{w.symbol}</span>
                      <span className="ml-2 text-xs text-zinc-400">{w.sector}</span>
                      {w.notes && (
                        <span className="ml-2 text-xs text-zinc-400" title={w.notes}>
                          📝
                        </span>
                      )}
                    </Td>
                    <Td align="center"><StageBadge stage={w.stage} short /></Td>
                    <Td className="text-xs text-zinc-300">{w.setup}</Td>
                    <Td align="right" mono>{fmt(w.entryPrice)}</Td>
                    <Td align="right" mono className="text-red-400">{fmt(w.stopLoss)}</Td>
                    <Td align="right" mono className="text-emerald-400">{fmt(w.targetPrice)}</Td>
                    <Td align="right">
                      <Badge tone={rr >= 2 ? "good" : rr >= 1.5 ? "warn" : "bad"}>{fmt(rr, 1)}</Badge>
                    </Td>
                    <Td align="right">
                      <span className="inline-flex gap-2">
                        <ScorePill label="RS" value={w.rsScore} />
                        <ScorePill label="พื้นฐาน" value={w.fundScore} />
                      </span>
                    </Td>
                    <Td align="center"><PriorityBadge priority={w.priority} /></Td>
                    <Td align="center">
                      <SelectField
                        value={w.status as "WATCHING" | "BOUGHT" | "DROPPED"}
                        onChange={(v) =>
                          void run(async () => {
                            await put("/watchlist", {
                              id: w.id,
                              status: v,
                              expectedUpdatedAt: w.updatedAt,
                            });
                            await refresh();
                          })
                        }
                        options={[
                          { value: "WATCHING", label: "เฝ้าดู" },
                          { value: "BOUGHT", label: "ซื้อแล้ว" },
                          { value: "DROPPED", label: "ปล่อย" },
                        ]}
                      />
                    </Td>
                    <Td align="right">
                      <span className="inline-flex gap-1.5">
                        <Button
                          size="sm"
                          onClick={() =>
                            setDraft({
                              id: w.id,
                              expectedUpdatedAt: w.updatedAt,
                              symbol: w.symbol,
                              sector: w.sector,
                              stage: w.stage,
                              setup: w.setup,
                              entryPrice: w.entryPrice,
                              stopLoss: w.stopLoss,
                              targetPrice: w.targetPrice,
                              rsScore: w.rsScore,
                              fundScore: w.fundScore,
                              priority: w.priority as "A" | "B" | "C",
                              status: w.status as "WATCHING" | "BOUGHT" | "DROPPED",
                              notes: w.notes ?? "",
                            })
                          }
                        >
                          แก้ไข
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setConfirmId(w.id)}>
                          ลบ
                        </Button>
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Card>
      )}

      <WatchlistFormModal
        open={draft !== null}
        draft={draft ?? EMPTY_DRAFT}
        onClose={() => setDraft(null)}
        onSaved={refresh}
      />

      <ConfirmDelete
        open={confirmId !== null}
        busy={busy}
        onCancel={() => setConfirmId(null)}
        onConfirm={() =>
          void run(async () => {
            await del(`/watchlist?id=${confirmId}`);
            setConfirmId(null);
            await refresh();
          }, "ลบรายการแล้ว")
        }
      />
    </div>
  );
}

export function ConfirmDelete({
  open,
  busy,
  onCancel,
  onConfirm,
  message = "ลบรายการนี้ถาวร — ย้อนกลับไม่ได้",
}: {
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  message?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="absolute inset-0" onClick={onCancel} aria-hidden />
      <div role="alertdialog" aria-modal="true" className="relative w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-sm text-zinc-200">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" onClick={onCancel}>ยกเลิก</Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={onConfirm}>
            {busy ? "กำลังลบ…" : "ลบ"}
          </Button>
        </div>
      </div>
    </div>
  );
}
