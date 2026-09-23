import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import ThemeProvider from "@/components/platform/theme-provider";

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

// แถบเบราว์เซอร์มือถือสีตามธีม (Gold Ivory / Gold Night) · ปุ่มฟอร์มของเบราว์เซอร์สลับโทนตาม color-scheme
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1320" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: next-themes ใส่คลาส dark + style color-scheme บน <html> ก่อน React hydrate
    <html lang="th" suppressHydrationWarning>
      <body
        className={`${plexThai.variable} ${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
