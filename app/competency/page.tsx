"use client";

import { useCallback, useState } from "react";
import { ClipboardPlus, LayoutDashboard, Users } from "lucide-react";
import type { AssessmentDTO } from "@/lib/competency/types";
import { ModuleNav } from "./_nav";
import { OverviewTab } from "./_overview";
import { AssessmentForm, type EditTarget } from "./_assessment-form";
import { NursesTab } from "./_nurses";
import { cx } from "./_ui";

type Tab = "overview" | "assess" | "nurses";

const TABS: Array<{ id: Tab; label: string; short: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "ภาพรวมหน่วย", short: "ภาพรวม", icon: LayoutDashboard },
  { id: "assess", label: "บันทึกการประเมิน", short: "ประเมิน", icon: ClipboardPlus },
  { id: "nurses", label: "รายชื่อพยาบาล", short: "พยาบาล", icon: Users },
];

export default function CompetencyPage() {
  const [tab, setTab] = useState<Tab>("overview");
  // Bumped after every write so the other tabs refetch instead of showing stale numbers.
  const [refreshKey, setRefreshKey] = useState(0);
  const [preselectNurseId, setPreselectNurseId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  const startAssess = useCallback((nurseId: string) => {
    setEditing(null);
    setPreselectNurseId(nurseId);
    setTab("assess");
  }, []);

  const startEdit = useCallback((target: EditTarget) => {
    setPreselectNurseId(null);
    setEditing(target);
    setTab("assess");
  }, []);

  const onSaved = useCallback(
    (_assessment: AssessmentDTO, wasEdit: boolean) => {
      bump();
      if (wasEdit) {
        setEditing(null);
        setTab("nurses");
      }
    },
    [bump]
  );

  return (
    <>
      <ModuleNav />
      <header className="bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-700 text-white">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <h1 className="text-xl font-bold leading-tight sm:text-2xl">ระบบประเมิน Competency Level พยาบาลหน่วยไตเทียม</h1>
          <p className="mt-1 text-sm text-teal-50">
            Hemodialysis Nurse Competency Assessment · 10 เกณฑ์ × 5 ระดับ · คะแนนเต็ม 100 · LEVEL 1 ผู้เริ่มต้น → LEVEL 5 ผู้เชี่ยวชาญ
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        <div role="tablist" aria-label="ส่วนของระบบ" className="no-print mb-5 grid grid-cols-3 gap-1 rounded-xl bg-teal-100/70 p-1">
          {TABS.map(({ id, label, short, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              onClick={() => setTab(id)}
              className={cx(
                "flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition sm:text-sm",
                tab === id ? "bg-white text-teal-800 shadow" : "text-slate-700 hover:bg-white/60"
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{short}</span>
              {id === "assess" && editing && (
                <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">แก้ไข</span>
              )}
            </button>
          ))}
        </div>

        <div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview" hidden={tab !== "overview"}>
          {tab === "overview" && (
            <OverviewTab refreshKey={refreshKey} onDataChanged={bump} onNavigate={setTab} onAssess={startAssess} />
          )}
        </div>
        <div role="tabpanel" id="panel-assess" aria-labelledby="tab-assess" hidden={tab !== "assess"}>
          {tab === "assess" && (
            <AssessmentForm
              refreshKey={refreshKey}
              preselectNurseId={preselectNurseId}
              editing={editing}
              onSaved={onSaved}
              onCancelEdit={() => {
                setEditing(null);
                setTab("nurses");
              }}
            />
          )}
        </div>
        <div role="tabpanel" id="panel-nurses" aria-labelledby="tab-nurses" hidden={tab !== "nurses"}>
          {tab === "nurses" && (
            <NursesTab refreshKey={refreshKey} onDataChanged={bump} onAssess={startAssess} onEditAssessment={startEdit} />
          )}
        </div>
      </main>

      <footer className="no-print mt-8 border-t border-slate-200 bg-white/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-slate-600 sm:px-6">
          <p>แบบประเมิน Competency Level · หน่วยฟอกไตเทียม (Hemodialysis Unit) — ระดับคะแนนคำนวณจากแบบฟอร์มโดยตรง ไม่มีการปัดหรือถ่วงน้ำหนัก</p>
          <p>LEVEL 1 ผู้เริ่มต้น · 2 ผู้เรียนรู้ · 3 ผู้ปฏิบัติ · 4 ผู้ชำนาญ · 5 ผู้เชี่ยวชาญ · 6-7 ระดับบริหาร</p>
        </div>
      </footer>
    </>
  );
}
