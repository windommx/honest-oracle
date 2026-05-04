"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, Loader2, Copy, Trash2 } from "lucide-react";

type KeyItem = {
  id: string;
  label: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export default function OracleApiKeysPage() {
  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [label, setLabel] = useState("");
  const [plain, setPlain] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    const [keysRes, usageRes] = await Promise.all([
      fetch("/api/oracle/api-keys"),
      fetch("/api/oracle/usage"),
    ]);
    const keysJson = await keysRes.json();
    const usageJson = await usageRes.json();
    if (!usageRes.ok) throw new Error(usageJson.error || "Failed to load");
    setPlan(usageJson.plan ?? null);
    if (!keysRes.ok) throw new Error(keysJson.error || "Failed to load");
    setKeys(keysJson.keys ?? []);
  };

  useEffect(() => {
    const run = async () => {
      try {
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const createKey = async () => {
    setPlain(null);
    setError("");
    try {
      const res = await fetch("/api/oracle/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      setPlain(data.plain);
      setLabel("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    }
  };

  const revoke = async (id: string) => {
    setError("");
    try {
      const res = await fetch(`/api/oracle/api-keys/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Revoke failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revoke failed");
    }
  };

  const copy = async () => {
    if (!plain) return;
    await navigator.clipboard.writeText(plain);
  };

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
            <Link href="/oracle/pricing" className="text-gray-300 hover:text-[#c9a84c] transition-colors">
              Pricing
            </Link>
          </div>
        </div>
      </nav>

      <div className="pt-28 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold gold-gradient text-center mb-8">
            API Keys
          </h1>

          <div className="glass-card rounded-2xl p-6">
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-gray-400 py-10">
                <Loader2 className="w-5 h-5 animate-spin" />
                กำลังโหลด...
              </div>
            ) : (
              <>
                {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

                <div className="p-4 bg-white/5 rounded-xl border border-white/5 mb-5">
                  <p className="text-gray-400 text-sm">
                    แผนปัจจุบัน:{" "}
                    <span className="text-white/90 font-semibold">{plan ?? "-"}</span>{" "}
                    (Public API ต้องใช้ Premium)
                  </p>
                </div>

                <div className="grid md:grid-cols-3 gap-3 mb-4">
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="ชื่อสำหรับ key (เช่น production)"
                    className="md:col-span-2 w-full px-4 py-3 bg-white/5 border border-gold/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-gold/50 transition-colors"
                  />
                  <button
                    onClick={createKey}
                    disabled={!label.trim()}
                    className="px-4 py-3 bg-gold text-black font-semibold rounded-xl hover:bg-gold-light transition-colors disabled:opacity-50"
                  >
                    สร้าง Key
                  </button>
                </div>

                {plain && (
                  <div className="p-4 bg-gold/10 rounded-xl border border-gold/20 mb-6">
                    <p className="text-gray-300 text-sm mb-2">
                      API key แสดงครั้งเดียว (คัดลอกไปเก็บทันที)
                    </p>
                    <div className="flex gap-2 items-center flex-wrap">
                      <code className="px-3 py-2 bg-black/40 rounded-lg text-sm text-white/90">
                        {plain}
                      </code>
                      <button
                        onClick={copy}
                        className="px-3 py-2 bg-white/5 border border-gold/20 text-white rounded-xl hover:border-gold/40 transition-colors flex items-center gap-2 text-sm"
                      >
                        <Copy className="w-4 h-4" />
                        คัดลอก
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {keys.length === 0 ? (
                    <div className="text-gray-400 text-sm text-center py-8">
                      ยังไม่มี API key
                    </div>
                  ) : (
                    keys.map((k) => (
                      <div
                        key={k.id}
                        className="p-4 bg-white/5 rounded-xl border border-white/5 flex flex-wrap gap-3 items-center justify-between"
                      >
                        <div>
                          <p className="text-white/90 font-semibold">{k.label}</p>
                          <p className="text-gray-500 text-xs">
                            prefix: {k.prefix} · created:{" "}
                            {new Date(k.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => revoke(k.id)}
                            className="px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl hover:border-red-500/50 transition-colors flex items-center gap-2 text-sm"
                            disabled={Boolean(k.revokedAt)}
                          >
                            <Trash2 className="w-4 h-4" />
                            {k.revokedAt ? "ถูกยกเลิกแล้ว" : "ยกเลิก"}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-8 p-4 bg-white/5 rounded-xl border border-white/5">
                  <p className="text-gray-300 text-sm mb-2 font-semibold">Public API</p>
                  <pre className="text-xs text-gray-400 whitespace-pre-wrap break-words">
{`POST /api/public/oracle
Header: x-api-key: <YOUR_KEY>
Body:
{
  "inputName": "Nara",
  "birthDate": "2020-01-01T00:00:00.000Z",
  "birthTime": "12:00",
  "birthPlace": "Bangkok"
}`}
                  </pre>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

