"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "../_toast";
import Link from "next/link";
import { BookisdomLogo } from "../_logo";
import { BookOpen, Play, Loader2, Save, Check, KeyRound, ShieldCheck, Server, BookMarked } from "lucide-react";
import { PROVIDERS, DIRECT_BROWSER, validateRunInput, type Provider } from "@/lib/bookisdom-engine/llm-provider";
import { saveManuscript } from "../_manuscript-store";
import { runDirect } from "../_studio-direct";
import { listBooks, addChapter, updateChapter, type WritingBook } from "../_writing-store";

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
  // Writer-Room bridge: the output can land as a NEW CHAPTER of a book instead of a loose
  // manuscript — the chapter's title is the first line of the output.
  const [books, setBooks] = useState<WritingBook[]>([]);
  const [targetBook, setTargetBook] = useState("");
  const [savedChapter, setSavedChapter] = useState(false);
  useEffect(() => { listBooks().then(setBooks).catch(() => setBooks([])); }, []);
  // Transport. DIRECT = browser → provider (Bookisdom's server never sees the text or the
  // key). RELAY = through /api/bookisdom/studio/run. Direct is the default wherever we have
  // MEASURED that the provider's API accepts a browser preflight; elsewhere it is offered
  // but labelled untested. A blocked direct call never falls back silently — the writer
  // is told, and chooses.
  const [direct, setDirect] = useState(true);
  const [offerRelay, setOfferRelay] = useState(false);
  const support = DIRECT_BROWSER[provider];

  // One-time migration: delete any provider keys a previous build leaked to
  // localStorage (it now lives in memory, or tab-scoped sessionStorage on opt-in).
  useEffect(() => {
    try {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith("bookisdom.studio.key."))
        .forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  }, []);

  // Load the key only if the user opted into tab-scoped persistence (sessionStorage).
  useEffect(() => {
    setModel(meta.models[0]);
    setDirect(true);
    setOfferRelay(false);
    try {
      const saved = window.sessionStorage.getItem(`bookisdom.studio.key.${provider}`);
      setApiKey(saved ?? "");
      setRememberKey(!!saved);
    } catch {
      /* ignore */
    }
  }, [provider, meta]);

  // Prefill from "Run in Studio" on the generator (passed via sessionStorage).
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("bookisdom.studio.prefill");
      if (raw) {
        const d = JSON.parse(raw) as { system?: string; prompt?: string };
        if (d.system) setSystem(d.system);
        if (d.prompt) setPrompt(d.prompt);
        window.sessionStorage.removeItem("bookisdom.studio.prefill");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const sessKey = `bookisdom.studio.key.${provider}`;
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

  async function run(useDirect: boolean = direct) {
    setError("");
    setOutput("");
    setOfferRelay(false);
    if (!apiKey.trim() || !prompt.trim()) {
      setError("ใส่ API key และ prompt ก่อน");
      return;
    }
    const body = { provider, model, apiKey, system: system || undefined, prompt };
    // Same gate as the server, before anything leaves the tab.
    const v = validateRunInput(body);
    if (!v.ok) { setError(v.error); return; }
    setLoading(true);
    try {
      if (useDirect) {
        const r = await runDirect(body);
        if (r.ok) setOutput(r.text);
        else {
          setError(r.kind === "auth" ? `key ถูกปฏิเสธโดยผู้ให้บริการ: ${r.message}` : r.message);
          if (r.kind === "blocked") setOfferRelay(true);
        }
        return;
      }
      const res = await fetch("/api/bookisdom/studio/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "รันไม่สำเร็จ");
        if (res.status === 401) setError(data.error === "Unauthorized" ? "ต้องเข้าสู่ระบบก่อน (โหมดผ่านเซิร์ฟเวอร์ต้องมีบัญชี — โหมดส่งตรงไม่ต้อง)" : data.error);
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
    void saveManuscript({ title: `Studio ${new Date().toLocaleString()}`, lang: saveLang, text: output })
      .then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      })
      // saveManuscript now throws when BOTH stores are full. Without this catch the promise
      // rejects unhandled and the writer sees NOTHING — they think the save worked.
      .catch(() => {
        toast("บันทึกไม่สำเร็จ — พื้นที่เก็บของเบราว์เซอร์เต็ม ผลลัพธ์นี้ยังไม่ถูกบันทึก คัดลอกเก็บไว้ก่อน", { variant: "error" });
      });
  }

  async function saveAsChapter() {
    if (!output.trim() || !targetBook) return;
    const firstLine = output.trim().split(/\r?\n/)[0].slice(0, 80);
    try {
      const ch = await addChapter(targetBook, firstLine);
      await updateChapter(ch.id, { content: output });
      setSavedChapter(true);
      setTimeout(() => setSavedChapter(false), 2500);
      toast(`เพิ่มเป็นบทใหม่ใน "${books.find((b) => b.id === targetBook)?.title ?? "เล่ม"}" แล้ว`);
    } catch {
      toast("เพิ่มบทไม่สำเร็จ — พื้นที่เก็บของเบราว์เซอร์อาจเต็ม", { variant: "error" });
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f5f9]">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <BookisdomLogo />
          <div className="flex items-center gap-3 text-xs">
            <Link href="/bookisdom" className="text-slate-600 hover:text-[#6b5010]">เครื่องมือ prompt</Link>
            <Link href="/bookisdom/dashboard" className="text-slate-600 hover:text-[#6b5010]">แดชบอร์ด</Link>
            <Link href="/bookisdom/kdp" className="text-slate-600 hover:text-[#6b5010] flex items-center gap-1"><BookMarked className="w-3.5 h-3.5" />KDP</Link>
            <span className="flex items-center gap-1.5 text-[#7a5c12] border border-[#7a5c12]/30 rounded-lg px-3 py-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Bookisdom Studio
            </span>
          </div>
        </div>
      </nav>

      <div className="pt-24 pb-16 px-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold accent-gradient">Bookisdom Studio</h1>
          <p className="text-slate-600 mt-1 text-sm mb-2">
            รัน prompt ด้วย <span className="text-[#7a5c12]">API key ของคุณเอง</span> — เซิร์ฟเวอร์ไม่เก็บ key และไม่จ่าย token ให้
          </p>
          <p className="text-[0.7rem] text-amber-800 mb-4 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" /> key อยู่ในหน่วยความจำหน้านี้เท่านั้น (หายเมื่อรีเฟรช) — ไม่ลงเซิร์ฟเวอร์/ดิสก์ เว้นแต่คุณติ๊ก &quot;จำ key ไว้ในแท็บนี้&quot;
          </p>

          {/* Transport — the privacy claim is made HERE, per provider, with the evidence. */}
          <div className="mb-6 rounded-xl border border-black/10 bg-[#ffffff] p-3 text-xs" role="group" aria-label="เส้นทางการส่ง">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => { setDirect(true); setOfferRelay(false); }}
                aria-pressed={direct}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors ${direct ? "border-[#7a5c12] text-[#7a5c12] bg-[#d9a63a]/10" : "border-black/10 text-slate-600 hover:border-[#7a5c12]/40"}`}
              >
                <ShieldCheck className="w-3.5 h-3.5" /> ส่งตรงจากเบราว์เซอร์
              </button>
              <button
                type="button"
                onClick={() => { setDirect(false); setOfferRelay(false); }}
                aria-pressed={!direct}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors ${!direct ? "border-[#7a5c12] text-[#7a5c12] bg-[#d9a63a]/10" : "border-black/10 text-slate-600 hover:border-[#7a5c12]/40"}`}
              >
                <Server className="w-3.5 h-3.5" /> ผ่านเซิร์ฟเวอร์ Bookisdom
              </button>
              {direct && (
                <span className={`ml-auto text-[0.65rem] ${support.cors === "verified" ? "text-[#166534]" : "text-amber-800"}`}>
                  {support.cors === "verified" ? `ตรวจแล้วว่ารับคำขอตรง (ณ ${support.asOf})` : `ยังไม่ได้ตรวจกับ ${meta.label} (ณ ${support.asOf}) — ถ้าถูกปฏิเสธจะบอก ไม่สลับเงียบ ๆ`}
                </span>
              )}
            </div>
            <p className="text-faint mt-2 leading-relaxed">
              {direct
                ? <>ต้นฉบับและ key เดินทางจากแท็บนี้ไป {meta.label} โดยตรง — <span className="text-slate-700">เซิร์ฟเวอร์ Bookisdom ไม่เห็นทั้งสองอย่าง</span> และไม่ต้องเข้าสู่ระบบ สิ่งที่ยังจริงอยู่: ผู้ให้บริการที่คุณเลือกเห็นต้นฉบับ (ตามข้อตกลงของเขา ไม่ใช่ของเรา)</>
                : <>ต้นฉบับผ่านเซิร์ฟเวอร์ Bookisdom ไป {meta.label} — เซิร์ฟเวอร์ไม่เก็บ key และไม่เก็บข้อความ แต่ <span className="text-slate-700">ข้อความผ่านเครื่องเราหนึ่งครั้ง</span> ใช้เมื่อผู้ให้บริการปฏิเสธคำขอตรงจากเบราว์เซอร์ (ต้องมีบัญชี)</>}
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            {/* left: inputs */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-[0.7rem] text-slate-600 mb-1">ผู้ให้บริการ</span>
                  <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)} className="input">
                    {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[0.7rem] text-slate-600 mb-1">โมเดล</span>
                  <select value={model} onChange={(e) => setModel(e.target.value)} className="input">
                    {meta.models.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="flex items-center justify-between text-[0.7rem] text-slate-600 mb-1">
                  <span>API key ({meta.keyHint})</span>
                  {apiKey && <button type="button" onClick={clearKey} className="text-[#7a5c12] hover:underline">ล้าง key</button>}
                </span>
                <input type="password" value={apiKey} onChange={(e) => onKey(e.target.value)} placeholder={meta.keyHint} className="input" />
                <label className="flex items-center gap-1.5 text-[0.65rem] text-faint mt-1.5 cursor-pointer">
                  <input type="checkbox" checked={rememberKey} onChange={(e) => toggleRemember(e.target.checked)} className="accent-[#c8901f]" />
                  จำ key ไว้ในแท็บนี้ (ล้างเมื่อปิดแท็บ)
                </label>
              </label>
              <label className="block">
                <span className="block text-[0.7rem] text-slate-600 mb-1">System prompt (เช่น MASTER จากเครื่องมือ prompt)</span>
                <textarea value={system} onChange={(e) => setSystem(e.target.value)} placeholder="ไม่บังคับ — วาง MASTER system prompt ที่นี่" className="input min-h-[90px] resize-y" />
              </label>
              <label className="block">
                <span className="block text-[0.7rem] text-slate-600 mb-1">Prompt</span>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="วาง prompt บท/โมดูลที่นี่…" className="input min-h-[150px] resize-y" />
              </label>
              <button
                onClick={() => run()}
                disabled={loading}
                className="w-full py-2.5 bg-[#d9a63a] text-black font-semibold rounded-xl hover:bg-[#c8901f] transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {loading ? "กำลังรัน…" : "รัน"}
              </button>
              {error && <p className="text-xs text-red-700">{error}</p>}
              {offerRelay && (
                <button
                  type="button"
                  onClick={() => { setDirect(false); void run(false); }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-amber-700/40 text-amber-800 hover:bg-amber-300/10 flex items-center gap-1.5"
                >
                  <Server className="w-3.5 h-3.5" /> ส่งผ่านเซิร์ฟเวอร์ Bookisdom แทน (ข้อความจะผ่านเครื่องเราหนึ่งครั้ง)
                </button>
              )}
            </div>

            {/* right: output */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[0.7rem] text-slate-600">ผลลัพธ์</span>
                {output && (
                  <div className="flex items-center gap-2">
                    <select value={saveLang} onChange={(e) => setSaveLang(e.target.value as "th" | "en")} className="text-[0.65rem] bg-[#f3f5f9] border border-black/10 rounded px-1.5 py-0.5 text-slate-700">
                      <option value="th">ไทย</option>
                      <option value="en">EN</option>
                    </select>
                    <button onClick={saveOutput} className="text-[0.65rem] px-2 py-1 rounded border border-[#7a5c12]/40 text-[#7a5c12] hover:bg-[#d9a63a]/15 flex items-center gap-1">
                      {saved ? <Check className="w-3 h-3 text-green-800" /> : <Save className="w-3 h-3" />}
                      {saved ? "บันทึกแล้ว → แดชบอร์ด" : "บันทึกเป็นต้นฉบับ"}
                    </button>
                    {books.length > 0 && (
                      <>
                        <select value={targetBook} onChange={(e) => setTargetBook(e.target.value)} className="text-[0.65rem] bg-[#f3f5f9] border border-black/10 rounded px-1.5 py-0.5 text-slate-700" aria-label="เล่มปลายทาง">
                          <option value="">เล่มในห้องเขียน…</option>
                          {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
                        </select>
                        <button onClick={() => void saveAsChapter()} disabled={!targetBook} className="text-[0.65rem] px-2 py-1 rounded border border-[#7a5c12]/40 text-[#7a5c12] hover:bg-[#d9a63a]/15 disabled:opacity-50 flex items-center gap-1">
                          {savedChapter ? <Check className="w-3 h-3 text-green-800" /> : <BookMarked className="w-3 h-3" />}
                          {savedChapter ? "เพิ่มบทแล้ว" : "เป็นบทใหม่ในเล่ม"}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="bg-[#ffffff] border border-black/10 rounded-xl p-4 text-sm text-slate-800 whitespace-pre-wrap min-h-[420px] max-h-[600px] overflow-y-auto">
                {output || <span className="text-faint">ผลลัพธ์จะแสดงที่นี่ — บันทึกเป็นต้นฉบับเพื่อนำไปวิเคราะห์/รัน NIS ต่อ</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
