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

interface GeneratedName {
  name: string;
  score: number;
  passesKalaigani: boolean;
  numerology: number;
  isTargetNumber: boolean;
}

function getScoreClass(score: number): string {
  if (score >= 80) return "score-excellent";
  if (score >= 60) return "score-good";
  if (score >= 40) return "score-moderate";
  return "score-caution";
}

export default function GeneratePage() {
  const { data: session } = useSession();
  const [pool, setPool] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [targetNumber, setTargetNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GeneratedName[]>([]);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResults([]);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool, lastName, birthday, targetNumber: targetNumber ? parseInt(targetNumber) : null }),
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
    <div className="min-h-screen">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Crown className="w-8 h-8 text-[#1d4ed8]" />
            <span className="text-xl font-semibold gold-gradient">NaraClear</span>
          </Link>
          <div className="flex gap-6 items-center">
            <Link href="/analyze" className="text-gray-700 hover:text-[#1e40af] transition-colors">วิเคราะห์ชื่อ</Link>
            <Link href="/corporate" className="text-gray-700 hover:text-[#1e40af] transition-colors">องค์กร</Link>
            <Link href="/child" className="text-gray-700 hover:text-[#1e40af] transition-colors">ตั้งชื่อเด็ก</Link>
            <Link href="/rename" className="text-gray-700 hover:text-[#1e40af] transition-colors">เปลี่ยนชื่อ</Link>
            {session ? (
              <Link href="/history" className="text-gray-700 hover:text-[#1e40af] transition-colors">ประวัติ</Link>
            ) : (
              <Link href="/login" className="text-gray-700 hover:text-[#1e40af] transition-colors">เข้าสู่ระบบ</Link>
            )}
          </div>
        </div>
      </nav>

      <div className="pt-28 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-center mb-2 gold-gradient">สร้างชื่อมงคล</h1>
          <p className="text-gray-600 text-center mb-8">กรอกคำที่ต้องการ ระบบจะสร้างชื่อที่เหมาะกับคุณ</p>

          <div className="glass-card rounded-2xl p-8 mb-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">คำที่ต้องการ (คั่นด้วยเครื่องหมาย ,)</label>
                <input
                  type="text"
                  value={pool}
                  onChange={(e) => setPool(e.target.value)}
                  className="w-full px-4 py-3 bg-black/[0.03] border border-[#1d4ed8]/25 rounded-xl text-[#111827] placeholder-gray-500 focus:outline-none focus:border-[#1d4ed8]/60 transition-colors"
                  placeholder="เช่น สมชาย, สมหญิง, วิชัย"
                  required
                />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">นามสกุล</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-4 py-3 bg-black/[0.03] border border-[#1d4ed8]/25 rounded-xl text-[#111827] placeholder-gray-500 focus:outline-none focus:border-[#1d4ed8]/60 transition-colors"
                    placeholder="กรอกนามสกุล"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">วันเกิด</label>
                  <select
                    value={birthday}
                    onChange={(e) => setBirthday(e.target.value)}
                    className="w-full px-4 py-3 bg-black/[0.03] border border-[#1d4ed8]/25 rounded-xl text-[#111827] focus:outline-none focus:border-[#1d4ed8]/60 transition-colors"
                    required
                  >
                    <option value="" className="bg-[#f8f8f8]">เลือกวันเกิด</option>
                    {DAYS.map((day) => (
                      <option key={day.value} value={day.value} className="bg-[#f8f8f8]">
                        {day.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">เลขเป้าหมาย (ไม่บังคับ)</label>
                <input
                  type="number"
                  value={targetNumber}
                  onChange={(e) => setTargetNumber(e.target.value)}
                  className="w-full px-4 py-3 bg-black/[0.03] border border-[#1d4ed8]/25 rounded-xl text-[#111827] placeholder-gray-500 focus:outline-none focus:border-[#1d4ed8]/60 transition-colors"
                  placeholder="เช่น 1, 2, 3, 5, 6 หรือ 9"
                  min="1"
                  max="9"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-[#3c74d4] text-white font-semibold rounded-xl hover:bg-[#3366bf] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                {loading ? "กำลังสร้างชื่อ..." : "สร้างชื่อ"}
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
              <h2 className="text-xl font-semibold mb-6">ผลลัพธ์ ({results.length} ชื่อ)</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#1d4ed8]/25">
                      <th className="text-left py-3 px-4 text-gray-600 font-medium">ชื่อ</th>
                      <th className="text-center py-3 px-4 text-gray-600 font-medium">คะแนน</th>
                      <th className="text-center py-3 px-4 text-gray-600 font-medium">กาลกิณี</th>
                      <th className="text-center py-3 px-4 text-gray-600 font-medium">เลข</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((item, index) => (
                      <tr key={index} className="border-b border-[#1d4ed8]/15 hover:bg-black/[0.04]">
                        <td className="py-4 px-4 font-medium">{item.name}</td>
                        <td className={`text-center py-4 px-4 font-bold ${getScoreClass(item.score)}`}>
                          {item.score}
                        </td>
                        <td className="text-center py-4 px-4">
                          {item.passesKalaigani ? (
                            <span className="text-green-800">✓</span>
                          ) : (
                            <span className="text-red-700">✗</span>
                          )}
                        </td>
                        <td className="text-center py-4 px-4">
                          {item.isTargetNumber && <span className="text-[#1d4ed8]">★</span>}
                          {item.numerology}
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
