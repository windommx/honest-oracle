"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import type { PromptGroup } from "@/lib/bookisdom-engine/types";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  LIGHT UI PRIMITIVES — presentational only, zero engine imports.  ║
// ║                                                                    ║
// ║  These lived in _components.tsx, which imports EVERY analyzer      ║
// ║  (Thai, prose, codex, saga, sensory, radar, rename, register,      ║
// ║  translation, narrative) plus the EPUB builder. Importing <Field>  ║
// ║  — a label wrapper — therefore pulled the entire analysis half of  ║
// ║  the engine into /bookisdom's initial bundle, and kept the three heavy  ║
// ║  modals in the first chunk even after they were dynamic-imported:  ║
// ║  the static import of these four helpers held the module in place. ║
// ║  Splitting the FILE is what makes the dynamic import actually work.║
// ╚══════════════════════════════════════════════════════════════════╝

export const GROUP_COLORS: Record<PromptGroup, string> = {
  core: "border-[#1d4ed8] text-[#1d4ed8]",
  craft: "border-green-700 text-green-800",
  nonfiction: "border-blue-700 text-blue-700",
  prose: "border-purple-700 text-purple-700",
  thai: "border-pink-700 text-pink-700",
  dialect: "border-rose-700 text-rose-700",
  marketing: "border-orange-700 text-orange-800",
  advanced: "border-cyan-700 text-cyan-700",
  agents: "border-emerald-700 text-emerald-700",
  nis: "border-red-700 text-red-700",
  saga: "border-violet-700 text-violet-700",
};

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-[0.7rem] text-slate-600 mb-1 tracking-wide">{label}</label>
      {children}
    </div>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="p-2 bg-black/[0.03] rounded-lg text-center">
      <div className="text-lg font-bold text-[#1d4ed8]">{value}</div>
      <div className="text-[0.6rem] text-faint mt-0.5">{label}</div>
    </div>
  );
}

export function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
        active ? "border-[#1d4ed8] text-[#1d4ed8] bg-[#3c74d4]/10" : "border-black/10 text-slate-600 hover:border-[#1d4ed8]/40"
      }`}
    >
      {label}
    </button>
  );
}

// Deleting is permanent — a server project has no undo endpoint and a local record is gone
// from IndexedDB for good. One slipped click must never be enough. First click ARMS the
// button (it turns red and says so); the second click within 4 seconds deletes; doing
// nothing disarms it again. Same-button flow keeps this keyboard-accessible (no dialog) and
// un-blockable (no window.confirm). Shared by the dashboard and the production log so both
// destructive-delete flows behave identically.
export function DeleteButton({ onDelete, what, idleClass, armedClass }: {
  onDelete: () => void; what: string; idleClass: string; armedClass: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <button
      onClick={() => { setArmed(false); onDelete(); }}
      aria-label={`ยืนยันลบ${what}`}
      className={armedClass}
    >
      ยืนยันลบ?
    </button>
  ) : (
    <button onClick={() => setArmed(true)} aria-label={`ลบ${what}`} title="ลบ" className={idleClass}>
      <Trash2 className="w-4 h-4" />
    </button>
  );
}
