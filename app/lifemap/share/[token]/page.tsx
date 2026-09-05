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
      <div className="min-h-screen bg-[#f3f5f9] flex items-center justify-center px-4">
        <div className="glass-card rounded-2xl p-8 max-w-lg w-full text-center">
          <p className="text-[#14161c]/90 font-semibold mb-2">ไม่พบลิงก์แชร์</p>
          <p className="text-gray-600 text-sm mb-6">
            ลิงก์อาจถูกตั้งเป็นส่วนตัวหรือหมดอายุ
          </p>
          <Link
            href="/lifemap"
            className="px-6 py-3 bg-[#d9a63a] text-black font-semibold rounded-xl hover:bg-[#c8901f] transition-colors inline-block"
          >
            กลับไปหน้าโครงสร้างชีวิต
          </Link>
        </div>
      </div>
    );
  }

  const result = reading.result as any;

  return (
    <div className="min-h-screen bg-[#f3f5f9]">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Crown className="w-8 h-8 text-[#7a5c12]" />
            <span className="text-xl font-semibold gold-gradient">NaraClear</span>
          </Link>
          <div className="flex gap-6 items-center">
            <Link href="/lifemap" className="text-gray-700 hover:text-[#6b5010] transition-colors">
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
            <p className="text-gray-600 text-sm">
              {reading.inputName} · {reading.birthDate.toISOString().slice(0, 10)}
            </p>

            <div className="mt-6 p-5 bg-black/[0.03] rounded-xl">
              <p className="text-gray-600 text-sm">คะแนนภาพรวม</p>
              <p className="text-5xl font-bold text-[#7a5c12]">
                {result?.summary?.overallScore ?? "-"}
              </p>
              <p className="text-gray-600 text-sm mt-1">
                {result?.summary?.headline ?? ""}
              </p>
            </div>

            <div className="mt-6 p-4 bg-[#d9a63a]/10 rounded-xl border border-[#7a5c12]/25">
              <p className="text-gray-700 text-sm text-center">
                <span className="text-[#7a5c12] font-semibold">Transparency note:</span>{" "}
                {result?.summary?.note ??
                  "ผลลัพธ์นี้เป็นแบบจำลองเชิงโครงสร้างเพื่อช่วยสะท้อนแนวโน้ม"}
              </p>
            </div>

            <div className="mt-6 text-center">
              <Link
                href="/lifemap/app"
                className="px-6 py-3 bg-black/[0.03] border border-[#7a5c12]/25 text-[#14161c] rounded-xl hover:border-[#7a5c12]/50 transition-colors inline-block"
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

