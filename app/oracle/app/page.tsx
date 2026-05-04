"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Crown,
  Loader2,
  AlertCircle,
  Share2,
  History,
  KeyRound,
} from "lucide-react";
import type { OracleResult } from "@/lib/honest-oracle/types";

type ApiResponse = {
  reading: { id: string; shareToken: string; createdAt: string; result: OracleResult };
};

function scoreColor(score: number) {
  if (score >= 70) return "text-green-400";
  if (score >= 45) return "text-yellow-400";
  return "text-red-400";
}

function Graph({ points }: { points: number[] }) {
  const { poly } = useMemo(() => {
    const w = 1000;
    const h = 200;
    const pad = 10;
    const xs = points.map((_, i) => (i / (points.length - 1)) * (w - 2 * pad) + pad);
    const ys = points.map((p) => {
      const t = p / 100;
      return (1 - t) * (h - 2 * pad) + pad;
    });
    const poly = xs.map((x, i) => `${x.toFixed(2)},${ys[i]!.toFixed(2)}`).join(" ");
    return { poly };
  }, [points]);

  return (
    <div className="mt-4 overflow-x-auto border border-gold/20 rounded-xl bg-black/20">
      <svg viewBox="0 0 1000 200" className="min-w-[900px] h-[220px] block">
        <polyline
          fill="none"
          stroke="rgba(201,168,76,0.9)"
          strokeWidth="2.5"
          points={poly}
        />
      </svg>
    </div>
  );
}

export default function OracleAppPage() {
  const { data: session } = useSession();
  const [inputName, setInputName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OracleResult | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [error, setError] = useState("");

  const shareUrl = shareToken ? `/oracle/share/${shareToken}` : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    setReadingId(null);
    setShareToken(null);
    setVisibility("private");

    try {
      const iso = birthDate ? new Date(`${birthDate}T00:00:00.000Z`).toISOString() : "";
      const res = await fetch("/api/oracle/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputName,
          birthDate: iso,
          birthTime: birthTime || null,
          birthPlace: birthPlace || null,
        }),
      });
      const data = (await res.json()) as Partial<ApiResponse> & { error?: string };
      if (!res.ok || !data.reading) {
        throw new Error(data.error || "Something went wrong");
      }
      setResult(data.reading.result);
      setReadingId(data.reading.id);
      setShareToken(data.reading.shareToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const toggleShare = async () => {
    if (!readingId) return;
    const next = visibility === "private" ? "public" : "private";
    const res = await fetch(`/api/oracle/readings/${readingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: next }),
    });
    if (res.ok) setVisibility(next);
  };

  return (
    <div className="min-h-screen bg-[#08080e]">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Crown className="w-8 h-8 text-[#c9a84c]" />
            <span className="text-xl font-semibold gold-gradient">NaraSuite</span>
          </Link>
          <div className="flex gap-6 items-center">
            <Link href="/oracle" className="text-gray-300 hover:text-[#c9a84c] transition-colors">
              Honest Oracle
            </Link>
            <Link
              href="/oracle/history"
              className="text-gray-300 hover:text-[#c9a84c] transition-colors flex items-center gap-2"
            >
              <History className="w-4 h-4" />
              ประวัติ
            </Link>
            <Link
              href="/oracle/api-keys"
              className="text-gray-300 hover:text-[#c9a84c] transition-colors flex items-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              API Keys
            </Link>
          </div>
        </div>
      </nav>

      <div className="pt-28 pb-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold gold-gradient">แผนที่ชีวิต 100 ปี</h1>
            <p className="text-gray-400 mt-2">
              ใส่ข้อมูลเพื่อสร้างผลลัพธ์แบบ deterministic และเก็บประวัติในบัญชีของคุณ
            </p>
          </div>

          {!session && (
            <div className="mb-6 p-4 bg-gold/10 rounded-xl border border-gold/20 text-center text-sm text-gray-300">
              ต้องเข้าสู่ระบบก่อนใช้งาน{" "}
              <Link href="/login?callbackUrl=/oracle/app" className="text-gold font-semibold">
                ไปหน้าเข้าสู่ระบบ
              </Link>
            </div>
          )}

          <div className="glass-card rounded-2xl p-8 mb-8">
            <form onSubmit={submit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    ชื่อที่ใช้ในผลลัพธ์
                  </label>
                  <input
                    type="text"
                    value={inputName}
                    onChange={(e) => setInputName(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-gold/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-gold/50 transition-colors"
                    placeholder="เช่น Nara"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    วันเกิด
                  </label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-gold/20 rounded-xl text-white focus:outline-none focus:border-gold/50 transition-colors"
                    required
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    เวลาเกิด (ไม่บังคับ)
                  </label>
                  <input
                    type="time"
                    value={birthTime}
                    onChange={(e) => setBirthTime(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-gold/20 rounded-xl text-white focus:outline-none focus:border-gold/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    สถานที่เกิด (ไม่บังคับ)
                  </label>
                  <input
                    type="text"
                    value={birthPlace}
                    onChange={(e) => setBirthPlace(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-gold/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-gold/50 transition-colors"
                    placeholder="เช่น Bangkok"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !session}
                className="w-full py-4 bg-gold text-black font-semibold rounded-xl hover:bg-gold-light transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                {loading ? "กำลังสร้างแผนที่..." : "สร้างแผนที่ชีวิต"}
              </button>
            </form>

            {error && (
              <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-400">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>

          {result && (
            <div className="glass-card rounded-2xl p-8 animate-fadeIn">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                  <p className="text-gray-400 text-sm">คะแนนภาพรวม</p>
                  <p className={`text-5xl font-bold ${scoreColor(result.summary.overallScore)}`}>
                    {result.summary.overallScore}
                  </p>
                  <p className="text-gray-500 text-sm mt-1">{result.summary.headline}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={toggleShare}
                    className="px-4 py-2 bg-white/5 border border-gold/20 text-white rounded-xl hover:border-gold/40 transition-colors flex items-center gap-2"
                    disabled={!readingId}
                  >
                    <Share2 className="w-4 h-4" />
                    {visibility === "private" ? "ตั้งเป็นสาธารณะ" : "ตั้งเป็นส่วนตัว"}
                  </button>
                  {visibility === "public" && shareUrl && (
                    <a
                      href={shareUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 bg-gold text-black font-semibold rounded-xl hover:bg-gold-light transition-colors"
                    >
                      เปิดลิงก์แชร์
                    </a>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-5 bg-white/5 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                      Framework
                    </span>
                    <h3 className="font-semibold">Elements</h3>
                  </div>
                  {(["fire", "earth", "air", "water"] as const).map((k) => (
                    <div key={k} className="mb-2">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span className="uppercase">{k}</span>
                        <span>{result.elements[k]}%</span>
                      </div>
                      <div className="h-2 bg-black/30 rounded">
                        <div
                          className="h-2 rounded bg-gold/70"
                          style={{ width: `${result.elements[k]}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-5 bg-white/5 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                      Framework
                    </span>
                    <h3 className="font-semibold">Houses</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {result.houses.slice(0, 12).map((h) => (
                      <div key={h.house} className="p-3 bg-black/20 rounded-lg">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-500">House {h.house}</p>
                          <p className={`text-sm font-semibold ${scoreColor(h.score)}`}>{h.score}</p>
                        </div>
                        <p className="text-sm text-gray-300 mt-1">{h.title}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8 p-5 bg-white/5 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                    Framework
                  </span>
                  <h3 className="font-semibold">Life Graph</h3>
                </div>
                <Graph points={result.graph.points} />
                <p className="text-gray-500 text-xs mt-3 text-center">
                  จุดข้อมูล = อายุ 0–99 (100 จุด)
                </p>
              </div>

              <div className="mt-8 p-5 bg-white/5 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                    Framework
                  </span>
                  <h3 className="font-semibold">Timeline (ตัวอย่าง)</h3>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {result.timeline.slice(0, 12).map((t) => (
                    <div
                      key={t.age}
                      className="p-4 bg-black/20 rounded-lg border border-white/5"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500">Age {t.age}</p>
                        <p className={`text-sm font-semibold ${scoreColor(t.score)}`}>{t.score}</p>
                      </div>
                      <p className="text-gray-200 mt-1">{t.title}</p>
                      <p className="text-gray-400 text-sm mt-1">{t.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              {result.personalizedReport && (
                <div className="mt-8 p-5 bg-white/5 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-1 bg-gold/20 text-gold text-xs rounded">
                      Personalized
                    </span>
                    <h3 className="font-semibold">รายงานเฉพาะบุคคล</h3>
                  </div>
                  <p className="text-xs text-gray-500 mb-4">
                    Signature: {result.personalizedReport.signature}
                  </p>

                  <div className="space-y-4">
                    {result.personalizedReport.topics.map((topic) => (
                      <div key={topic.key} className="p-4 bg-black/20 rounded-lg border border-white/5">
                        <p className="text-white/90 font-semibold mb-2">{topic.title}</p>
                        <div className="max-h-[420px] overflow-auto pr-2">
                          <div className="space-y-2">
                            {topic.lines.map((line, idx) => (
                              <p key={`${topic.key}-${idx}`} className="text-sm text-gray-300 leading-6">
                                {line}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}

                    <div className="p-4 bg-black/20 rounded-lg border border-gold/30">
                      <p className="text-gold font-semibold mb-2">
                        {result.personalizedReport.actionPlan.title}
                      </p>
                      <div className="max-h-[460px] overflow-auto pr-2">
                        <div className="space-y-2">
                          {result.personalizedReport.actionPlan.lines.map((line, idx) => (
                            <p key={`action-${idx}`} className="text-sm text-gray-300 leading-6">
                              {line}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-8 p-4 bg-gold/10 rounded-xl border border-gold/20">
                <p className="text-gray-300 text-sm text-center">
                  <span className="text-gold font-semibold">Transparency note:</span>{" "}
                  {result.summary.note}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
