import type { Metadata } from "next";
import { Toaster } from "@/components/toast";

export const metadata: Metadata = {
  title: "StageLab — ระบบ Stage Analysis สำหรับหุ้นไทย",
  description:
    "แพลตฟอร์มทำรอบทบทวนรายสัปดาห์ตามระบบ Stage Analysis ของ Stan Weinstein — คัดหุ้น จัดพอร์ต และบันทึกวินัยการเทรด",
};

/**
 * StageLab shell. The app is a dark trading terminal regardless of the rest of
 * the suite's palette, so the surface is set here rather than inherited.
 */
export default function StageLabLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {children}
      <Toaster />
    </div>
  );
}
