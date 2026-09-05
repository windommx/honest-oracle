import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "NaraClear - ระบบวิเคราะห์ชื่อมงคลไทย",
  description: "ระบบวิเคราะห์ชื่อมงคลไทยครบทุกมิติ - บุคคล องค์กร ธุรกิจ เด็ก เปลี่ยนชื่อ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="font-thai antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
