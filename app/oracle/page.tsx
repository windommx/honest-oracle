import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Crown, Sparkles, Shield, KeyRound } from "lucide-react";

export default async function OracleLandingPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="min-h-screen bg-[#08080e]">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Crown className="w-8 h-8 text-[#c9a84c]" />
            <span className="text-xl font-semibold gold-gradient">NaraSuite</span>
          </Link>
          <div className="flex gap-6 items-center">
            <Link
              href="/oracle"
              className="text-[#c9a84c]"
            >
              Honest Oracle
            </Link>
            {session ? (
              <Link
                href="/oracle/app"
                className="text-gray-300 hover:text-[#c9a84c] transition-colors"
              >
                เข้าใช้งาน
              </Link>
            ) : (
              <Link
                href="/login"
                className="text-gray-300 hover:text-[#c9a84c] transition-colors"
              >
                เข้าสู่ระบบ
              </Link>
            )}
          </div>
        </div>
      </nav>

      <div className="pt-28 pb-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-semibold mb-4">
              <span className="gold-gradient">Honest Oracle</span>{" "}
              <span className="text-white/90">— แผนที่ชีวิต 100 ปี</span>
            </h1>
            <p className="text-gray-400 max-w-2xl mx-auto">
              เครื่องมือเพื่อการสะท้อนตนเอง (self-reflection) แบบโปร่งใส:
              อธิบายผลเป็นโครงสร้างและแนวโน้ม ไม่อ้างว่าเป็นคำทำนาย
            </p>
            <div className="mt-8 flex gap-3 justify-center flex-wrap">
              <Link
                href={session ? "/oracle/app" : "/login?callbackUrl=/oracle/app"}
                className="px-6 py-3 bg-gold text-black font-semibold rounded-xl hover:bg-gold-light transition-colors"
              >
                เริ่มทำแผนที่ชีวิต
              </Link>
              <Link
                href="/oracle/pricing"
                className="px-6 py-3 bg-white/5 border border-gold/20 text-white rounded-xl hover:border-gold/40 transition-colors"
              >
                ดูแพ็กเกจ
              </Link>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-10">
            {[
              {
                icon: <Sparkles className="w-6 h-6 text-[#c9a84c]" />,
                title: "100-Year Timeline",
                desc: "สรุปจังหวะชีวิตเป็นกราฟ + timeline พร้อมระดับ good/warn/danger",
              },
              {
                icon: <Shield className="w-6 h-6 text-[#c9a84c]" />,
                title: "Transparent Model",
                desc: "ผลลัพธ์เป็นแบบจำลองเชิงโครงสร้าง (deterministic) ไม่สุ่มรายครั้ง",
              },
              {
                icon: <KeyRound className="w-6 h-6 text-[#c9a84c]" />,
                title: "Premium API",
                desc: "สำหรับทีม/นักพัฒนา: ใช้ API key เพื่อเรียกอ่านผลแบบโปรดักชัน",
              },
            ].map((f) => (
              <div key={f.title} className="glass-card rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  {f.icon}
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                </div>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="glass-card rounded-2xl p-6">
            <p className="text-gray-400 text-sm text-center">
              <span className="text-[#c9a84c] font-semibold">Transparency note:</span>{" "}
              เครื่องมือนี้มีไว้เพื่อการสะท้อนและจัดระบบความคิด ไม่ใช่การทำนายอนาคต
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

