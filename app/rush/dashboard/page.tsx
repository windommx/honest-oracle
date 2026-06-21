"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crown, BookOpen, Plus, Trash2, Share2, Lock, ArrowRight, Loader2 } from "lucide-react";
import { BOOK_TYPES, type BookTypeKey } from "@/lib/rush-engine/engine";
import { titleCase } from "../_utils";

type Project = {
  id: string;
  title: string;
  type: string;
  subGenre: string;
  visibility: string;
  updatedAt: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/rush/projects");
        if (res.status === 401) {
          setNeedLogin(true);
        } else if (res.ok) {
          setProjects((await res.json()).projects ?? []);
        }
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

  return (
    <div className="min-h-screen bg-[#08080e]">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Crown className="w-7 h-7 text-[#c9a84c]" />
            <span className="text-lg font-semibold gold-gradient">NaraSuite</span>
          </Link>
          <span className="flex items-center gap-2 text-sm text-gray-300">
            <BookOpen className="w-4 h-4 text-[#c9a84c]" />
            Rush Engine
          </span>
        </div>
      </nav>

      <div className="pt-24 pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between flex-wrap gap-3 mb-8">
            <div>
              <h1 className="text-3xl font-bold gold-gradient">หนังสือของฉัน</h1>
              <p className="text-gray-400 mt-1 text-sm">
                {projects.length > 0 ? `${projects.length} โปรเจกต์` : "เริ่มสร้างชุด prompt สำหรับหนังสือเล่มแรกของคุณ"}
              </p>
            </div>
            <Link href="/rush" className="px-4 py-2.5 bg-[#c9a84c] text-black font-semibold rounded-xl hover:bg-[#d4b96a] transition-colors flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" />
              สร้างหนังสือใหม่
            </Link>
          </div>

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

          {!loading && projects.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((p) => {
                const bt = BOOK_TYPES[p.type as BookTypeKey];
                return (
                  <div key={p.id} className="glass-card rounded-2xl p-5 border border-white/5 hover:border-[#c9a84c]/40 transition-colors flex flex-col">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-3xl">{bt?.icon ?? "📘"}</span>
                      {p.visibility === "public" ? (
                        <span className="text-[0.6rem] px-1.5 py-0.5 rounded border border-green-400/40 text-green-400 flex items-center gap-1">
                          <Share2 className="w-3 h-3" /> แชร์
                        </span>
                      ) : (
                        <span className="text-[0.6rem] px-1.5 py-0.5 rounded border border-white/10 text-gray-500 flex items-center gap-1">
                          <Lock className="w-3 h-3" /> ส่วนตัว
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-100 truncate" title={p.title}>{p.title}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {bt?.label ?? p.type} · {titleCase(p.subGenre)}
                    </p>
                    <p className="text-[0.65rem] text-gray-600 mt-1">
                      แก้ไขล่าสุด {new Date(p.updatedAt).toLocaleDateString("th-TH", { dateStyle: "medium" })}
                    </p>
                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
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
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
