import type { Metadata } from "next";
import { Nav } from "./_nav";
import { Toaster } from "../rush/_toast";

export const metadata: Metadata = {
  title: "MindBridge — ดนตรีบำบัดเชิงหลักฐาน",
  description:
    "แพลตฟอร์มดนตรีบำบัดที่ใช้แบบคัดกรองมาตรฐาน (GAD-7, PHQ-9) และ intervention ที่มีงานวิจัยอ้างอิงทุกรายการ — ไม่ใช่การวินิจฉัย และไม่ทดแทนผู้ให้บริการสุขภาพ",
};

/** MindBridge shell. The toast stack is shared with /rush rather than duplicated:
 *  it is a dependency-free module-level store, so a second copy would mean two
 *  stacks fighting over the same corner of the screen. */
export default function TherapyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-gray-200">
      <Nav />
      {children}
      <footer className="border-t border-white/10 mt-16">
        <div className="max-w-6xl mx-auto px-5 py-8 text-[0.7rem] text-faint leading-relaxed">
          <p className="font-medium text-gray-400">
            MindBridge เป็นเครื่องมือคัดกรองและดูแลตัวเอง ไม่ใช่การวินิจฉัย ไม่ใช่การรักษา
            และไม่ทดแทนการพบผู้ให้บริการสุขภาพ
          </p>
          <p className="mt-2">
            หากมีความคิดทำร้ายตัวเอง โทร <a className="text-gold" href="tel:1323">1323</a> (สายด่วนสุขภาพจิต ตลอด 24
            ชั่วโมง) หรือ <a className="text-gold" href="tel:1669">1669</a> (การแพทย์ฉุกเฉิน)
          </p>
        </div>
      </footer>
      <Toaster />
    </div>
  );
}
