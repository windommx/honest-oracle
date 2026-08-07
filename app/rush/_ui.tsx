"use client";

import type { PromptGroup } from "@/lib/rush-engine/types";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  LIGHT UI PRIMITIVES — presentational only, zero engine imports.  ║
// ║                                                                    ║
// ║  These lived in _components.tsx, which imports EVERY analyzer      ║
// ║  (Thai, prose, codex, saga, sensory, radar, rename, register,      ║
// ║  translation, narrative) plus the EPUB builder. Importing <Field>  ║
// ║  — a label wrapper — therefore pulled the entire analysis half of  ║
// ║  the engine into /rush's initial bundle, and kept the three heavy  ║
// ║  modals in the first chunk even after they were dynamic-imported:  ║
// ║  the static import of these four helpers held the module in place. ║
// ║  Splitting the FILE is what makes the dynamic import actually work.║
// ╚══════════════════════════════════════════════════════════════════╝

export const GROUP_COLORS: Record<PromptGroup, string> = {
  core: "border-[#c9a84c] text-[#c9a84c]",
  craft: "border-green-400 text-green-400",
  nonfiction: "border-blue-400 text-blue-400",
  prose: "border-purple-400 text-purple-400",
  thai: "border-pink-400 text-pink-400",
  dialect: "border-rose-400 text-rose-400",
  marketing: "border-orange-400 text-orange-400",
  advanced: "border-cyan-400 text-cyan-400",
  agents: "border-emerald-400 text-emerald-400",
  nis: "border-red-400 text-red-400",
  saga: "border-violet-400 text-violet-400",
};

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-[0.7rem] text-gray-400 mb-1 tracking-wide">{label}</label>
      {children}
    </div>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="p-2 bg-white/5 rounded-lg text-center">
      <div className="text-lg font-bold text-[#c9a84c]">{value}</div>
      <div className="text-[0.6rem] text-faint mt-0.5">{label}</div>
    </div>
  );
}

export function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
        active ? "border-[#c9a84c] text-[#c9a84c] bg-[#c9a84c]/10" : "border-white/10 text-gray-400 hover:border-[#c9a84c]/40"
      }`}
    >
      {label}
    </button>
  );
}
