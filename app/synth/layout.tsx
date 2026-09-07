import type { Metadata } from "next";
import { Toaster } from "../rush/_toast";

export const metadata: Metadata = {
  title: "SynthPro — เครื่องสังเคราะห์เสียงในเบราว์เซอร์",
  description:
    "ซินธิไซเซอร์ที่รัน DSP ตัวเดียวกับที่ชุดทดสอบตรวจ — PolyBLEP, ladder filter, plate reverb ใน AudioWorklet",
};

export default function SynthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-gray-200">
      {children}
      <Toaster />
    </div>
  );
}
