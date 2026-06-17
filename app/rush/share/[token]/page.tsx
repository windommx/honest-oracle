"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import { Crown, BookOpen, Copy, Check, ChevronDown, AlertCircle } from "lucide-react";
import { generateAllPrompts, defaultGroupsFor, type BookConfig, type GeneratedPrompt } from "@/lib/rush-engine/engine";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [title, setTitle] = useState("");
  const [prompts, setPrompts] = useState<GeneratedPrompt[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/public/rush/${token}`);
        if (!res.ok) throw new Error("ไม่พบ prompt pack นี้ หรือเจ้าของยังไม่เปิดสาธารณะ");
        const { project } = await res.json();
        const cfg = project.config as BookConfig;
        setTitle(project.title);
        const pack = generateAllPrompts(cfg, defaultGroupsFor(cfg.type));
        setPrompts(pack);
        setOpenId(pack[0]?.id ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function copyPrompt(p: GeneratedPrompt) {
    await copyText(p.prompt);
    setCopiedId(p.id);
    setTimeout(() => setCopiedId((c) => (c === p.id ? null : c)), 1500);
  }

  return (
    <div className="min-h-screen bg-[#08080e]">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Crown className="w-7 h-7 text-[#c9a84c]" />
            <span className="text-lg font-semibold gold-gradient">NaraSuite</span>
          </Link>
          <span className="flex items-center gap-2 text-sm text-gray-300">
            <BookOpen className="w-4 h-4 text-[#c9a84c]" />
            Rush Engine · แชร์
          </span>
        </div>
      </nav>

      <div className="pt-24 pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          {loading && <p className="text-gray-500 text-center">กำลังโหลด…</p>}
          {error && (
            <div className="glass-card rounded-2xl p-6 flex items-start gap-2 text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {!loading && !error && (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold gold-gradient">{title}</h1>
                <p className="text-gray-500 text-sm mt-1">ชุด prompt แบบอ่านอย่างเดียว ({prompts.length} prompts)</p>
              </div>
              <div className="space-y-3">
                {prompts.map((p) => {
                  const open = openId === p.id;
                  return (
                    <div key={p.id} className="glass-card rounded-2xl overflow-hidden border border-white/5">
                      <div className="flex items-center justify-between gap-3 px-5 py-3">
                        <button onClick={() => setOpenId(open ? null : p.id)} aria-expanded={open} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
                          <span className="text-sm font-semibold text-gray-100 whitespace-nowrap">{p.id}</span>
                          <span className="text-xs text-gray-500 truncate">{p.name}</span>
                        </button>
                        <button onClick={() => copyPrompt(p)} className="text-gray-400 hover:text-[#c9a84c]" aria-label={`Copy ${p.id}`}>
                          {copiedId === p.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      {open && (
                        <div className="px-5 pb-5">
                          <pre className="bg-[#08080e] border border-white/5 rounded-lg p-4 text-xs leading-6 text-gray-300 whitespace-pre-wrap max-h-[480px] overflow-y-auto">
                            {p.prompt}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-8 text-center">
                <Link href="/rush" className="text-xs text-[#c9a84c] hover:underline">
                  สร้าง prompt pack ของคุณเองด้วย Rush Engine →
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
