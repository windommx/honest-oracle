"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Crown, BookOpen, Play, Loader2, Save, Check, KeyRound } from "lucide-react";
import { PROVIDERS, type Provider } from "@/lib/rush-engine/llm-provider";
import { saveManuscript } from "../_manuscript-store";

export default function StudioPage() {
  const [provider, setProvider] = useState<Provider>("anthropic");
  const meta = useMemo(() => PROVIDERS.find((p) => p.id === provider)!, [provider]);
  const [model, setModel] = useState(meta.models[0]);
  const [apiKey, setApiKey] = useState("");
  const [rememberKey, setRememberKey] = useState(false);
  const [system, setSystem] = useState("");
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveLang, setSaveLang] = useState<"th" | "en">("th");

  // One-time migration: delete any provider keys a previous build leaked to
  // localStorage (it now lives in memory, or tab-scoped sessionStorage on opt-in).
  useEffect(() => {
    try {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith("rush.studio.key."))
        .forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  }, []);

  // Load the key only if the user opted into tab-scoped persistence (sessionStorage).
  useEffect(() => {
    setModel(meta.models[0]);
    try {
      const saved = window.sessionStorage.getItem(`rush.studio.key.${provider}`);
      setApiKey(saved ?? "");
      setRememberKey(!!saved);
    } catch {
      /* ignore */
    }
  }, [provider, meta]);

  // Prefill from "Run in Studio" on the generator (passed via sessionStorage).
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("rush.studio.prefill");
      if (raw) {
        const d = JSON.parse(raw) as { system?: string; prompt?: string };
        if (d.system) setSystem(d.system);
        if (d.prompt) setPrompt(d.prompt);
        window.sessionStorage.removeItem("rush.studio.prefill");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const sessKey = `rush.studio.key.${provider}`;
  const onKey = (v: string) => {
    setApiKey(v);
    try {
      if (rememberKey) window.sessionStorage.setItem(sessKey, v);
    } catch {
      /* ignore */
    }
  };
  const toggleRemember = (on: boolean) => {
    setRememberKey(on);
    try {
      if (on) window.sessionStorage.setItem(sessKey, apiKey);
      else window.sessionStorage.removeItem(sessKey);
    } catch {
      /* ignore */
    }
  };
  const clearKey = () => {
    setApiKey("");
    setRememberKey(false);
    try {
      window.sessionStorage.removeItem(sessKey);
    } catch {
      /* ignore */
    }
  };

  async function run() {
    setError("");
    setOutput("");
    if (!apiKey.trim() || !prompt.trim()) {
      setError("ใส่ API key และ prompt ก่อน");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/rush/studio/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model, apiKey, system: system || undefined, prompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "รันไม่สำเร็จ");
        if (res.status === 401) setError(data.error === "Unauthorized" ? "ต้องเข้าสู่ระบบก่อน" : data.error);
      } else {
        setOutput(data.text ?? "");
      }
    } catch {
      setError("เครือข่ายมีปัญหา ลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  function saveOutput() {
    if (!output.trim()) return;
    void saveManuscript({ title: `Studio ${new Date().toLocaleString()}`, lang: saveLang, text: output }).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="min-h-screen bg-[#08080e]">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Crown className="w-7 h-7 text-[#c9a84c]" />
            <span className="text-lg font-semibold gold-gradient">NaraSuite</span>
          </Link>
          <div className="flex items-center gap-3 text-xs">
            <Link href="/rush" className="text-gray-400 hover:text-[#c9a84c]">เครื่องมือ prompt</Link>
            <Link href="/rush/dashboard" className="text-gray-400 hover:text-[#c9a84c]">แดชบอร์ด</Link>
            <span className="flex items-center gap-1.5 text-[#c9a84c] border border-[#c9a84c]/30 rounded-lg px-3 py-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Rush Studio
            </span>
          </div>
        </div>
      </nav>

      <div className="pt-24 pb-16 px-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold gold-gradient">Rush Studio</h1>
          <p className="text-gray-400 mt-1 text-sm mb-2">
            รัน prompt ด้วย <span className="text-[#c9a84c]">API key ของคุณเอง</span> — เซิร์ฟเวอร์ไม่เก็บ key และไม่จ่าย token ให้
          </p>
          <p className="text-[0.7rem] text-amber-300/80 mb-6 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" /> ปกติ key อยู่ในหน่วยความจำหน้านี้เท่านั้น (หายเมื่อรีเฟรช) และส่งผ่าน proxy เฉพาะตอนกดรัน — ไม่ลงเซิร์ฟเวอร์/ดิสก์ เว้นแต่คุณติ๊ก &quot;จำ key ไว้ในแท็บนี้&quot;
          </p>

          <div className="grid lg:grid-cols-2 gap-5">
            {/* left: inputs */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-[0.7rem] text-gray-400 mb-1">ผู้ให้บริการ</span>
                  <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)} className="input">
                    {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[0.7rem] text-gray-400 mb-1">โมเดล</span>
                  <select value={model} onChange={(e) => setModel(e.target.value)} className="input">
                    {meta.models.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="flex items-center justify-between text-[0.7rem] text-gray-400 mb-1">
                  <span>API key ({meta.keyHint})</span>
                  {apiKey && <button type="button" onClick={clearKey} className="text-[#c9a84c] hover:underline">ล้าง key</button>}
                </span>
                <input type="password" value={apiKey} onChange={(e) => onKey(e.target.value)} placeholder={meta.keyHint} className="input" />
                <label className="flex items-center gap-1.5 text-[0.65rem] text-gray-500 mt-1.5 cursor-pointer">
                  <input type="checkbox" checked={rememberKey} onChange={(e) => toggleRemember(e.target.checked)} className="accent-[#c9a84c]" />
                  จำ key ไว้ในแท็บนี้ (ล้างเมื่อปิดแท็บ)
                </label>
              </label>
              <label className="block">
                <span className="block text-[0.7rem] text-gray-400 mb-1">System prompt (เช่น MASTER จากเครื่องมือ prompt)</span>
                <textarea value={system} onChange={(e) => setSystem(e.target.value)} placeholder="ไม่บังคับ — วาง MASTER system prompt ที่นี่" className="input min-h-[90px] resize-y" />
              </label>
              <label className="block">
                <span className="block text-[0.7rem] text-gray-400 mb-1">Prompt</span>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="วาง prompt บท/โมดูลที่นี่…" className="input min-h-[150px] resize-y" />
              </label>
              <button
                onClick={run}
                disabled={loading}
                className="w-full py-2.5 bg-[#c9a84c] text-black font-semibold rounded-xl hover:bg-[#d4b96a] transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {loading ? "กำลังรัน…" : "รัน"}
              </button>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>

            {/* right: output */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[0.7rem] text-gray-400">ผลลัพธ์</span>
                {output && (
                  <div className="flex items-center gap-2">
                    <select value={saveLang} onChange={(e) => setSaveLang(e.target.value as "th" | "en")} className="text-[0.65rem] bg-[#08080e] border border-white/10 rounded px-1.5 py-0.5 text-gray-300">
                      <option value="th">ไทย</option>
                      <option value="en">EN</option>
                    </select>
                    <button onClick={saveOutput} className="text-[0.65rem] px-2 py-1 rounded border border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10 flex items-center gap-1">
                      {saved ? <Check className="w-3 h-3 text-green-400" /> : <Save className="w-3 h-3" />}
                      {saved ? "บันทึกแล้ว → แดชบอร์ด" : "บันทึกเป็นต้นฉบับ"}
                    </button>
                  </div>
                )}
              </div>
              <div className="bg-[#0d0d15] border border-white/10 rounded-xl p-4 text-sm text-gray-200 whitespace-pre-wrap min-h-[420px] max-h-[600px] overflow-y-auto">
                {output || <span className="text-gray-600">ผลลัพธ์จะแสดงที่นี่ — บันทึกเป็นต้นฉบับเพื่อนำไปวิเคราะห์/รัน NIS ต่อ</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
