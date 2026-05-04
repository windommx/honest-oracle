"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Crown, Loader2, AlertCircle } from "lucide-react";

const DAYS = [
  { label: "อาทิตย์", value: "อาทิตย์" },
  { label: "จันทร์", value: "จันทร์" },
  { label: "อังคาร", value: "อังคาร" },
  { label: "พุธกลางวัน", value: "พุธกลางวัน" },
  { label: "พุธกลางคืน", value: "พุธกลางคืน" },
  { label: "พฤหัสบดี", value: "พฤหัสบดี" },
  { label: "ศุกร์", value: "ศุกร์" },
  { label: "เสาร์", value: "เสาร์" },
];

interface AnalysisResult {
  totalScore: number;
  kalaiganiScore: number;
  numerologyScore: number;
  taksaScore: number;
  phoneticScore: number;
  elementScore: number;
  details: {
    kalaigani: { violations: string[]; forbiddenLetters: string[] };
    numerology: { totalStrokes: number; isLucky: boolean };
    taksa: { covered: string[]; missing: string[] };
    phonetic: { syllables: number; vowelComplexity: number; length: number };
    element: { elements: string[]; hasConflict: boolean };
  };
}

function getScoreClass(score: number): string {
  if (score >= 80) return "score-excellent";
  if (score >= 60) return "score-good";
  if (score >= 40) return "score-moderate";
  if (score >= 20) return "score-caution";
  return "score-poor";
}

export default function AnalyzePage() {
  const { data: session } = useSession();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, birthday }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
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
            <Link href="/analyze" className="text-[#c9a84c]">วิเคราะห์ชื่อ</Link>
            <Link href="/corporate" className="text-gray-300 hover:text-[#c9a84c] transition-colors">องค์กร</Link>
            <Link href="/child" className="text-gray-300 hover:text-[#c9a84c] transition-colors">ตั้งชื่อเด็ก</Link>
            <Link href="/rename" className="text-gray-300 hover:text-[#c9a84c] transition-colors">เปลี่ยนชื่อ</Link>
            {session ? (
              <Link href="/history" className="text-gray-300 hover:text-[#c9a84c] transition-colors">ประวัติ</Link>
            ) : (
              <Link href="/login" className="text-gray-300 hover:text-[#c9a84c] transition-colors">เข้าสู่ระบบ</Link>
            )}
          </div>
        </div>
      </nav>

      <div className="pt-28 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-center mb-2 gold-gradient">วิเคราะห์ชื่อมงคลไทย</h1>
          <p className="text-gray-400 text-center mb-8">กรอกข้อมูลเพื่อวิเคราะห์ชื่อของคุณ</p>

          <div className="glass-card rounded-2xl p-8 mb-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">ชื่อ</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-gold/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-gold/50 transition-colors"
                    placeholder="กรอกชื่อ"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">นามสกุล</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-gold/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-gold/50 transition-colors"
                    placeholder="กรอกนามสกุล"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">วันเกิด</label>
                <select
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-gold/20 rounded-xl text-white focus:outline-none focus:border-gold/50 transition-colors"
                  required
                >
                  <option value="" className="bg-[#08080e]">เลือกวันเกิด</option>
                  {DAYS.map((day) => (
                    <option key={day.value} value={day.value} className="bg-[#08080e]">
                      {day.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-gold text-black font-semibold rounded-xl hover:bg-gold-light transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                {loading ? "กำลังวิเคราะห์..." : "วิเคราะห์ชื่อ"}
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
              <div className="text-center mb-8">
                <p className="text-gray-400 mb-2">คะแนนรวม</p>
                <p className={`text-6xl font-bold ${getScoreClass(result.totalScore)}`}>
                  {result.totalScore}
                </p>
                <p className="text-gray-500 text-sm mt-1">จาก 100</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                {[
                  { label: "กาลกิณี", score: result.kalaiganiScore, badge: "Traditional" },
                  { label: "เลขศาสตร์", score: result.numerologyScore, badge: "Traditional" },
                  { label: "วรรคทักษา", score: result.taksaScore, badge: "Traditional" },
                  { label: "สัทศาสตร์", score: result.phoneticScore, badge: "Framework" },
                  { label: "ธาตุ", score: result.elementScore, badge: "Traditional" },
                ].map(({ label, score, badge }) => (
                  <div key={label} className="text-center p-4 bg-white/5 rounded-xl">
                    <p className="text-xs text-gray-500 mb-1">{badge}</p>
                    <p className={`text-2xl font-bold ${getScoreClass(score)}`}>{score}</p>
                    <p className="text-sm text-gray-400 mt-1">{label}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-6">
                <div className="p-4 bg-white/5 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-1 bg-gold/20 text-gold text-xs rounded">Traditional</span>
                    <h3 className="font-semibold">กาลกิณี</h3>
                  </div>
                  <p className="text-gray-400 text-sm">
                    {result.details.kalaigani.violations.length === 0 ? (
                      <span className="text-green-400">✓ ไม่มีตัวอักษรต้องห้าม</span>
                    ) : (
                      <span className="text-red-400">
                        พบตัวอักษรต้องห้าม: {result.details.kalaigani.violations.join(", ")}
                      </span>
                    )}
                  </p>
                </div>

                <div className="p-4 bg-white/5 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-1 bg-gold/20 text-gold text-xs rounded">Traditional</span>
                    <h3 className="font-semibold">เลขศาสตร์</h3>
                  </div>
                  <p className="text-gray-400 text-sm">
                    เลขที่ได้: <span className="text-gold font-semibold">{result.details.numerology.totalStrokes}</span>
                    {result.details.numerology.isLucky && (
                      <span className="text-green-400 ml-2">✓ เป็นเลขมงคล</span>
                    )}
                  </p>
                </div>

                <div className="p-4 bg-white/5 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-1 bg-gold/20 text-gold text-xs rounded">Traditional</span>
                    <h3 className="font-semibold">วรรคทักษา</h3>
                  </div>
                  <p className="text-gray-400 text-sm">
                    ครอบคลุม: {result.details.taksa.covered.join(", ") || "ไม่มี"}
                  </p>
                  {result.details.taksa.missing.length > 0 && (
                    <p className="text-gray-500 text-sm mt-1">
                      ขาด: {result.details.taksa.missing.join(", ")}
                    </p>
                  )}
                </div>

                <div className="p-4 bg-white/5 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">Framework</span>
                    <h3 className="font-semibold">สัทศาสตร์</h3>
                  </div>
                  <p className="text-gray-400 text-sm">
                    พยางค์: {result.details.phonetic.syllables}, ความยาว: {result.details.phonetic.length}
                  </p>
                </div>

                <div className="p-4 bg-white/5 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-1 bg-gold/20 text-gold text-xs rounded">Traditional</span>
                    <h3 className="font-semibold">ธาตุ</h3>
                  </div>
                  <p className="text-gray-400 text-sm">
                    ธาตุ: {result.details.element.elements.join(", ") || "ไม่มี"}
                    {result.details.element.hasConflict && (
                      <span className="text-red-400 ml-2">⚠ ธาตุไฟและน้ำขัดกัน</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-8 p-4 bg-gold/10 rounded-xl border border-gold/20">
                <p className="text-gray-400 text-sm text-center">
                  <span className="text-gold font-semibold">หมายเหตุ:</span> ระบบวิเคราะห์ชื่อนี้ใช้หลักโหราศาสตร์ไทยแบบดั้งเดิม
                  เป็นเครื่องมือช่วยประกอบการตัดสินใจเท่านั้น ไม่สามารถทำนายชะตาชีวิตได้อย่างแท้จริง
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
