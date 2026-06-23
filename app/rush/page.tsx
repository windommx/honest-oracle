"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Crown,
  AlertCircle,
  Download,
  BookOpen,
  Sparkles,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  Save,
  FileJson,
  FileText,
  HelpCircle,
  Share2,
  Languages,
  LayoutGrid,
} from "lucide-react";
import { titleCase, copyText, slug, downloadBlob } from "./_utils";
import { GROUP_COLORS, Field, Stat, FilterChip, GuideModal, ThaiAnalyzerModal, ProseAnalyzerModal } from "./_components";
import { getManuscript } from "./_manuscript-store";
import {
  BOOK_TYPES,
  MODULE_GROUPS,
  TH_GROUP_LABEL,
  defaultGroupsFor,
  generateAllPrompts,
  type BookConfig,
  type BookTypeKey,
  type GeneratedPrompt,
  type PromptGroup,
} from "@/lib/rush-engine/engine";

const PAGE_SIZE = 40;

type OptionalGroup = Exclude<PromptGroup, "core">;

type SavedProject = {
  id: string;
  title: string;
  type: string;
  subGenre: string;
  updatedAt: string;
};

const VOICES = ["conversational", "academic", "inspirational", "practical", "storytelling", "witty"];
const CITATIONS = ["APA", "MLA", "Chicago", "inline", "none"];

export default function RushPage() {
  const [type, setType] = useState<BookTypeKey>("nonfiction");
  const [subGenre, setSubGenre] = useState<string>(BOOK_TYPES.nonfiction.sub_genres[0]);
  const [title, setTitle] = useState("");
  const [thesis, setThesis] = useState("");
  const [reader, setReader] = useState("");
  const [voice, setVoice] = useState("conversational");
  const [chapters, setChapters] = useState(BOOK_TYPES.nonfiction.default_chapters);
  const [wordsPerChapter, setWordsPerChapter] = useState(BOOK_TYPES.nonfiction.default_words);
  const [citationStyle, setCitationStyle] = useState("inline");
  const [language, setLanguage] = useState<BookConfig["language"]>("thai");
  const [outline, setOutline] = useState("");
  const [storyBible, setStoryBible] = useState("");
  const [promptLanguage, setPromptLanguage] = useState<"en" | "th">("en");

  const [groups, setGroups] = useState<OptionalGroup[]>(defaultGroupsFor("nonfiction"));
  const [prompts, setPrompts] = useState<GeneratedPrompt[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<PromptGroup | "all">("all");

  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [shareInfo, setShareInfo] = useState<{ token: string | null; visibility: string }>({ token: null, visibility: "private" });
  const [versions, setVersions] = useState<{ id: string; createdAt: string; config: BookConfig }[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showAnalyzer, setShowAnalyzer] = useState(false);
  const [showProse, setShowProse] = useState(false);
  const [analyzeText, setAnalyzeText] = useState<string | undefined>(undefined);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const allGroups = MODULE_GROUPS.map((m) => m.key);
  const groupLabel = (g: PromptGroup) => (promptLanguage === "th" ? TH_GROUP_LABEL[g] ?? g : titleCase(g));

  const config: BookConfig = useMemo(
    () => ({
      type,
      title: title || "Untitled",
      thesis: thesis || "No thesis specified",
      reader: reader || "General audience",
      voice,
      chapters,
      wordsPerChapter,
      subGenre,
      citationStyle,
      language,
      outline: outline || undefined,
      storyBible: storyBible || undefined,
      promptLanguage,
    }),
    [type, title, thesis, reader, voice, chapters, wordsPerChapter, subGenre, citationStyle, language, outline, storyBible, promptLanguage]
  );

  const totalWords = chapters * wordsPerChapter;
  const filtered = filter === "all" ? prompts : prompts.filter((p) => p.group === filter);
  const shown = filtered.slice(0, visibleCount);
  const presentGroups = useMemo(() => Array.from(new Set(prompts.map((p) => p.group))), [prompts]);

  function toggleGroup(g: OptionalGroup) {
    setGroups((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  useEffect(() => {
    refreshProjects();
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("project");
    if (pid) loadProject(pid);
    const mid = params.get("analyze");
    if (mid) {
      const m = getManuscript(mid);
      if (m) {
        setAnalyzeText(m.text);
        if (m.lang === "th") setShowAnalyzer(true);
        else setShowProse(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset the visible window when the result set or filter changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter, prompts]);

  // Auto-regenerate when modules or prompt language change (only if already generated).
  useEffect(() => {
    if (prompts.length === 0) return;
    setPrompts(generateAllPrompts(config, groups));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, promptLanguage]);

  // Close the guide modal on Escape.
  useEffect(() => {
    if (!showGuide) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShowGuide(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showGuide]);

  async function refreshProjects() {
    try {
      const res = await fetch("/api/rush/projects");
      if (res.ok) setProjects((await res.json()).projects ?? []);
    } catch {
      /* not logged in — saving simply unavailable */
    }
  }

  function selectType(key: BookTypeKey) {
    setType(key);
    const t = BOOK_TYPES[key];
    setSubGenre(t.sub_genres[0]);
    setChapters(t.default_chapters);
    setWordsPerChapter(t.default_words);
    setGroups(defaultGroupsFor(key));
  }

  function generate() {
    setError("");
    setNotice("");
    const pack = generateAllPrompts(config, groups);
    setPrompts(pack);
    setFilter("all");
    setOpenId(pack[0]?.id ?? null);
  }

  async function copyPrompt(p: GeneratedPrompt) {
    await copyText(p.prompt);
    setCopiedId(p.id);
    setTimeout(() => setCopiedId((c) => (c === p.id ? null : c)), 1500);
  }

  async function copyAll() {
    if (!prompts.length) return;
    const text = prompts.map((p) => `# ${p.id}: ${p.name}\n# Usage: ${p.usage}\n\n${p.prompt}`).join("\n\n\n");
    await copyText(text);
    setNotice("คัดลอกทุก prompt แล้ว");
  }

  function downloadMd() {
    const header = `# ${config.title} — Prompt Pack\n\n_${BOOK_TYPES[config.type].label} · ${titleCase(config.subGenre)} · ${config.chapters} chapters × ~${config.wordsPerChapter} words · ${config.language}_\n\n`;
    const body = prompts
      .map((p) => `## ${p.id}: ${p.name}\n\n**Usage:** ${p.usage}\n\n\`\`\`\n${p.prompt}\n\`\`\``)
      .join("\n\n---\n\n");
    downloadBlob(`${slug(config.title)}-prompts.md`, header + body, "text/markdown");
  }

  function downloadJson() {
    const payload = { config, generatedAt: new Date().toISOString(), prompts };
    downloadBlob(`${slug(config.title)}-prompts.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  async function saveProject() {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const method = projectId ? "PATCH" : "POST";
      const url = projectId ? `/api/rush/projects/${projectId}` : "/api/rush/projects";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (res.status === 401) {
        setError("กรุณาเข้าสู่ระบบก่อนบันทึก project");
        return;
      }
      if (!res.ok) throw new Error("บันทึกไม่สำเร็จ");
      let id = projectId;
      if (!id) {
        id = (await res.json()).id as string;
        setProjectId(id);
      }
      setNotice("บันทึก project แล้ว");
      refreshProjects();
      // Refresh version history for the saved project.
      if (id) {
        const pr = await fetch(`/api/rush/projects/${id}`);
        if (pr.ok) {
          const { project } = await pr.json();
          setVersions(project.versions ?? []);
          setShareInfo({ token: project.shareToken ?? null, visibility: project.visibility ?? "private" });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function loadProject(id: string) {
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/rush/projects/${id}`);
      if (!res.ok) throw new Error("โหลดไม่สำเร็จ");
      const { project } = await res.json();
      const cfg = project.config as BookConfig;
      applyConfig(cfg);
      setProjectId(project.id);
      setShareInfo({ token: project.shareToken ?? null, visibility: project.visibility ?? "private" });
      setVersions(project.versions ?? []);
      const g = defaultGroupsFor(cfg.type);
      setGroups(g);
      const pack = generateAllPrompts(cfg, g);
      setPrompts(pack);
      setOpenId(pack[0]?.id ?? null);
      setNotice("โหลด project แล้ว");
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    }
  }

  function applyConfig(cfg: BookConfig) {
    setType(cfg.type);
    setSubGenre(cfg.subGenre);
    setTitle(cfg.title === "Untitled" ? "" : cfg.title);
    setThesis(cfg.thesis === "No thesis specified" ? "" : cfg.thesis);
    setReader(cfg.reader === "General audience" ? "" : cfg.reader);
    setVoice(cfg.voice);
    setChapters(cfg.chapters);
    setWordsPerChapter(cfg.wordsPerChapter);
    setCitationStyle(cfg.citationStyle);
    setLanguage(cfg.language);
    setOutline(cfg.outline ?? "");
    setStoryBible(cfg.storyBible ?? "");
    setPromptLanguage(cfg.promptLanguage ?? "en");
  }

  async function toggleShare() {
    if (!projectId) return;
    const next = shareInfo.visibility === "public" ? "private" : "public";
    try {
      const res = await fetch(`/api/rush/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      });
      if (!res.ok) throw new Error("เปลี่ยนการแชร์ไม่สำเร็จ");
      const data = await res.json();
      setShareInfo({ token: data.shareToken ?? shareInfo.token, visibility: next });
      if (next === "public" && data.shareToken) {
        const url = `${window.location.origin}/rush/share/${data.shareToken}`;
        await copyText(url);
        setNotice("เปิดแชร์แล้ว — คัดลอกลิงก์ให้อัตโนมัติ");
      } else {
        setNotice("ปิดแชร์แล้ว");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "ผิดพลาด");
    }
  }

  function restoreVersion(cfg: BookConfig) {
    applyConfig(cfg);
    const g = defaultGroupsFor(cfg.type);
    setGroups(g);
    setPrompts(generateAllPrompts(cfg, g));
    setNotice("กู้คืนเวอร์ชันแล้ว — กด Save เพื่อบันทึกเป็นเวอร์ชันล่าสุด");
  }

  async function deleteProject(id: string) {
    try {
      await fetch(`/api/rush/projects/${id}`, { method: "DELETE" });
      if (projectId === id) setProjectId(null);
      refreshProjects();
    } catch {
      /* ignore */
    }
  }

  function newProject() {
    setProjectId(null);
    setPrompts([]);
    setShareInfo({ token: null, visibility: "private" });
    setVersions([]);
    setNotice("");
    setError("");
  }

  return (
    <div className="min-h-screen bg-[#08080e]">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Crown className="w-7 h-7 text-[#c9a84c]" />
            <span className="text-lg font-semibold gold-gradient">NaraSuite</span>
          </Link>
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <Link href="/rush/dashboard" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#c9a84c]/30 text-[#c9a84c] hover:border-[#c9a84c] transition-colors text-xs">
              <LayoutGrid className="w-3.5 h-3.5" />
              แดชบอร์ด
            </Link>
            <button onClick={() => setShowAnalyzer(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#c9a84c]/30 text-[#c9a84c] hover:border-[#c9a84c] transition-colors text-xs">
              <Languages className="w-3.5 h-3.5" />
              วิเคราะห์ไทย
            </button>
            <button onClick={() => setShowProse(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#c9a84c]/30 text-[#c9a84c] hover:border-[#c9a84c] transition-colors text-xs">
              <Languages className="w-3.5 h-3.5" />
              Prose (EN)
            </button>
            <button onClick={() => setShowGuide(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#c9a84c]/30 text-[#c9a84c] hover:border-[#c9a84c] transition-colors text-xs">
              <HelpCircle className="w-3.5 h-3.5" />
              วิธีใช้
            </button>
            <span className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#c9a84c]" />
              Rush Engine
            </span>
          </div>
        </div>
      </nav>

      <div className="pt-24 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold gold-gradient">Rush Engine — Book Prompt Generator</h1>
            <p className="text-gray-400 mt-2 text-sm">
              สร้างชุด prompt ครบเซ็ตสำหรับแต่งหนังสือทุกประเภท — คัดลอกไปใช้กับ LLM ตัวไหนก็ได้ (ChatGPT / Claude / Gemini)
              <span className="block text-[0.7rem] text-gray-600 mt-1">แพลตฟอร์มสร้าง “prompt” — ไม่ใช่ตัวเขียน AI · ไม่ต้องมี API key · ไม่มีค่า token</span>
            </p>
          </div>

          <div className="grid lg:grid-cols-[380px_1fr] gap-6">
            {/* CONFIG */}
            <aside className="glass-card rounded-2xl p-6 h-fit">
              <h2 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-3">Book Type</h2>
              <div className="grid grid-cols-2 gap-2 mb-6">
                {(Object.keys(BOOK_TYPES) as BookTypeKey[]).map((key) => {
                  const t = BOOK_TYPES[key];
                  const active = type === key;
                  return (
                    <button
                      key={key}
                      onClick={() => selectType(key)}
                      className={`p-3 rounded-xl border text-center transition-colors ${
                        active ? "border-[#c9a84c] bg-[#c9a84c]/10" : "border-white/10 bg-white/5 hover:border-[#c9a84c]/40"
                      }`}
                    >
                      <div className="text-2xl">{t.icon}</div>
                      <div className={`text-xs mt-1 ${active ? "text-[#c9a84c]" : "text-gray-400"}`}>{t.label}</div>
                    </button>
                  );
                })}
              </div>

              <Field label="Sub-Genre">
                <select value={subGenre} onChange={(e) => setSubGenre(e.target.value)} className="input">
                  {BOOK_TYPES[type].sub_genres.map((g) => (
                    <option key={g} value={g}>
                      {titleCase(g)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Title / Working Title">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Deep Work Method" className="input" />
              </Field>

              <Field label="Thesis / Core Idea">
                <textarea value={thesis} onChange={(e) => setThesis(e.target.value)} placeholder="Main argument or premise..." className="input min-h-[64px] resize-y" />
              </Field>

              <Field label="Target Reader">
                <input value={reader} onChange={(e) => setReader(e.target.value)} placeholder="e.g. Thai professionals, 25-40" className="input" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Author Voice">
                  <select value={voice} onChange={(e) => setVoice(e.target.value)} className="input">
                    {VOICES.map((v) => (
                      <option key={v} value={v}>
                        {titleCase(v)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Language">
                  <select value={language} onChange={(e) => setLanguage(e.target.value as BookConfig["language"])} className="input">
                    <option value="thai">Thai (ภาษาไทย)</option>
                    <option value="english">English</option>
                    <option value="bilingual">Bilingual (TH/EN)</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Chapters">
                  <input type="number" min={1} max={100} value={chapters} onChange={(e) => setChapters(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))} className="input" />
                </Field>
                <Field label="Words / Chapter">
                  <input type="number" min={100} max={15000} value={wordsPerChapter} onChange={(e) => setWordsPerChapter(Math.max(100, parseInt(e.target.value) || 100))} className="input" />
                </Field>
              </div>

              <Field label="Citation Style">
                <select value={citationStyle} onChange={(e) => setCitationStyle(e.target.value)} className="input">
                  {CITATIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Outline / Beats (optional)">
                <textarea
                  value={outline}
                  onChange={(e) => setOutline(e.target.value)}
                  placeholder={'วาง outline ที่นี่ (ไม่บังคับ) — ใส่เป็น "1. ..." "2. ..." หรือ "บท 1: ..." แล้ว beat แต่ละบทจะ map เข้า prompt บทนั้นอัตโนมัติ'}
                  className="input min-h-[60px] resize-y"
                />
              </Field>

              <Field label="Prompt Language">
                <div className="flex gap-2">
                  {(["en", "th"] as const).map((pl) => (
                    <button
                      key={pl}
                      onClick={() => setPromptLanguage(pl)}
                      className={`flex-1 py-2 rounded-lg border text-xs transition-colors ${
                        promptLanguage === pl ? "border-[#c9a84c] text-[#c9a84c] bg-[#c9a84c]/10" : "border-white/10 text-gray-400 hover:border-[#c9a84c]/40"
                      }`}
                    >
                      {pl === "en" ? "English scaffolding" : "ไทยทั้งชุด"}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="mt-4 mb-1">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-semibold tracking-widest text-gray-400 uppercase">Extra Modules</h2>
                  <div className="flex gap-1">
                    <button onClick={() => setGroups(defaultGroupsFor(type))} className="text-[0.6rem] px-1.5 py-0.5 rounded border border-white/10 text-gray-400 hover:border-[#c9a84c]/40 hover:text-[#c9a84c]" title="กลุ่มที่แนะนำตามประเภทหนังสือ">
                      แนะนำ
                    </button>
                    <button onClick={() => setGroups(allGroups)} className="text-[0.6rem] px-1.5 py-0.5 rounded border border-white/10 text-gray-400 hover:border-[#c9a84c]/40 hover:text-[#c9a84c]">
                      ทั้งหมด
                    </button>
                    <button onClick={() => setGroups([])} className="text-[0.6rem] px-1.5 py-0.5 rounded border border-white/10 text-gray-400 hover:border-[#c9a84c]/40 hover:text-[#c9a84c]" title="เฉพาะ prompt หลัก">
                      ล้าง
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {MODULE_GROUPS.map((g) => (
                    <label key={g.key} className="flex items-start gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={groups.includes(g.key)}
                        onChange={() => toggleGroup(g.key)}
                        className="accent-[#c9a84c] mt-0.5"
                      />
                      <span className="text-xs">
                        <span className="text-gray-200">{g.label}</span>
                        <span className="block text-[0.65rem] text-gray-500 leading-snug">{g.desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {groups.includes("agents") && (
                  <p className="mt-2 text-[0.62rem] text-emerald-300/80 leading-snug">
                    ℹ️ Agent Pack สร้าง “system prompt” สำหรับ multi-agent ที่คุณรันเอง (เช่น Claude Projects) — ไม่ได้รันในแอปนี้
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 my-4">
                <Stat value={String(chapters)} label="Chapters" />
                <Stat value={totalWords >= 1000 ? `${Math.round(totalWords / 1000)}K` : String(totalWords)} label="Est. Words" />
                <Stat value={String(prompts.length)} label="Prompts" />
              </div>

              <button onClick={generate} className="w-full py-3 bg-[#c9a84c] text-black font-semibold rounded-xl hover:bg-[#d4b96a] transition-colors flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4" />
                Generate Prompts
              </button>

              {prompts.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button onClick={downloadMd} className="py-2.5 border border-[#c9a84c]/30 text-[#c9a84c] rounded-xl hover:border-[#c9a84c] transition-colors flex items-center justify-center gap-1.5 text-xs">
                    <FileText className="w-4 h-4" /> .md
                  </button>
                  <button onClick={downloadJson} className="py-2.5 border border-[#c9a84c]/30 text-[#c9a84c] rounded-xl hover:border-[#c9a84c] transition-colors flex items-center justify-center gap-1.5 text-xs">
                    <FileJson className="w-4 h-4" /> .json
                  </button>
                  <button onClick={copyAll} className="py-2.5 border border-white/10 text-gray-300 rounded-xl hover:border-[#c9a84c]/40 transition-colors flex items-center justify-center gap-1.5 text-xs">
                    <Copy className="w-4 h-4" /> Copy all
                  </button>
                  <button onClick={saveProject} disabled={saving} className="py-2.5 border border-white/10 text-gray-300 rounded-xl hover:border-[#c9a84c]/40 transition-colors flex items-center justify-center gap-1.5 text-xs disabled:opacity-50">
                    <Save className="w-4 h-4" /> {projectId ? "Update" : "Save"}
                  </button>
                </div>
              )}

              {projectId && (
                <div className="mt-2 space-y-2">
                  <button onClick={toggleShare} className="w-full py-2.5 border border-white/10 text-gray-300 rounded-xl hover:border-[#c9a84c]/40 transition-colors flex items-center justify-center gap-1.5 text-xs">
                    <Share2 className="w-4 h-4" />
                    {shareInfo.visibility === "public" ? "คัดลอกลิงก์ / ปิดแชร์" : "เปิดแชร์ (ลิงก์อ่านอย่างเดียว)"}
                  </button>
                  {shareInfo.visibility === "public" && shareInfo.token && (
                    <a href={`/rush/share/${shareInfo.token}`} target="_blank" rel="noreferrer" className="block text-center text-[0.65rem] text-[#c9a84c] hover:underline truncate">
                      /rush/share/{shareInfo.token.slice(0, 12)}…
                    </a>
                  )}
                  {versions.length > 1 && (
                    <select
                      onChange={(e) => {
                        const v = versions.find((x) => x.id === e.target.value);
                        if (v) restoreVersion(v.config);
                      }}
                      defaultValue=""
                      className="input text-xs"
                    >
                      <option value="" disabled>
                        กู้คืนเวอร์ชัน… ({versions.length})
                      </option>
                      {versions.map((v, i) => (
                        <option key={v.id} value={v.id}>
                          {i === 0 ? "ล่าสุด" : `เวอร์ชัน ${versions.length - i}`} · {new Date(v.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {notice && <div className="mt-4 p-3 bg-[#c9a84c]/10 border border-[#c9a84c]/30 rounded-xl text-[#d4b96a] text-xs">{notice}</div>}
              {error && (
                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {projects.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase">Saved Projects</h3>
                    {projectId && (
                      <button onClick={newProject} className="text-[0.65rem] text-gray-500 hover:text-[#c9a84c]">+ New</button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {projects.map((p) => (
                      <div key={p.id} className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-xs ${projectId === p.id ? "border-[#c9a84c]/50 bg-[#c9a84c]/5" : "border-white/5 bg-white/5"}`}>
                        <button onClick={() => loadProject(p.id)} className="flex-1 text-left truncate" title={p.title}>
                          <span className="text-gray-200">{p.title}</span>
                          <span className="text-gray-500 ml-1">· {titleCase(p.type)}</span>
                        </button>
                        <button onClick={() => deleteProject(p.id)} className="text-gray-600 hover:text-red-400" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </aside>

            {/* OUTPUT */}
            <main>
              <div className="glass-card rounded-2xl p-4 mb-4 border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-[#c9a84c]" />
                    Story Bible / STATE
                    {storyBible.trim() && <span className="text-[0.6rem] text-green-400 normal-case">● injected</span>}
                  </h3>
                  {storyBible.trim() && (
                    <button onClick={() => setStoryBible("")} className="text-[0.65rem] text-gray-500 hover:text-red-400">
                      Clear
                    </button>
                  )}
                </div>
                <textarea
                  value={storyBible}
                  onChange={(e) => setStoryBible(e.target.value)}
                  placeholder="วาง/แก้ codex ที่นี่ — หรือคัดลอกบล็อก <<<STATE>>> ที่โมเดลสร้างจากบทล่าสุดมาวาง แล้วกด Generate ใหม่ → ฉีดเป็น 'แหล่งความจริง' เข้าทุกบทอัตโนมัติ"
                  className="input min-h-[80px] resize-y font-mono text-[0.72rem]"
                />
                <p className="text-[0.62rem] text-gray-600 mt-1">
                  ปิดช่องว่าง continuity แบบ Sudowrite ด้วย prompt ล้วน — แก้ที่นี่ที่เดียว ใช้กับทุกบท (กด Generate Prompts ใหม่เพื่อใช้ค่าล่าสุด)
                </p>
              </div>

              {prompts.length === 0 ? (
                <div className="glass-card rounded-2xl p-10 text-center text-gray-500">
                  <Sparkles className="w-10 h-10 mx-auto mb-3 text-[#c9a84c]/40" />
                  <p>ตั้งค่าหนังสือทางซ้าย แล้วกด Generate Prompts</p>
                  <p className="text-xs mt-2 text-gray-600">
                    จะได้ชุด prompt ครบเซ็ต: Master, Overview, รายบท, Analysis, Revision, Front/Back Matter, Feedback
                  </p>
                  <button onClick={() => setShowGuide(true)} className="mt-4 text-xs text-[#c9a84c] hover:underline">
                    ดูเวิร์กโฟลว์แนะนำ →
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label={`All (${prompts.length})`} />
                    {presentGroups.map((g) => (
                      <FilterChip
                        key={g}
                        active={filter === g}
                        onClick={() => setFilter(g)}
                        label={`${groupLabel(g)} (${prompts.filter((p) => p.group === g).length})`}
                      />
                    ))}
                  </div>

                  <div className="space-y-3">
                    {shown.map((p) => {
                      const open = openId === p.id;
                      return (
                        <div key={p.id} className="glass-card rounded-2xl overflow-hidden border border-white/5">
                          <div className="flex items-center justify-between gap-3 px-5 py-3">
                            <button onClick={() => setOpenId(open ? null : p.id)} aria-expanded={open} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                              <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
                              <span className="text-sm font-semibold text-gray-100 whitespace-nowrap">{p.id}</span>
                              <span className="text-xs text-gray-500 truncate">{p.name}</span>
                            </button>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`text-[0.6rem] px-1.5 py-0.5 border rounded ${GROUP_COLORS[p.group]}`}>{groupLabel(p.group)}</span>
                              <button onClick={() => copyPrompt(p)} className="text-gray-400 hover:text-[#c9a84c]" title="Copy" aria-label={`Copy ${p.id}`}>
                                {copiedId === p.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                          {open && (
                            <div className="px-5 pb-5">
                              <p className="text-[0.7rem] text-gray-500 mb-1">{p.description}</p>
                              <p className="text-[0.65rem] text-gray-600 italic mb-3">Usage: {p.usage}</p>
                              <pre className="bg-[#08080e] border border-white/5 rounded-lg p-4 text-xs leading-6 text-gray-300 whitespace-pre-wrap max-h-[480px] overflow-y-auto">
                                {p.prompt}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {filtered.length > visibleCount && (
                    <button
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                      className="w-full mt-3 py-2.5 border border-white/10 text-gray-400 rounded-xl hover:border-[#c9a84c]/40 hover:text-[#c9a84c] transition-colors text-xs"
                    >
                      แสดงเพิ่ม ({filtered.length - visibleCount} ที่เหลือ)
                    </button>
                  )}
                </>
              )}
            </main>
          </div>
        </div>
      </div>

      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
      {showAnalyzer && <ThaiAnalyzerModal onClose={() => setShowAnalyzer(false)} initialText={analyzeText} />}
      {showProse && <ProseAnalyzerModal onClose={() => setShowProse(false)} initialText={analyzeText} />}

      <style jsx>{`
        :global(.input) {
          width: 100%;
          padding: 8px 10px;
          background: #08080e;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #f0ece4;
          font-size: 0.85rem;
          border-radius: 0.6rem;
          outline: none;
          transition: border-color 0.2s;
        }
        :global(.input:focus) {
          border-color: rgba(201, 168, 76, 0.6);
        }
      `}</style>
    </div>
  );
}

