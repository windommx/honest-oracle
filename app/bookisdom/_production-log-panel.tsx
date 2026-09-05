"use client";

import { useEffect, useState } from "react";
import { X, Wallet, TrendingUp } from "lucide-react";
import { toast } from "./_toast";
import { DeleteButton } from "./_ui";
import {
  type CostEntry, type MetricEntry,
  addCostEntry, listCostEntries, deleteCostEntry,
  addMetricEntry, listMetricEntries, deleteMetricEntry,
  computeMetricRates, summarizeCosts,
} from "./_production-log";

type Tab = "cost" | "metric";

/** Production log modal for one project — cost entries and launch metrics the WRITER
 *  reports themselves. Every number shown here is either typed in directly or plain
 *  disclosed arithmetic on numbers typed in (a rate). There is no "healthy / at risk"
 *  verdict anywhere in this panel: no industry-standard CTR or conversion threshold is
 *  cited here, because none is sourced — the same refusal this whole engine makes for
 *  fake 0–100 quality scores. If a rate matters against a target, that target is the
 *  writer's own to set and remember, not this panel's to assert. */
export function ProductionLogPanel({ projectId, projectTitle, onClose }: {
  projectId: string; projectTitle: string; onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("cost");
  const [costs, setCosts] = useState<CostEntry[] | null>(null);
  const [metrics, setMetrics] = useState<MetricEntry[] | null>(null);

  const reloadCosts = () => void listCostEntries(projectId).then(setCosts);
  const reloadMetrics = () => void listMetricEntries(projectId).then(setMetrics);
  useEffect(() => { reloadCosts(); reloadMetrics(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-[#ffffff] border border-black/10 rounded-3xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/10">
          <div>
            <div className="text-xs uppercase tracking-wider text-faint">บันทึกการผลิต</div>
            <div className="font-semibold text-[15px] truncate max-w-[420px]" title={projectTitle}>{projectTitle}</div>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="w-8 h-8 flex items-center justify-center rounded-xl border border-black/10 hover:bg-black/[0.04] text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-black/10 px-2">
          <button
            onClick={() => setTab("cost")}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${tab === "cost" ? "border-[#7a5c12] text-[#7a5c12]" : "border-transparent text-slate-600 hover:text-slate-800"}`}
          >
            <Wallet className="w-3.5 h-3.5" /> ต้นทุน
          </button>
          <button
            onClick={() => setTab("metric")}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${tab === "metric" ? "border-[#7a5c12] text-[#7a5c12]" : "border-transparent text-slate-600 hover:text-slate-800"}`}
          >
            <TrendingUp className="w-3.5 h-3.5" /> ตัวชี้วัดเปิดตัว
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === "cost" && <CostTab projectId={projectId} entries={costs} onChange={reloadCosts} />}
          {tab === "metric" && <MetricTab projectId={projectId} entries={metrics} onChange={reloadMetrics} />}
        </div>
      </div>
    </div>
  );
}

function CostTab({ projectId, entries, onChange }: { projectId: string; entries: CostEntry[] | null; onChange: () => void }) {
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");

  async function submit() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) { toast("ใส่จำนวนเงินเป็นตัวเลขที่ไม่ติดลบ", { variant: "error" }); return; }
    if (!label.trim()) { toast("ใส่รายการสั้น ๆ ว่าเป็นค่าอะไร", { variant: "error" }); return; }
    try {
      await addCostEntry(projectId, n, label.trim());
      setAmount(""); setLabel(""); onChange();
    } catch {
      toast("บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง", { variant: "error" });
    }
  }

  const summary = entries ? summarizeCosts(entries) : null;

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="จำนวนเงิน (บาท)" className="input w-36" />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ค่าอะไร เช่น API เขียนบท 1-6" className="input flex-1" onKeyDown={(e) => e.key === "Enter" && submit()} />
        <button onClick={submit} className="px-4 py-2.5 rounded-xl bg-[#d9a63a] text-[#14161c] text-sm font-semibold hover:bg-[#c8901f] transition-colors whitespace-nowrap">บันทึก</button>
      </div>

      {summary && summary.count > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <SummaryStat label="รวมที่คุณบันทึก" value={`฿${summary.total.toLocaleString("th-TH")}`} />
          <SummaryStat label="เฉลี่ย/รายการ" value={`฿${summary.average.toLocaleString("th-TH")}`} />
          <SummaryStat label="จำนวนรายการ" value={String(summary.count)} />
        </div>
      )}

      {entries === null && <p className="text-sm text-faint text-center py-8">กำลังโหลด…</p>}
      {entries?.length === 0 && (
        <p className="text-sm text-faint text-center py-8">
          ยังไม่มีบันทึกต้นทุน — ตัวเลขในแท็บนี้มาจากที่คุณกรอกเองทั้งหมด ไม่มีการประมาณให้
        </p>
      )}
      <div className="space-y-2">
        {entries?.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-black/[0.02] border border-black/10 rounded-xl">
            <div className="min-w-0">
              <div className="text-sm truncate">{e.label}</div>
              <div className="text-[11px] text-faint">{new Date(e.createdAt).toLocaleDateString("th-TH", { dateStyle: "medium" })}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono text-sm text-[#7a5c12]">฿{e.amountThb.toLocaleString("th-TH")}</span>
              <DeleteButton
                onDelete={() => deleteCostEntry(e.id).then(onChange)}
                what="รายการต้นทุน"
                idleClass="w-7 h-7 flex items-center justify-center rounded-lg text-faint hover:text-red-700 hover:bg-red-50"
                armedClass="text-[10px] font-semibold px-2 py-1 rounded-lg bg-red-50 border border-red-500/60 text-red-700 whitespace-nowrap"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricTab({ projectId, entries, onChange }: { projectId: string; entries: MetricEntry[] | null; onChange: () => void }) {
  const [impressions, setImpressions] = useState("");
  const [clicks, setClicks] = useState("");
  const [sales, setSales] = useState("");
  const [avgStars, setAvgStars] = useState("");
  const [note, setNote] = useState("");

  async function submit() {
    const imp = Number(impressions), clk = Number(clicks), sal = Number(sales);
    if (![imp, clk, sal].every((n) => Number.isFinite(n) && n >= 0)) {
      toast("ใส่ impressions, clicks, sales เป็นตัวเลขที่ไม่ติดลบ", { variant: "error" });
      return;
    }
    const stars = avgStars.trim() ? Number(avgStars) : undefined;
    if (stars !== undefined && (!Number.isFinite(stars) || stars < 0 || stars > 5)) {
      toast("ดาวเฉลี่ยต้องอยู่ระหว่าง 0-5 หรือเว้นว่างไว้ถ้าไม่ทราบ", { variant: "error" });
      return;
    }
    try {
      await addMetricEntry(projectId, { impressions: imp, clicks: clk, sales: sal, avgStars: stars, note: note.trim() });
      setImpressions(""); setClicks(""); setSales(""); setAvgStars(""); setNote(""); onChange();
    } catch {
      toast("บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง", { variant: "error" });
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
        <input value={impressions} onChange={(e) => setImpressions(e.target.value)} type="number" min="0" placeholder="Impressions" className="input" />
        <input value={clicks} onChange={(e) => setClicks(e.target.value)} type="number" min="0" placeholder="Clicks" className="input" />
        <input value={sales} onChange={(e) => setSales(e.target.value)} type="number" min="0" placeholder="Sales" className="input" />
        <input value={avgStars} onChange={(e) => setAvgStars(e.target.value)} type="number" min="0" max="5" step="0.1" placeholder="ดาวเฉลี่ย (ถ้ามี)" className="input" />
      </div>
      <div className="flex gap-2 mb-4">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="โน้ต เช่น ช่วงหลังลดราคา" className="input flex-1" onKeyDown={(e) => e.key === "Enter" && submit()} />
        <button onClick={submit} className="px-4 py-2.5 rounded-xl bg-[#d9a63a] text-[#14161c] text-sm font-semibold hover:bg-[#c8901f] transition-colors whitespace-nowrap">บันทึก</button>
      </div>

      <p className="text-[11px] text-faint mb-3">
        CTR และ conversion ด้านล่างคำนวณจากตัวเลขที่คุณกรอก (clicks÷impressions, sales÷clicks) — ไม่มีเกณฑ์ &ldquo;ดี/แย่&rdquo; ใด ๆ แนบมา เพราะไม่มีมาตรฐานอุตสาหกรรมที่อ้างอิงได้ เป้าหมายเป็นของคุณเอง
      </p>

      {entries === null && <p className="text-sm text-faint text-center py-8">กำลังโหลด…</p>}
      {entries?.length === 0 && (
        <p className="text-sm text-faint text-center py-8">ยังไม่มีบันทึกตัวชี้วัด — กรอกตัวเลขจริงจาก KDP/ร้านค้าของคุณด้านบน</p>
      )}
      <div className="space-y-2">
        {entries?.map((e) => {
          const rates = computeMetricRates(e);
          return (
            <div key={e.id} className="px-3 py-2.5 bg-black/[0.02] border border-black/10 rounded-xl">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] text-faint">{new Date(e.createdAt).toLocaleDateString("th-TH", { dateStyle: "medium" })}{e.note ? ` · ${e.note}` : ""}</div>
                <DeleteButton
                  onDelete={() => deleteMetricEntry(e.id).then(onChange)}
                  what="รายการตัวชี้วัด"
                  idleClass="w-7 h-7 flex items-center justify-center rounded-lg text-faint hover:text-red-700 hover:bg-red-50"
                  armedClass="text-[10px] font-semibold px-2 py-1 rounded-lg bg-red-50 border border-red-500/60 text-red-700 whitespace-nowrap"
                />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs font-mono">
                <span className="text-slate-700">{e.impressions.toLocaleString("th-TH")} imp</span>
                <span className="text-slate-700">{e.clicks.toLocaleString("th-TH")} clicks</span>
                <span className="text-slate-700">{e.sales.toLocaleString("th-TH")} sales</span>
                {e.avgStars !== undefined && <span className="text-slate-700">★{e.avgStars}</span>}
                <span className="text-[#7a5c12]">CTR {rates.ctrPercent === null ? "—" : `${rates.ctrPercent}%`}</span>
                <span className="text-[#7a5c12]">conv {rates.conversionPercent === null ? "—" : `${rates.conversionPercent}%`}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5 bg-black/[0.02] border border-black/10 rounded-xl text-center">
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] text-faint mt-0.5">{label}</div>
    </div>
  );
}
