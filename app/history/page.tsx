"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Crown, Loader2, History as HistoryIcon, ExternalLink, User, Building2, Baby, RefreshCw } from "lucide-react";

type TabType = "personal" | "corporate" | "child" | "rename";

export default function HistoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("personal");
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated") {
      fetchHistory();
    }
  }, [status, router, activeTab]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      let endpoint = "/api/history";
      if (activeTab === "corporate") endpoint = "/api/corporate";
      else if (activeTab === "child") endpoint = "/api/child";
      else if (activeTab === "rename") endpoint = "/api/rename";
      
      const res = await fetch(endpoint);
      const data = await res.json();
      setHistory(data);
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: "personal" as TabType, label: "บุคคล", icon: User },
    { id: "corporate" as TabType, label: "องค์กร", icon: Building2 },
    { id: "child" as TabType, label: "เด็ก", icon: Baby },
    { id: "rename" as TabType, label: "เปลี่ยนชื่อ", icon: RefreshCw },
  ];

  const getHref = (tab: TabType) => {
    switch (tab) {
      case "personal": return "/analyze";
      case "corporate": return "/corporate";
      case "child": return "/child";
      case "rename": return "/rename";
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-[#f3f5f9] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#7a5c12] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f5f9]">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Crown className="w-8 h-8 text-[#7a5c12]" />
            <span className="text-xl font-semibold gold-gradient">NaraClear</span>
          </Link>
          <div className="flex gap-6 items-center">
            <Link href="/analyze" className="text-gray-700 hover:text-[#6b5010] transition-colors">วิเคราะห์ชื่อ</Link>
            <Link href="/corporate" className="text-gray-700 hover:text-[#6b5010] transition-colors">องค์กร</Link>
            <Link href="/history" className="text-[#7a5c12]">ประวัติ</Link>
          </div>
        </div>
      </nav>

      <div className="pt-28 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-center mb-2 gold-gradient">ประวัติการวิเคราะห์</h1>
          <p className="text-gray-600 text-center mb-8">ดูประวัติการวิเคราะห์ทั้งหมดของคุณ</p>

          <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl whitespace-nowrap transition-all ${
                  activeTab === id
                    ? "bg-[#d9a63a] text-black font-medium"
                    : "bg-black/[0.03] text-gray-600 hover:bg-black/[0.07]"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {history.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <HistoryIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-600 mb-6">ยังไม่มีประวัติการวิเคราะห์</p>
              <Link
                href={getHref(activeTab)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#d9a63a] text-black font-medium rounded-xl hover:bg-[#c8901f] transition-colors"
              >
                ไปวิเคราะห์ <ExternalLink className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((item, index) => (
                <div key={item.id || index} className="glass-card rounded-2xl p-6 hover:border-[#7a5c12]/30 transition-colors">
                  {activeTab === "personal" && (
                    <>
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-semibold mb-1">
                            {item.firstName} {item.lastName}
                          </h3>
                          <p className="text-gray-600 text-sm">
                            วันเกิด: {item.birthday} • {new Date(item.createdAt).toLocaleDateString("th-TH")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-600 text-xs">คะแนนรวม</p>
                          <p className={`text-3xl font-bold ${
                            item.totalScore >= 80 ? "score-excellent" :
                            item.totalScore >= 60 ? "score-good" :
                            item.totalScore >= 40 ? "score-moderate" : "score-caution"
                          }`}>
                            {item.totalScore}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-[#7a5c12]/10 flex gap-6 text-sm">
                        <div>
                          <span className="text-gray-600">กาลกิณี: </span>
                          <span className={item.kalaiganiScore >= 80 ? "text-green-800" : item.kalaiganiScore >= 60 ? "text-yellow-800" : "text-red-700"}>{item.kalaiganiScore}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">เลขศาสตร์: </span>
                          <span className={item.numerologyScore >= 80 ? "text-green-800" : item.numerologyScore >= 60 ? "text-yellow-800" : "text-red-700"}>{item.numerologyScore}</span>
                        </div>
                      </div>
                    </>
                  )}
                  
                  {activeTab === "corporate" && (
                    <>
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-semibold mb-1">{item.brandName}</h3>
                          <p className="text-gray-600 text-sm">
                            {item.industryType} • {new Date(item.createdAt).toLocaleDateString("th-TH")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-600 text-xs">CAI</p>
                          <p className={`text-3xl font-bold ${
                            item.cai >= 72 ? "text-green-800" : item.cai >= 60 ? "text-yellow-800" : "text-red-700"
                          }`}>
                            {item.cai}/10
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                  
                  {activeTab === "child" && (
                    <>
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-semibold mb-1">เพศ: {item.gender === "male" ? "ชาย" : "หญิง"}</h3>
                          <p className="text-gray-600 text-sm">
                            วันเกิด: {item.birthDay} • {new Date(item.createdAt).toLocaleDateString("th-TH")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-600 text-xs">เลขเป้าหมาย</p>
                          <p className="text-3xl font-bold text-[#7a5c12]">{item.targetNumber}</p>
                        </div>
                      </div>
                    </>
                  )}
                  
                  {activeTab === "rename" && (
                    <>
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-semibold mb-1">
                            {item.currentName} {item.currentSurname}
                          </h3>
                          <p className="text-gray-600 text-sm">
                            วันเกิด: {item.birthDay} • {new Date(item.createdAt).toLocaleDateString("th-TH")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-600 text-xs">เลขเป้าหมาย</p>
                          <p className="text-3xl font-bold text-[#7a5c12]">{item.targetNumber}</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
