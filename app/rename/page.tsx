"use client";

import { useState } from "react";
import { RefreshCw, AlertTriangle, CheckCircle2, Sparkles, ArrowRight, Users } from "lucide-react";

const DAY_OPTIONS = [
  { value: "sunday", label: "วันอาทิตย์" },
  { value: "monday", label: "วันจันทร์" },
  { value: "tuesday", label: "วันอังคาร" },
  { value: "wednesday_day", label: "วันพุธ (กลางวัน)" },
  { value: "wednesday_night", label: "วันพุธ (กลางคืน)" },
  { value: "thursday", label: "วันพฤหัสบดี" },
  { value: "friday", label: "วันศุกร์" },
  { value: "saturday", label: "วันเสาร์" },
];

const GOAL_OPTIONS = [
  { value: "สุขภาพ", label: "สุขภาพแข็งแรง" },
  { value: "การเรียน", label: "การเรียน/สติปัญญา" },
  { value: "การเงิน", label: "ความมั่นคงการเงิน" },
  { value: "ความสัมพันธ์", label: "ความสัมพันธ์/สังคม" },
  { value: "ภาวะผู้นำ", label: "ภาวะผู้นำ/ความมั่นใจ" },
];

const WARAKKASA_NAMES: Record<string, string> = {
  bari: "บริวาร",
  ayu: "อายุ",
  decha: "เดช",
  si: "ศรี",
  mula: "มูละ",
  utsaha: "อุตสาหะ",
  montri: "มนตรี",
};

export default function RenamePage() {
  const [currentName, setCurrentName] = useState("");
  const [currentSurname, setCurrentSurname] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const toggleGoal = (goal: string) => {
    setSelectedGoals(prev =>
      prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedGoals.length === 0) {
      setError("กรุณาเลือกอย่างน้อย 1 เป้าหมาย");
      return;
    }
    
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentName,
          currentSurname,
          birthDay,
          goals: selectedGoals,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setResult(data);
      } else {
        setError(data.error || "Analysis failed");
      }
    } catch (err) {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08080e] text-white">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#c9a84c]/10 text-[#c9a84c] text-sm mb-4">
            <RefreshCw className="w-4 h-4" />
            <span>Rename Protocol Module</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="text-[#c9a84c]">NaraRename</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            โปรโตคอลเปลี่ยนชื่อเดิมให้มงคลด้วย 7-Step Transformation และ Soft Transition Technique
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          <div className="bg-[#12121a] rounded-2xl p-8 border border-white/5">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-[#c9a84c]" />
              วิเคราะห์เพื่อเปลี่ยนชื่อ
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">ชื่อเดิม</label>
                  <input
                    type="text"
                    value={currentName}
                    onChange={(e) => setCurrentName(e.target.value)}
                    placeholder="เช่น สมชาย"
                    className="w-full px-4 py-3 rounded-lg bg-black/30 border border-white/10 focus:border-[#c9a84c] focus:outline-none transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">นามสกุลเดิม</label>
                  <input
                    type="text"
                    value={currentSurname}
                    onChange={(e) => setCurrentSurname(e.target.value)}
                    placeholder="เช่น ใจดี"
                    className="w-full px-4 py-3 rounded-lg bg-black/30 border border-white/10 focus:border-[#c9a84c] focus:outline-none transition-colors"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">วันเกิด</label>
                <select
                  value={birthDay}
                  onChange={(e) => setBirthDay(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-black/30 border border-white/10 focus:border-[#c9a84c] focus:outline-none transition-colors"
                  required
                >
                  <option value="">เลือกวันเกิด</option>
                  {DAY_OPTIONS.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-3">เป้าหมายการเปลี่ยนชื่อ</label>
                <div className="grid grid-cols-2 gap-3">
                  {GOAL_OPTIONS.map((goal) => (
                    <button
                      key={goal.value}
                      type="button"
                      onClick={() => toggleGoal(goal.value)}
                      className={`p-3 rounded-lg border transition-all text-left ${
                        selectedGoals.includes(goal.value)
                          ? "border-[#c9a84c] bg-[#c9a84c]/10 text-[#c9a84c]"
                          : "border-white/10 hover:border-white/20"
                      }`}
                    >
                      {goal.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-lg bg-gradient-to-r from-[#c9a84c] to-[#a08030] text-black font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? "กำลังวิเคราะห์..." : "วิเคราะห์และแนะนำชื่อใหม่"}
              </button>
            </form>

            {error && (
              <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                {error}
              </div>
            )}
          </div>

          <div className="space-y-6">
            {result && (
              <>
                <div className="bg-[#12121a] rounded-2xl p-8 border border-white/5">
                  <h3 className="text-xl font-bold mb-4">ผลวิเคราะห์ชื่อเดิม</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                      <span className="text-gray-400">คะแนนรวม</span>
                      <span className={`text-2xl font-bold ${
                        result.currentNameAnalysis.totalScore >= 70 ? "text-green-400" :
                        result.currentNameAnalysis.totalScore >= 50 ? "text-yellow-400" :
                        "text-red-400"
                      }`}>
                        {result.currentNameAnalysis.totalScore}/100
                      </span>
                    </div>
                  </div>
                </div>

                {result.problemAreas && result.problemAreas.length > 0 && (
                  <div className="bg-[#12121a] rounded-2xl p-8 border border-yellow-500/20">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-yellow-400">
                      <AlertTriangle className="w-5 h-5" />
                      จุดที่ต้องปรับ
                    </h3>
                    <ul className="space-y-2">
                      {result.problemAreas.map((p: string, i: number) => (
                        <li key={i} className="text-yellow-300 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="bg-[#12121a] rounded-2xl p-8 border border-white/5">
                  <h3 className="text-xl font-bold mb-4">เป้าหมายการเปลี่ยนชื่อ</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg bg-white/5 text-center">
                      <div className="text-sm text-gray-400">เลขเป้าหมาย</div>
                      <div className="text-2xl font-bold text-[#c9a84c]">{result.targetNumber}</div>
                    </div>
                    <div className="p-4 rounded-lg bg-white/5 text-center">
                      <div className="text-sm text-gray-400">อายตนะเป้า</div>
                      <div className="text-2xl font-bold text-[#c9a84c]">{result.targetAyatana}</div>
                    </div>
                    <div className="p-4 rounded-lg bg-white/5 text-center">
                      <div className="text-sm text-gray-400">วรรคเน้น</div>
                      <div className="text-lg font-bold text-[#c9a84c]">{result.recommendedWarakkasa.length}</div>
                    </div>
                  </div>
                </div>

                <div className="bg-[#12121a] rounded-2xl p-8 border border-[#c9a84c]/20">
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <ArrowRight className="w-5 h-5 text-[#c9a84c]" />
                    ชื่อใหม่ที่แนะนำ
                  </h3>
                  <div className="space-y-4">
                    {result.suggestedNewNames.map((name: any, i: number) => (
                      <div key={i} className="p-4 rounded-lg bg-white/5 border border-white/10">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xl font-bold text-[#c9a84c]">
                            {currentName}{name.name}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-sm ${
                            name.score >= 85 ? "bg-green-500/20 text-green-400" :
                            name.score >= 70 ? "bg-yellow-500/20 text-yellow-400" :
                            "bg-red-500/20 text-red-400"
                          }`}>
                            {Math.round(name.score)}%
                          </span>
                        </div>
                        <div className="text-gray-400 text-sm mb-3">{name.meaning}</div>
                        <div className="flex items-center gap-2 text-sm text-[#c9a84c]">
                          <RefreshCw className="w-4 h-4" />
                          {name.transition}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#12121a] rounded-2xl p-8 border border-green-500/20">
                  <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-green-400">
                    <CheckCircle2 className="w-5 h-5" />
                    เทคนิคเปลี่ยนชื่อนุ่มนวล
                  </h3>
                  <ul className="space-y-3">
                    {result.softTransitionTips.map((tip: string, i: number) => (
                      <li key={i} className="flex items-start gap-3 text-green-300">
                        <span className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-sm font-bold shrink-0">
                          {i + 1}
                        </span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {!result && (
              <div className="bg-[#12121a] rounded-2xl p-12 border border-white/5 text-center">
                <RefreshCw className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                <p className="text-gray-400">
                  กรอกข้อมูลชื่อเดิมแล้วกดวิเคราะห์เพื่อดูชื่อใหม่ที่แนะนำ
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-12 p-6 rounded-2xl bg-[#12121a]/50 border border-white/5">
          <div className="flex items-start gap-3 text-yellow-500">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-gray-500 text-sm">
              <strong className="text-yellow-400">ข้อควรระวัง:</strong> การเปลี่ยนชื่อควรทำในช่วงเวลาที่เหมาะสม 
              เช่น ก่อนอายุ 7 ปี หรือช่วงเปลี่ยนระดับชั้นเรียน ควรแจ้งโรงเรียนและหน่วยงานที่เกี่ยวข้องล่วงหน้า
              และไม่ควรเปลี่ยนชื่อบ่อยเกิน 1 ครั้ง/3 ปี
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
