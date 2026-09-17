"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ExportButton,
  Field,
  Modal,
  NumberField,
  ProgressBar,
  SelectField,
  Skeleton,
  StageBadge,
  TableWrap,
  Td,
  TextInput,
  Th,
  Toggle,
  ViewHeader,
} from "../_ui";
import { del, post, put, useAction, useResource, type StageSession } from "../_api";
import { ConfirmDelete } from "./watchlist";
import {
  FLOW_OPTIONS,
  FUNDAMENTAL_MAX,
  TECHNICAL_MAX,
  combinedScore,
  earningsAnalysis,
  flowSignal,
  fundScore,
  riskCell,
  type FlowLevel,
} from "@/lib/stagelab/scoring";
import { fmt, fmtPct, rrRatio } from "@/lib/stagelab/utils";
import type { ThesisDTO } from "@/lib/stagelab/types";

interface Response {
  theses: ThesisDTO[];
  limit: number;
}

interface Draft {
  id?: number;
  expectedUpdatedAt?: string;
  symbol: string;
  sector: string;
  stockStage: number;
  tripleConfirm: boolean;
  tech17: number;
  epsGrowthPct: number;
  epsAccelerating: boolean;
  cfoGeNi: boolean;
  revenueGrowthPct: number;
  recurringRev: boolean;
  gmExpanding: boolean;
  opMarginAboveInd: boolean;
  debtEquity: number;
  currentRatio: number;
  fcfYieldPct: number;
  foreignNetBuy: boolean;
  fundIncreasing: boolean;
  insiderBuying: boolean;
  catalyst: string;
  earningsDate: string;
  riskNote: string;
  entryStrategy: string;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  foreignFlow: FlowLevel;
  status: "ACTIVE" | "CLOSED_IDEA";
  quarters: { label: string; eps: number }[];
}

const EMPTY: Draft = {
  symbol: "",
  sector: "",
  stockStage: 2,
  tripleConfirm: false,
  tech17: 0,
  epsGrowthPct: 0,
  epsAccelerating: false,
  cfoGeNi: false,
  revenueGrowthPct: 0,
  recurringRev: false,
  gmExpanding: false,
  opMarginAboveInd: false,
  debtEquity: 1,
  currentRatio: 1.5,
  fcfYieldPct: 0,
  foreignNetBuy: false,
  fundIncreasing: false,
  insiderBuying: false,
  catalyst: "",
  earningsDate: "",
  riskNote: "",
  entryStrategy: "Breakout",
  entryPrice: 0,
  stopLoss: 0,
  target1: 0,
  target2: 0,
  foreignFlow: "FLAT",
  status: "ACTIVE",
  quarters: [],
};

export default function ThesisView({
  session,
  onSessionChange,
}: {
  session: StageSession;
  onSessionChange: () => void;
}) {
  const { data, loading, reload } = useResource<Response>("/thesis");
  const { busy, run } = useAction();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const theses = data?.theses ?? [];
  const atCap = theses.length >= (data?.limit ?? session.limits.theses);

  async function refresh() {
    await reload();
    onSessionChange();
  }

  if (loading && !data) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-5">
      <ViewHeader
        title="Stock Thesis"
        subtitle={`${theses.length} / ${data?.limit ?? session.limits.theses} — หน้าเดียวจบ: เทคนิค พื้นฐาน ตัวเร่ง และแผนเทรด`}
        actions={
          <>
            <ExportButton dataset="thesis" enabled={session.features.includes("export")} />
            <Button size="sm" variant="primary" disabled={atCap} onClick={() => setDraft(EMPTY)}>
              เขียน Thesis ใหม่
            </Button>
          </>
        }
      />

      {theses.length === 0 ? (
        <EmptyState
          title="ยังไม่มี Thesis"
          hint="เขียนเหตุผลที่จะเข้าไม้ไว้ก่อนเข้า — รวมถึงข้อที่จะทำให้คุณผิด นั่นคือส่วนที่มีค่าที่สุดเมื่อราคาเริ่มสวนทาง"
          action={<Button size="sm" variant="primary" onClick={() => setDraft(EMPTY)}>เขียน Thesis แรก</Button>}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {theses.map((t) => (
            <ThesisCard
              key={t.id}
              thesis={t}
              onEdit={() => setDraft(toDraft(t))}
              onDelete={() => setConfirmId(t.id)}
            />
          ))}
        </div>
      )}

      <ThesisFormModal
        open={draft !== null}
        draft={draft ?? EMPTY}
        onClose={() => setDraft(null)}
        onSaved={refresh}
      />

      <ConfirmDelete
        open={confirmId !== null}
        busy={busy}
        message="ลบ Thesis นี้ถาวร"
        onCancel={() => setConfirmId(null)}
        onConfirm={() =>
          void run(async () => {
            await del(`/thesis?id=${confirmId}`);
            setConfirmId(null);
            await refresh();
          }, "ลบแล้ว")
        }
      />
    </div>
  );
}

function toDraft(t: ThesisDTO): Draft {
  return {
    ...t,
    expectedUpdatedAt: t.updatedAt,
    earningsDate: t.earningsDate ?? "",
    riskNote: t.riskNote ?? "",
    foreignFlow: t.foreignFlow as FlowLevel,
    status: t.status as "ACTIVE" | "CLOSED_IDEA",
    quarters: t.quarters.map((q) => ({ label: q.label, eps: q.eps })),
  };
}

function ThesisCard({
  thesis,
  onEdit,
  onDelete,
}: {
  thesis: ThesisDTO;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const combined = combinedScore(thesis.tech17, thesis.fundScore);
  const flow = flowSignal(thesis.foreignFlow as FlowLevel, thesis.stockStage);
  const risk = riskCell(thesis.stockStage, thesis.fundScore, thesis.tripleConfirm);
  const rr = rrRatio(thesis.entryPrice, thesis.stopLoss, thesis.target1);
  const earnings = earningsAnalysis(thesis.quarters.map((q) => ({ label: q.label, eps: q.eps })));

  return (
    <Card
      title={`${thesis.symbol}${thesis.sector ? ` · ${thesis.sector}` : ""}`}
      subtitle={combined.text}
      action={
        <span className="flex items-center gap-1.5">
          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.7rem] font-semibold ${combined.badge}`}>
            {combined.label}
          </span>
          {thesis.status === "CLOSED_IDEA" && <Badge>ปิดไอเดีย</Badge>}
        </span>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-zinc-400">เทคนิค ({TECHNICAL_MAX})</span>
            <span className="font-mono tabular-nums text-zinc-200">{thesis.tech17}/{TECHNICAL_MAX}</span>
          </div>
          <ProgressBar value={thesis.tech17} max={TECHNICAL_MAX} tone={thesis.tech17 >= 12 ? "good" : thesis.tech17 >= 8 ? "warn" : "bad"} />
        </div>
        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-zinc-400">พื้นฐาน (20)</span>
            <span className="font-mono tabular-nums text-zinc-200">{thesis.fundScore}/20</span>
          </div>
          <ProgressBar
            value={thesis.fundScore}
            max={FUNDAMENTAL_MAX}
            tone={thesis.fundScore >= 14 ? "good" : thesis.fundScore >= 9 ? "warn" : "bad"}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StageBadge stage={thesis.stockStage} />
        {thesis.tripleConfirm && <Badge tone="good">Triple Confirm</Badge>}
        <Badge tone={flow.tone === "trap" || flow.tone === "exit" ? "bad" : flow.tone === "high" ? "warn" : "good"}>
          ต่างชาติ: {flow.label}
        </Badge>
        <Badge tone={rr >= 2 ? "good" : rr >= 1.5 ? "warn" : "bad"}>R:R {fmt(rr, 1)}</Badge>
        {earnings.latestYoY !== null && (
          <Badge tone={earnings.accelerating ? "good" : earnings.decelerating ? "bad" : "neutral"}>
            EPS YoY {fmtPct(earnings.latestYoY, 0)}
          </Badge>
        )}
      </div>

      <dl className="mt-3 space-y-1.5 text-xs">
        {/* The matrix's own risk figure, not the tier's. These are computed
            from different inputs and disagreed: a Stage 4 name with strong
            fundamentals rendered "EXIT ALL · เสี่ยง 2%". RiskCell.risk was
            already correct and was being thrown away. */}
        <Line label="ขนาดไม้ที่ระบบแนะนำ" value={`${risk.size} · เสี่ยง ${risk.risk}`} />
        <Line label="แผนเข้า" value={`${thesis.entryStrategy} @ ${fmt(thesis.entryPrice)} · Stop ${fmt(thesis.stopLoss)} · เป้า ${fmt(thesis.target1)} / ${fmt(thesis.target2)}`} />
        {thesis.catalyst && <Line label="ตัวเร่ง" value={thesis.catalyst} />}
        {thesis.earningsDate && <Line label="วันประกาศงบ" value={thesis.earningsDate} />}
        {thesis.riskNote && <Line label="อะไรจะทำให้ผิด" value={thesis.riskNote} tone="warn" />}
      </dl>

      <p className="mt-3 rounded-lg border border-zinc-800 px-3 py-2 text-xs leading-relaxed text-zinc-300">
        {flow.note}
      </p>

      <div className="mt-3 flex justify-end gap-1.5">
        <Button size="sm" onClick={onEdit}>แก้ไข</Button>
        <Button size="sm" variant="danger" onClick={onDelete}>ลบ</Button>
      </div>
    </Card>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-zinc-400">{label}:</dt>
      <dd className={tone === "warn" ? "text-amber-200" : "text-zinc-200"}>{value}</dd>
    </div>
  );
}

function ThesisFormModal({
  open,
  draft,
  onClose,
  onSaved,
}: {
  open: boolean;
  draft: Draft;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<Draft>(draft);
  const { busy, run } = useAction();
  const [key, setKey] = useState(0);

  // Re-seed when a different thesis is opened. Keyed on the draft identity so
  // typing is never clobbered mid-edit by a parent re-render.
  const identity = `${draft.id ?? "new"}-${open}`;
  const [lastIdentity, setLastIdentity] = useState(identity);
  if (identity !== lastIdentity) {
    setLastIdentity(identity);
    setForm(draft);
    setKey((k) => k + 1);
  }

  const fund = useMemo(() => fundScore(form), [form]);
  const combined = useMemo(() => combinedScore(form.tech17, fund.score), [form.tech17, fund.score]);
  const rr = rrRatio(form.entryPrice, form.stopLoss, form.target1);

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={form.id ? `แก้ไข Thesis · ${form.symbol}` : "เขียน Thesis ใหม่"}
      footer={
        <>
          <Button size="sm" onClick={onClose}>ยกเลิก</Button>
          <Button
            size="sm"
            variant="primary"
            disabled={busy || form.symbol.trim() === ""}
            onClick={() =>
              void run(async () => {
                const payload = {
                  ...form,
                  symbol: form.symbol.trim().toUpperCase(),
                  earningsDate: form.earningsDate.trim() || null,
                  riskNote: form.riskNote.trim() || null,
                  quarters: form.quarters.filter((q) => q.label.trim() !== ""),
                };
                if (form.id) await put("/thesis", payload);
                else await post("/thesis", payload);
                await onSaved();
                onClose();
              }, "บันทึก Thesis แล้ว")
            }
          >
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </>
      }
    >
      <div key={key} className="space-y-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-zinc-400">พื้นฐานคำนวณสด — เซิร์ฟเวอร์คำนวณซ้ำตอนบันทึก · คะแนนเทคนิคคือค่าที่คุณกรอกเอง</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs text-zinc-300">
                เทคนิค {form.tech17}/{TECHNICAL_MAX}
              </span>
              <span className="font-mono text-xs text-zinc-300">
                พื้นฐาน {fund.score}/{fund.max}
              </span>
              <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.7rem] font-semibold ${combined.badge}`}>
                {combined.label}
              </span>
            </span>
          </div>
        </div>

        <Section title="1 · ตัวหุ้นและเทคนิค">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="สัญลักษณ์">
              <TextInput value={form.symbol} onChange={(e) => set("symbol", e.target.value.toUpperCase())} className="font-mono" />
            </Field>
            <Field label="กลุ่ม">
              <TextInput value={form.sector} onChange={(e) => set("sector", e.target.value)} />
            </Field>
            <SelectField
              label="Stage"
              value={String(form.stockStage)}
              onChange={(v) => set("stockStage", Number(v))}
              options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `Stage ${n}` }))}
            />
            <NumberField
              label={`คะแนนเทคนิค (0-${TECHNICAL_MAX})`}
              value={form.tech17}
              onChange={(n) => set("tech17", n)}
              min={0}
              max={TECHNICAL_MAX}
            />
            <div className="sm:col-span-2">
              <Toggle
                label="Triple Confirm"
                hint="ราคา + วอลุ่ม + RS ยืนยันพร้อมกัน"
                checked={form.tripleConfirm}
                onChange={(v) => set("tripleConfirm", v)}
              />
            </div>
          </div>
        </Section>

        <Section title="2 · พื้นฐาน">
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField label="EPS Growth (%)" value={form.epsGrowthPct} onChange={(n) => set("epsGrowthPct", n)} step={1} />
            <NumberField label="Revenue Growth (%)" value={form.revenueGrowthPct} onChange={(n) => set("revenueGrowthPct", n)} step={1} />
            <NumberField label="FCF Yield (%)" value={form.fcfYieldPct} onChange={(n) => set("fcfYieldPct", n)} step={0.1} />
            <NumberField label="D/E" value={form.debtEquity} onChange={(n) => set("debtEquity", n)} step={0.1} />
            <NumberField label="Current Ratio" value={form.currentRatio} onChange={(n) => set("currentRatio", n)} step={0.1} />
            <SelectField
              label="กระแสเงินต่างชาติ"
              value={form.foreignFlow}
              onChange={(v) => set("foreignFlow", v)}
              options={FLOW_OPTIONS}
            />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Toggle label="EPS เร่งตัว" checked={form.epsAccelerating} onChange={(v) => set("epsAccelerating", v)} />
            <Toggle label="กระแสเงินสด ≥ กำไรสุทธิ" checked={form.cfoGeNi} onChange={(v) => set("cfoGeNi", v)} />
            <Toggle label="รายได้ประจำ (recurring)" checked={form.recurringRev} onChange={(v) => set("recurringRev", v)} />
            <Toggle label="อัตรากำไรขั้นต้นขยายตัว" checked={form.gmExpanding} onChange={(v) => set("gmExpanding", v)} />
            <Toggle label="อัตรากำไรจากการดำเนินงานสูงกว่าอุตสาหกรรม" checked={form.opMarginAboveInd} onChange={(v) => set("opMarginAboveInd", v)} />
            <Toggle label="ต่างชาติซื้อสุทธิ" checked={form.foreignNetBuy} onChange={(v) => set("foreignNetBuy", v)} />
            <Toggle label="กองทุนเพิ่มน้ำหนัก" checked={form.fundIncreasing} onChange={(v) => set("fundIncreasing", v)} />
            <Toggle label="ผู้บริหารซื้อหุ้น" checked={form.insiderBuying} onChange={(v) => set("insiderBuying", v)} />
          </div>
          <ul className="mt-3 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
            {fund.parts.map((p) => (
              <li key={`${p.cat}-${p.label}`} className="flex items-baseline justify-between text-[0.7rem]">
                <span className="text-zinc-400">{p.label}</span>
                <span className={`font-mono tabular-nums ${p.pts === p.max ? "text-emerald-400" : p.pts === 0 ? "text-zinc-400" : "text-amber-400"}`}>
                  {p.pts}/{p.max}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="3 · EPS รายไตรมาส">
          <QuarterEditor quarters={form.quarters} onChange={(q) => set("quarters", q)} />
        </Section>

        <Section title="4 · ตัวเร่งและความเสี่ยง">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ตัวเร่ง (catalyst)">
              <TextInput value={form.catalyst} onChange={(e) => set("catalyst", e.target.value)} placeholder="เช่น กำลังการผลิตใหม่เริ่มเดินไตรมาสหน้า" />
            </Field>
            <Field label="วันประกาศงบ">
              <TextInput value={form.earningsDate} onChange={(e) => set("earningsDate", e.target.value)} placeholder="เช่น 2026-02-20" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="อะไรจะทำให้ผมผิด" hint="เขียนตอนนี้ ตอนที่ยังไม่มีเงินอยู่ในไม้">
                <TextInput value={form.riskNote} onChange={(e) => set("riskNote", e.target.value)} placeholder="เช่น ถ้า GM หดสองไตรมาสติด แปลว่าเรื่องต้นทุนไม่ใช่เรื่องชั่วคราว" />
              </Field>
            </div>
          </div>
        </Section>

        <Section title="5 · แผนเทรด">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="รูปแบบเข้า">
              <TextInput value={form.entryStrategy} onChange={(e) => set("entryStrategy", e.target.value)} />
            </Field>
            <NumberField label="ราคาเข้า" value={form.entryPrice} onChange={(n) => set("entryPrice", n)} step={0.25} />
            <NumberField label="Stop Loss" value={form.stopLoss} onChange={(n) => set("stopLoss", n)} step={0.25} />
            <NumberField label="เป้าที่ 1" value={form.target1} onChange={(n) => set("target1", n)} step={0.25} />
            <NumberField label="เป้าที่ 2" value={form.target2} onChange={(n) => set("target2", n)} step={0.25} />
            <Field label="R:R (เป้าที่ 1)">
              <div className="flex min-h-11 items-center rounded-lg border border-zinc-800 px-3">
                <Badge tone={rr >= 2 ? "good" : rr >= 1.5 ? "warn" : "bad"}>{fmt(rr, 2)} : 1</Badge>
              </div>
            </Field>
            <SelectField
              label="สถานะ"
              value={form.status}
              onChange={(v) => set("status", v)}
              options={[
                { value: "ACTIVE", label: "ยังใช้อยู่" },
                { value: "CLOSED_IDEA", label: "ปิดไอเดียแล้ว" },
              ]}
            />
          </div>
        </Section>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-400">{title}</h3>
      {children}
    </section>
  );
}

function QuarterEditor({
  quarters,
  onChange,
}: {
  quarters: { label: string; eps: number }[];
  onChange: (q: { label: string; eps: number }[]) => void;
}) {
  const analysis = useMemo(() => earningsAnalysis(quarters), [quarters]);

  return (
    <div>
      {quarters.length > 0 && (
        <TableWrap minWidth={420}>
          <thead>
            <tr>
              <Th>ไตรมาส</Th>
              <Th align="right">EPS</Th>
              <Th align="right">YoY</Th>
              <Th align="right">QoQ</Th>
              <Th align="center">เร่งตัว</Th>
              <Th align="right"> </Th>
            </tr>
          </thead>
          <tbody>
            {quarters.map((q, i) => {
              const row = analysis.rows[i];
              return (
                <tr key={i}>
                  <Td>
                    <TextInput
                      value={q.label}
                      onChange={(e) => {
                        const next = [...quarters];
                        next[i] = { ...next[i], label: e.target.value };
                        onChange(next);
                      }}
                      className="!min-h-9 w-24 !text-xs"
                    />
                  </Td>
                  <Td align="right">
                    <input
                      type="number"
                      step={0.01}
                      value={q.eps}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        const next = [...quarters];
                        next[i] = { ...next[i], eps: Number.isFinite(n) ? n : 0 };
                        onChange(next);
                      }}
                      aria-label={`EPS ของ ${q.label}`}
                      className="w-20 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-right font-mono text-sm tabular-nums text-zinc-100 focus:border-emerald-500 focus:outline-none"
                    />
                  </Td>
                  <Td align="right" mono className={row?.yoy === null ? "text-zinc-400" : (row?.yoy ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {row?.yoy === null || row?.yoy === undefined ? "—" : fmtPct(row.yoy, 0)}
                  </Td>
                  <Td align="right" mono className={row?.qoq === null ? "text-zinc-400" : (row?.qoq ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {row?.qoq === null || row?.qoq === undefined ? "—" : fmtPct(row.qoq, 0)}
                  </Td>
                  <Td align="center">
                    {row?.accelerating === null || row?.accelerating === undefined ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      <Badge tone={row.accelerating ? "good" : "bad"}>{row.accelerating ? "ใช่" : "ไม่"}</Badge>
                    )}
                  </Td>
                  <Td align="right">
                    <Button size="sm" variant="danger" onClick={() => onChange(quarters.filter((_, j) => j !== i))}>
                      ลบ
                    </Button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
      <Button
        size="sm"
        className="mt-2"
        disabled={quarters.length >= 12}
        onClick={() => onChange([...quarters, { label: `Q${quarters.length + 1}`, eps: 0 }])}
      >
        + เพิ่มไตรมาส
      </Button>
      {quarters.length >= 3 && (
        <p className="mt-2 text-xs text-zinc-400">
          {analysis.accelerating
            ? "กำไรกำลังเร่งตัว — ตรงกับสิ่งที่ Stage 2 ควรมีอยู่เบื้องหลัง"
            : analysis.decelerating
              ? "กำไรชะลอตัว — ถ้าราคายังขึ้น ให้ระวังว่านี่อาจเป็น Stage 3 ที่มาเร็ว"
              : "ยังไม่เห็นทิศทางชัดเจนจากไตรมาสที่กรอก"}
        </p>
      )}
    </div>
  );
}
