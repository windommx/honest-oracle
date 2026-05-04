"use client";

import { useState } from "react";
import { Baby, Heart, Sparkles, AlertTriangle, CheckCircle2, Users } from "lucide-react";

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
  bari: "บริวาร (ลูกค้า, พันธมิตร)",
  ayu: "อายุ (ความยั่งยืน, ระบบ)",
  decha: "เดช (อำนาจตัดสินใจ, นวัตกรรม)",
  si: "ศรี (เสน่ห์, การยอมรับ)",
  mula: "มูละ (ทรัพย์สิน, ความมั่นคง)",
  utsaha: "อุตสาหะ (ความพยายาม, R&D)",
  montri: "มนตรี (ที่ปรึกษา, Regulatory)",
};

export default function ChildPage() {
  const [gender, setGender] = useState<"male" | "female">("male");
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
      const res = await fetch("/api/child", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gender,
          birthDay,
          parentGoals: selectedGoals,
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
            <Baby className="w-4 h-4" />
            <span>Child Naming Module</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="text-[#c9a84c]">NaraChild</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            ออกแบบชื่อมงคลสำหรับเด็กแรกเกิดด้วย Warakkasa Matrix ตามเพศและเป้าหมายพัฒนาการ
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          <div className="bg-[#12121a] rounded-2xl p-8 border border-white/5">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-[#c9a84c]" />
              วิเคราะห์เพื่อตั้งชื่อเด็ก
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm text-gray-400 mb-3">เพศ</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setGender("male")}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      gender === "male"
                        ? "border-[#c9a84c] bg-[#c9a84c]/10"
                        : "border-white/10 hover:border-white/20"
                    }`}
                  >
                    <Users className="w-8 h-8 mx-auto mb-2" />
                    <div className="font-bold">เด็กชาย</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender("female")}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      gender === "female"
                        ? "border-[#c9a84c] bg-[#c9a84c]/10"
                        : "border-white/10 hover:border-white/20"
                    }`}
                  >
                    <Heart className="w-8 h-8 mx-auto mb-2" />
                    <div className="font-bold">เด็กหญิง</div>
                  </button>
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
                <label className="block text-sm text-gray-400 mb-3">เป้าหมายการพัฒนา (เลือกได้หลายข้อ)</label>
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
                {loading ? "กำลังวิเคราะห์..." : "วิเคราะห์และแนะนำชื่อ"}
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
                  <h3 className="text-xl font-bold mb-4">อักษรแนะนำ</h3>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {result.recommendedLetters.map((letter: string) => (
                      <span key={letter} className="px-4 py-2 rounded-full bg-[#c9a84c]/20 text-[#c9a84c] font-bold">
                        {letter}
                      </span>
                    ))}
                  </div>
                  
                  <h3 className="text-xl font-bold mb-4">อักษรห้าม</h3>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {result.avoidedLetters.slice(0, 10).map((letter: string) => (
                      <span key={letter} className="px-4 py-2 rounded-full bg-red-500/20 text-red-400">
                        {letter}
                      </span>
                    ))}
                    {result.avoidedLetters.length > 10 && (
                      <span className="px-4 py-2 rounded-full bg-red-500/10 text-red-300">
                        +{result.avoidedLetters.length - 10} ตัว
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-[#12121a] rounded-2xl p-8 border border-white/5">
                  <h3 className="text-xl font-bold mb-4">เป้าหมายและตัวชี้วัด</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-white/5">
                      <div className="text-sm text-gray-400">เลขเป้าหมาย</div>
                      <div className="text-2xl font-bold text-[#c9a84c]">{result.targetNumber}</div>
                    </div>
                    <div className="p-4 rounded-lg bg-white/5">
                      <div className="text-sm text-gray-400">อายตนะเป้าหมาย</div>
                      <div className="text-2xl font-bold text-[#c9a84c]">{result.ayatana}</div>
                    </div>
                  </div>
                </div>

                <div className="bg-[#12121a] rounded-2xl p-8 border border-white/5">
                  <h3 className="text-xl font-bold mb-4">วรรคทักษาเน้น</h3>
                  <div className="space-y-2">
                    {result.warakkasaEmphasis.map((w: string) => (
                      <div key={w} className="flex items-center gap-2 p-3 rounded-lg bg-white/5">
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                        <span>{WARAKKASA_NAMES[w] || w}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#12121a] rounded-2xl p-8 border border-[#c9a84c]/20">
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#c9a84c]" />
                    ชื่อแนะนำ
                  </h3>
                  <div className="space-y-4">
                    {result.suggestedNames.map((name: any, i: number) => (
                      <div key={i} className="p-4 rounded-lg bg-white/5 border border-white/10">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xl font-bold text-[#c9a84c]">{name.name}</span>
                          <span className={`px-3 py-1 rounded-full text-sm ${
                            name.score >= 90 ? "bg-green-500/20 text-green-400" :
                            name.score >= 70 ? "bg-yellow-500/20 text-yellow-400" :
                            "bg-red-500/20 text-red-400"
                          }`}>
                            {Math.round(name.score)}%
                          </span>
                        </div>
                        <div className="text-gray-400 text-sm mb-2">{name.meaning}</div>
                        <div className="text-xs text-gray-500">ผลรวม: {name.strokes} ขีด</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {!result && (
              <div className="bg-[#12121a] rounded-2xl p-12 border border-white/5 text-center">
                <Baby className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                <p className="text-gray-400">
                  กรอกข้อมูลแล้วกดวิเคราะห์เพื่อดูชื่อแนะนำ
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-12 p-6 rounded-2xl bg-[#12121a]/50 border border-white/5">
          <p className="text-center text-gray-500 text-sm">
            ⚠️ ชื่อที่ดีสำหรับเด็กไม่ใช่เพียงการ "กำหนดชะตา" แต่คือการออกแบบพลังงานเริ่มต้น 
            ที่จะทำงานร่วมกับการเลี้ยงดู สภาพแวดล้อม และเจตจำนงของครอบครัว
          </p>
        </div>
      </div>
    </div>
  );
}
