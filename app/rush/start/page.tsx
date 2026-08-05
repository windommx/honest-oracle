"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";
import { BOOK_TYPES, MODULE_GROUPS, defaultGroupsFor, NARRATIVE_STRUCTURES, BOOTSTRAPS, bootstrapQuery, structureById, type BookTypeKey } from "@/lib/rush-engine/engine";

type GroupKey = (typeof MODULE_GROUPS)[number]["key"];
const STEPS = ["ประเภท", "แนวย่อย + ภาษา", "ความยาว", "โมดูลเสริม", "สรุป"];

export default function RushStart() {
  const [step, setStep] = useState(0);
  const [type, setType] = useState<BookTypeKey>("novel");
  const [genre, setGenre] = useState<string>(BOOK_TYPES.novel.sub_genres[0]);
  const [lang, setLang] = useState<"th" | "en">("th");
  const [chapters, setChapters] = useState(BOOK_TYPES.novel.default_chapters);
  const [words, setWords] = useState(BOOK_TYPES.novel.default_words);
  const [groups, setGroups] = useState<GroupKey[]>(defaultGroupsFor("novel"));
  const [structure, setStructure] = useState<string>(""); // "" = โครงมาตรฐาน (3 องก์)
  // Preset gallery filter — 70 presets need to be scannable, especially on mobile.
  const [presetFilter, setPresetFilter] = useState<BookTypeKey | "all">("all");
  const presetTypes = useMemo(() => {
    const seen = new Set<BookTypeKey>();
    for (const b of BOOTSTRAPS) seen.add(b.type);
    return (Object.keys(BOOK_TYPES) as BookTypeKey[]).filter((k) => seen.has(k));
  }, []);
  const shownPresets = useMemo(
    () => (presetFilter === "all" ? BOOTSTRAPS : BOOTSTRAPS.filter((b) => b.type === presetFilter)),
    [presetFilter]
  );

  // Picking a type resets the downstream defaults to that type's.
  const chooseType = (key: BookTypeKey) => {
    const t = BOOK_TYPES[key];
    setType(key);
    setGenre(t.sub_genres[0]);
    setChapters(t.default_chapters);
    setWords(t.default_words);
    setGroups(defaultGroupsFor(key));
    setStructure("");
  };
  const toggleGroup = (k: GroupKey) => setGroups((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const href = useMemo(() => {
    const q = new URLSearchParams({ type, genre, lang, chapters: String(chapters), words: String(words) });
    if (groups.length) q.set("groups", groups.join(","));
    if (structure) q.set("structure", structure);
    return `/rush?${q.toString()}`;
  }, [type, genre, lang, chapters, words, groups, structure]);

  const canNext = step < STEPS.length - 1;
  const t = BOOK_TYPES[type];

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-gray-200">
      <div className="max-w-3xl mx-auto px-5 py-12">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs tracking-[0.2em] uppercase text-[#c9a84c] font-semibold">Rush Studio · สร้าง Prompt Pack</p>
          <div className="flex items-center gap-3">
            <Link href="/rush/fix" className="text-xs text-gray-500 hover:text-gray-300">ติดอยู่? หาจากอาการ</Link>
            <Link href="/rush/explore" className="text-xs text-gray-500 hover:text-gray-300">← ดู 8 ประเภท</Link>
          </div>
        </div>

        {/* stepper */}
        <div className="flex items-center gap-1.5 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={`h-1 rounded-full ${i <= step ? "bg-[#c9a84c]" : "bg-white/10"}`} />
              <p className={`text-[0.62rem] mt-1.5 ${i === step ? "text-[#d8b45a]" : "text-gray-600"}`}>{i + 1}. {s}</p>
            </div>
          ))}
        </div>

        {/* step 1 — type */}
        {step === 0 && (
          <section>
            <h2 className="text-lg font-bold mb-4">เลือกประเภทหนังสือ</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.entries(BOOK_TYPES) as [BookTypeKey, (typeof BOOK_TYPES)[BookTypeKey]][]).map(([key, bt]) => (
                <button
                  key={key}
                  onClick={() => chooseType(key)}
                  className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${type === key ? "border-[#c9a84c] bg-[#c9a84c]/[0.06]" : "border-white/10 hover:border-white/25"}`}
                >
                  <span className="text-2xl">{bt.icon}</span>
                  <span>
                    <span className="block font-medium text-gray-100">{bt.label}</span>
                    <span className="block text-[0.68rem] text-gray-500">{bt.sub_genres.length} แนวย่อย · {bt.default_chapters} บท</span>
                  </span>
                  {type === key && <Check className="w-4 h-4 text-[#c9a84c] ml-auto" />}
                </button>
              ))}
            </div>

            {/* bootstraps — one-click starting points (skip the wizard entirely) */}
            <div className="mt-10">
              <h3 className="text-sm font-semibold text-gray-300 mb-1">หรือเริ่มเร็วจากแม่แบบตั้งต้น ({BOOTSTRAPS.length})</h3>
              <p className="text-[0.68rem] text-gray-500 mb-3">กดแล้วได้ config ครบ (ประเภท·แนว·โครงเรื่อง·ความยาว) — ปรับต่อได้ทุกอย่างในหน้าถัดไป</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                <button
                  onClick={() => setPresetFilter("all")}
                  className={`text-[0.68rem] px-2.5 py-1 rounded-full border transition ${presetFilter === "all" ? "border-[#c9a84c] bg-[#c9a84c]/10 text-[#e6c86a]" : "border-white/10 text-gray-400 hover:border-white/25"}`}
                >
                  ทั้งหมด ({BOOTSTRAPS.length})
                </button>
                {presetTypes.map((k) => (
                  <button
                    key={k}
                    onClick={() => setPresetFilter(k)}
                    className={`text-[0.68rem] px-2.5 py-1 rounded-full border transition ${presetFilter === k ? "border-[#c9a84c] bg-[#c9a84c]/10 text-[#e6c86a]" : "border-white/10 text-gray-400 hover:border-white/25"}`}
                  >
                    {BOOK_TYPES[k].icon} {BOOK_TYPES[k].label} ({BOOTSTRAPS.filter((b) => b.type === k).length})
                  </button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {shownPresets.map((b) => (
                  <Link
                    key={b.id}
                    href={`/rush?${bootstrapQuery(b)}`}
                    className="rounded-lg border border-white/10 p-3 hover:border-[#c9a84c]/50 transition group"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-base">{BOOK_TYPES[b.type].icon}</span>
                      <span className="text-sm font-medium text-gray-100 group-hover:text-[#e6c86a]">{b.nameTh}</span>
                    </span>
                    <span className="block text-[0.65rem] text-gray-500 mt-1">{b.taglineTh}</span>
                    <span className="block text-[0.6rem] text-gray-600 mt-1">
                      {b.chapters} บท × {b.words.toLocaleString()} คำ{b.structure ? ` · ${structureById(b.structure)?.thai ?? b.structure}` : ""}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* step 2 — genre + language */}
        {step === 1 && (
          <section>
            <h2 className="text-lg font-bold mb-1">แนวย่อยของ {t.label}</h2>
            <p className="text-sm text-gray-500 mb-4">เลือกแนวย่อยที่ใกล้เคียงที่สุด</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {t.sub_genres.map((g) => (
                <button
                  key={g}
                  onClick={() => setGenre(g)}
                  className={`text-sm px-3 py-1.5 rounded-full border transition ${genre === g ? "border-[#c9a84c] bg-[#c9a84c]/10 text-[#e6c86a]" : "border-white/10 text-gray-300 hover:border-white/25"}`}
                >
                  {g.replace(/_/g, " ")}
                </button>
              ))}
            </div>
            <h3 className="text-sm font-semibold mb-2">ภาษาของ prompt</h3>
            <div className="flex gap-2">
              {(["th", "en"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`text-sm px-4 py-2 rounded-lg border transition ${lang === l ? "border-[#c9a84c] bg-[#c9a84c]/10 text-[#e6c86a]" : "border-white/10 text-gray-300 hover:border-white/25"}`}
                >
                  {l === "th" ? "ไทย (Thai-native)" : "อังกฤษ (English)"}
                </button>
              ))}
            </div>

            {type === "novel" && lang === "th" && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-1">โครงเรื่อง (ทางเลือกไทย/เอเชีย)</h3>
                <p className="text-[0.7rem] text-gray-500 mb-2">เลือกโครงพื้นถิ่นแทน 3 องก์ตะวันตก — จะฝัง beat รายบทลงใน prompt ภาษาไทย</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    onClick={() => setStructure("")}
                    className={`rounded-xl border p-3 text-left transition ${structure === "" ? "border-[#c9a84c] bg-[#c9a84c]/[0.06]" : "border-white/10 hover:border-white/25"}`}
                  >
                    <span className="block text-sm font-medium text-gray-100">โครงมาตรฐาน (3 องก์)</span>
                    <span className="block text-[0.66rem] text-gray-500 mt-0.5">conflict → climax → resolution</span>
                  </button>
                  {NARRATIVE_STRUCTURES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStructure(s.id)}
                      className={`rounded-xl border p-3 text-left transition ${structure === s.id ? "border-[#c9a84c] bg-[#c9a84c]/[0.06]" : "border-white/10 hover:border-white/25"}`}
                    >
                      <span className="block text-sm font-medium text-gray-100">{s.thai}</span>
                      <span className="block text-[0.66rem] text-gray-500 mt-0.5">{s.origin}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* step 3 — length */}
        {step === 2 && (
          <section>
            <h2 className="text-lg font-bold mb-4">ความยาว</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm text-gray-400">จำนวนบท</span>
                <input type="number" min={1} max={100} value={chapters} onChange={(e) => setChapters(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))} className="mt-1.5 w-full px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-gray-100 focus:border-[#c9a84c]/50 focus:outline-none" />
              </label>
              <label className="block">
                <span className="text-sm text-gray-400">คำต่อบท (โดยประมาณ)</span>
                <input type="number" min={100} max={20000} step={100} value={words} onChange={(e) => setWords(Math.max(100, Math.min(20000, parseInt(e.target.value) || 100)))} className="mt-1.5 w-full px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-gray-100 focus:border-[#c9a84c]/50 focus:outline-none" />
              </label>
            </div>
            <p className="text-[0.72rem] text-gray-500 mt-3">รวมประมาณ {(chapters * words).toLocaleString()} คำ · ค่าเริ่มต้นของ {t.label}: {t.default_chapters} บท × {t.default_words.toLocaleString()} คำ</p>
          </section>
        )}

        {/* step 4 — modules */}
        {step === 3 && (
          <section>
            <h2 className="text-lg font-bold mb-1">โมดูลเสริม</h2>
            <p className="text-sm text-gray-500 mb-4">เลือกได้หลายกลุ่ม — ต่อเข้าไปใน prompt pack (แนะนำตามประเภทไว้ให้แล้ว)</p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {MODULE_GROUPS.map((g) => {
                const on = groups.includes(g.key);
                return (
                  <button
                    key={g.key}
                    onClick={() => toggleGroup(g.key)}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${on ? "border-[#c9a84c] bg-[#c9a84c]/[0.06]" : "border-white/10 hover:border-white/25"}`}
                  >
                    <span className={`mt-0.5 grid place-items-center w-4 h-4 rounded border ${on ? "bg-[#c9a84c] border-[#c9a84c]" : "border-white/25"}`}>
                      {on && <Check className="w-3 h-3 text-black" />}
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-gray-100">{g.label}</span>
                      <span className="block text-[0.68rem] text-gray-500 leading-snug mt-0.5">{g.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* step 5 — summary */}
        {step === 4 && (
          <section>
            <h2 className="text-lg font-bold mb-4">สรุป แล้วสร้าง Prompt Pack</h2>
            <dl className="rounded-xl border border-white/10 divide-y divide-white/5 text-sm">
              {[
                ["ประเภท", `${t.icon} ${t.label}`],
                ["แนวย่อย", genre.replace(/_/g, " ")],
                ["ภาษา prompt", lang === "th" ? "ไทย" : "อังกฤษ"],
                ["โครงเรื่อง", structure ? (NARRATIVE_STRUCTURES.find((s) => s.id === structure)?.thai ?? structure) : "มาตรฐาน (3 องก์)"],
                ["ความยาว", `${chapters} บท × ${words.toLocaleString()} คำ (~${(chapters * words).toLocaleString()} คำ)`],
                ["โมดูลเสริม", groups.length ? groups.map((k) => MODULE_GROUPS.find((m) => m.key === k)?.label).join(", ") : "core เท่านั้น"],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3 px-4 py-2.5">
                  <dt className="w-28 shrink-0 text-gray-500">{k}</dt>
                  <dd className="text-gray-200">{v}</dd>
                </div>
              ))}
            </dl>
            <Link href={href} className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#c9a84c] text-black font-semibold hover:bg-[#e6c86a] transition">
              สร้าง Prompt Pack ใน Rush Studio <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="text-[0.68rem] text-gray-500 mt-3">จะเปิด /rush พร้อมตั้งค่าทุกอย่างให้ — กด Generate ได้เลย</p>
          </section>
        )}

        {/* nav */}
        <div className="flex items-center justify-between mt-10">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-white/10 text-gray-300 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-4 h-4" /> ย้อนกลับ
          </button>
          {canNext && (
            <button
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              className="inline-flex items-center gap-1.5 text-sm px-5 py-2 rounded-lg bg-[#c9a84c] text-black font-semibold hover:bg-[#e6c86a]"
            >
              ถัดไป <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
