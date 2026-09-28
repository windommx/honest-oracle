import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Omniscient Quant Engine — Full-Cycle Multi-View Quant Platform",
  description:
    "แพลตฟอร์มเทรดเชิงระบบครบวงจร: 7 Layers (L0 Data/PIT → L3 Multi-View Factor Integration → L5 Copula-CVaR Risk → L6 5-Gates Execution) พร้อม Walk-Forward Backtest, Gate Attribution และ LLM Audit Loop",
  keywords: ["quant", "5-gates", "MOFA", "copula", "CVaR", "SET", "walk-forward"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
