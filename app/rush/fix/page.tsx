"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ArrowRight, AlertCircle, CornerDownRight } from "lucide-react";
import { route, SYMPTOM_LADDER, MODULE_CATALOG, TH_META } from "@/lib/rush-engine/engine";

// Sample symptoms, taken verbatim from the ladder's own rung labels so this list can
// never drift out of sync with what actually routes. Six chosen to span the ladder.
const SAMPLE_RUNGS = ["R21", "R5", "R3", "R8", "R13", "R2"];

export default function RushFix() {
  const [symptom, setSymptom] = useState("");
  const result = useMemo(() => (symptom.trim() ? route(symptom) : null), [symptom]);
  // Thai description when the module has one, English catalog copy as the fallback —
  // never a made-up label. An id with no entry shows as itself.
  const meta = (id: string) => {
    const m = MODULE_CATALOG.find((x) => x.id === id);
    return { name: m?.name ?? id, desc: TH_META[id]?.description ?? m?.description ?? "" };
  };
  const samples = SAMPLE_RUNGS.map((id) => SYMPTOM_LADDER.find((r) => r.id === id)!).filter(Boolean);

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-gray-200">
      <div className="max-w-3xl mx-auto px-5 py-12">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs tracking-[0.2em] uppercase text-[#c9a84c] font-semibold">Rush · หาโมดูลจากอาการ</p>
          <Link href="/rush/start" className="text-xs text-gray-500 hover:text-gray-300">เริ่มเล่มใหม่ →</Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-100 mb-1">ติดตรงไหน?</h1>
        <p className="text-sm text-gray-500 mb-1">
          พิมพ์อาการด้วยคำของคุณเอง — ระบบจะบอกว่าควรเปิดโมดูลไหนใน {MODULE_CATALOG.length} ตัว
        </p>
        <p className="text-[0.68rem] text-gray-600 mb-6">
          เป็นตารางคำค้นตายตัว ไม่ใช่ AI: พิมพ์เหมือนเดิมได้ผลเหมือนเดิมทุกครั้ง และจะแสดงคำที่ทำให้เข้าขั้นนั้นให้ตรวจย้อนได้
        </p>

        <label className="block relative mb-4">
          <Search className="w-4 h-4 text-gray-600 absolute left-3.5 top-3.5" />
          <input
            value={symptom}
            onChange={(e) => setSymptom(e.target.value)}
            placeholder="เช่น จบบทแล้ววางได้ ไม่มีใครอ่านต่อ"
            aria-label="อาการที่เจอ"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] pl-10 pr-4 py-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-[#c9a84c] focus:outline-none"
          />
        </label>

        {!symptom.trim() && (
          <div className="mb-8">
            <p className="text-[0.68rem] text-gray-600 mb-2">หรือกดอาการที่ใกล้เคียง:</p>
            <div className="flex flex-wrap gap-1.5">
              {samples.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSymptom(r.th.split(" / ")[0])}
                  className="text-[0.68rem] px-2.5 py-1 rounded-full border border-white/10 text-gray-400 hover:border-[#c9a84c]/60 hover:text-[#e6c86a] transition text-left"
                >
                  {r.th.split(" / ")[0]}
                </button>
              ))}
            </div>
          </div>
        )}

        {result && !result.primary && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-300/90 mb-2">
              <AlertCircle className="w-4 h-4" /> ไม่พบขั้นที่ตรง (R0)
            </p>
            <p className="text-[0.8rem] leading-relaxed text-gray-400">{result.noMatch}</p>
          </div>
        )}

        {result?.primary && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#c9a84c]/40 bg-[#c9a84c]/[0.05] p-5">
              <p className="text-[0.62rem] tracking-widest uppercase text-[#c9a84c] mb-1">
                {result.primary.rung.id} · เปิดตัวนี้ก่อน
              </p>
              <p className="text-lg font-bold text-gray-100">{meta(result.primary.rung.primary).name}</p>
              <p className="text-[0.7rem] font-mono text-[#d8b45a] mb-2">{result.primary.rung.primary}</p>
              <p className="text-[0.78rem] text-gray-300 mb-3">{meta(result.primary.rung.primary).desc}</p>
              <p className="text-[0.8rem] leading-relaxed text-gray-400 mb-3">{result.primary.rung.why}</p>
              <p className="text-[0.68rem] text-gray-600">
                คำที่ทำให้เข้าขั้นนี้:{" "}
                {result.primary.matched.map((k) => (
                  <span key={k} className="font-mono text-gray-500 mr-1.5">“{k}”</span>
                ))}
                <span className="text-gray-700">← ตรวจย้อนเองได้</span>
              </p>
            </div>

            {result.runFirst.length > 0 && (
              <div className="rounded-xl border border-white/10 p-4">
                <p className="text-xs font-semibold text-gray-300 mb-1.5">ต้องมีก่อน</p>
                <p className="text-[0.72rem] text-gray-500 mb-2">ข้ามขั้นนี้ไป ผลลัพธ์จะมั่นใจบนความว่างเปล่า</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.runFirst.map((id) => (
                    <span key={id} className="text-[0.68rem] px-2 py-0.5 rounded border border-amber-500/25 text-amber-300/70 font-mono">
                      {id} · {meta(id).name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.primary.rung.also.length > 0 && (
              <div className="rounded-xl border border-white/10 p-4">
                <p className="text-xs font-semibold text-gray-300 mb-2">มุมอื่นของอาการเดียวกัน</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {result.primary.rung.also.map((id) => (
                    <span key={id} className="text-[0.72rem] text-gray-400">
                      <span className="font-mono text-gray-600 mr-1.5">{id}</span>
                      {meta(id).name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.secondary.length > 0 && (
              <div className="rounded-xl border border-white/10 p-4">
                <p className="text-xs font-semibold text-gray-300 mb-1">ขั้นอื่นที่ก็เข้าเงื่อนไขด้วย</p>
                <p className="text-[0.72rem] text-gray-500 mb-3">ไม่ตัดทิ้งให้ — คุณเลือกเองว่าอันไหนตรงกว่า</p>
                <ul className="space-y-2">
                  {result.secondary.map((s) => (
                    <li key={s.rung.id} className="flex gap-2 text-[0.75rem]">
                      <CornerDownRight className="w-3.5 h-3.5 text-gray-700 shrink-0 mt-0.5" />
                      <span>
                        <span className="font-mono text-gray-600 mr-1.5">{s.rung.id}</span>
                        <span className="text-gray-400">{s.rung.th}</span>
                        <span className="block text-gray-600 mt-0.5">
                          → <span className="font-mono text-[#c9a84c]/70">{s.rung.primary}</span> (จาก: {s.matched.join(", ")})
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Link
              href="/rush/start"
              className="inline-flex items-center gap-2 rounded-xl bg-[#c9a84c] px-5 py-2.5 text-sm font-semibold text-[#0a0a0f] hover:bg-[#d8b45a] transition"
            >
              สร้าง Prompt Pack ที่มีโมดูลเหล่านี้ <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        <p className="mt-12 text-[0.65rem] leading-relaxed text-gray-700 border-t border-white/5 pt-5">
          บันไดนี้มี {SYMPTOM_LADDER.length} ขั้น และครอบคลุมไม่ครบทั้ง {MODULE_CATALOG.length} โมดูล — บางโมดูลเป็นสิ่งที่คุณ
          “สั่ง” (เช่น แปลไทย→อังกฤษ, สร้าง prompt ภาพ) ไม่ใช่ “อาการ” ที่สังเกตเห็น. ถ้าอาการของคุณไม่เข้าขั้นไหนเลย
          ระบบจะบอกตรง ๆ ว่าไม่รู้ แทนที่จะเดาตัวที่ใกล้ที่สุดให้.
        </p>
      </div>
    </main>
  );
}
