import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MasterPro — มาสเตอร์ริงที่วัดผลได้",
  description:
    "โหลดไฟล์เพลง ปรับ EQ ไดนามิก และคาแรกเตอร์ แล้ววัดความดังตามมาตรฐาน ITU-R BS.1770 ก่อนส่งงาน",
};

export default function MasterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
