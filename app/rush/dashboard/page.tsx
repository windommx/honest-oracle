"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crown, BookOpen, Plus, Trash2, Share2, Lock, ArrowRight, Loader2, Search } from "lucide-react";
import { BOOK_TYPES, type BookConfig, type BookTypeKey } from "@/lib/rush-engine/engine";
import { titleCase } from "../_utils";
import { listManuscripts, deleteManuscript, type StoredManuscript } from "../_manuscript-store";

type Project = {
  id: string;
  title: string;
  type: string;
  subGenre: string;
  visibility: string;
  updatedAt: string;
  config?: BookConfig;
};

const COVER: Record<string, string> = {
  novel: "from-indigo-500/30 to-purple-600/20",
  nonfiction: "from-blue-500/30 to-cyan-600/20",
  howto: "from-amber-500/30 to-orange-600/20",
  kids: "from-pink-500/30 to-rose-600/20",
  cookbook: "from-red-500/30 to-orange-600/20",
  textbook: "from-emerald-500/30 to-teal-600/20",
  memoir: "from-violet-500/30 to-fuchsia-600/20",
  poetry: "from-teal-500/30 to-emerald-600/20",
};

type Filter = "all" | "private" | "public";
type Sort = "recent" | "title";

function fmtWords(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}
function words(p: Project) {
  return p.config ? (p.config.chapters || 0) * (p.config.wordsPerChapter || 0) : 0;
}

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [manuscripts, setManuscripts] = useState<StoredManuscript[]>([]);

  useEffect(() => setManuscripts(listManuscripts()), []);

  const delManuscript = (id: string) => {
    deleteManuscript(id);
    setManuscripts(listManuscripts());
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/rush/projects");
        if (res.status === 401) setNeedLogin(true);
        else if (res.ok) setProjects((await res.json()).projects ?? []);
      } catch {
        /* offline */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function del(id: string) {
    setProjects((p) => p.filter((x) => x.id !== id));
    try {
      await fetch(`/api/rush/projects/${id}`, { method: "DELETE" });
    } catch {
      /* best-effort */
    }
  }

  const stats = useMemo(() => {
    const shared = projects.filter((p) => p.visibility === "public").length;
    const total = projects.reduce((s, p) => s + words(p), 0);
    return { count: projects.length, shared, words: total };
  }, [projects]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter((p) => {
      if (filter === "private" && p.visibility !== "private") return false;
      if (filter === "public" && p.visibility !== "public") return false;
      if (q && !`${p.title} ${p.subGenre} ${p.type}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return list.sort((a, b) =>
      sort === "title" ? a.title.localeCompare(b.title) : +new Date(b.updatedAt) - +new Date(a.updatedAt)
    );
  }, [projects, query, filter, sort]);

  return (
    <div className="min-h-screen bg-[#08080e]">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Crown className="w-7 h-7 text-[#c9a84c]" />
            <span className="text-lg font-semibold gold-gradient">NaraSuite</span>
          </Link>
          <span className="flex items-center gap-1.5 text-xs text-[#c9a84c] border border-[#c9a84c]/30 rounded-lg px-3 py-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            Rush Engine
          </span>
        </div>
      </nav>

      <div className="pt-24 pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          {/* header */}
          <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
            <div>
              <h1 className="text-3xl font-bold gold-gradient">หนังสือของฉัน</h1>
              <p className="text-gray-400 mt-1 text-sm">จัดการโปรเจกต์นิยายและหนังสือด้วย Rush Engine</p>
            </div>
            <Link href="/rush" className="px-4 py-2.5 bg-[#c9a84c] text-black font-semibold rounded-xl hover:bg-[#d4b96a] transition-colors flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" />
              สร้างหนังสือใหม่
            </Link>
          </div>

          {/* stats row */}
          {!needLogin && (
            <div className="grid grid-cols-3 gap-3 mb-6">
              <StatCard value={String(stats.count)} label="หนังสือทั้งหมด" />
              <StatCard value={String(stats.shared)} label="แชร์แล้ว" />
              <StatCard value={fmtWords(stats.words)} label="คำทั้งหมด (ประเมิน)" />
            </div>
          )}

          {/* search + filter + sort */}
          {!needLogin && (
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ค้นหาหนังสือ — ชื่อเรื่อง หรือแนว…"
                  className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#c9a84c]/50"
                />
              </div>
              <div className="flex gap-1">
                {([["all", "ทั้งหมด"], ["private", "ส่วนตัว"], ["public", "แชร์"]] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setFilter(k)}
                    className={`px-3 py-2 rounded-xl text-xs border transition-colors ${
                      filter === k ? "border-[#c9a84c] text-[#c9a84c] bg-[#c9a84c]/10" : "border-white/10 text-gray-400 hover:border-[#c9a84c]/40"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-gray-300 focus:outline-none focus:border-[#c9a84c]/50"
              >
                <option value="recent">ใหม่ล่าสุด</option>
                <option value="title">ชื่อ A-Z</option>
              </select>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-20 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          {!loading && needLogin && (
            <div className="glass-card rounded-2xl p-10 text-center">
              <Lock className="w-10 h-10 mx-auto mb-3 text-[#c9a84c]/40" />
              <p className="text-gray-300">เข้าสู่ระบบเพื่อบันทึกและจัดการหนังสือของคุณ</p>
              <Link href="/login?callbackUrl=/rush/dashboard" className="inline-block mt-4 text-sm text-[#c9a84c] hover:underline">
                ไปหน้าเข้าสู่ระบบ →
              </Link>
              <p className="text-xs text-gray-600 mt-4">
                หรือ <Link href="/rush" className="text-[#c9a84c] hover:underline">สร้าง prompt โดยไม่ต้องล็อกอิน</Link> (จะไม่ถูกบันทึก)
              </p>
            </div>
          )}

          {!loading && !needLogin && projects.length === 0 && (
            <div className="glass-card rounded-2xl p-10 text-center text-gray-500">
              <BookOpen className="w-10 h-10 mx-auto mb-3 text-[#c9a84c]/40" />
              <p>ยังไม่มีหนังสือที่บันทึกไว้</p>
              <Link href="/rush" className="inline-flex items-center gap-1 mt-4 text-sm text-[#c9a84c] hover:underline">
                เริ่มเล่มแรก <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}

          {!loading && projects.length > 0 && visible.length === 0 && (
            <p className="text-center text-gray-600 text-sm py-12">ไม่พบหนังสือที่ตรงกับการค้นหา</p>
          )}

          {!loading && visible.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visible.map((p) => {
                const bt = BOOK_TYPES[p.type as BookTypeKey];
                const w = words(p);
                return (
                  <div key={p.id} className="glass-card rounded-2xl overflow-hidden border border-white/5 hover:border-[#c9a84c]/40 transition-colors flex flex-col">
                    {/* cover tile */}
                    <div className={`relative h-28 bg-gradient-to-br ${COVER[p.type] ?? "from-gray-700/30 to-gray-800/20"} flex items-center justify-center`}>
                      <span className="text-5xl drop-shadow">{bt?.icon ?? "📘"}</span>
                      <span className="absolute top-2 right-2">
                        {p.visibility === "public" ? (
                          <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-black/40 border border-green-400/40 text-green-400 flex items-center gap-1">
                            <Share2 className="w-3 h-3" /> แชร์
                          </span>
                        ) : (
                          <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-black/40 border border-white/15 text-gray-300 flex items-center gap-1">
                            <Lock className="w-3 h-3" /> ส่วนตัว
                          </span>
                        )}
                      </span>
                    </div>
                    {/* body */}
                    <div className="p-4 flex flex-col flex-1">
                      <h3 className="font-semibold text-gray-100 truncate" title={p.title}>{p.title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{bt?.label ?? p.type} · {titleCase(p.subGenre)}</p>
                      <div className="flex items-center gap-3 mt-2 text-[0.65rem] text-gray-600">
                        {p.config?.chapters ? <span>{p.config.chapters} บท</span> : null}
                        {w ? <span>~{fmtWords(w)} คำ</span> : null}
                        <span>{new Date(p.updatedAt).toLocaleDateString("th-TH", { dateStyle: "medium" })}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                        <button
                          onClick={() => router.push(`/rush?project=${p.id}`)}
                          className="flex-1 py-2 bg-white/5 border border-[#c9a84c]/20 text-[#c9a84c] rounded-lg hover:border-[#c9a84c]/50 transition-colors text-xs flex items-center justify-center gap-1"
                        >
                          เปิด <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => del(p.id)} className="p-2 text-gray-600 hover:text-red-400 transition-colors" aria-label="Delete" title="ลบ">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {manuscripts.length > 0 && (
            <div className="mt-10">
              <h2 className="text-lg font-semibold text-gray-200 mb-1">ต้นฉบับที่บันทึก (ในเครื่องนี้)</h2>
              <p className="text-xs text-gray-500 mb-4">เก็บฝั่งเบราว์เซอร์ ไม่ขึ้น server — เปิดในเครื่อง/บราวเซอร์เดิมเท่านั้น</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {manuscripts.map((m) => (
                  <div key={m.id} className="glass-card rounded-xl p-4 border border-white/5 hover:border-[#c9a84c]/40 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium text-gray-100 truncate text-sm" title={m.title}>{m.title}</h3>
                      <span className="text-[0.6rem] px-1.5 py-0.5 rounded border border-white/15 text-gray-300 shrink-0">
                        {m.lang === "th" ? "ไทย" : "EN"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[0.65rem] text-gray-600">
                      <span>{m.text.length.toLocaleString()} ตัวอักษร</span>
                      <span>{new Date(m.updatedAt).toLocaleDateString("th-TH", { dateStyle: "medium" })}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                      <button
                        onClick={() => router.push(`/rush?analyze=${m.id}`)}
                        className="flex-1 py-1.5 bg-white/5 border border-[#c9a84c]/20 text-[#c9a84c] rounded-lg hover:border-[#c9a84c]/50 transition-colors text-xs flex items-center justify-center gap-1"
                      >
                        วิเคราะห์ <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => delManuscript(m.id)} className="p-1.5 text-gray-600 hover:text-red-400 transition-colors" aria-label="Delete manuscript" title="ลบ">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="glass-card rounded-2xl p-4 border border-white/5">
      <div className="text-2xl font-bold text-[#c9a84c]">{value}</div>
      <div className="text-[0.7rem] text-gray-500 mt-1">{label}</div>
    </div>
  );
}
