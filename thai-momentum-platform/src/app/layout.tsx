import type { Metadata } from "next";
import { Geist, Geist_Mono, IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const plexThai = IBM_Plex_Sans_Thai({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["thai", "latin"],
  variable: "--font-plex-thai",
});

export const metadata: Metadata = {
  title: "Thai Momentum Platform — ระบบโมเมนตัมหุ้นไทย × Jev AI",
  description:
    "แผนที่โมเมนตัมหุ้นไทยข้าม 7 timeframe (5/10/20/40/80/160/300 วัน) พร้อมสมองตัดสินใจ Jev, Human Gate, Backtest และ Portfolio แบบ paper mode",
  keywords: ["Thai stocks", "momentum", "SET", "quant", "Jev AI", "backtest"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body
        className={`${plexThai.variable} ${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
