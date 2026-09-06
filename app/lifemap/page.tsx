import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Crown, Sparkles, Shield, KeyRound } from "lucide-react";

export default async function LifemapLandingPage() {
  // This is a public marketing page — it must render even when auth itself is
  // misconfigured (e.g. NEXTAUTH_SECRET unset). Before this, getServerSession
  // threw straight out of the Server Component and 500'd the whole landing
  // page; a broken personalization detail (which CTA link to show) is not a
  // reason to take down content anyone should be able to read. Fail to the
  // logged-out view — never a blank crash page.
  const session = await getServerSession(authOptions).catch(() => null);

  return (
    <div className="min-h-screen">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Crown className="w-8 h-8 text-[#1d4ed8]" />
            <span className="text-xl font-semibold gold-gradient">NaraClear</span>
          </Link>
          <div className="flex gap-6 items-center">
            <Link
              href="/lifemap"
              className="text-[#1d4ed8]"
            >
              โครงสร้างชีวิต
            </Link>
            {session ? (
              <Link
                href="/lifemap/app"
                className="text-gray-700 hover:text-[#1e40af] transition-colors"
              >
                เข้าใช้งาน
              </Link>
            ) : (
              <Link
                href="/login"
                className="text-gray-700 hover:text-[#1e40af] transition-colors"
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
              <span className="gold-gradient">โครงสร้างชีวิต</span>{" "}
              <span className="text-[#111827]/90">— แผนที่ชีวิต 100 ปี</span>
            </h1>
            <p className="text-gray-600 max-w-2xl mx-auto">
              เครื่องมือเพื่อการสะท้อนตนเอง (self-reflection) แบบโปร่งใส:
              อธิบายผลเป็นโครงสร้างและแนวโน้ม ไม่อ้างว่าเป็นคำทำนาย
            </p>
            <div className="mt-8 flex gap-3 justify-center flex-wrap">
              <Link
                href={session ? "/lifemap/app" : "/login?callbackUrl=/lifemap/app"}
                className="px-6 py-3 bg-[#3c74d4] text-white font-semibold rounded-xl hover:bg-[#3366bf] transition-colors"
              >
                เริ่มทำแผนที่ชีวิต
              </Link>
              <Link
                href="/lifemap/pricing"
                className="px-6 py-3 bg-black/[0.03] border border-[#1d4ed8]/25 text-[#111827] rounded-xl hover:border-[#1d4ed8]/50 transition-colors"
              >
                ดูแพ็กเกจ
              </Link>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-10">
            {[
              {
                icon: <Sparkles className="w-6 h-6 text-[#1d4ed8]" />,
                title: "100-Year Timeline",
                desc: "สรุปจังหวะชีวิตเป็นกราฟ + timeline พร้อมระดับ good/warn/danger",
              },
              {
                icon: <Shield className="w-6 h-6 text-[#1d4ed8]" />,
                title: "Transparent Model",
                desc: "ผลลัพธ์เป็นแบบจำลองเชิงโครงสร้าง (deterministic) ไม่สุ่มรายครั้ง",
              },
              {
                icon: <KeyRound className="w-6 h-6 text-[#1d4ed8]" />,
                title: "Premium API",
                desc: "สำหรับทีม/นักพัฒนา: ใช้ API key เพื่อเรียกอ่านผลแบบโปรดักชัน",
              },
            ].map((f) => (
              <div key={f.title} className="glass-card rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  {f.icon}
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="glass-card rounded-2xl p-6">
            <p className="text-gray-600 text-sm text-center">
              <span className="text-[#1d4ed8] font-semibold">Transparency note:</span>{" "}
              เครื่องมือนี้มีไว้เพื่อการสะท้อนและจัดระบบความคิด ไม่ใช่การทำนายอนาคต
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

