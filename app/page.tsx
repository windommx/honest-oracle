"use client";

import Link from "next/link";
import { Sparkles, User, Building2, Baby, RefreshCw, Crown, ArrowRight, Shield, TrendingUp, Heart, Calculator } from "lucide-react";

const SERVICES = [
  {
    icon: User,
    title: "NaraName",
    description: "วิเคราะห์ชื่อบุคคล",
    href: "/analyze",
    color: "from-[#c9a84c] to-[#a08030]",
    features: ["กาลกิณี", "เลขศาสตร์", "วรรคทักษา", "สัทศาสตร์"],
  },
  {
    icon: Building2,
    title: "NaraCorp",
    description: "วิเคราะห์ชื่อองค์กร",
    href: "/corporate",
    color: "from-blue-500 to-blue-700",
    features: ["CAI/MCAI", "Resonant Triangle", "Corporate Taksa", "Shadow Power"],
  },
  {
    icon: Baby,
    title: "NaraChild",
    description: "ตั้งชื่อเด็กแรกเกิด",
    href: "/child",
    color: "from-pink-500 to-pink-700",
    features: ["Warakkasa by Gender", "Ayatana 6", "Child Naming", "Development Goals"],
  },
  {
    icon: RefreshCw,
    title: "NaraRename",
    description: "เปลี่ยนชื่อเดิมให้มงคล",
    href: "/rename",
    color: "from-purple-500 to-purple-700",
    features: ["7-Step Protocol", "Soft Transition", "Problem Analysis", "New Name Suggestion"],
  },
  {
    icon: Sparkles,
    title: "Honest Oracle",
    description: "แผนที่ชีวิต 100 ปี",
    href: "/oracle",
    color: "from-[#c9a84c] to-[#5a9e6a]",
    features: ["Life Graph", "Timeline", "Sharing", "Premium API"],
  },
  {
    icon: TrendingUp,
    title: "Dividend Screen",
    description: "คัดกรองความยั่งยืนปันผล — นับ ไม่ตัดสิน",
    href: "/dividend",
    color: "from-emerald-500 to-emerald-700",
    features: ["Loss / FCF gates", "Piotroski · Altman · Beneish", "Stability gate", "Walk-forward harness"],
  },
];

const MCAS_FEATURES = [
  {
    icon: Shield,
    title: "กรอบโหราศาสตร์",
    description: "กาลกิณี 8 วัน, เลขศาสตร์ 9 ตัว, วรรคทักษา 7 มิติ",
  },
  {
    icon: Calculator,
    title: "MCAS Scoring",
    description: "Multi-Criteria Auspiciousness Index คำนวณอัตโนมัติ",
  },
  {
    icon: TrendingUp,
    title: "5D Elemental",
    description: "ธาตุสมดุล 5 มิติ - วันเกิด, ชื่อ, ฤกษ์, ทิศ, ดิจิทัล",
  },
  {
    icon: Heart,
    title: "Soft Transition",
    description: "เทคนิคเปลี่ยนชื่อนุ่มนวล ลดแรงกระแทกทางจิตวิทยา",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#08080e]">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Crown className="w-8 h-8 text-[#c9a84c]" />
            <span className="text-xl font-semibold gold-gradient">NaraSuite</span>
          </div>
          <div className="flex gap-6 items-center">
            <Link href="/analyze" className="text-gray-300 hover:text-[#c9a84c] transition-colors">
              วิเคราะห์ชื่อ
            </Link>
            <Link href="/corporate" className="text-gray-300 hover:text-[#c9a84c] transition-colors">
              องค์กร
            </Link>
            <Link href="/child" className="text-gray-300 hover:text-[#c9a84c] transition-colors">
              ตั้งชื่อเด็ก
            </Link>
            <Link href="/rename" className="text-gray-300 hover:text-[#c9a84c] transition-colors">
              เปลี่ยนชื่อ
            </Link>
            <Link href="/oracle" className="text-gray-300 hover:text-[#c9a84c] transition-colors">
              Honest Oracle
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 bg-[#c9a84c] text-black font-medium rounded-lg hover:bg-[#d4b55d] transition-colors"
            >
              เข้าสู่ระบบ
            </Link>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-20 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#c9a84c]/10 text-[#c9a84c] text-sm mb-6">
            <Sparkles className="w-4 h-4" />
            <span>Full-Stack Thai Name SaaS</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6">
            <span className="gold-gradient">NaraSuite</span>
          </h1>
          <p className="text-xl text-gray-400 mb-4 max-w-2xl mx-auto">
            ระบบวิเคราะห์และออกแบบชื่อมงคลครบทุกมิติ
          </p>
          <p className="text-lg text-gray-500 mb-10 max-w-2xl mx-auto">
            บุคคล • องค์กร • ธุรกิจ • อสังหา • เด็ก • เปลี่ยนชื่อ
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/analyze"
              className="px-8 py-4 bg-[#c9a84c] text-black font-semibold rounded-xl hover:bg-[#d4b55d] transition-all flex items-center gap-2"
            >
              เริ่มวิเคราะห์ <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/corporate"
              className="px-8 py-4 border border-blue-500/30 text-blue-400 font-semibold rounded-xl hover:bg-blue-500/10 transition-all"
            >
              วิเคราะห์องค์กร
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4 gold-gradient">4 บริการครบวงจร</h2>
          <p className="text-gray-400 text-center mb-12">เลือกบริการที่เหมาะกับความต้องการของคุณ</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {SERVICES.map(({ icon: Icon, title, description, href, color, features }) => (
              <Link
                key={title}
                href={href}
                className="glass-card rounded-2xl p-6 hover:border-[#c9a84c]/40 transition-all group block"
              >
                <div className={`w-14 h-14 bg-gradient-to-br ${color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-white">{title}</h3>
                <p className="text-gray-400 text-sm mb-4">{description}</p>
                <div className="flex flex-wrap gap-2">
                  {features.map((f) => (
                    <span key={f} className="px-2 py-1 bg-white/5 rounded text-xs text-gray-400">
                      {f}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-gradient-to-b from-transparent via-[#c9a84c]/5 to-transparent">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12 gold-gradient">เทคโนโลยีการคำนวณ</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {MCAS_FEATURES.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="glass-card rounded-2xl p-6"
              >
                <div className="w-12 h-12 bg-[#c9a84c]/10 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-[#c9a84c]" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-white">{title}</h3>
                <p className="text-gray-400 text-sm">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="glass-card rounded-2xl p-8">
            <p className="text-gray-400 text-sm leading-relaxed">
              <span className="text-[#c9a84c] font-semibold">หมายเหตุ:</span> ระบบวิเคราะห์ชื่อนี้ใช้หลักโหราศาสตร์ไทยแบบดั้งเดิม
              เป็นเครื่องมือช่วยประกอบการตัดสินใจเท่านั้น ไม่สามารถทำนายชะตาชีวิตได้อย่างแท้จริง
              ผลลัพธ์ควรใช้เป็นแนวทางและพิจารณาร่วมกับปัจจัยอื่นๆ ประกอบด้วย
            </p>
          </div>
        </div>
      </section>

      <footer className="py-12 px-4 border-t border-[#c9a84c]/10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Crown className="w-6 h-6 text-[#c9a84c]" />
            <span className="font-semibold gold-gradient">NaraSuite</span>
          </div>
          <p className="text-gray-500 text-sm">
            © 2024 NaraSuite. สงวนลิขสิทธิ์ | ระบบวิเคราะห์ชื่อมงคลไทย
          </p>
        </div>
      </footer>
    </div>
  );
}
