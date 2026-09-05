"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Crown, Loader2, AlertCircle } from "lucide-react";

interface CompareResult {
  birthday: string;
  score: number;
  kalaiganiScore: number;
  numerologyScore: number;
  violations: string[];
}

function getScoreClass(score: number): string {
  if (score >= 80) return "score-excellent";
  if (score >= 60) return "score-good";
  if (score >= 40) return "score-moderate";
  return "score-caution";
}

export default function ComparePage() {
  const { data: session } = useSession();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CompareResult[]>([]);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResults([]);

    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f5f9]">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Crown className="w-8 h-8 text-[#7a5c12]" />
            <span className="text-xl font-semibold gold-gradient">NaraClear</span>
          </Link>
          <div className="flex gap-6 items-center">
            <Link href="/analyze" className="text-gray-700 hover:text-[#6b5010] transition-colors">วิเคราะห์ชื่อ</Link>
            <Link href="/corporate" className="text-gray-700 hover:text-[#6b5010] transition-colors">องค์กร</Link>
            <Link href="/child" className="text-gray-700 hover:text-[#6b5010] transition-colors">ตั้งชื่อเด็ก</Link>
            <Link href="/rename" className="text-gray-700 hover:text-[#6b5010] transition-colors">เปลี่ยนชื่อ</Link>
            {session ? (
              <Link href="/history" className="text-gray-700 hover:text-[#6b5010] transition-colors">ประวัติ</Link>
            ) : (
              <Link href="/login" className="text-gray-700 hover:text-[#6b5010] transition-colors">เข้าสู่ระบบ</Link>
            )}
          </div>
        </div>
      </nav>

      <div className="pt-28 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-center mb-2 gold-gradient">เปรียบเทียบวันเกิด</h1>
          <p className="text-gray-600 text-center mb-8">วิเคราะห์ชื่อเดียวกันในทุกวันเกิด</p>

          <div className="glass-card rounded-2xl p-8 mb-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">ชื่อ</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-4 py-3 bg-black/[0.03] border border-[#7a5c12]/25 rounded-xl text-[#14161c] placeholder-gray-500 focus:outline-none focus:border-[#7a5c12]/60 transition-colors"
                    placeholder="กรอกชื่อ"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">นามสกุล</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-4 py-3 bg-black/[0.03] border border-[#7a5c12]/25 rounded-xl text-[#14161c] placeholder-gray-500 focus:outline-none focus:border-[#7a5c12]/60 transition-colors"
                    placeholder="กรอกนามสกุล"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-[#d9a63a] text-black font-semibold rounded-xl hover:bg-[#c8901f] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                {loading ? "กำลังเปรียบเทียบ..." : "เปรียบเทียบ"}
              </button>
            </form>

            {error && (
              <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>

          {results.length > 0 && (
            <div className="glass-card rounded-2xl p-8 animate-fadeIn">
              <h2 className="text-xl font-semibold mb-6">ผลลัพธ์การเปรียบเทียบ</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#7a5c12]/25">
                      <th className="text-left py-3 px-4 text-gray-600 font-medium">วันเกิด</th>
                      <th className="text-center py-3 px-4 text-gray-600 font-medium">คะแนนรวม</th>
                      <th className="text-center py-3 px-4 text-gray-600 font-medium">กาลกิณี</th>
                      <th className="text-center py-3 px-4 text-gray-600 font-medium">เลขศาสตร์</th>
                      <th className="text-left py-3 px-4 text-gray-600 font-medium">ตัวต้องห้าม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((item, index) => (
                      <tr key={index} className="border-b border-[#7a5c12]/15 hover:bg-black/[0.04]">
                        <td className="py-4 px-4 font-medium">{item.birthday}</td>
                        <td className={`text-center py-4 px-4 font-bold text-xl ${getScoreClass(item.score)}`}>
                          {item.score}
                        </td>
                        <td className={`text-center py-4 px-4 ${getScoreClass(item.kalaiganiScore)}`}>
                          {item.kalaiganiScore}
                        </td>
                        <td className={`text-center py-4 px-4 ${getScoreClass(item.numerologyScore)}`}>
                          {item.numerologyScore}
                        </td>
                        <td className="py-4 px-4 text-red-700 text-sm">
                          {item.violations.length > 0 ? item.violations.join(", ") : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
