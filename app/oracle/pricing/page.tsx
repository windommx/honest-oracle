"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, Loader2 } from "lucide-react";

type UsageResp = {
  plan: string;
  role: string;
  today: { oracleReads: number; apiCalls: number };
  limits: { oracleDaily: number | null; apiDaily: number | null };
};

export default function OraclePricingPage() {
  const [usage, setUsage] = useState<UsageResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingLoading, setBillingLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/oracle/usage");
        if (res.ok) setUsage(await res.json());
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const checkout = async () => {
    setBillingLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Billing unavailable");
      }
      if (data.url) window.location.href = data.url;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Billing unavailable");
    } finally {
      setBillingLoading(false);
    }
  };

  const plans = [
    {
      key: "free",
      name: "Free",
      price: "฿0",
      badge: "เริ่มต้น",
      features: ["สร้างแผนที่ชีวิต", "เก็บประวัติ", "แชร์แบบลิงก์ (manual)", "จำกัดจำนวน/วัน"],
      cta: { label: "เริ่มใช้งาน", href: "/oracle/app" },
    },
    {
      key: "pro",
      name: "Pro",
      price: "฿299/เดือน",
      badge: "แนะนำ",
      features: ["ไม่จำกัดจำนวน/วัน", "ประวัติยาวขึ้น", "Billing ผ่าน Stripe", "รองรับงานจริง"],
      cta: { label: "อัปเกรด Pro", action: checkout },
    },
    {
      key: "premium",
      name: "Premium",
      price: "฿599/เดือน",
      badge: "ทีม/นักพัฒนา",
      features: ["ทุกอย่างใน Pro", "Public API + API keys", "โควตา API/วัน", "เหมาะกับ integrator"],
      cta: { label: "ขอ Premium", href: "/oracle/admin" },
    },
  ];

  return (
    <div className="min-h-screen bg-[#08080e]">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Crown className="w-8 h-8 text-[#c9a84c]" />
            <span className="text-xl font-semibold gold-gradient">NaraSuite</span>
          </Link>
          <div className="flex gap-6 items-center">
            <Link href="/oracle/app" className="text-gray-300 hover:text-[#c9a84c] transition-colors">
              กลับไปหน้า App
            </Link>
          </div>
        </div>
      </nav>

      <div className="pt-28 pb-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold gold-gradient mb-2">แผนราคา</h1>
            <p className="text-gray-400">เริ่มต้นฟรี แล้วอัปเกรดเมื่อพร้อม</p>
          </div>

          <div className="glass-card rounded-2xl p-6 mb-8">
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-gray-400 py-6">
                <Loader2 className="w-5 h-5 animate-spin" />
                กำลังโหลด...
              </div>
            ) : usage ? (
              <p className="text-gray-300 text-sm text-center">
                แผนปัจจุบัน:{" "}
                <span className="text-white/90 font-semibold">{usage.plan}</span>
              </p>
            ) : (
              <p className="text-gray-400 text-sm text-center">
                เข้าสู่ระบบเพื่อดูแผนปัจจุบัน
              </p>
            )}
            {msg && <p className="text-red-400 text-sm text-center mt-3">{msg}</p>}
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((p) => (
              <div
                key={p.key}
                className={`glass-card rounded-2xl p-7 border ${
                  p.key === "pro" ? "border-gold/40" : "border-gold/10"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white/90 font-semibold text-lg">{p.name}</p>
                  <span className="px-2 py-1 bg-gold/15 text-gold text-xs rounded">
                    {p.badge}
                  </span>
                </div>
                <p className="text-3xl font-bold text-[#c9a84c] mb-4">{p.price}</p>
                <ul className="space-y-2 text-sm text-gray-400 mb-6">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-green-400">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {"href" in p.cta ? (
                  <Link
                    href={p.cta.href}
                    className={`w-full inline-block text-center px-4 py-3 rounded-xl font-semibold transition-colors ${
                      p.key === "pro"
                        ? "bg-gold text-black hover:bg-gold-light"
                        : "bg-white/5 border border-gold/20 text-white hover:border-gold/40"
                    }`}
                  >
                    {p.cta.label}
                  </Link>
                ) : (
                  <button
                    onClick={p.cta.action}
                    disabled={billingLoading}
                    className="w-full px-4 py-3 rounded-xl font-semibold bg-gold text-black hover:bg-gold-light transition-colors disabled:opacity-50"
                  >
                    {billingLoading ? "กำลังไป Stripe..." : p.cta.label}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="mt-10 p-4 bg-gold/10 rounded-xl border border-gold/20">
            <p className="text-gray-300 text-sm text-center">
              <span className="text-gold font-semibold">Transparency note:</span>{" "}
              ระบบนี้เป็นเครื่องมือเพื่อการสะท้อนตนเอง ไม่ใช่คำทำนายหรือการรับรองผลในชีวิตจริง
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

