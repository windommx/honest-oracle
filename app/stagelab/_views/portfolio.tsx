"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  NumberField,
  PriorityBadge,
  SelectField,
  Skeleton,
  StageBadge,
  StatCard,
  TableWrap,
  Td,
  TextInput,
  Th,
  ViewHeader,
  toneOfSign,
} from "../_ui";
import { del, post, put, useAction, useResource, type StageSession } from "../_api";
import { ConfirmDelete } from "./watchlist";
import { fmt, fmtBaht, fmtPct, pnlPct, positionValue, suggestAction } from "@/lib/stagelab/utils";
import type { Position } from "@/lib/stagelab/types";

interface Response {
  positions: Position[];
  limit: number;
}

const STAGE_OPTIONS = [
  { value: "1", label: "Stage 1 – สะสมฐาน" },
  { value: "2", label: "Stage 2 – ขาขึ้น" },
  { value: "3", label: "Stage 3 – ยอดพีค" },
  { value: "4", label: "Stage 4 – ขาลง" },
];

export default function PortfolioView({
  session,
  onSessionChange,
}: {
  session: StageSession;
  onSessionChange: () => void;
}) {
  const { data, loading, error, reload } = useResource<Response>("/positions");
  const { busy, run } = useAction(async () => {
    await reload();
  });
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState<Position | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const positions = useMemo(() => data?.positions ?? [], [data]);
  const open = useMemo(() => positions.filter((p) => p.status === "OPEN"), [positions]);
  const closed = useMemo(() => positions.filter((p) => p.status !== "OPEN"), [positions]);

  const stats = useMemo(() => {
    const value = open.reduce((s, p) => s + positionValue(p), 0);
    const unrealized = open.reduce((s, p) => s + (p.currentPrice - p.entryPrice) * p.quantity, 0);
    const realized = closed.reduce(
      (s, p) => s + ((p.closedPrice ?? p.currentPrice) - p.entryPrice) * p.quantity,
      0,
    );
    const wins = closed.filter((p) => (p.closedPrice ?? p.currentPrice) > p.entryPrice).length;
    return {
      value,
      unrealized,
      realized,
      winRate: closed.length > 0 ? (wins / closed.length) * 100 : null,
      avgPct: open.length > 0 ? open.reduce((s, p) => s + pnlPct(p), 0) / open.length : 0,
    };
  }, [open, closed]);

  async function refresh() {
    await reload();
    onSessionChange();
  }

  const atCap = open.length >= (data?.limit ?? session.limits.positions);

  if (loading && !data) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-5">
      <ViewHeader
        title="พอร์ต"
        subtitle={`เปิดอยู่ ${open.length} / ${data?.limit ?? session.limits.positions} · ปิดแล้ว ${closed.length}`}
        actions={
          <Button
            size="sm"
            variant="primary"
            disabled={atCap}
            title={atCap ? "ถึงเพดานสถานะเปิดของแผนแล้ว" : undefined}
            onClick={() => setAdding(true)}
          >
            เพิ่มสถานะ
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="มูลค่าพอร์ต" value={fmtBaht(stats.value)} sub={`${open.length} สถานะเปิด`} />
        <StatCard
          label="ยังไม่ปิด"
          value={fmtBaht(stats.unrealized)}
          sub={open.length > 0 ? `เฉลี่ย ${fmtPct(stats.avgPct)}` : "—"}
          tone={toneOfSign(stats.unrealized)}
        />
        <StatCard
          label="Win Rate"
          value={stats.winRate === null ? "—" : `${fmt(stats.winRate, 0)}%`}
          sub={`จาก ${closed.length} ไม้ที่ปิดแล้ว`}
          tone={stats.winRate === null ? "neutral" : stats.winRate >= 50 ? "good" : "bad"}
        />
        <StatCard label="กำไรที่รับรู้แล้ว" value={fmtBaht(stats.realized)} tone={toneOfSign(stats.realized)} />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-300">
        <strong className="text-zinc-100">กฎการปรับพอร์ต:</strong> หลุด Stop → ขายทันที ไม่ต่อรอง ·
        เข้าสู่ Stage 4 → ขายทันที · Stage 3 → ทยอยลดไม้ · Stage 2 ที่ยังห่าง Stop เกิน 10% → ถือต่อ
      </div>

      {error ? (
        <EmptyState title="โหลดพอร์ตไม่สำเร็จ" hint={error} action={<Button size="sm" variant="primary" onClick={() => void reload()}>ลองใหม่</Button>} />
      ) : open.length === 0 ? (
        <EmptyState
          title="ยังไม่มีสถานะที่เปิดอยู่"
          hint="บันทึกไม้ที่ซื้อจริงไว้ที่นี่ ระบบจะเทียบราคากับ Stop และ Stage ให้ทุกครั้งที่คุณอัปเดต"
          action={<Button size="sm" variant="primary" onClick={() => setAdding(true)}>เพิ่มสถานะแรก</Button>}
        />
      ) : (
        <Card title="สถานะที่เปิดอยู่">
          <TableWrap minWidth={980}>
            <thead>
              <tr>
                <Th>หุ้น</Th>
                <Th align="right">เข้า</Th>
                <Th align="right">ปัจจุบัน</Th>
                <Th align="right">P/L</Th>
                <Th align="right">มูลค่า</Th>
                <Th align="center">Stage</Th>
                <Th align="right">Stop</Th>
                <Th align="right">ห่าง Stop</Th>
                <Th>คำแนะนำ</Th>
                <Th align="right">จัดการ</Th>
              </tr>
            </thead>
            <tbody>
              {open.map((p) => {
                const pl = pnlPct(p);
                const toStop = p.stopLoss > 0 ? (p.currentPrice / p.stopLoss - 1) * 100 : null;
                const advice = suggestAction(p);
                return (
                  <tr key={p.id} className="hover:bg-zinc-800/30">
                    <Td>
                      <span className="font-mono font-medium text-zinc-100">{p.symbol}</span>
                      <span className="ml-2 text-xs text-zinc-400">{p.quantity.toLocaleString()} หุ้น</span>
                      <span className="ml-2"><PriorityBadge priority={p.confidence} /></span>
                    </Td>
                    <Td align="right" mono>{fmt(p.entryPrice)}</Td>
                    <Td align="right">
                      <input
                        type="number"
                        step={0.25}
                        defaultValue={p.currentPrice}
                        aria-label={`ราคาปัจจุบันของ ${p.symbol}`}
                        onBlur={(e) => {
                          const next = Number(e.target.value);
                          if (!Number.isFinite(next) || next === p.currentPrice) return;
                          void run(async () => {
                            await put("/positions", {
                              id: p.id,
                              currentPrice: next,
                              expectedUpdatedAt: p.updatedAt,
                            });
                            await refresh();
                          });
                        }}
                        className="w-20 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-right font-mono text-sm tabular-nums text-zinc-100 focus:border-emerald-500 focus:outline-none"
                      />
                    </Td>
                    <Td align="right" mono className={pl >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {fmtPct(pl)}
                    </Td>
                    <Td align="right" mono>{fmtBaht(positionValue(p))}</Td>
                    <Td align="center">
                      <span className="inline-flex items-center gap-1">
                        <StageBadge stage={p.entryStage} short />
                        <span className="text-zinc-400">→</span>
                        <SelectField
                          value={String(p.currentStage)}
                          onChange={(v) =>
                            void run(async () => {
                              await put("/positions", {
                                id: p.id,
                                currentStage: Number(v),
                                expectedUpdatedAt: p.updatedAt,
                              });
                              await refresh();
                            })
                          }
                          options={STAGE_OPTIONS}
                        />
                      </span>
                    </Td>
                    <Td align="right" mono className="text-red-400">{fmt(p.stopLoss)}</Td>
                    <Td
                      align="right"
                      mono
                      className={toStop === null ? "text-zinc-400" : toStop < 0 ? "text-red-400" : toStop < 5 ? "text-amber-400" : "text-zinc-300"}
                    >
                      {toStop === null ? "—" : fmtPct(toStop)}
                    </Td>
                    <Td>
                      <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.7rem] ${advice.badge}`}>
                        {advice.label}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="inline-flex gap-1.5">
                        <Button size="sm" onClick={() => setClosing(p)}>ปิดไม้</Button>
                        <Button size="sm" variant="danger" onClick={() => setConfirmId(p.id)}>ลบ</Button>
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {closed.length > 0 && (
        <Card title="ไม้ที่ปิดแล้ว" subtitle="ประวัติที่ใช้คำนวณ Win Rate และ Monte Carlo">
          <TableWrap minWidth={640}>
            <thead>
              <tr>
                <Th>หุ้น</Th>
                <Th align="right">เข้า</Th>
                <Th align="right">ปิด</Th>
                <Th align="right">P/L ฿</Th>
                <Th align="right">P/L %</Th>
                <Th align="center">ผล</Th>
                <Th align="right">วันที่ปิด</Th>
              </tr>
            </thead>
            <tbody>
              {closed.map((p) => {
                const exit = p.closedPrice ?? p.currentPrice;
                const baht = (exit - p.entryPrice) * p.quantity;
                const pct = pnlPct(p);
                return (
                  <tr key={p.id}>
                    <Td><span className="font-mono text-zinc-100">{p.symbol}</span></Td>
                    <Td align="right" mono>{fmt(p.entryPrice)}</Td>
                    <Td align="right" mono>{fmt(exit)}</Td>
                    <Td align="right" mono className={baht >= 0 ? "text-emerald-400" : "text-red-400"}>{fmtBaht(baht)}</Td>
                    <Td align="right" mono className={pct >= 0 ? "text-emerald-400" : "text-red-400"}>{fmtPct(pct)}</Td>
                    <Td align="center">
                      <Badge tone={baht >= 0 ? "good" : "bad"}>{baht >= 0 ? "WIN" : "LOSS"}</Badge>
                    </Td>
                    <Td align="right" className="text-xs text-zinc-400">
                      {p.closedAt ? new Date(p.closedAt).toLocaleDateString("th-TH") : "—"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Card>
      )}

      <AddPositionModal open={adding} onClose={() => setAdding(false)} onSaved={refresh} />
      <ClosePositionModal position={closing} onClose={() => setClosing(null)} onSaved={refresh} />
      <ConfirmDelete
        open={confirmId !== null}
        busy={busy}
        message="ลบสถานะนี้ถาวร — ประวัติที่ใช้คำนวณ Win Rate จะหายไปด้วย"
        onCancel={() => setConfirmId(null)}
        onConfirm={() =>
          void run(async () => {
            await del(`/positions?id=${confirmId}`);
            setConfirmId(null);
            await refresh();
          }, "ลบสถานะแล้ว")
        }
      />
    </div>
  );
}

function AddPositionModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { busy, run } = useAction();
  const [form, setForm] = useState({
    symbol: "",
    sector: "",
    quantity: 100,
    entryPrice: 0,
    stopLoss: 0,
    entryStage: "2",
    confidence: "B" as "A+" | "A" | "B" | "C" | "D",
    notes: "",
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="เพิ่มสถานะในพอร์ต"
      footer={
        <>
          <Button size="sm" onClick={onClose}>ยกเลิก</Button>
          <Button
            size="sm"
            variant="primary"
            disabled={busy || form.symbol.trim() === "" || form.entryPrice <= 0}
            onClick={() =>
              void run(async () => {
                await post("/positions", {
                  ...form,
                  symbol: form.symbol.trim().toUpperCase(),
                  entryStage: Number(form.entryStage),
                  currentStage: Number(form.entryStage),
                  currentPrice: form.entryPrice,
                  notes: form.notes.trim() || null,
                });
                await onSaved();
                onClose();
              }, "บันทึกสถานะแล้ว")
            }
          >
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="สัญลักษณ์">
          <TextInput
            value={form.symbol}
            onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
            placeholder="เช่น KBANK"
            className="font-mono"
          />
        </Field>
        <Field label="กลุ่มอุตสาหกรรม">
          <TextInput value={form.sector} onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))} />
        </Field>
        <NumberField label="จำนวนหุ้น" value={form.quantity} onChange={(n) => setForm((f) => ({ ...f, quantity: n }))} step={100} min={1} />
        <NumberField label="ราคาเข้า" value={form.entryPrice} onChange={(n) => setForm((f) => ({ ...f, entryPrice: n }))} step={0.25} />
        <NumberField label="Stop Loss" value={form.stopLoss} onChange={(n) => setForm((f) => ({ ...f, stopLoss: n }))} step={0.25} />
        <SelectField
          label="Stage ตอนเข้า"
          value={form.entryStage}
          onChange={(v) => setForm((f) => ({ ...f, entryStage: v }))}
          options={STAGE_OPTIONS}
        />
        <SelectField
          label="ความมั่นใจ"
          value={form.confidence}
          onChange={(v) => setForm((f) => ({ ...f, confidence: v }))}
          options={[
            { value: "A+", label: "A+ — ครบทุกเงื่อนไข" },
            { value: "A", label: "A — แข็งแรง" },
            { value: "B", label: "B — มาตรฐาน" },
            { value: "C", label: "C — เสี่ยง" },
            { value: "D", label: "D — ไม่ควรเข้า" },
          ]}
        />
        <div className="sm:col-span-2">
          <Field label="บันทึก">
            <TextInput value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="เหตุผลที่เข้า" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function ClosePositionModal({
  position,
  onClose,
  onSaved,
}: {
  position: Position | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { busy, run } = useAction();
  const [price, setPrice] = useState(0);

  return (
    <Modal
      open={position !== null}
      onClose={onClose}
      title={position ? `ปิดไม้ ${position.symbol}` : "ปิดไม้"}
      footer={
        <>
          <Button size="sm" onClick={onClose}>ยกเลิก</Button>
          <Button
            size="sm"
            variant="primary"
            disabled={busy || !position}
            onClick={() =>
              void run(async () => {
                if (!position) return;
                await put("/positions", {
                  id: position.id,
                  status: "CLOSED",
                  closedPrice: price > 0 ? price : position.currentPrice,
                  closedAt: new Date().toISOString(),
                  expectedUpdatedAt: position.updatedAt,
                });
                await onSaved();
                onClose();
              }, "ปิดไม้แล้ว")
            }
          >
            {busy ? "กำลังปิด…" : "ยืนยันปิดไม้"}
          </Button>
        </>
      }
    >
      {position && (
        <>
          <NumberField
            label="ราคาปิด"
            value={price > 0 ? price : position.currentPrice}
            onChange={setPrice}
            step={0.25}
            hint={`ราคาเข้า ${fmt(position.entryPrice)} · ${position.quantity.toLocaleString()} หุ้น`}
          />
          <p className="text-xs text-zinc-400">
            ผลลัพธ์โดยประมาณ:{" "}
            <span className={(price > 0 ? price : position.currentPrice) >= position.entryPrice ? "text-emerald-400" : "text-red-400"}>
              {fmtBaht(((price > 0 ? price : position.currentPrice) - position.entryPrice) * position.quantity)}
            </span>
          </p>
        </>
      )}
    </Modal>
  );
}
