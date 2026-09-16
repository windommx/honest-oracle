"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  NumberField,
  SelectField,
  Skeleton,
  Slider,
  StageBadge,
  StatCard,
  TableWrap,
  Td,
  TextInput,
  Th,
  Toggle,
  ViewHeader,
} from "../_ui";
import { del, post, put, useAction, useResource, type StageSession } from "../_api";
import { ConfirmDelete } from "./watchlist";
import ScreenerView from "./screener";
import { ACTION_TYPE_META, calcMarketScore, fmtPct, pnlPct, suggestAction } from "@/lib/stagelab/utils";
import type { ActionItem, MarketReview, Position, SectorRanking } from "@/lib/stagelab/types";

const STEPS = [
  { n: 1, label: "ตลาดรวม" },
  { n: 2, label: "กลุ่มอุตสาหกรรม" },
  { n: 3, label: "คัดหุ้น" },
  { n: 4, label: "ทบทวนพอร์ต" },
  { n: 5, label: "แผนสัปดาห์หน้า" },
];

export default function WeeklyReviewView({
  session,
  onSessionChange,
}: {
  session: StageSession;
  onSessionChange: () => void;
}) {
  const [step, setStep] = useState(1);

  return (
    <div className="space-y-5">
      <ViewHeader
        title="รอบทบทวนรายสัปดาห์"
        subtitle="ห้าขั้น เรียงจากบนลงล่าง: ตลาด → กลุ่ม → หุ้น → พอร์ต → แผน"
        actions={
          <>
            <Button size="sm" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>
              ก่อนหน้า
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={step === STEPS.length}
              onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}
            >
              ขั้นถัดไป
            </Button>
          </>
        }
      />

      <ol className="flex flex-wrap gap-2" aria-label="ขั้นตอน">
        {STEPS.map((s) => (
          <li key={s.n}>
            <button
              onClick={() => setStep(s.n)}
              aria-current={step === s.n ? "step" : undefined}
              className={`flex min-h-9 items-center gap-2 rounded-lg border px-3 text-xs transition-colors ${
                step === s.n
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                  : step > s.n
                    ? "border-zinc-700 text-zinc-300"
                    : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              <span className="font-mono">{step > s.n ? "✓" : s.n}</span>
              {s.label}
            </button>
          </li>
        ))}
      </ol>

      {step === 1 && <MarketStep onSaved={onSessionChange} />}
      {step === 2 && <SectorStep />}
      {step === 3 && <ScreenerView compact onSaved={onSessionChange} />}
      {step === 4 && <PortfolioStep onSessionChange={onSessionChange} />}
      {step === 5 && <PlanStep session={session} />}
    </div>
  );
}

// ─── Step 1 ──────────────────────────────────────────────────────────────────

const CHECKS = [
  { key: "setAboveMa", label: "SET อยู่เหนือเส้นค่าเฉลี่ย 30 สัปดาห์", hint: "ตัวชี้ขาดข้อแรก" },
  { key: "maRising", label: "เส้น 30W MA ชันขึ้น", hint: "ไม่ใช่แค่ยืนเหนือ แต่ต้องกำลังไป" },
  { key: "breadthOk", label: "หุ้นเหนือ MA เกินครึ่งตลาด", hint: "ตลาดขึ้นด้วยหุ้นหลายตัว ไม่ใช่ห้าตัว" },
  { key: "adConfirm", label: "เส้น A/D ยืนยันทิศทางเดียวกับดัชนี", hint: "ถ้าสวนทางคือสัญญาณกระจายของ" },
  { key: "foreignBuy", label: "ต่างชาติซื้อสุทธิต่อเนื่อง", hint: "เงินก้อนใหญ่อยู่ฝั่งไหน" },
] as const;

function MarketStep({ onSaved }: { onSaved: () => void }) {
  const { data, loading, reload } = useResource<MarketReview>("/market-review");
  const { busy, run } = useAction();
  const [form, setForm] = useState<MarketReview | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (loading && !form) return <Skeleton className="h-80" />;
  if (!form) return <EmptyState title="โหลดข้อมูลตลาดไม่สำเร็จ" />;

  const score = calcMarketScore(form);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="ให้คะแนนตลาดรวม" subtitle="ห้าข้อ ข้อละ 2 คะแนน" className="lg:col-span-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            label="SET Index"
            value={form.setIndex}
            onChange={(n) => setForm({ ...form, setIndex: n })}
            step={0.01}
          />
          <div className="flex items-end">
            <div className="w-full">
              <Slider
                label="Market Breadth"
                value={form.breadthPct}
                onChange={(n) => setForm({ ...form, breadthPct: n })}
                min={0}
                max={100}
                format={(n) => `${n}%`}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {CHECKS.map((c) => (
            <Toggle
              key={c.key}
              label={c.label}
              hint={c.hint}
              checked={form[c.key]}
              onChange={(v) => setForm({ ...form, [c.key]: v })}
            />
          ))}
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-[0.7rem] uppercase tracking-wide text-zinc-400">บันทึก</label>
          <textarea
            rows={2}
            value={form.notes ?? ""}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="สิ่งที่สังเกตเห็นในสัปดาห์นี้"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await post("/market-review", {
                  setIndex: form.setIndex,
                  breadthPct: form.breadthPct,
                  setAboveMa: form.setAboveMa,
                  maRising: form.maRising,
                  breadthOk: form.breadthOk,
                  adConfirm: form.adConfirm,
                  foreignBuy: form.foreignBuy,
                  notes: form.notes,
                });
                await reload();
                onSaved();
              }, "บันทึกคะแนนตลาดแล้ว")
            }
          >
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </div>
      </Card>

      <Card title="ผลลัพธ์">
        <div
          className={`rounded-xl border px-4 py-5 text-center ${
            score.score >= 8
              ? "border-emerald-500/40 bg-emerald-500/5"
              : score.score >= 6
                ? "border-amber-500/40 bg-amber-500/5"
                : score.score >= 4
                  ? "border-orange-500/40 bg-orange-500/5"
                  : "border-red-500/40 bg-red-500/5"
          }`}
        >
          <div className="font-mono text-4xl font-semibold tabular-nums text-zinc-50">
            {score.score}
            <span className="text-lg text-zinc-400">/{score.max}</span>
          </div>
          <div className="mt-1 text-sm text-zinc-200">{score.stageLabel}</div>
          <div className="mt-2 text-xs text-zinc-400">สัดส่วนหุ้นแนะนำ</div>
          <div className="font-mono text-lg text-emerald-400">{score.equityPct}</div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-300">{score.recommendation}</p>
        <p className="mt-2 text-[0.7rem] text-zinc-400">
          ตัวเลขนี้คำนวณสดจากช่องที่กำลังกรอก — กดบันทึกเพื่อให้ส่วนอื่นของระบบใช้คะแนนนี้
        </p>
      </Card>
    </div>
  );
}

// ─── Step 2 ──────────────────────────────────────────────────────────────────

function SectorStep() {
  const { data, loading, reload } = useResource<{ sectors: SectorRanking[] }>("/sectors");
  const { busy, run } = useAction();
  const [name, setName] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const sectors = data?.sectors ?? [];

  async function update(id: number, patchFields: Record<string, unknown>) {
    await run(async () => {
      await put("/sectors", { id, ...patchFields });
      await reload();
    });
  }

  if (loading && !data) return <Skeleton className="h-80" />;

  return (
    <Card
      title="จัดอันดับกลุ่มอุตสาหกรรม"
      subtitle="ให้คะแนน 1–5 จากความแข็งแรงเทียบตลาด — Screener จะกรองด้วยกลุ่มที่ได้ 4 ขึ้นไป"
      action={
        <span className="flex gap-1.5">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            placeholder="ชื่อกลุ่ม"
            className="!min-h-9 w-28 !text-xs"
          />
          <Button
            size="sm"
            disabled={busy || name.trim() === ""}
            onClick={() =>
              void run(async () => {
                await post("/sectors", { name: name.trim() });
                setName("");
                await reload();
              }, "เพิ่มกลุ่มแล้ว")
            }
          >
            เพิ่ม
          </Button>
        </span>
      }
    >
      {sectors.length === 0 ? (
        <EmptyState title="ยังไม่มีกลุ่มอุตสาหกรรม" hint="เพิ่มกลุ่มที่คุณติดตาม แล้วให้คะแนนทุกสัปดาห์" />
      ) : (
        <TableWrap minWidth={720}>
          <thead>
            <tr>
              <Th>กลุ่ม</Th>
              <Th align="center">Stage</Th>
              <Th align="center">แนวโน้ม</Th>
              <Th align="center">ปริมาณ</Th>
              <Th align="right">RS เทียบ SET</Th>
              <Th align="center">คะแนน</Th>
              <Th align="right"> </Th>
            </tr>
          </thead>
          <tbody>
            {sectors.map((s) => (
              <tr key={s.id}>
                <Td><span className="font-medium text-zinc-100">{s.name}</span></Td>
                <Td align="center">
                  <SelectField
                    value={String(s.stage)}
                    onChange={(v) => void update(s.id, { stage: Number(v) })}
                    options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `Stage ${n}` }))}
                  />
                </Td>
                <Td align="center">
                  <SelectField
                    value={s.trend as "RISING" | "FLAT" | "FALLING"}
                    onChange={(v) => void update(s.id, { trend: v })}
                    options={[
                      { value: "RISING", label: "ขึ้น" },
                      { value: "FLAT", label: "ออกข้าง" },
                      { value: "FALLING", label: "ลง" },
                    ]}
                  />
                </Td>
                <Td align="center">
                  <SelectField
                    value={s.volume as "HEAVY" | "NORMAL" | "LIGHT"}
                    onChange={(v) => void update(s.id, { volume: v })}
                    options={[
                      { value: "HEAVY", label: "หนา" },
                      { value: "NORMAL", label: "ปกติ" },
                      { value: "LIGHT", label: "บาง" },
                    ]}
                  />
                </Td>
                <Td align="right">
                  <input
                    type="number"
                    step={0.1}
                    defaultValue={s.rsVsSet}
                    aria-label={`RS ของ ${s.name}`}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n) && n !== s.rsVsSet) void update(s.id, { rsVsSet: n });
                    }}
                    className="w-20 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-right font-mono text-sm tabular-nums text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                </Td>
                <Td align="center">
                  <SelectField
                    value={String(s.score)}
                    onChange={(v) => void update(s.id, { score: Number(v) })}
                    options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n}` }))}
                  />
                </Td>
                <Td align="right">
                  <Button size="sm" variant="danger" onClick={() => setConfirmId(s.id)}>
                    ลบ
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <ConfirmDelete
        open={confirmId !== null}
        busy={busy}
        message="ลบกลุ่มนี้ออกจากกระดานจัดอันดับ"
        onCancel={() => setConfirmId(null)}
        onConfirm={() =>
          void run(async () => {
            await del(`/sectors?id=${confirmId}`);
            setConfirmId(null);
            await reload();
          }, "ลบกลุ่มแล้ว")
        }
      />
    </Card>
  );
}

// ─── Step 4 ──────────────────────────────────────────────────────────────────

function PortfolioStep({ onSessionChange }: { onSessionChange: () => void }) {
  const { data, loading, reload } = useResource<{ positions: Position[] }>("/positions");
  const { busy, run } = useAction();

  const open = useMemo(() => (data?.positions ?? []).filter((p) => p.status === "OPEN"), [data]);
  const verdicts = useMemo(() => {
    const counts = { CUT: 0, SELL: 0, HOLD: 0, WATCH: 0 };
    for (const p of open) counts[suggestAction(p).action] += 1;
    return counts;
  }, [open]);

  if (loading && !data) return <Skeleton className="h-80" />;

  return (
    <Card
      title="ทบทวนทีละไม้"
      subtitle="อัปเดต Stage ปัจจุบัน แล้วทำตามคำแนะนำ — นี่คือขั้นที่ระบบมีค่าที่สุด"
    >
      {open.length === 0 ? (
        <EmptyState title="ไม่มีสถานะที่เปิดอยู่" hint="ข้ามไปขั้นที่ 5 เพื่อเขียนแผนของสัปดาห์หน้า" />
      ) : (
        <>
          <div className="mb-4 grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard label="ต้องขายทันที" value={String(verdicts.CUT)} tone={verdicts.CUT > 0 ? "bad" : "neutral"} />
            <StatCard label="ทยอยลด" value={String(verdicts.SELL)} tone={verdicts.SELL > 0 ? "late" : "neutral"} />
            <StatCard label="เฝ้าระวัง" value={String(verdicts.WATCH)} tone={verdicts.WATCH > 0 ? "warn" : "neutral"} />
            <StatCard label="ถือต่อ" value={String(verdicts.HOLD)} tone="good" />
          </div>

          <TableWrap minWidth={760}>
            <thead>
              <tr>
                <Th>หุ้น</Th>
                <Th align="right">P/L</Th>
                <Th align="right">ห่าง Stop</Th>
                <Th align="center">Stage ปัจจุบัน</Th>
                <Th>คำแนะนำ</Th>
              </tr>
            </thead>
            <tbody>
              {open.map((p) => {
                const advice = suggestAction(p);
                const toStop = p.stopLoss > 0 ? (p.currentPrice / p.stopLoss - 1) * 100 : null;
                const pl = pnlPct(p);
                return (
                  <tr key={p.id}>
                    <Td>
                      <span className="font-mono font-medium text-zinc-100">{p.symbol}</span>
                      <span className="ml-2"><StageBadge stage={p.entryStage} short /></span>
                    </Td>
                    <Td align="right" mono className={pl >= 0 ? "text-emerald-400" : "text-red-400"}>{fmtPct(pl)}</Td>
                    <Td
                      align="right"
                      mono
                      className={toStop === null ? "text-zinc-400" : toStop < 0 ? "text-red-400" : toStop < 5 ? "text-amber-400" : "text-zinc-300"}
                    >
                      {toStop === null ? "—" : fmtPct(toStop)}
                    </Td>
                    <Td align="center">
                      <SelectField
                        value={String(p.currentStage)}
                        onChange={(v) =>
                          void run(async () => {
                            await put("/positions", { id: p.id, currentStage: Number(v) });
                            await reload();
                            onSessionChange();
                          })
                        }
                        options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `Stage ${n}` }))}
                      />
                    </Td>
                    <Td>
                      <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.7rem] ${advice.badge}`}>
                        {advice.label}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
          {busy && <p className="mt-2 text-xs text-zinc-400">กำลังบันทึก…</p>}
        </>
      )}
    </Card>
  );
}

// ─── Step 5 ──────────────────────────────────────────────────────────────────

function PlanStep({ session }: { session: StageSession }) {
  const { data, loading, reload } = useResource<{ actions: ActionItem[] }>("/actions");
  const { busy, run } = useAction();
  const [type, setType] = useState<"BUY" | "SELL" | "ADD" | "ALERT" | "EVENT">("BUY");
  const [content, setContent] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const actions = data?.actions ?? [];

  if (loading && !data) return <Skeleton className="h-64" />;

  return (
    <Card
      title="แผนสัปดาห์หน้า"
      subtitle={`${actions.filter((a) => !a.done).length} รายการค้าง · เพดานแผน ${session.limits.actions} รายการ`}
    >
      <div className="flex flex-wrap gap-2">
        <div className="w-36">
          <SelectField
            value={type}
            onChange={setType}
            options={[
              { value: "BUY", label: "ซื้อ" },
              { value: "SELL", label: "ขาย" },
              { value: "ADD", label: "เพิ่มไม้" },
              { value: "ALERT", label: "ตั้ง Alert" },
              { value: "EVENT", label: "ติดตามข่าว" },
            ]}
          />
        </div>
        <TextInput
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="เช่น ซื้อ DELTA ถ้าย่อถึง 148 (limit order)"
          className="min-w-0 flex-1"
        />
        <Button
          size="sm"
          variant="primary"
          disabled={busy || content.trim() === ""}
          onClick={() =>
            void run(async () => {
              await post("/actions", { type, content: content.trim() });
              setContent("");
              await reload();
            }, "เพิ่มลงแผนแล้ว")
          }
        >
          เพิ่ม
        </Button>
      </div>

      {actions.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="ยังไม่มีแผน"
            hint="แผนที่ดีระบุทั้งราคาและเงื่อนไข ไม่ใช่แค่ชื่อหุ้น — เพื่อให้พรุ่งนี้ไม่ต้องตัดสินใจใหม่"
          />
        </div>
      ) : (
        <ul className="mt-4 max-h-96 space-y-1.5 overflow-y-auto">
          {actions.map((a) => {
            const meta = ACTION_TYPE_META[a.type] ?? { label: a.type, badge: "" };
            return (
              <li key={a.id} className="flex items-center gap-2.5 rounded-lg border border-zinc-800 px-3 py-2">
                <input
                  type="checkbox"
                  checked={a.done}
                  disabled={busy}
                  aria-label={a.content}
                  onChange={() =>
                    void run(async () => {
                      await put("/actions", { id: a.id, done: !a.done });
                      await reload();
                    })
                  }
                  className="h-5 w-5 shrink-0 accent-emerald-500"
                />
                <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.7rem] ${meta.badge}`}>
                  {meta.label}
                </span>
                <span className={`flex-1 text-sm ${a.done ? "text-zinc-400 line-through" : "text-zinc-200"}`}>
                  {a.content}
                </span>
                <Badge>{a.weekOf}</Badge>
                <Button size="sm" variant="danger" onClick={() => setConfirmId(a.id)}>
                  ลบ
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDelete
        open={confirmId !== null}
        busy={busy}
        message="ลบรายการนี้ออกจากแผน"
        onCancel={() => setConfirmId(null)}
        onConfirm={() =>
          void run(async () => {
            await del(`/actions?id=${confirmId}`);
            setConfirmId(null);
            await reload();
          }, "ลบแล้ว")
        }
      />
    </Card>
  );
}
