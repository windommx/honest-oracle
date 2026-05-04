"use client";

import { useState } from "react";
import { Shield, Building2, Users, TrendingUp, AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";

const INDUSTRY_TYPES = [
  { value: "tech", label: "เทคโนโลยี / Startup" },
  { value: "realestate", label: "อสังหาริมทรัพย์" },
  { value: "healthcare", label: "สุขภาพ / การแพทย์" },
  { value: "finance", label: "การเงิน / ธนาคาร" },
  { value: "retail", label: "ค้าปลีก / ร้านค้า" },
  { value: "education", label: "การศึกษา" },
  { value: "hospitality", label: "โรงแรม / รับรอง" },
  { value: "manufacturing", label: "การผลิต" },
];

export default function CorporatePage() {
  const [brandName, setBrandName] = useState("");
  const [founderBirthday, setFounderBirthday] = useState("");
  const [industryType, setIndustryType] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/corporate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName,
          founderBirthday,
          industryType,
          targetAudience,
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
            <Building2 className="w-4 h-4" />
            <span>Corporate Naming Module</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="text-[#c9a84c]">NaraCorp</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            วิเคราะห์ชื่อองค์กรขั้นสูงด้วย CAI, MCAI, Resonant Triangle และ Corporate Shadow Formula
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          <div className="bg-[#12121a] rounded-2xl p-8 border border-white/5">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-[#c9a84c]" />
              วิเคราะห์ชื่อองค์กร
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2">ชื่อแบรนด์ / ชื่อบริษัท</label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="เช่น เวอริซิงก์, ธาราพฤกษา"
                  className="w-full px-4 py-3 rounded-lg bg-black/30 border border-white/10 focus:border-[#c9a84c] focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">วันเกิดผู้ก่อตั้ง (วัน/เดือน/ปี)</label>
                <input
                  type="text"
                  value={founderBirthday}
                  onChange={(e) => setFounderBirthday(e.target.value)}
                  placeholder="เช่น 15/08/1990"
                  className="w-full px-4 py-3 rounded-lg bg-black/30 border border-white/10 focus:border-[#c9a84c] focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">ประเภทธุรกิจ</label>
                <select
                  value={industryType}
                  onChange={(e) => setIndustryType(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-black/30 border border-white/10 focus:border-[#c9a84c] focus:outline-none transition-colors"
                  required
                >
                  <option value="">เลือกประเภทธุรกิจ</option>
                  {INDUSTRY_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">กลุ่มเป้าหมาย (ไม่บังคับ)</label>
                <input
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="เช่น Enterprise, SME, Consumer"
                  className="w-full px-4 py-3 rounded-lg bg-black/30 border border-white/10 focus:border-[#c9a84c] focus:outline-none transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-lg bg-gradient-to-r from-[#c9a84c] to-[#a08030] text-black font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? "กำลังวิเคราะห์..." : "วิเคราะห์ชื่อองค์กร"}
              </button>
            </form>

            {error && (
              <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                {error}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-[#12121a] rounded-2xl p-8 border border-white/5">
              <h2 className="text-2xl font-bold mb-6">Resonant Triangle</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-white/5">
                  <Users className="w-8 h-8 text-[#c9a84c] mx-auto mb-2" />
                  <div className="text-2xl font-bold text-[#c9a84c]">
                    {result?.resonanceTriangle?.founder || "?"}
                  </div>
                  <div className="text-sm text-gray-400">Founder Energy</div>
                </div>
                <div className="text-center p-4 rounded-lg bg-white/5">
                  <Building2 className="w-8 h-8 text-[#c9a84c] mx-auto mb-2" />
                  <div className="text-2xl font-bold text-[#c9a84c]">
                    {result?.resonanceTriangle?.industry || "?"}
                  </div>
                  <div className="text-sm text-gray-400">Industry Element</div>
                </div>
                <div className="text-center p-4 rounded-lg bg-white/5">
                  <TrendingUp className="w-8 h-8 text-[#c9a84c] mx-auto mb-2" />
                  <div className="text-2xl font-bold text-[#c9a84c]">
                    {result?.resonanceTriangle?.audience || "?"}
                  </div>
                  <div className="text-sm text-gray-400">Audience Cognition</div>
                </div>
              </div>
              {result?.resonanceTriangle?.isBalanced !== undefined && (
                <div className={`mt-4 p-3 rounded-lg flex items-center gap-2 ${
                  result.resonanceTriangle.isBalanced 
                    ? "bg-green-500/10 text-green-400" 
                    : "bg-yellow-500/10 text-yellow-400"
                }`}>
                  {result.resonanceTriangle.isBalanced ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5" />
                  )}
                  <span>
                    {result.resonanceTriangle.isBalanced 
                      ? "Resonance Triangle สมดุล" 
                      : "Resonance Triangle ต้องปรับจูน"}
                  </span>
                </div>
              )}
            </div>

            {result && (
              <>
                <div className="bg-[#12121a] rounded-2xl p-8 border border-white/5">
                  <h2 className="text-2xl font-bold mb-6">ผลการวิเคราะห์</h2>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                      <span className="text-gray-400">CAI (Corporate Auspiciousness Index)</span>
                      <span className={`text-2xl font-bold ${
                        result.cai >= 72 ? "text-green-400" : "text-yellow-400"
                      }`}>
                        {result.cai}/10
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                      <span className="text-gray-400">MCAI (Multi-Criteria Auspiciousness)</span>
                      <span className={`text-2xl font-bold ${
                        result.mcai >= 85 ? "text-green-400" : result.mcai >= 70 ? "text-yellow-400" : "text-red-400"
                      }`}>
                        {result.mcai}/100
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mt-4">
                      <div className="text-center p-3 rounded-lg bg-white/5">
                        <div className="text-xl font-bold text-[#c9a84c]">S₁ {result.s1}</div>
                        <div className="text-xs text-gray-400">ชื่อแบรนด์</div>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-white/5">
                        <div className="text-xl font-bold text-[#c9a84c]">S₂ {result.s2}</div>
                        <div className="text-xs text-gray-400">ผู้ก่อตั้ง</div>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-white/5">
                        <div className="text-xl font-bold text-[#c9a84c]">S₃ {result.s3}</div>
                        <div className="text-xs text-gray-400">ดวงองค์กร</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                      <span className="text-gray-400">Memorability Score</span>
                      <span className="text-xl font-bold">{result.memorabilityScore}%</span>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                      <span className="text-gray-400">Phonetic Pricing</span>
                      <span className="text-xl font-bold text-[#c9a84c]">{result.phoneticPricing}</span>
                    </div>
                  </div>
                </div>

                {result.warnings && result.warnings.length > 0 && (
                  <div className="bg-[#12121a] rounded-2xl p-8 border border-yellow-500/20">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-yellow-400">
                      <AlertTriangle className="w-5 h-5" />
                      คำเตือน
                    </h3>
                    <ul className="space-y-2">
                      {result.warnings.map((warning: string, i: number) => (
                        <li key={i} className="text-yellow-300">• {warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.recommendations && result.recommendations.length > 0 && (
                  <div className="bg-[#12121a] rounded-2xl p-8 border border-green-500/20">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-green-400">
                      <CheckCircle2 className="w-5 h-5" />
                      คำแนะนำ
                    </h3>
                    <ul className="space-y-2">
                      {result.recommendations.map((rec: string, i: number) => (
                        <li key={i} className="text-green-300">• {rec}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="bg-[#12121a] rounded-2xl p-8 border border-white/5">
                  <h3 className="text-xl font-bold mb-4">Corporate Taksa Matrix</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(result.taksaMatrix).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                        <span className="text-gray-400 capitalize">{key}</span>
                        <span className={value === 100 ? "text-green-400" : "text-red-400"}>
                          {value === 100 ? "✓" : "✗"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-12 p-6 rounded-2xl bg-[#12121a]/50 border border-white/5">
          <p className="text-center text-gray-500 text-sm">
            ⚠️ ระบบวิเคราะห์นี้ใช้กรอบโหราศาสตร์และเลขศาสตร์ไทยเป็นส่วนหนึ่งของการประเมิน 
            ผลลัพธ์ไม่ได้รับประกันความสำเร็จทางธุรกิจ และควรใช้ร่วมกับการวิเคราะห์ทางธุรกิจอื่นๆ
          </p>
        </div>
      </div>
    </div>
  );
}
