"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShieldCheck, XCircle, BookMarked } from "lucide-react";
// Data-only imports at module scope. generateAllPrompts/coverage are loaded LAZILY below:
// the live citation-coverage count needs the whole prompt engine, and paying for it in the
// initial bundle made this the one page the import cleanup could not shrink (287 kB).
import { TIERS, REFUSED_CONSTRUCTS } from "@/lib/bookisdom-engine/epistemics";
import { CITATIONS, disputed } from "@/lib/bookisdom-engine/citations";

const TIER_TONE: Record<string, string> = {
  paccakkha: "#22c55e", anumana: "#38bdf8", sanna: "#fbbf24", avisaya: "#ef4444",
};
const CITE_TONE: Record<string, string> = {
  primary: "#22c55e", index: "#38bdf8", memory: "#fbbf24", disputed: "#ef4444",
};
const CITE_LABEL: Record<string, string> = {
  primary: "เปิดต้นฉบับจริง",
  index: "ยืนยันผ่านดัชนีค้นหา — ไม่ได้เปิดหน้าเอกสาร",
  memory: "รายงานจากความจำ — ยังไม่ได้ตรวจรอบนี้",
  disputed: "อ้างเพราะมันถูกโต้แย้ง — ความสงสัยคือบทเรียนเอง",
};

export default function BookisdomHonesty() {
  // Tier counts are pure data — available immediately.
  const { byTier, primaryCount, registered } = useMemo(() => {
    const byTier: Record<string, number> = {};
    for (const c of CITATIONS) byTier[c.tier] = (byTier[c.tier] ?? 0) + 1;
    return { byTier, primaryCount: byTier.primary ?? 0, registered: CITATIONS.length };
  }, []);

  // The coverage DENOMINATOR is still counted live from the real generated prompts — never
  // a hardcoded constant, which is the property that keeps it from drifting flattering as
  // modules grow. It just loads after paint now, so the page does not ship the whole prompt
  // engine in its initial bundle. null = still counting.
  const [mentionsEstimate, setMentionsEstimate] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const [{ generateAllPrompts, MODULE_GROUPS }, { coverage }] = await Promise.all([
        import("@/lib/bookisdom-engine/engine"),
        import("@/lib/bookisdom-engine/citations"),
      ]);
      const cfg = {
        type: "novel", title: "-", thesis: "-", reader: "-", voice: "storytelling",
        chapters: 12, wordsPerChapter: 2000, subGenre: "thriller", citationStyle: "none", language: "english",
      } as unknown as Parameters<typeof generateAllPrompts>[0];
      const text = generateAllPrompts(cfg, MODULE_GROUPS.map((m) => m.key)).map((p) => p.prompt).join("\n");
      if (live) setMentionsEstimate(coverage(text).mentionsEstimate);
    })();
    return () => { live = false; };
  }, []);

  return (
    <main className="min-h-screen bg-[#0b0e17] text-slate-200">
      <div className="max-w-3xl mx-auto px-5 py-12">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs tracking-[0.2em] uppercase text-[#ab5bf7] font-semibold">Bookisdom · ความซื่อสัตย์ทางญาณวิทยา</p>
          <Link href="/bookisdom/explore" className="text-xs text-faint hover:text-slate-300">← กลับ</Link>
        </div>
        <h1 className="text-2xl font-bold text-slate-100 mb-1">เราถือมาตรฐานเดียวกับที่เราใช้ตรวจงานคุณ</h1>
        <p className="text-sm text-faint mb-8">
          Bookisdom ปฏิเสธที่จะให้คะแนน 0–100 แบบเดา และหน้านี้แสดงว่าเราใช้กฎเดียวกันนั้นกับ<strong>ตัวเลขของเราเอง</strong>และ<strong>แหล่งอ้างอิงของเราเอง</strong>
        </p>

        {/* Tiers */}
        <section className="mb-10">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-3">
            <ShieldCheck className="w-4 h-4 text-[#ab5bf7]" /> ทุกตัวเลขถูกจัดชั้นว่ามาจากการรู้แบบไหน
          </h2>
          <div className="space-y-2">
            {TIERS.map((t) => (
              <div key={t.id} className="rounded-lg border border-white/10 p-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: TIER_TONE[t.id] }} />
                  <span className="text-sm font-medium" style={{ color: TIER_TONE[t.id] }}>{t.thai}</span>
                  <span className="text-[0.6rem] text-faint italic">{t.pali}</span>
                  <span className={`ml-auto text-[0.6rem] px-1.5 py-0.5 rounded ${t.admissible ? "text-emerald-300/80" : "text-rose-300/80"}`}>
                    {t.admissible ? "แสดงได้" : "ปฏิเสธ"}
                  </span>
                </div>
                <p className="text-[0.72rem] text-faint mt-1">{t.gloss}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Refused */}
        <section className="mb-10">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-3">
            <XCircle className="w-4 h-4 text-rose-400" /> {REFUSED_CONSTRUCTS.length} ค่าที่เราปฏิเสธจะให้คะแนน — และเหตุผล
          </h2>
          <div className="grid gap-1.5">
            {REFUSED_CONSTRUCTS.map((c) => (
              <div key={c.id} className="text-[0.72rem] text-slate-400 rounded border border-rose-500/15 bg-rose-500/[0.03] px-3 py-1.5">
                <span className="text-rose-300/90 line-through">{c.thai}</span> — {c.why}
              </div>
            ))}
          </div>
        </section>

        {/* Citations */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-1">
            <BookMarked className="w-4 h-4 text-[#ab5bf7]" /> เราจัดชั้นแหล่งอ้างอิงของเราเองด้วย
          </h2>
          <p className="text-[0.72rem] text-faint mb-3">
            ชั้นบอกว่า <strong>ตรวจมาแรงแค่ไหน</strong> ไม่ได้บอกว่างานดีแค่ไหน
          </p>

          <div className="rounded-lg border border-white/10 p-3 mb-3 text-[0.72rem] text-slate-400 leading-relaxed">
            <span className="text-slate-200 font-medium">{registered}</span> แหล่งอ้างอิงลงทะเบียนแล้ว จาก
            ~<span className="text-slate-200 font-medium">{mentionsEstimate ?? "…"}</span> การอ้างอิงในโมดูล (ประมาณการแบบนับเกิน).{" "}
            <span className={primaryCount === 0 ? "text-rose-300/90" : "text-emerald-300/90"}>
              เปิดต้นฉบับจริง {primaryCount} ฉบับ
            </span>{" "}
            — network policy ของ environment บล็อกเว็บวิชาการเกือบทั้งหมด เราจึงบอกตรง ๆ ว่ายังไม่ได้เปิด แทนที่จะทำเป็นว่าอ่านแล้ว
          </div>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {(["primary", "index", "memory", "disputed"] as const).map((tier) => (
              <span key={tier} className="text-[0.66rem] px-2 py-0.5 rounded border"
                style={{ borderColor: CITE_TONE[tier] + "55", color: CITE_TONE[tier] }}>
                {CITE_LABEL[tier].split(" —")[0]} · {byTier[tier] ?? 0}
              </span>
            ))}
          </div>

          <h3 className="text-xs font-semibold text-rose-300/90 mb-2">
            {disputed().length} แหล่งที่เราอ้าง<strong>เพราะ</strong>มันถูกโต้แย้ง — ความสงสัยคือเนื้อหาเอง
          </h3>
          <div className="space-y-2">
            {disputed().map((c) => (
              <div key={c.id} className="rounded-lg border border-rose-500/15 bg-rose-500/[0.03] p-3">
                <p className="text-[0.75rem] text-slate-200">
                  {c.who} <span className="text-faint">({c.year})</span> — <span className="text-slate-400">{c.claim}</span>
                </p>
                {c.note && <p className="text-[0.68rem] text-faint mt-1">{c.note}</p>}
              </div>
            ))}
          </div>
        </section>

        <p className="mt-12 text-[0.65rem] leading-relaxed text-faint border-t border-white/5 pt-5">
          ทุกอย่างในหน้านี้คำนวณสด ๆ จากตัวเครื่องยนต์ในเบราว์เซอร์คุณ — ไม่มีเซิร์ฟเวอร์ ไม่มีการเรียก AI.
          ตรวจเองได้ที่ command line: <code className="text-faint">bookisdom cite</code>, <code className="text-faint">bookisdom receipt &lt;ไฟล์&gt; --verify</code>.
        </p>
      </div>
    </main>
  );
}
