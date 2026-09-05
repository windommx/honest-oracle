import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Crown } from "lucide-react";

export default async function LifemapSharePage({
  params,
}: {
  params: { token: string };
}) {
  const reading = await prisma.lifemapReading.findFirst({
    where: { shareToken: params.token, visibility: "public" },
    select: {
      inputName: true,
      birthDate: true,
      createdAt: true,
      result: true,
    },
  });

  if (!reading) {
    return (
      <div className="min-h-screen bg-[#08080e] flex items-center justify-center px-4">
        <div className="glass-card rounded-2xl p-8 max-w-lg w-full text-center">
          <p className="text-white/90 font-semibold mb-2">ไม่พบลิงก์แชร์</p>
          <p className="text-gray-400 text-sm mb-6">
            ลิงก์อาจถูกตั้งเป็นส่วนตัวหรือหมดอายุ
          </p>
          <Link
            href="/lifemap"
            className="px-6 py-3 bg-gold text-black font-semibold rounded-xl hover:bg-gold-light transition-colors inline-block"
          >
            กลับไปหน้าโครงสร้างชีวิต
          </Link>
        </div>
      </div>
    );
  }

  const result = reading.result as any;

  return (
    <div className="min-h-screen bg-[#08080e]">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Crown className="w-8 h-8 text-[#c9a84c]" />
            <span className="text-xl font-semibold gold-gradient">NaraClear</span>
          </Link>
          <div className="flex gap-6 items-center">
            <Link href="/lifemap" className="text-gray-300 hover:text-[#c9a84c] transition-colors">
              โครงสร้างชีวิต
            </Link>
          </div>
        </div>
      </nav>

      <div className="pt-28 pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="glass-card rounded-2xl p-8">
            <h1 className="text-3xl font-bold gold-gradient mb-2">
              โครงสร้างชีวิต (แชร์)
            </h1>
            <p className="text-gray-400 text-sm">
              {reading.inputName} · {reading.birthDate.toISOString().slice(0, 10)}
            </p>

            <div className="mt-6 p-5 bg-white/5 rounded-xl">
              <p className="text-gray-400 text-sm">คะแนนภาพรวม</p>
              <p className="text-5xl font-bold text-[#c9a84c]">
                {result?.summary?.overallScore ?? "-"}
              </p>
              <p className="text-gray-500 text-sm mt-1">
                {result?.summary?.headline ?? ""}
              </p>
            </div>

            <div className="mt-6 p-4 bg-gold/10 rounded-xl border border-gold/20">
              <p className="text-gray-300 text-sm text-center">
                <span className="text-gold font-semibold">Transparency note:</span>{" "}
                {result?.summary?.note ??
                  "ผลลัพธ์นี้เป็นแบบจำลองเชิงโครงสร้างเพื่อช่วยสะท้อนแนวโน้ม"}
              </p>
            </div>

            <div className="mt-6 text-center">
              <Link
                href="/lifemap/app"
                className="px-6 py-3 bg-white/5 border border-gold/20 text-white rounded-xl hover:border-gold/40 transition-colors inline-block"
              >
                สร้างแผนที่ของฉัน
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

