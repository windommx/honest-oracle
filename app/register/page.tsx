"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crown, Loader2, AlertCircle } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (password !== confirmPassword) {
      setError("รหัสผ่านไม่ตรงกัน");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      router.push("/login?registered=true");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08080e] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <Crown className="w-10 h-10 text-[#c9a84c]" />
            <span className="text-2xl font-semibold gold-gradient">NaraSuite</span>
          </Link>
          <h1 className="text-2xl font-bold mb-2">สมัครสมาชิก</h1>
          <p className="text-gray-400">สร้างบัญชีเพื่อใช้งาน NaraSuite</p>
        </div>

        <div className="glass-card rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">ชื่อ (ไม่บังคับ)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-gold/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-gold/50 transition-colors"
                placeholder="กรอกชื่อของคุณ"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">อีเมล</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-gold/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-gold/50 transition-colors"
                placeholder="กรอกอีเมล"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">รหัสผ่าน</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-gold/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-gold/50 transition-colors"
                placeholder="กรอกรหัสผ่าน (อย่างน้อย 6 ตัว)"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">ยืนยันรหัสผ่าน</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-gold/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-gold/50 transition-colors"
                placeholder="กรอกรหัสผ่านอีกครั้ง"
                required
              />
            </div>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-400">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gold text-black font-semibold rounded-xl hover:bg-gold-light transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              {loading ? "กำลังสมัครสมาชิก..." : "สมัครสมาชิก"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-400">
              มีบัญชีอยู่แล้ว?{" "}
              <Link href="/login" className="text-gold hover:underline">
                เข้าสู่ระบบ
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
