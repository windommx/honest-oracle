"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ExportButton,
  Field,
  NumberField,
  ProgressBar,
  SelectField,
  Skeleton,
  TextInput,
  ViewHeader,
} from "../_ui";
import {
  del,
  patch,
  post,
  useAction,
  useOptimisticFlags,
  useResource,
  type StageSession,
} from "../_api";
import { ConfirmDelete } from "./watchlist";
import { fmt, fmtPct } from "@/lib/stagelab/utils";
import type { ChecklistItem, JournalEntry } from "@/lib/stagelab/types";

const BIASES = [
  { value: "NONE", label: "ไม่มี — ทำตามระบบ" },
  { value: "FOMO", label: "FOMO — กลัวตกรถ" },
  { value: "LOSS_AVERSION", label: "Loss Aversion — ไม่ยอมตัดขาดทุน" },
  { value: "DISPOSITION", label: "Disposition — รีบขายตัวที่กำไร" },
  { value: "CONFIRMATION", label: "Confirmation — หาข้อมูลเข้าข้างตัวเอง" },
  { value: "RECENCY", label: "Recency — ยึดกับสิ่งที่เพิ่งเกิด" },
] as const;

const BIAS_NOTES = [
  { name: "FOMO", symptom: "ไล่ราคาหลัง breakout ไปไกลแล้ว", fix: "ตั้ง limit order ไว้ล่วงหน้า ไม่เข้าตลาดด้วยมือเปล่า" },
  { name: "Loss Aversion", symptom: "เลื่อน Stop ลงเพื่อไม่ให้ถูกชน", fix: "Stop เขียนก่อนเข้า และเลื่อนขึ้นได้อย่างเดียว" },
  { name: "Disposition", symptom: "ขายตัวที่กำไร 5% แต่ถือตัวที่ขาดทุน 20%", fix: "ตัดที่ Stage ไม่ใช่ที่ราคาทุน" },
  { name: "Confirmation", symptom: "อ่านแต่ข่าวที่สนับสนุนไม้ที่ถืออยู่", fix: "เขียน 'อะไรจะทำให้ผมผิด' ลงใน Thesis ตั้งแต่วันเข้า" },
  { name: "Recency", symptom: "เจ็บครั้งล่าสุดแล้วไม่กล้าเข้าไม้ถัดไป", fix: "ดูสถิติ 30 ไม้ย้อนหลัง ไม่ใช่ไม้ล่าสุด" },
];

const AFFIRMATIONS = [
  "ผมเทรดตามระบบ ไม่ใช่ตามความรู้สึก",
  "การไม่เข้าไม้ คือการตัดสินใจอย่างหนึ่ง",
  "ขาดทุนเล็กคือค่าใช้จ่ายของธุรกิจนี้ ขาดทุนใหญ่คือความผิดพลาด",
  "ตลาดจะมีพรุ่งนี้เสมอ พอร์ตของผมอาจไม่มี",
];

interface JournalResponse {
  entries: JournalEntry[];
}
interface ChecklistResponse {
  items: ChecklistItem[];
}

export default function JournalView({
  session,
  onSessionChange,
}: {
  session: StageSession;
  onSessionChange: () => void;
}) {
  const journal = useResource<JournalResponse>("/journal");
  const checklists = useResource<ChecklistResponse>("/checklists");
  const { busy, run } = useAction();
  const flags = useOptimisticFlags();
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [category, setCategory] = useState<"DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY">("WEEKLY");
  const [form, setForm] = useState({
    symbol: "",
    bias: "NONE" as (typeof BIASES)[number]["value"],
    outcome: "OPEN" as "WIN" | "LOSS" | "OPEN",
    pnlPct: 0,
    lesson: "",
  });

  const entries = useMemo(() => journal.data?.entries ?? [], [journal.data]);
  const items = useMemo(
    () => (checklists.data?.items ?? []).filter((i) => i.category === category),
    [checklists.data, category],
  );
  const done = items.filter((i) => i.done).length;

  const stats = useMemo(() => {
    const decided = entries.filter((e) => e.outcome !== "OPEN");
    const wins = decided.filter((e) => e.outcome === "WIN");
    return {
      total: entries.length,
      winRate: decided.length > 0 ? (wins.length / decided.length) * 100 : null,
      topBias: mostCommon(entries.filter((e) => e.bias !== "NONE").map((e) => e.bias)),
    };
  }, [entries]);

  return (
    <div className="space-y-5">
      <ViewHeader
        title="Journal & จิตวิทยา"
        subtitle={
          stats.winRate === null
            ? `${stats.total} บันทึก`
            : `${stats.total} บันทึก · Win Rate ${fmt(stats.winRate, 0)}%${stats.topBias ? ` · อคติที่เจอบ่อย: ${stats.topBias}` : ""}`
        }
        actions={<ExportButton dataset="journal" enabled={session.features.includes("export")} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="เพิ่มบันทึกเทรด" subtitle="เขียนตอนที่ยังจำความรู้สึกได้ ไม่ใช่ตอนสิ้นเดือน">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="สัญลักษณ์">
                <TextInput
                  value={form.symbol}
                  onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                  placeholder="เช่น DELTA"
                  className="font-mono"
                />
              </Field>
              <SelectField
                label="อคติที่เกิดขึ้น"
                value={form.bias}
                onChange={(v) => setForm((f) => ({ ...f, bias: v }))}
                options={BIASES}
              />
              <SelectField
                label="ผลลัพธ์"
                value={form.outcome}
                onChange={(v) => setForm((f) => ({ ...f, outcome: v }))}
                options={[
                  { value: "OPEN", label: "ยังถืออยู่" },
                  { value: "WIN", label: "กำไร" },
                  { value: "LOSS", label: "ขาดทุน" },
                ]}
              />
              <NumberField
                label="P/L (%)"
                value={form.pnlPct}
                onChange={(n) => setForm((f) => ({ ...f, pnlPct: n }))}
                step={0.1}
                hint={form.outcome === "OPEN" ? "ไม้ที่ยังไม่ปิดจะไม่บันทึกตัวเลขนี้" : undefined}
              />
            </div>
            <div className="mt-3">
              <Field label="บทเรียน">
                <textarea
                  rows={2}
                  value={form.lesson}
                  onChange={(e) => setForm((f) => ({ ...f, lesson: e.target.value }))}
                  placeholder="สิ่งที่จะทำต่างออกไปในไม้ถัดไป"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </Field>
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                variant="primary"
                disabled={busy || form.symbol.trim() === ""}
                onClick={() =>
                  void run(async () => {
                    await post("/journal", {
                      ...form,
                      symbol: form.symbol.trim().toUpperCase(),
                      pnlPct: form.outcome === "OPEN" ? null : form.pnlPct,
                    });
                    setForm({ symbol: "", bias: "NONE", outcome: "OPEN", pnlPct: 0, lesson: "" });
                    await journal.reload();
                    onSessionChange();
                  }, "บันทึกแล้ว")
                }
              >
                บันทึก
              </Button>
            </div>
          </Card>

          <Card title="บันทึกล่าสุด">
            {journal.loading && !journal.data ? (
              <Skeleton className="h-40" />
            ) : entries.length === 0 ? (
              <EmptyState title="ยังไม่มีบันทึก" hint="บันทึกแรกมักเป็นไม้ที่เจ็บที่สุด — เขียนไว้ก่อนจะลืมว่าทำไมถึงเข้า" />
            ) : (
              <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
                {entries.map((e) => (
                  <li key={e.id} className="rounded-lg border border-zinc-800 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium text-zinc-100">{e.symbol}</span>
                      <Badge tone={e.outcome === "WIN" ? "good" : e.outcome === "LOSS" ? "bad" : "neutral"}>
                        {e.outcome === "WIN" ? "กำไร" : e.outcome === "LOSS" ? "ขาดทุน" : "ถืออยู่"}
                      </Badge>
                      {e.pnlPct !== null && (
                        <span className={`font-mono text-xs tabular-nums ${e.pnlPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {fmtPct(e.pnlPct)}
                        </span>
                      )}
                      {e.bias !== "NONE" && <Badge tone="warn">{e.bias}</Badge>}
                      <span className="ml-auto text-[0.7rem] text-zinc-400">
                        {new Date(e.createdAt).toLocaleDateString("th-TH")}
                      </span>
                      <Button size="sm" variant="danger" onClick={() => setConfirmId(e.id)}>
                        ลบ
                      </Button>
                    </div>
                    {e.lesson && <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">{e.lesson}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="เช็คลิสต์รอบทบทวน" subtitle={`${done}/${items.length} เสร็จสิ้น`}>
            <SelectField
              value={category}
              onChange={setCategory}
              options={[
                { value: "DAILY", label: "รายวัน" },
                { value: "WEEKLY", label: "รายสัปดาห์" },
                { value: "MONTHLY", label: "รายเดือน" },
                { value: "QUARTERLY", label: "รายไตรมาส" },
              ]}
            />
            <div className="my-3">
              <ProgressBar value={done} max={Math.max(1, items.length)} />
            </div>
            <ul className="space-y-1">
              {items.map((c) => (
                <li key={c.id} className="flex items-center gap-2.5 py-1">
                  <input
                    type="checkbox"
                    checked={flags.valueOf(c.id, c.done)}
                    onChange={(e) =>
                      void flags.toggle(c.id, e.target.checked, async () => {
                        await patch("/checklists", { id: c.id, done: e.target.checked });
                        await checklists.reload();
                      })
                    }
                    aria-label={c.label}
                    className="h-5 w-5 shrink-0 accent-emerald-500"
                  />
                  <span
                    className={`text-sm ${
                      flags.valueOf(c.id, c.done) ? "text-zinc-400 line-through" : "text-zinc-200"
                    }`}
                  >
                    {c.label}
                  </span>
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              className="mt-3 w-full"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await post("/checklists", { category });
                  await checklists.reload();
                }, "เริ่มรอบใหม่แล้ว")
              }
            >
              รีเซ็ตรอบนี้
            </Button>
          </Card>

          <Card title="5 อคติที่พบบ่อย">
            <ul className="space-y-2.5">
              {BIAS_NOTES.map((b) => (
                <li key={b.name} className="border-l-2 border-amber-500/40 pl-2.5">
                  <p className="text-xs font-semibold text-amber-200">{b.name}</p>
                  <p className="text-[0.7rem] text-zinc-400">อาการ: {b.symptom}</p>
                  <p className="text-[0.7rem] text-emerald-300">แก้: {b.fix}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="ย้ำกับตัวเองก่อนเปิดตลาด">
            <ul className="space-y-2">
              {AFFIRMATIONS.map((a) => (
                <li key={a} className="text-xs italic leading-relaxed text-zinc-300">
                  “{a}”
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <ConfirmDelete
        open={confirmId !== null}
        busy={busy}
        message="ลบบันทึกนี้ถาวร"
        onCancel={() => setConfirmId(null)}
        onConfirm={() =>
          void run(async () => {
            await del(`/journal?id=${confirmId}`);
            setConfirmId(null);
            await journal.reload();
            onSessionChange();
          }, "ลบบันทึกแล้ว")
        }
      />
    </div>
  );
}

function mostCommon(values: string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  counts.forEach((n, v) => {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  });
  return best;
}
