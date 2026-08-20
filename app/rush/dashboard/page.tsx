"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "../_toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Crown, BookOpen, FileText, Share2, HardDrive, Type, Plus, RefreshCw, Search,
  LayoutGrid, List, Lock, Globe, Trash2, ArrowRight, Play, Wand2, Sparkles, Loader2, BookDown, CloudOff, Wrench,
} from "lucide-react";
import { BOOK_TYPES, buildEpub, type BookConfig, type BookTypeKey } from "@/lib/rush-engine/engine";
import { splitChapters } from "@/lib/rush-engine/chapters";
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
  novel: "from-indigo-600/40 to-slate-900",
  nonfiction: "from-blue-700/40 to-slate-900",
  howto: "from-amber-600/40 to-slate-900",
  kids: "from-pink-600/40 to-slate-900",
  cookbook: "from-red-700/40 to-slate-900",
  textbook: "from-emerald-700/40 to-slate-900",
  memoir: "from-violet-700/40 to-slate-900",
  poetry: "from-teal-700/40 to-slate-900",
};

type Filter = "all" | "private" | "public";
type Sort = "recent" | "title";
type View = "grid" | "list";

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
// An invalid updatedAt must render as "—", never the string "Invalid Date".
const fmtDate = (iso: string | number) => {
  const d = new Date(iso);
  return isNaN(+d) ? "—" : d.toLocaleDateString("th-TH", { dateStyle: "medium" });
};
const words = (p: Project) => (p.config ? (p.config.chapters || 0) * (p.config.wordsPerChapter || 0) : 0);

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // 503 from the API = the SERVER is not configured (NEXTAUTH_SECRET / DATABASE_URL).
  // A different truth from "network failed" and from "not logged in" — self-hosters
  // need the server's own detail line, not a generic retry card.
  const [setupDetail, setSetupDetail] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [view, setView] = useState<View>("grid");
  const [manuscripts, setManuscripts] = useState<StoredManuscript[]>([]);
  const [plan, setPlan] = useState<string>("free");
  const [upgrading, setUpgrading] = useState(false);

  const isPaid = plan === "pro" || plan === "team";
  async function upgrade() {
    setUpgrading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnTo: "rush" }),
      });
      if (res.ok) {
        const { url } = await res.json();
        if (url) { window.location.href = url; return; }
      } else if (res.status === 501) {
        toast("ระบบบิลยังไม่ได้ตั้งค่า (ต้องใส่ STRIPE_PRICE_ID_PRO) — ดูขั้นตอนใน README", { variant: "error" });
      } else if (res.status === 401) {
        setNeedLogin(true);
      } else {
        toast(`เริ่มการชำระเงินไม่สำเร็จ (HTTP ${res.status}) — ลองใหม่อีกครั้ง`, { variant: "error" });
      }
    } catch {
      // A click that does NOTHING is the worst outcome — say why it failed.
      toast("เชื่อมต่อระบบชำระเงินไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่", { variant: "error" });
    } finally {
      setUpgrading(false);
    }
  }

  // Monotone request counter: if the user hits refresh twice, only the LATEST
  // request may write state. Without this the slower (stale) response wins the
  // race and silently replaces fresher data.
  const loadSeq = useRef(0);
  async function loadProjects() {
    const seq = ++loadSeq.current;
    const hadData = projects.length > 0;
    setLoading(true);
    setLoadError(false);
    setSetupDetail(null);
    const failed = () => {
      // A failed REFRESH must not hide books we already showed the writer. Keep the
      // last good list on screen and say the refresh failed; the full-page error
      // card is only for when we have nothing at all to show.
      if (hadData) toast("รีเฟรชไม่สำเร็จ — แสดงข้อมูลล่าสุดที่โหลดได้ไว้ก่อน", { variant: "error" });
      else setLoadError(true);
    };
    try {
      const res = await fetch("/api/rush/projects");
      if (seq !== loadSeq.current) return; // a newer request owns the state now
      if (res.status === 401) setNeedLogin(true);
      else if (res.status === 503) {
        const body = await res.json().catch(() => ({}));
        if (seq !== loadSeq.current) return;
        setSetupDetail(typeof body.detail === "string" ? body.detail : "เซิร์ฟเวอร์ยังตั้งค่าไม่เสร็จ");
      } else if (res.ok) {
        setNeedLogin(false);
        const data = await res.json();
        if (seq !== loadSeq.current) return;
        setProjects(data.projects ?? []);
        setPlan(data.plan ?? "free");
      } else {
        // A non-OK response is a FAILED LOAD, not an empty shelf.
        failed();
      }
    } catch {
      // Offline / network error. Do NOT fall through to the empty state: rendering
      // "you have no saved books" when we simply could not reach the server tells the
      // writer something false about their own work. Say we could not load, and offer retry.
      if (seq === loadSeq.current) failed();
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
    void listManuscripts().then(setManuscripts);
  }, []);

  async function del(id: string) {
    // Optimistic removal — but a FAILED delete must not leave the book merely hidden.
    // Put it back and say so, rather than letting the user believe it is gone.
    const prev = projects;
    setProjects((p) => p.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/rush/projects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setProjects(prev);
      toast("ลบไม่สำเร็จ — หนังสือยังอยู่ ลองใหม่อีกครั้ง", { variant: "error" });
    }
  }
  const delManuscript = async (id: string) => {
    try {
      await deleteManuscript(id);
      setManuscripts(await listManuscripts());
    } catch {
      toast("ลบต้นฉบับในเครื่องไม่สำเร็จ — ต้นฉบับยังอยู่", { variant: "error" });
    }
  };
  const exportEpub = (m: StoredManuscript) => {
    const chs = splitChapters(m.text).filter((c) => c.body.trim());
    if (!chs.length) {
      // Before: the button did NOTHING on an empty manuscript — no file, no message.
      toast("ต้นฉบับนี้ยังไม่มีเนื้อหาให้ส่งออก — EPUB ต้องมีอย่างน้อยหนึ่งบทที่ไม่ว่าง", { variant: "error" });
      return;
    }
    const bytes = buildEpub({
      title: m.title,
      language: m.lang,
      chapters: chs.map((c) => ({ title: c.title, text: c.body })),
      // The engine has no clock by design; the export handler does. Stamping here keeps
      // buildEpub pure while still shipping a real dcterms:modified (EPUB 3 requires one).
      modified: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    });
    const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "application/epub+zip" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${m.title || "manuscript"}.epub`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const localChars = useMemo(() => manuscripts.reduce((s, m) => s + m.text.length, 0), [manuscripts]);
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
      sort === "title"
        ? a.title.localeCompare(b.title, "th") // pinned collation — order must not depend on the viewer's OS locale
        : (+new Date(b.updatedAt) || 0) - (+new Date(a.updatedAt) || 0)
    );
  }, [projects, query, filter, sort]);

  return (
    <div className="min-h-screen text-slate-200" style={{ background: "#0b0e17" }}>
      {/* Top nav */}
      <nav className="border-b border-white/10 bg-[#0b0e17]/95 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-x-8">
            <Link href="/" className="flex items-center gap-x-3">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#ab5bf7] to-[#7c3aed] flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-[#0b0e17]" />
              </div>
              <div className="text-2xl font-semibold tracking-tight">
                Nara<span className="accent-gradient">Suite</span>
              </div>
            </Link>
            <div className="hidden md:flex items-center gap-x-1 text-sm">
              <NavTab href="/rush/dashboard" icon={<LayoutGrid className="w-4 h-4" />} label="ภาพรวม" active />
              <NavTab href="/rush" icon={<Wand2 className="w-4 h-4" />} label="เครื่องมือ" />
              <NavTab href="/rush/studio" icon={<Play className="w-4 h-4" />} label="Rush Studio" />
              <NavTab href="/rush?tool=thai" icon={<Sparkles className="w-4 h-4" />} label="วิเคราะห์" />
            </div>
          </div>
          <div className="flex items-center gap-x-3">
            <div className="hidden sm:flex items-center gap-x-2 px-3 py-1.5 rounded-2xl bg-emerald-950/50 border border-emerald-900/50 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 font-medium">Rush Engine</span>
              <span className="text-emerald-500/50">•</span>
              <span className="text-emerald-400/80 text-[10px]">deterministic</span>
            </div>
            {isPaid ? (
              <span className="flex items-center gap-x-1.5 px-3 py-1.5 rounded-2xl bg-[#ab5bf7]/15 border border-[#ab5bf7]/40 text-xs font-semibold text-[#ab5bf7]" title="แผนปัจจุบัน">
                <Crown className="w-3.5 h-3.5" /> {plan === "team" ? "Team" : "Pro"}
              </span>
            ) : (
              <button
                onClick={upgrade}
                disabled={upgrading || needLogin}
                className="flex items-center gap-x-1.5 px-3.5 py-1.5 rounded-2xl bg-[#ab5bf7] text-[#0b0e17] text-xs font-semibold hover:bg-[#c084fc] disabled:opacity-50 transition-colors"
                title="อัปเกรดเป็น Pro — cloud sync, version history, saga เต็มระบบ"
              >
                {upgrading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crown className="w-3.5 h-3.5" />}
                อัปเกรด Pro
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-8 pt-8 pb-16">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-y-4 mb-8">
          <div>
            <div className="flex items-center gap-x-3">
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">หนังสือของฉัน</h1>
              <span className="px-3 py-1 text-xs font-mono tracking-wider bg-white/5 border border-white/10 rounded-full text-[#ab5bf7] self-start mt-2">RUSH ENGINE</span>
            </div>
            <p className="text-slate-400 mt-1 text-[15px]">จัดการโปรเจกต์ ต้นฉบับ และเครื่องมือ Rush Engine — ทุกตัวเลขวัดได้จริง</p>
          </div>
          <div className="flex items-center gap-x-3">
            <Link href="/rush" className="flex items-center gap-x-2 px-6 py-3 rounded-3xl bg-[#ab5bf7] text-[#0b0e17] font-semibold text-sm hover:bg-[#c084fc] active:scale-[0.985] transition-all">
              <Plus className="w-4 h-4" /> สร้างหนังสือใหม่
            </Link>
            <button onClick={loadProjects} className="flex items-center justify-center w-11 h-11 rounded-3xl border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white transition-colors" aria-label="รีเฟรชรายการ">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* KPI stats — all real */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <Kpi label="หนังสือทั้งหมด" value={String(stats.count)} icon={<BookOpen className="w-7 h-7" />} tint="text-[#ab5bf7]/30" />
          <Kpi label="คำทั้งหมด (ประเมิน)" value={fmt(stats.words)} icon={<FileText className="w-7 h-7" />} tint="text-sky-400/30" />
          <Kpi label="แชร์สาธารณะ" value={String(stats.shared)} icon={<Share2 className="w-7 h-7" />} tint="text-violet-400/30" />
          <Kpi label="ต้นฉบับ (ในเครื่อง)" value={String(manuscripts.length)} icon={<HardDrive className="w-7 h-7" />} tint="text-emerald-400/30" />
          <Kpi label="ตัวอักษรที่บันทึก" value={fmt(localChars)} icon={<Type className="w-7 h-7" />} tint="text-fuchsia-400/30" />
        </div>

        {/* Quick actions */}
        <div className="mb-8">
          <div className="section-header mb-3 px-1 text-xs uppercase tracking-wider text-faint font-semibold">การดำเนินการด่วน</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <QuickAction href="/rush" icon={<Wand2 className="w-6 h-6" />} title="เครื่องมือ prompt" sub="สร้างชุด prompt แต่งหนังสือคุณภาพสูง" cta="เปิดเครื่องมือ" tone="from-indigo-500/20 to-violet-500/10 text-indigo-400" />
            <QuickAction href="/rush/studio" icon={<Play className="w-6 h-6" />} title="Rush Studio" sub="รัน prompt ด้วย API key ของคุณเอง" cta="เปิด Studio" tone="from-[#ab5bf7]/20 to-[#7c3aed]/10 text-[#ab5bf7]" />
            <QuickAction href="/rush?tool=thai" icon={<Search className="w-6 h-6" />} title="วิเคราะห์ร้อยแก้ว" sub="ตรวจไทย/EN + NIS audit ฟรี ไม่เรียก AI" cta="เริ่มวิเคราะห์" tone="from-emerald-500/20 to-teal-500/10 text-emerald-400" />
          </div>
        </div>

        {/* Projects */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-y-3 mb-4 px-1">
            <div>
              <div className="text-xs uppercase tracking-wider text-faint font-semibold mb-1">โปรเจกต์นิยายและหนังสือ</div>
              <div className="text-xl font-semibold tracking-tight">My Library <span className="text-slate-400 font-normal text-base">({stats.count})</span></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาหนังสือ…" aria-label="ค้นหาหนังสือ" className="w-full bg-white/5 border border-white/10 focus:border-white/30 text-sm placeholder:text-faint rounded-3xl py-2.5 pl-10 pr-4 outline-none" />
                <Search className="w-4 h-4 absolute left-4 top-3 text-faint" />
              </div>
              <div className="flex items-center bg-white/5 border border-white/10 rounded-3xl p-1 text-xs">
                {([["all", "ทั้งหมด"], ["private", "ส่วนตัว"], ["public", "แชร์"]] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={`px-3.5 py-1.5 rounded-[20px] font-medium transition-colors ${filter === k ? "bg-[#ab5bf7] text-[#0b0e17]" : "text-slate-400 hover:text-white"}`}>{label}</button>
                ))}
              </div>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="bg-white/5 border border-white/10 rounded-3xl px-3 py-2 text-xs text-slate-300 outline-none">
                <option value="recent">ใหม่ล่าสุด</option>
                <option value="title">ชื่อ A-Z</option>
              </select>
              <div className="flex items-center border border-white/10 rounded-3xl p-1 text-xs bg-white/5">
                <button onClick={() => setView("grid")} aria-pressed={view === "grid"} className={`px-3 py-1.5 rounded-[20px] flex items-center gap-1.5 ${view === "grid" ? "bg-white/10 text-white" : "text-slate-400"}`} aria-label="มุมมองการ์ด"><LayoutGrid className="w-3.5 h-3.5" /></button>
                <button onClick={() => setView("list")} aria-pressed={view === "list"} className={`px-3 py-1.5 rounded-[20px] flex items-center gap-1.5 ${view === "list" ? "bg-white/10 text-white" : "text-slate-400"}`} aria-label="มุมมองตาราง"><List className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20 text-faint"><Loader2 className="w-5 h-5 animate-spin" /></div>
          )}

          {!loading && needLogin && (
            <div className="glass-card rounded-3xl p-10 text-center">
              <Lock className="w-10 h-10 mx-auto mb-3 text-[#ab5bf7]/40" />
              <p className="text-slate-300">เข้าสู่ระบบเพื่อบันทึกและจัดการหนังสือของคุณ</p>
              <Link href="/login?callbackUrl=/rush/dashboard" className="inline-block mt-4 text-sm text-[#ab5bf7] hover:underline">ไปหน้าเข้าสู่ระบบ →</Link>
              <p className="text-xs text-faint mt-4">หรือ <Link href="/rush" className="text-[#ab5bf7] hover:underline">สร้าง prompt โดยไม่ต้องล็อกอิน</Link> (จะไม่ถูกบันทึก)</p>
            </div>
          )}

          {!loading && !needLogin && setupDetail && (
            <div className="glass-card rounded-3xl p-10 text-center">
              <Wrench className="w-10 h-10 mx-auto mb-3 text-[#ab5bf7]/50" />
              <p className="text-slate-300">เซิร์ฟเวอร์ยังตั้งค่าไม่เสร็จ</p>
              <p className="text-xs text-faint mt-1.5 max-w-md mx-auto">{setupDetail}</p>
              <p className="text-xs text-faint mt-3">
                ถ้าคุณไม่ใช่ผู้ดูแลระบบ: ต้นฉบับในเครื่องยังใช้ได้ตามปกติ และ<Link href="/rush" className="text-[#ab5bf7] hover:underline">เครื่องมือ prompt ทำงานได้โดยไม่ต้องมีเซิร์ฟเวอร์</Link>
              </p>
              <button
                onClick={loadProjects}
                className="inline-flex items-center gap-1.5 mt-4 text-sm px-4 py-2 rounded-lg border border-[#ab5bf7]/40 text-[#ab5bf7] hover:bg-[#ab5bf7]/10 transition"
              >
                <RefreshCw className="w-4 h-4" /> ตรวจอีกครั้ง
              </button>
            </div>
          )}

          {!loading && !needLogin && !setupDetail && loadError && (
            <div className="glass-card rounded-3xl p-10 text-center">
              <CloudOff className="w-10 h-10 mx-auto mb-3 text-rose-400/50" />
              <p className="text-slate-300">โหลดรายการหนังสือไม่สำเร็จ</p>
              <p className="text-xs text-faint mt-1.5">
                นี่<strong>ไม่ได้</strong>แปลว่าคุณไม่มีหนังสือ — แค่ตอนนี้เราติดต่อเซิร์ฟเวอร์ไม่ได้ ต้นฉบับที่เก็บในเครื่องยังอยู่ครบ
              </p>
              <button
                onClick={loadProjects}
                className="inline-flex items-center gap-1.5 mt-4 text-sm px-4 py-2 rounded-lg border border-[#ab5bf7]/40 text-[#ab5bf7] hover:bg-[#ab5bf7]/10 transition"
              >
                <RefreshCw className="w-4 h-4" /> ลองอีกครั้ง
              </button>
            </div>
          )}

          {!loading && !needLogin && !setupDetail && !loadError && projects.length === 0 && (
            <div className="glass-card rounded-3xl p-10 text-center text-faint">
              <BookOpen className="w-10 h-10 mx-auto mb-3 text-[#ab5bf7]/40" />
              <p>ยังไม่มีหนังสือที่บันทึกไว้</p>
              <Link href="/rush" className="inline-flex items-center gap-1 mt-4 text-sm text-[#ab5bf7] hover:underline">เริ่มเล่มแรก <ArrowRight className="w-4 h-4" /></Link>
            </div>
          )}

          {!loading && !needLogin && !loadError && projects.length > 0 && visible.length === 0 && (
            <p className="text-center text-faint text-sm py-12">ไม่พบหนังสือที่ตรงกับการค้นหา</p>
          )}

          {/* Grid */}
          {!loading && !needLogin && view === "grid" && visible.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {visible.map((p) => <ProjectCard key={p.id} p={p} onOpen={() => router.push(`/rush?project=${p.id}`)} onDelete={() => del(p.id)} />)}
            </div>
          )}

          {/* List */}
          {!loading && !needLogin && view === "list" && visible.length > 0 && (
            <div className="glass-card rounded-3xl overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-slate-400">
                    <th className="text-left py-3 px-6 font-normal">ชื่อเรื่อง</th>
                    <th className="text-left py-3 px-4 font-normal">ประเภท</th>
                    <th className="text-right py-3 px-4 font-normal">บท (วางแผน)</th>
                    <th className="text-right py-3 px-4 font-normal">คำ (ประเมิน)</th>
                    <th className="text-right py-3 px-6 font-normal">อัปเดต</th>
                    <th className="w-24" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {visible.map((p) => {
                    const bt = BOOK_TYPES[p.type as BookTypeKey];
                    return (
                      <tr key={p.id} className="hover:bg-white/5">
                        <td className="px-6 py-4 font-medium">{p.title}</td>
                        <td className="px-4 py-4 text-xs text-slate-400">{bt?.label ?? p.type} • {titleCase(p.subGenre)}</td>
                        <td className="px-4 py-4 text-right font-mono text-xs">{p.config?.chapters ?? "—"}</td>
                        <td className="px-4 py-4 text-right font-mono text-xs">{fmt(words(p))}</td>
                        <td className="px-6 py-4 text-right text-xs text-slate-400">{fmtDate(p.updatedAt)}</td>
                        <td className="px-4 py-4 text-right">
                          <button onClick={() => router.push(`/rush?project=${p.id}`)} className="text-[#ab5bf7] text-xs px-3 py-1 rounded-xl border border-white/10 hover:bg-white/5">เปิด</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Local manuscripts + summary */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
          <div className="xl:col-span-3">
            <div className="flex items-center justify-between mb-3 px-1">
              <div>
                <div className="text-xs uppercase tracking-wider text-faint font-semibold">ต้นฉบับที่บันทึก (ในเครื่องนี้)</div>
                <div className="text-sm text-slate-400">เก็บฝั่งเบราว์เซอร์ ไม่ขึ้น server — เปิดได้เฉพาะเครื่องนี้</div>
              </div>
            </div>
            <div className="glass-card rounded-3xl p-1">
              {manuscripts.length === 0 ? (
                <p className="text-center text-faint text-sm py-10">ยังไม่มีต้นฉบับ — บันทึกจาก analyzer หรือ Studio</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr className="text-xs text-faint">
                        <th className="text-left px-5 py-3 font-normal">ชื่อ / บท</th>
                        <th className="px-4 py-3 font-normal text-center">ภาษา</th>
                        <th className="px-4 py-3 font-normal text-right">ตัวอักษร</th>
                        <th className="px-5 py-3 font-normal text-right">วันที่</th>
                        <th className="w-20" />
                      </tr>
                    </thead>
                    <tbody>
                      {manuscripts.map((m) => (
                        <tr key={m.id} className="hover:bg-white/5">
                          <td className="px-5 py-3.5 font-medium truncate max-w-[200px]" title={m.title}>{m.title}</td>
                          <td className="px-4 text-center">
                            <span className={`inline-block text-[10px] px-2 py-px rounded ${m.lang === "th" ? "bg-sky-900/60 text-sky-300" : "bg-violet-900/60 text-violet-300"}`}>{m.lang === "th" ? "ไทย" : "EN"}</span>
                          </td>
                          <td className="px-4 text-right font-mono text-xs text-slate-300">{m.text.length.toLocaleString("th-TH")}</td>
                          <td className="px-5 text-right text-xs text-slate-400">{fmtDate(m.updatedAt)}</td>
                          <td className="px-3 text-right whitespace-nowrap">
                            <button onClick={() => router.push(`/rush?analyze=${m.id}`)} className="text-emerald-400 hover:text-emerald-300 p-1.5" aria-label="Analyze"><Search className="w-4 h-4" /></button>
                            <button onClick={() => exportEpub(m)} className="text-[#ab5bf7] hover:text-[#c084fc] p-1.5" aria-label="Export EPUB" title="ดาวน์โหลด .epub"><BookDown className="w-4 h-4" /></button>
                            <DeleteButton
                              onDelete={() => delManuscript(m.id)}
                              what="ต้นฉบับ"
                              idleClass="text-faint hover:text-red-400 p-1.5"
                              armedClass="text-[10px] font-semibold px-2 py-1 rounded-lg bg-red-950/60 border border-red-500/60 text-red-300 whitespace-nowrap"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Honest summary panel (replaces fabricated "AI Insights") */}
          <div className="xl:col-span-2">
            <div className="text-xs uppercase tracking-wider text-faint font-semibold px-1 mb-3">สรุปการใช้งาน (ในเครื่องนี้)</div>
            <div className="glass-card rounded-3xl p-5 h-full flex flex-col">
              <div className="grid grid-cols-3 gap-3 text-center">
                <Mini value={String(stats.count)} label="หนังสือ" />
                <Mini value={String(manuscripts.length)} label="ต้นฉบับ" />
                <Mini value={fmt(localChars)} label="ตัวอักษร" />
              </div>
              <p className="text-xs text-faint mt-4 leading-relaxed border-t border-white/10 pt-4">
                ตัวเลขทั้งหมดมาจากข้อมูลจริง (โปรเจกต์ที่บันทึก + ต้นฉบับในเบราว์เซอร์) — ไม่มีสถิติประดิษฐ์
              </p>
              <div className="mt-auto pt-4 space-y-2">
                <Link href="/rush/studio" className="w-full py-2.5 text-xs rounded-2xl border border-white/10 hover:bg-white/5 flex items-center justify-center gap-x-2 text-[#ab5bf7] font-medium">
                  เปิด Rush Studio <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <Link href="/rush?tool=thai" className="w-full py-2.5 text-xs rounded-2xl border border-white/10 hover:bg-white/5 flex items-center justify-center gap-x-2 text-emerald-400 font-medium">
                  วิเคราะห์ร้อยแก้ว <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// Deleting is permanent — a server project has no undo endpoint and a local
// manuscript is gone from IndexedDB for good. One slipped click must never be
// enough. First click ARMS the button (it turns red and says so); the second
// click within 4 seconds deletes; doing nothing disarms it again. This keeps
// the flow keyboard-accessible (same button, no dialog) and un-blockable
// (no window.confirm, which an earlier maturity pass removed on purpose).
function DeleteButton({ onDelete, what, idleClass, armedClass }: {
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

function NavTab({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <Link href={href} className={`px-4 py-2 rounded-xl font-medium flex items-center gap-x-2 transition-colors ${active ? "text-[#ab5bf7]" : "text-slate-300 hover:bg-white/5 hover:text-[#ab5bf7]"}`}>
      {icon}<span>{label}</span>
    </Link>
  );
}

function Kpi({ label, value, icon, tint }: { label: string; value: string; icon: React.ReactNode; tint: string }) {
  return (
    <div className="glass-card rounded-3xl p-5 hover:-translate-y-0.5 transition-transform">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-xs text-faint font-medium tracking-wider">{label}</div>
          <div className="text-3xl sm:text-4xl font-semibold text-white mt-1 tabular-nums">{value}</div>
        </div>
        <span className={tint}>{icon}</span>
      </div>
    </div>
  );
}

function QuickAction({ href, icon, title, sub, cta, tone }: { href: string; icon: React.ReactNode; title: string; sub: string; cta: string; tone: string }) {
  return (
    <Link href={href} className="group glass-card rounded-3xl p-5 hover:border-[#ab5bf7]/40 transition-colors flex gap-x-4">
      <div className={`w-11 h-11 flex-shrink-0 rounded-2xl bg-gradient-to-br ${tone} flex items-center justify-center group-hover:scale-110 transition-transform`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-lg tracking-tight">{title}</div>
        <div className="text-sm text-slate-400 mt-0.5">{sub}</div>
        <div className="mt-3 flex items-center text-xs text-[#ab5bf7] font-medium">
          <span>{cta}</span><ArrowRight className="w-3.5 h-3.5 ml-1.5 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </Link>
  );
}

function ProjectCard({ p, onOpen, onDelete }: { p: Project; onOpen: () => void; onDelete: () => void }) {
  const bt = BOOK_TYPES[p.type as BookTypeKey];
  const w = words(p);
  return (
    <div className="glass-card rounded-3xl overflow-hidden flex flex-col hover:-translate-y-1 transition-transform">
      <div className={`h-36 bg-gradient-to-br ${COVER[p.type] ?? "from-slate-800 to-slate-900"} relative flex items-center justify-center`}>
        <span className="text-5xl drop-shadow">{bt?.icon ?? "📘"}</span>
        <span className="absolute top-3 right-3">
          {p.visibility === "public" ? (
            <span className="text-[10px] px-2.5 py-px bg-emerald-900/70 border border-emerald-700 text-emerald-300 rounded-full flex items-center gap-x-1"><Globe className="w-3 h-3" /> แชร์</span>
          ) : (
            <span className="text-[10px] px-2.5 py-px bg-black/60 border border-white/20 text-white rounded-full flex items-center gap-x-1"><Lock className="w-3 h-3" /> ส่วนตัว</span>
          )}
        </span>
      </div>
      <div className="p-5 flex-1 flex flex-col">
        <div className="font-semibold text-[15px] leading-tight">{p.title}</div>
        <div className="text-xs text-slate-400 mt-0.5">{bt?.label ?? p.type} • {titleCase(p.subGenre)}</div>
        <div className="mt-auto pt-4 flex justify-between text-[11px] text-faint">
          <span>{p.config?.chapters ? `${p.config.chapters} บท` : "—"}{w ? ` · ~${fmt(w)} คำ` : ""}</span>
          <span>{fmtDate(p.updatedAt)}</span>
        </div>
        <div className="flex items-center gap-x-2 mt-3 pt-4 border-t border-white/10">
          <button onClick={onOpen} className="flex-1 text-xs py-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 font-medium text-[#ab5bf7] transition-colors">เปิดใน Rush →</button>
          <DeleteButton
            onDelete={onDelete}
            what="หนังสือ"
            idleClass="w-9 h-9 flex items-center justify-center rounded-2xl border border-white/10 hover:bg-red-950/40 hover:text-red-400 text-slate-400"
            armedClass="h-9 px-3 text-xs font-semibold rounded-2xl bg-red-950/60 border border-red-500/60 text-red-300 whitespace-nowrap"
          />
        </div>
      </div>
    </div>
  );
}

function Mini({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold text-white tabular-nums">{value}</div>
      <div className="text-[10px] text-faint -mt-0.5">{label}</div>
    </div>
  );
}
