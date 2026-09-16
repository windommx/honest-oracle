"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Field, Modal, NumberField, SelectField, TextInput } from "../_ui";
import { post, put, useAction } from "../_api";
import { fmt, rrRatio } from "@/lib/stagelab/utils";

export interface WatchlistDraft {
  id?: number;
  symbol: string;
  sector: string;
  stage: number;
  setup: string;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  rsScore: number;
  fundScore: number;
  priority: "A" | "B" | "C";
  status: "WATCHING" | "BOUGHT" | "DROPPED";
  notes: string;
}

export const EMPTY_DRAFT: WatchlistDraft = {
  symbol: "",
  sector: "",
  stage: 2,
  setup: "Breakout",
  entryPrice: 0,
  stopLoss: 0,
  targetPrice: 0,
  rsScore: 5,
  fundScore: 5,
  priority: "B",
  status: "WATCHING",
  notes: "",
};

const SETUPS = ["Breakout", "Pullback to 30W MA", "Pullback Entry", "Continuation", "Reversal"] as const;

/**
 * One form for both "add from screener" and "edit in watchlist".
 *
 * The R:R badge updates as the numbers are typed, on purpose: the whole point
 * of writing the plan down before entering is that a 1:1 trade should look
 * wrong while you can still change it, not after it is saved.
 */
export function WatchlistFormModal({
  open,
  draft,
  onClose,
  onSaved,
}: {
  open: boolean;
  draft: WatchlistDraft;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<WatchlistDraft>(draft);
  const { busy, run } = useAction();

  useEffect(() => {
    if (open) setForm(draft);
  }, [open, draft]);

  const rr = rrRatio(form.entryPrice, form.stopLoss, form.targetPrice);
  const editing = typeof form.id === "number";

  function set<K extends keyof WatchlistDraft>(key: K, value: WatchlistDraft[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    const payload = {
      ...form,
      symbol: form.symbol.trim().toUpperCase(),
      notes: form.notes.trim() === "" ? null : form.notes.trim(),
    };
    const ok = await run(
      () => (editing ? put("/watchlist", payload) : post("/watchlist", payload)),
      editing ? "บันทึกการแก้ไขแล้ว" : `เพิ่ม ${payload.symbol} เข้า Watchlist แล้ว`,
    );
    if (ok) {
      await onSaved();
      onClose();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `แก้ไข ${form.symbol}` : "เพิ่มเข้า Watchlist"}
      footer={
        <>
          <Button size="sm" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={busy || form.symbol.trim() === ""}
            onClick={() => void save()}
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
            onChange={(e) => set("symbol", e.target.value.toUpperCase())}
            placeholder="เช่น DELTA"
            className="font-mono"
          />
        </Field>
        <Field label="กลุ่มอุตสาหกรรม">
          <TextInput value={form.sector} onChange={(e) => set("sector", e.target.value)} placeholder="เช่น ETRON" />
        </Field>
        <SelectField
          label="Stage"
          value={String(form.stage)}
          onChange={(v) => set("stage", Number(v))}
          options={[
            { value: "1", label: "Stage 1 – สะสมฐาน" },
            { value: "2", label: "Stage 2 – ขาขึ้น" },
            { value: "3", label: "Stage 3 – ยอดพีค" },
            { value: "4", label: "Stage 4 – ขาลง" },
          ]}
        />
        <SelectField
          label="รูปแบบการเข้า"
          value={form.setup}
          onChange={(v) => set("setup", v)}
          options={SETUPS.map((s) => ({ value: s, label: s }))}
        />
        <NumberField label="ราคาเข้า" value={form.entryPrice} onChange={(n) => set("entryPrice", n)} step={0.25} />
        <NumberField label="Stop Loss" value={form.stopLoss} onChange={(n) => set("stopLoss", n)} step={0.25} />
        <NumberField label="ราคาเป้าหมาย" value={form.targetPrice} onChange={(n) => set("targetPrice", n)} step={0.25} />
        <Field label="Risk : Reward">
          <div className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-800 px-3">
            <Badge tone={rr >= 2 ? "good" : rr >= 1.5 ? "warn" : "bad"}>{fmt(rr, 2)} : 1</Badge>
            <span className="text-[0.7rem] text-zinc-400">
              {rr >= 2 ? "ผ่านเกณฑ์" : rr >= 1.5 ? "พอรับได้" : "ต่ำกว่าเกณฑ์ 1.5"}
            </span>
          </div>
        </Field>
        <NumberField label="คะแนน RS (0-10)" value={form.rsScore} onChange={(n) => set("rsScore", n)} min={0} max={10} />
        <NumberField label="คะแนนพื้นฐาน (0-10)" value={form.fundScore} onChange={(n) => set("fundScore", n)} min={0} max={10} />
        <SelectField
          label="ลำดับความสำคัญ"
          value={form.priority}
          onChange={(v) => set("priority", v)}
          options={[
            { value: "A", label: "A – เข้าก่อน" },
            { value: "B", label: "B – รอจังหวะ" },
            { value: "C", label: "C – เฝ้าดูห่าง ๆ" },
          ]}
        />
        <SelectField
          label="สถานะ"
          value={form.status}
          onChange={(v) => set("status", v)}
          options={[
            { value: "WATCHING", label: "เฝ้าดู" },
            { value: "BOUGHT", label: "ซื้อแล้ว" },
            { value: "DROPPED", label: "ปล่อย" },
          ]}
        />
        <div className="sm:col-span-2">
          <Field label="บันทึก">
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="เหตุผลที่สนใจ และเงื่อนไขที่จะทำให้เลิกสนใจ"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
