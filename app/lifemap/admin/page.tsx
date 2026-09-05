"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, Loader2 } from "lucide-react";

type Stats = {
  users: number;
  lifemapReadings: number;
  activeApiKeys: number;
  plans: Array<{ plan: string; count: number }>;
};

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  role: string;
  createdAt: string;
};

export default function LifemapAdminPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    const [sRes, uRes] = await Promise.all([
      fetch("/api/admin/stats"),
      fetch("/api/admin/users"),
    ]);
    const s = await sRes.json();
    const u = await uRes.json();
    if (!sRes.ok) throw new Error(s.error || "Failed to load stats");
    if (!uRes.ok) throw new Error(u.error || "Failed to load users");
    setStats(s);
    setUsers(u.users ?? []);
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

  const updateUser = async (id: string, patch: Partial<Pick<UserRow, "plan" | "role">>) => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Update failed");
    }
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...data.user } : u))
    );
  };

  return (
    <div className="min-h-screen bg-[#08080e]">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Crown className="w-8 h-8 text-[#c9a84c]" />
            <span className="text-xl font-semibold gold-gradient">NaraClear</span>
          </Link>
          <div className="flex gap-6 items-center">
            <Link href="/lifemap/app" className="text-gray-300 hover:text-[#c9a84c] transition-colors">
              โครงสร้างชีวิต
            </Link>
          </div>
        </div>
      </nav>

      <div className="pt-28 pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold gold-gradient">Admin</h1>
          </div>

          <div className="glass-card rounded-2xl p-6 mb-8">
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-gray-400 py-10">
                <Loader2 className="w-5 h-5 animate-spin" />
                กำลังโหลด...
              </div>
            ) : error ? (
              <div className="text-red-400 text-sm">{error}</div>
            ) : stats ? (
              <>
                <div className="grid md:grid-cols-4 gap-4">
                  {[
                    { label: "ผู้ใช้ทั้งหมด", value: stats.users },
                    { label: "Lifemap Readings", value: stats.lifemapReadings },
                    { label: "Active API Keys", value: stats.activeApiKeys },
                    { label: "Plans", value: stats.plans.reduce((a, p) => a + p.count, 0) },
                  ].map((c) => (
                    <div key={c.label} className="p-4 bg-white/5 rounded-xl border border-white/5">
                      <p className="text-gray-500 text-xs">{c.label}</p>
                      <p className="text-3xl font-bold text-[#c9a84c] mt-1">{c.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/5">
                  <p className="text-gray-300 text-sm font-semibold mb-3">Plan distribution</p>
                  <div className="grid md:grid-cols-3 gap-3">
                    {stats.plans.map((p) => (
                      <div key={p.plan} className="p-3 bg-black/20 rounded-lg">
                        <p className="text-gray-500 text-xs">{p.plan}</p>
                        <p className="text-white/90 font-semibold">{p.count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white/90">Users</h2>
              <button
                onClick={() => load().catch((e) => setError(e instanceof Error ? e.message : "Failed"))}
                className="px-4 py-2 bg-white/5 border border-gold/20 text-white rounded-xl hover:border-gold/40 transition-colors text-sm"
              >
                รีเฟรช
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-white/5">
                    <th className="py-3 px-3 text-left">Email</th>
                    <th className="py-3 px-3 text-left">Name</th>
                    <th className="py-3 px-3 text-left">Plan</th>
                    <th className="py-3 px-3 text-left">Role</th>
                    <th className="py-3 px-3 text-left">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-white/5">
                      <td className="py-3 px-3 text-white/90">{u.email}</td>
                      <td className="py-3 px-3 text-gray-300">{u.name ?? "-"}</td>
                      <td className="py-3 px-3">
                        <select
                          value={u.plan}
                          onChange={(e) =>
                            updateUser(u.id, { plan: e.target.value })
                              .then(() => load())
                              .catch((err) => setError(err.message))
                          }
                          className="px-3 py-2 bg-white/5 border border-gold/20 rounded-xl text-white focus:outline-none focus:border-gold/40"
                        >
                          <option value="free" className="bg-[#08080e]">
                            free
                          </option>
                          <option value="pro" className="bg-[#08080e]">
                            pro
                          </option>
                          <option value="premium" className="bg-[#08080e]">
                            premium
                          </option>
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={u.role}
                          onChange={(e) =>
                            updateUser(u.id, { role: e.target.value })
                              .then(() => load())
                              .catch((err) => setError(err.message))
                          }
                          className="px-3 py-2 bg-white/5 border border-gold/20 rounded-xl text-white focus:outline-none focus:border-gold/40"
                        >
                          <option value="user" className="bg-[#08080e]">
                            user
                          </option>
                          <option value="admin" className="bg-[#08080e]">
                            admin
                          </option>
                        </select>
                      </td>
                      <td className="py-3 px-3 text-gray-400">
                        {new Date(u.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

