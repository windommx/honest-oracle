"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, Loader2 } from "lucide-react";

type ReadingListItem = {
  id: string;
  inputName: string;
  birthDate: string;
  createdAt: string;
  visibility: string;
  shareToken: string;
};

export default function LifemapHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ReadingListItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/lifemap/readings");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");
        setItems(data.readings ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  return (
    <div className="min-h-screen bg-[#f3f5f9]">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Crown className="w-8 h-8 text-[#7a5c12]" />
            <span className="text-xl font-semibold gold-gradient">NaraClear</span>
          </Link>
          <div className="flex gap-6 items-center">
            <Link href="/lifemap/app" className="text-gray-700 hover:text-[#6b5010] transition-colors">
              สร้างใหม่
            </Link>
            <Link href="/lifemap/api-keys" className="text-gray-700 hover:text-[#6b5010] transition-colors">
              API Keys
            </Link>
          </div>
        </div>
      </nav>

      <div className="pt-28 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold gold-gradient text-center mb-8">
            ประวัติโครงสร้างชีวิต
          </h1>

          <div className="glass-card rounded-2xl p-6">
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-gray-600 py-10">
                <Loader2 className="w-5 h-5 animate-spin" />
                กำลังโหลด...
              </div>
            ) : error ? (
              <div className="text-red-700 text-sm">{error}</div>
            ) : items.length === 0 ? (
              <div className="text-gray-600 text-sm text-center py-10">
                ยังไม่มีประวัติ{" "}
                <Link href="/lifemap/app" className="text-[#7a5c12] font-semibold">
                  สร้างแผนที่แรก
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((r) => {
                  const created = new Date(r.createdAt).toLocaleString();
                  const share =
                    r.visibility === "public"
                      ? `/lifemap/share/${r.shareToken}`
                      : null;
                  return (
                    <div
                      key={r.id}
                      className="p-4 bg-black/[0.03] rounded-xl border border-black/5 flex flex-wrap gap-3 items-center justify-between"
                    >
                      <div>
                        <p className="text-[#14161c]/90 font-semibold">
                          {r.inputName} · {new Date(r.birthDate).toISOString().slice(0, 10)}
                        </p>
                        <p className="text-gray-600 text-xs">{created}</p>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Link
                          href={`/api/lifemap/readings/${r.id}`}
                          className="px-3 py-2 bg-black/[0.03] border border-[#7a5c12]/25 text-[#14161c] rounded-xl hover:border-[#7a5c12]/50 transition-colors text-sm"
                        >
                          ดู JSON
                        </Link>
                        {share && (
                          <a
                            href={share}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-2 bg-[#d9a63a] text-black font-semibold rounded-xl hover:bg-[#c8901f] transition-colors text-sm"
                          >
                            เปิดลิงก์แชร์
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
