import type { Metadata } from "next";
import { Toaster } from "./_toast";

export const metadata: Metadata = {
  title: "HD Competency — ระบบประเมิน Competency Level พยาบาลไตเทียม | NaraSuite",
  description:
    "ระบบประเมินสมรรถนะ (Competency Level) พยาบาลหน่วยฟอกไตเทียม: แบบประเมิน 10 เกณฑ์ คะแนนเต็ม 100, แดชบอร์ดหน่วย, แผนพัฒนารายบุคคล, รายงานพิมพ์ และส่งออก CSV",
};

/** Module shell: the suite's one light surface, plus the toast stack mounted once. */
export default function CompetencyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="competency min-h-screen bg-slate-50 text-slate-900">
      {children}
      <Toaster />
    </div>
  );
}
