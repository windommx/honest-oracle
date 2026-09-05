"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ShieldCheck, Cpu, Languages, Scale } from "lucide-react";
import { BOOK_TYPES } from "@/lib/bookisdom-engine/book-types";
import type { BookTypeKey } from "@/lib/bookisdom-engine/types";
import { MODULE_GROUPS } from "@/lib/bookisdom-engine/modules";
import { MODULE_META as MODULE_CATALOG } from "@/lib/bookisdom-engine/catalog-meta";
import { NARRATIVE_STRUCTURES } from "@/lib/bookisdom-engine/thai-structures";
import { BOOTSTRAPS } from "@/lib/bookisdom-engine/bootstraps";

// Curated Thai one-liners per book type (marketing copy — the structural facts below come
// straight from BOOK_TYPES so nothing here is invented).
const TYPE_TH: Record<BookTypeKey, string> = {
  novel: "นิยายทุกแนว — โครงเรื่องคิโชเทงเค็ตสึ/3 องก์, เสียงตัวละคร, สร้างโลก, ฉาก+บทสนทนา",
  nonfiction: "สารคดี/ความรู้ — แตกวิทยานิพนธ์เป็นข้อโต้แย้ง, หลักฐาน, การสอน",
  howto: "คู่มือ/How-To — ขั้นตอนชัด ทำตามได้จริง มีเช็กลิสต์ความปลอดภัย",
  kids: "หนังสือเด็ก — คุมคำศัพท์ตามวัย จังหวะอ่านออกเสียง โน้ตภาพประกอบ",
  cookbook: "ตำราอาหาร — สูตรชัด วัดตวงแม่น เรื่องเล่าประกอบจาน",
  textbook: "ตำราเรียน/วิชาการ — ลูกโซ่แนวคิด แบบฝึกหัด เฉลย",
  memoir: "บันทึกความทรงจำ/ชีวประวัติ — ความจริงทางอารมณ์ ร้อยแก่นผ่านฉาก",
  poetry: "รวมบทกวี — ภาพพจน์ จังหวะ เสียง แบ่งตามแก่น",
};

const HOW = [
  { icon: Cpu, title: "Prompt platform — ไม่ใช่ AI แต่งแทน", body: "Bookisdom สร้าง prompt pack ครบชุด (master + รายบท + วิเคราะห์ + revise) เอาไป paste ใน LLM ตัวไหนก็ได้ หรือต่อ API key ของคุณเองผ่าน Bookisdom Studio — เราไม่ ghost-write บนเซิร์ฟเวอร์" },
  { icon: Languages, title: "Moat ภาษาไทย", body: "คิโชเทงเค็ตสึ, ราชาศัพท์, สำเนียงถิ่น (อีสาน/คำเมือง/ใต้), แปลไทย→อังกฤษ, และการตัดคำไทยที่แม่นพอจะนับได้จริง — สิ่งที่เครื่องมือฝรั่งไม่มี" },
  { icon: Scale, title: "วิเคราะห์แบบนับได้ ในเบราว์เซอร์", body: "คำ/จังหวะ/ผัสสะ/ความต่อเนื่อง/pacing/ตัวละคร — ทุกตัวเลขตรวจซ้ำเองได้ ไม่เรียก AI" },
  { icon: ShieldCheck, title: "ไม่มีคะแนน 0–100 หลอก ๆ", body: "เรามีชั้นญาณวิทยาที่บอกว่าตัวเลขไหนเชื่อได้ (นับตรง/อนุมาน) และปฏิเสธที่จะให้คะแนน momentum/quality แบบเดา — ญาณวิทยานี้คู่แข่งลอกไม่ได้" },
];

export default function BookisdomExplore() {
  const [open, setOpen] = useState<BookTypeKey | null>(null);
  const types = Object.entries(BOOK_TYPES) as [BookTypeKey, (typeof BOOK_TYPES)[BookTypeKey]][];

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-800">
      {/* hero */}
      <section className="max-w-5xl mx-auto px-5 pt-16 pb-10 text-center">
        <p className="text-xs tracking-[0.2em] uppercase text-[#7a5c12] font-semibold mb-3">Bookisdom · แต่งหนังสือด้วย prompt ที่นับได้จริง</p>
        <h1 className="text-3xl sm:text-5xl font-bold leading-tight">
          แต่งหนังสือได้ <span className="bg-gradient-to-r from-[#7a5c12] to-[#c8901f] bg-clip-text text-transparent">8 ประเภท</span>
          <br className="hidden sm:block" /> ครบทั้งแนวย่อย โครงเรื่อง และโมดูลเสริม
        </h1>
        <p className="mt-4 text-slate-600 max-w-2xl mx-auto">
          เลือกประเภท → สร้าง prompt pack ครบชุด → เอาไปใช้กับ LLM ตัวโปรด. บวกเครื่องมือวิเคราะห์ภาษาไทยที่นับได้จริง ไม่มีคะแนนเดา
        </p>
        {/* live counts — computed from the engine registries, never hardcoded */}
        <div className="mt-5 flex flex-wrap gap-2 justify-center text-[0.7rem] text-slate-600">
          <span className="px-2.5 py-1 rounded-full border border-black/10">{Object.keys(BOOK_TYPES).length} ประเภทหนังสือ</span>
          <span className="px-2.5 py-1 rounded-full border border-black/10">{MODULE_CATALOG.length} โมดูล prompt</span>
          <span className="px-2.5 py-1 rounded-full border border-black/10">{NARRATIVE_STRUCTURES.length} โครงเรื่อง (รวมพื้นถิ่นไทย/เอเชีย)</span>
          <span className="px-2.5 py-1 rounded-full border border-black/10">{BOOTSTRAPS.length} แม่แบบตั้งต้น</span>
        </div>
        <div className="mt-7 flex flex-wrap gap-3 justify-center">
          <Link href="/bookisdom/start" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#d9a63a] text-black font-semibold hover:bg-[#c8901f] transition">
            เริ่มสร้าง Prompt Pack <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/bookisdom/fix" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-black/15 text-slate-800 hover:bg-black/[0.04] transition">
            เขียนอยู่แล้วแต่ติด — หาโมดูลจากอาการ
          </Link>
          <Link href="/bookisdom/honesty" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-black/15 text-slate-800 hover:bg-black/[0.04] transition">
            ทำไมเชื่อตัวเลขเราได้ — ชั้นความซื่อสัตย์
          </Link>
          <a href="#types" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-black/15 text-slate-800 hover:bg-black/[0.04] transition">
            ดู 8 ประเภท
          </a>
        </div>
      </section>

      {/* book types */}
      <section id="types" className="max-w-5xl mx-auto px-5 py-10">
        <h2 className="text-xl font-bold mb-1">8 ประเภทหนังสือ</h2>
        <p className="text-sm text-faint mb-6">คลิกการ์ดเพื่อดูแนวย่อย โครงเรื่อง และค่าเริ่มต้น (ข้อมูลจริงจากเอนจิน)</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {types.map(([key, t]) => {
            const isOpen = open === key;
            return (
              <div key={key} className={`rounded-2xl border p-5 transition ${isOpen ? "border-[#7a5c12] bg-[#d9a63a]/[0.05]" : "border-black/10 bg-black/[0.015] hover:border-black/20"}`}>
                <button onClick={() => setOpen(isOpen ? null : key)} className="w-full text-left">
                  <div className="flex items-start gap-3">
                    <span className="text-3xl leading-none">{t.icon}</span>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900">{t.label}</h3>
                      <p className="text-xs text-slate-600 mt-0.5">{TYPE_TH[key]}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3 text-[0.65rem] text-faint">
                    <span className="px-2 py-0.5 rounded border border-black/10">{t.sub_genres.length} แนวย่อย</span>
                    <span className="px-2 py-0.5 rounded border border-black/10">{t.structures.length} โครงเรื่อง</span>
                    <span className="px-2 py-0.5 rounded border border-black/10">{t.default_chapters} บท × {t.default_words.toLocaleString()} คำ</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="mt-4 space-y-3 border-t border-black/10 pt-3">
                    <div>
                      <p className="text-[0.65rem] uppercase tracking-wide text-faint mb-1.5">แนวย่อย</p>
                      <div className="flex flex-wrap gap-1.5">
                        {t.sub_genres.map((g) => (
                          <span key={g} className="text-[0.68rem] px-2 py-0.5 rounded-full border border-[#7a5c12]/30 text-[#7a5c12]">{g.replace(/_/g, " ")}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[0.65rem] uppercase tracking-wide text-faint mb-1.5">โครงเรื่อง</p>
                      <div className="flex flex-wrap gap-1.5">
                        {t.structures.map((s) => (
                          <span key={s} className="text-[0.68rem] px-2 py-0.5 rounded-full border border-black/10 text-slate-700">{s.replace(/_/g, " ")}</span>
                        ))}
                      </div>
                    </div>
                    <Link
                      href={`/bookisdom?type=${key}`}
                      className="inline-flex items-center gap-1.5 mt-1 text-sm px-4 py-2 rounded-lg bg-[#d9a63a] text-black font-semibold hover:bg-[#c8901f] transition"
                    >
                      เลือกประเภทนี้เพื่อสร้าง Prompt Pack <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* how it works */}
      <section className="max-w-5xl mx-auto px-5 py-10">
        <h2 className="text-xl font-bold mb-6">Bookisdom ทำงานยังไง (จุดยืน)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {HOW.map((h) => (
            <div key={h.title} className="rounded-2xl border border-black/10 bg-black/[0.015] p-5">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="grid place-items-center w-9 h-9 rounded-lg bg-[#d9a63a]/15 text-[#7a5c12]"><h.icon className="w-5 h-5" /></span>
                <h3 className="font-semibold text-slate-900">{h.title}</h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{h.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* module groups */}
      <section className="max-w-5xl mx-auto px-5 py-10">
        <h2 className="text-xl font-bold mb-1">โมดูลเสริม {MODULE_GROUPS.length} กลุ่ม</h2>
        <p className="text-sm text-faint mb-6">เปิดตามต้องการ — ต่อเข้าไปใน prompt pack</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULE_GROUPS.map((g) => (
            <div key={g.key} className="rounded-xl border border-black/10 bg-black/[0.015] p-4">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#7a5c12] shrink-0" />
                <h3 className="font-medium text-sm text-slate-900">{g.label}</h3>
              </div>
              <p className="text-[0.72rem] text-faint mt-1.5 leading-relaxed">{g.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* footer cta */}
      <section className="max-w-5xl mx-auto px-5 py-14 text-center">
        <h2 className="text-2xl font-bold">พร้อมแต่งหนังสือแล้ว?</h2>
        <p className="mt-2 text-slate-600">เลือกประเภท ปรับแต่ง แล้ว generate prompt pack ได้เลย — ฟรี ไม่ต้องล็อกอิน</p>
        <Link href="/bookisdom" className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#d9a63a] text-black font-semibold hover:bg-[#c8901f] transition">
          เปิด Bookisdom Studio <ArrowRight className="w-4 h-4" />
        </Link>
      </section>
    </main>
  );
}
