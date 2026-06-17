"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { MODULE_GROUPS, type PromptGroup } from "@/lib/rush-engine/engine";
import { analyzeThai } from "@/lib/rush-engine/thai-analyzer";

export const GROUP_COLORS: Record<PromptGroup, string> = {
  core: "border-[#c9a84c] text-[#c9a84c]",
  craft: "border-green-400 text-green-400",
  nonfiction: "border-blue-400 text-blue-400",
  prose: "border-purple-400 text-purple-400",
  thai: "border-pink-400 text-pink-400",
  marketing: "border-orange-400 text-orange-400",
  advanced: "border-cyan-400 text-cyan-400",
  agents: "border-emerald-400 text-emerald-400",
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
      <div className="text-[0.6rem] text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

export function ThaiAnalyzerModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const a = useMemo(() => (text.trim() ? analyzeThai(text) : null), [text]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Thai Analyzer" className="glass-card rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 border border-[#c9a84c]/30" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold gold-gradient">วิเคราะห์ภาษาไทย</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          เครื่องมือฝั่งเบราว์เซอร์ (ไม่เรียก AI) — นับคำด้วยตัวตัดคำไทย หาคำซ้ำ/echoes และสแกนคำคลิเชแบบ AI
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="วางข้อความภาษาไทยที่นี่…"
          className="input min-h-[140px] resize-y"
        />
        {a && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <Stat value={String(a.wordCount)} label="คำ" />
              <Stat value={String(a.uniqueWords)} label="คำไม่ซ้ำ" />
              <Stat value={String(a.charCount)} label="อักษร" />
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">AI-tell / คำคลิเช</h3>
              {a.aiTells.length === 0 ? (
                <p className="text-xs text-green-400">✓ ไม่พบคำคลิเชแบบ AI</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {a.aiTells.map((t) => (
                    <span key={t.phrase} className="text-xs px-2 py-0.5 rounded border border-red-500/40 text-red-400">
                      {t.phrase} ×{t.count}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">คำซ้ำใกล้กัน (ภายใน 40 คำ)</h3>
              {a.nearRepeats.length === 0 ? (
                <p className="text-xs text-gray-500">— ไม่พบคำเนื้อหาที่ซ้ำใกล้กัน</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {a.nearRepeats.slice(0, 20).map((e) => (
                    <span key={e.word} className="text-xs px-2 py-0.5 rounded border border-yellow-400/40 text-yellow-300">
                      {e.word} ×{e.count}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">คำซ้ำบ่อย (echoes ≥3)</h3>
              {a.echoes.length === 0 ? (
                <p className="text-xs text-gray-500">— ไม่มีคำเนื้อหาที่ซ้ำเกิน 3 ครั้ง</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {a.echoes.slice(0, 20).map((e) => (
                    <span key={e.word} className="text-xs px-2 py-0.5 rounded border border-orange-400/40 text-orange-300">
                      {e.word} ×{e.count}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">คำที่ใช้บ่อยสุด</h3>
              <div className="flex flex-wrap gap-1.5">
                {a.topWords.map((w) => (
                  <span key={w.word} className="text-xs px-2 py-0.5 rounded border border-white/10 text-gray-300">
                    {w.word} ×{w.count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function GuideModal({ onClose }: { onClose: () => void }) {
  const steps = [
    "ตั้งค่าหนังสือทางซ้าย (ประเภท / ชื่อ / แก่นเรื่อง / ผู้อ่าน / จำนวนบท) เปิด Extra Modules ที่ต้องการ แล้วกด Generate Prompts",
    "วางแผน: คัดลอก STRUCTURE ไปรันใน LLM เพื่อวางโครงเรื่องรายบท แล้ววางผลกลับในช่อง Outline",
    "ตั้ง MASTER เป็น system prompt ของ LLM (ใช้ตลอดทั้งเล่ม)",
    "ส่ง OVERVIEW หนึ่งครั้ง ให้โมเดลเข้าใจแผน + สร้างบล็อก STATE เริ่มต้น",
    "เขียนทีละบทด้วย CH_1, CH_2, … โมเดลจะออกบล็อก <<<STATE>>> ท้ายแต่ละบท",
    "คัดลอก <<<STATE>>> ล่าสุดมาวางในช่อง Story Bible / STATE แล้วกด Generate ใหม่ → ฉีดเข้าทุกบทอัตโนมัติ (continuity)",
    "ขัดเกลาด้วย ANALYSIS → REVISION, เก็บงานด้วย Front/Back Matter",
    "ตอนจะตีพิมพ์ ใช้กลุ่ม Marketing (Title, Blurb, KDP Metadata, Submission Pack)",
  ];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Rush Engine วิธีใช้" className="glass-card rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 border border-[#c9a84c]/30" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold gold-gradient">Rush Engine — วิธีใช้</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-300 mb-5">
          แพลตฟอร์มสร้าง <span className="text-[#c9a84c]">ชุด prompt</span> สำหรับแต่งหนังสือทุกประเภท คัดลอกไปใช้กับ LLM ตัวไหนก็ได้ (ChatGPT / Claude / Gemini) —
          ไม่ต้องมี API key ไม่มีค่า token
        </p>

        <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">เวิร์กโฟลว์แนะนำ</h3>
        <ol className="space-y-2 mb-5">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm text-gray-200">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#c9a84c]/15 text-[#c9a84c] text-xs flex items-center justify-center font-semibold">{i + 1}</span>
              <span className="leading-relaxed">{s}</span>
            </li>
          ))}
        </ol>

        <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">กลุ่ม Module เสริม</h3>
        <div className="space-y-1.5 mb-5">
          {MODULE_GROUPS.map((g) => (
            <div key={g.key} className="text-sm">
              <span className="text-[#c9a84c]">{g.label}</span>
              <span className="text-gray-500"> — {g.desc}</span>
            </div>
          ))}
        </div>

        <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">เลือก module อันไหน?</h3>
        <div className="space-y-2 mb-5 text-sm">
          {[
            { goal: "ทำให้ร้อยแก้วดีขึ้น", items: "Anti-Slop (ลบสำนวนกลาง ๆ แบบ AI) · Anti-Safe (กล้าเสี่ยง ไม่จบแบบเซฟ) · Line Edit (แก้ระดับประโยค) · Readability (คุมระดับความยาก)" },
            { goal: "ตรวจ/ประเมินดราฟต์", items: "Analysis (คะแนนรายบท) · Quality Gate (ผ่าน/ไม่ผ่านก่อนตีพิมพ์) · Feedback (สรุปส่งต่อบทถัดไป)" },
            { goal: "ความต่อเนื่อง", items: "Story Bible/STATE (ฉีดทุกบท) · Worldbuilding Codex (สร้าง bible + ตรวจ) · Rolling Recap (สรุปต่อเนื่อง)" },
            { goal: "วางโครง/ตัวละคร", items: "Structure Outline (โครงทั้งเล่ม) · Character Voice/Arc · Scene Builder · Conflict Map (ความตึง)" },
            { goal: "หลายเอเจนต์ (ขั้นสูง)", items: "Agent Pack — ต้องมี multi-agent setup เอง (เช่น Claude Projects); ไม่ได้รันในแอปนี้" },
          ].map((r) => (
            <div key={r.goal}>
              <span className="text-[#c9a84c]">{r.goal}:</span>
              <span className="text-gray-400"> {r.items}</span>
            </div>
          ))}
        </div>

        <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">เคล็ดลับ</h3>
        <ul className="space-y-1.5 text-sm text-gray-300 list-disc list-inside marker:text-[#c9a84c]">
          <li><span className="text-gray-200">ภาษา prompt:</span> สลับ “ไทยทั้งชุด” ได้ที่ Prompt Language</li>
          <li><span className="text-gray-200">Continuity:</span> Story Bible / STATE ฉีดเข้าทุกบท — แก้ที่เดียวใช้ทั้งเล่ม</li>
          <li><span className="text-gray-200">เซฟงาน:</span> ปุ่ม Save เก็บ project ไว้ในบัญชี (ต้องล็อกอิน)</li>
          <li><span className="text-gray-200">ส่งออก:</span> Copy ราย prompt / Copy all / Download .md หรือ .json</li>
          <li><span className="text-gray-200">Preset:</span> แนะนำ / ทั้งหมด / ล้าง เลือกกลุ่ม module ได้เร็ว</li>
        </ul>
      </div>
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
