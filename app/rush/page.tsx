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
  X,
} from "lucide-react";
import { analyzeThai } from "@/lib/rush-engine/thai-analyzer";
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

const GROUP_COLORS: Record<PromptGroup, string> = {
  core: "border-[#c9a84c] text-[#c9a84c]",
  craft: "border-green-400 text-green-400",
  nonfiction: "border-blue-400 text-blue-400",
  prose: "border-purple-400 text-purple-400",
  thai: "border-pink-400 text-pink-400",
  marketing: "border-orange-400 text-orange-400",
  advanced: "border-cyan-400 text-cyan-400",
  agents: "border-emerald-400 text-emerald-400",
};

function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

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
            <button onClick={() => setShowAnalyzer(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#c9a84c]/30 text-[#c9a84c] hover:border-[#c9a84c] transition-colors text-xs">
              <Languages className="w-3.5 h-3.5" />
              วิเคราะห์ไทย
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
              สร้างชุด prompt ครบเซ็ตสำหรับแต่งหนังสือทุกประเภท — master prompt, prompt รายบท, analysis, revision, front/back matter — คัดลอกไปใช้กับ LLM ตัวไหนก็ได้
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
                  placeholder="วางโครงเรื่องหรือ beat รายบทที่นี่ (ไม่บังคับ) — จะถูกร้อยเข้า prompt แต่ละบท"
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
      {showAnalyzer && <ThaiAnalyzerModal onClose={() => setShowAnalyzer(false)} />}

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

function slug(s: string) {
  return (s || "book").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "book";
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-[0.7rem] text-gray-400 mb-1 tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="p-2 bg-white/5 rounded-lg text-center">
      <div className="text-lg font-bold text-[#c9a84c]">{value}</div>
      <div className="text-[0.6rem] text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function ThaiAnalyzerModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const a = useMemo(() => (text.trim() ? analyzeThai(text) : null), [text]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Thai Analyzer" className="glass-card rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 border border-[#c9a84c]/30" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold gold-gradient">วิเคราะห์ภาษาไทย</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          เครื่องมือฝั่งเบราว์เซอร์ (ไม่เรียก AI) — นับคำด้วยตัวตัดคำไทย หาคำซ้ำ/echoes และสแกนคำคลิเชแบบ AI
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="วางข้อความภาษาไทยที่นี่…"
          className="input min-h-[140px] resize-y"
        />
        {a && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <Stat value={String(a.wordCount)} label="คำ" />
              <Stat value={String(a.uniqueWords)} label="คำไม่ซ้ำ" />
              <Stat value={String(a.charCount)} label="อักษร" />
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">AI-tell / คำคลิเช</h3>
              {a.aiTells.length === 0 ? (
                <p className="text-xs text-green-400">✓ ไม่พบคำคลิเชแบบ AI</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {a.aiTells.map((t) => (
                    <span key={t.phrase} className="text-xs px-2 py-0.5 rounded border border-red-500/40 text-red-400">
                      {t.phrase} ×{t.count}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">คำซ้ำบ่อย (echoes ≥3)</h3>
              {a.echoes.length === 0 ? (
                <p className="text-xs text-gray-500">— ไม่มีคำเนื้อหาที่ซ้ำเกิน 3 ครั้ง</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {a.echoes.slice(0, 20).map((e) => (
                    <span key={e.word} className="text-xs px-2 py-0.5 rounded border border-orange-400/40 text-orange-300">
                      {e.word} ×{e.count}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">คำที่ใช้บ่อยสุด</h3>
              <div className="flex flex-wrap gap-1.5">
                {a.topWords.map((w) => (
                  <span key={w.word} className="text-xs px-2 py-0.5 rounded border border-white/10 text-gray-300">
                    {w.word} ×{w.count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GuideModal({ onClose }: { onClose: () => void }) {
  const steps = [
    "ตั้งค่าหนังสือทางซ้าย (ประเภท / ชื่อ / แก่นเรื่อง / ผู้อ่าน / จำนวนบท) เปิด Extra Modules ที่ต้องการ แล้วกด Generate Prompts",
    "วางแผน: คัดลอก STRUCTURE ไปรันใน LLM เพื่อวางโครงเรื่องรายบท แล้ววางผลกลับในช่อง Outline",
    "ตั้ง MASTER เป็น system prompt ของ LLM (ใช้ตลอดทั้งเล่ม)",
    "ส่ง OVERVIEW หนึ่งครั้ง ให้โมเดลเข้าใจแผน + สร้างบล็อก STATE เริ่มต้น",
    "เขียนทีละบทด้วย CH_1, CH_2, … โมเดลจะออกบล็อก <<<STATE>>> ท้ายแต่ละบท",
    "คัดลอก <<<STATE>>> ล่าสุดมาวางในช่อง Story Bible / STATE แล้วกด Generate ใหม่ → ฉีดเข้าทุกบทอัตโนมัติ (continuity)",
    "ขัดเกลาด้วย ANALYSIS → REVISION, เก็บงานด้วย Front/Back Matter",
    "ตอนจะตีพิมพ์ ใช้กลุ่ม Marketing (Title, Blurb, KDP Metadata, Submission Pack)",
  ];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Rush Engine วิธีใช้" className="glass-card rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 border border-[#c9a84c]/30" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold gold-gradient">Rush Engine — วิธีใช้</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-300 mb-5">
          แพลตฟอร์มสร้าง <span className="text-[#c9a84c]">ชุด prompt</span> สำหรับแต่งหนังสือทุกประเภท คัดลอกไปใช้กับ LLM ตัวไหนก็ได้ (ChatGPT / Claude / Gemini) —
          ไม่ต้องมี API key ไม่มีค่า token
        </p>

        <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">เวิร์กโฟลว์แนะนำ</h3>
        <ol className="space-y-2 mb-5">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm text-gray-200">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#c9a84c]/15 text-[#c9a84c] text-xs flex items-center justify-center font-semibold">{i + 1}</span>
              <span className="leading-relaxed">{s}</span>
            </li>
          ))}
        </ol>

        <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">กลุ่ม Module เสริม</h3>
        <div className="space-y-1.5 mb-5">
          {MODULE_GROUPS.map((g) => (
            <div key={g.key} className="text-sm">
              <span className="text-[#c9a84c]">{g.label}</span>
              <span className="text-gray-500"> — {g.desc}</span>
            </div>
          ))}
        </div>

        <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">เลือก module อันไหน?</h3>
        <div className="space-y-2 mb-5 text-sm">
          {[
            { goal: "ทำให้ร้อยแก้วดีขึ้น", items: "Anti-Slop (ลบสำนวนกลาง ๆ แบบ AI) · Anti-Safe (กล้าเสี่ยง ไม่จบแบบเซฟ) · Line Edit (แก้ระดับประโยค) · Readability (คุมระดับความยาก)" },
            { goal: "ตรวจ/ประเมินดราฟต์", items: "Analysis (คะแนนรายบท) · Quality Gate (ผ่าน/ไม่ผ่านก่อนตีพิมพ์) · Feedback (สรุปส่งต่อบทถัดไป)" },
            { goal: "ความต่อเนื่อง", items: "Story Bible/STATE (ฉีดทุกบท) · Worldbuilding Codex (สร้าง bible + ตรวจ) · Rolling Recap (สรุปต่อเนื่อง)" },
            { goal: "วางโครง/ตัวละคร", items: "Structure Outline (โครงทั้งเล่ม) · Character Voice/Arc · Scene Builder · Conflict Map (ความตึง)" },
            { goal: "หลายเอเจนต์ (ขั้นสูง)", items: "Agent Pack — ต้องมี multi-agent setup เอง (เช่น Claude Projects); ไม่ได้รันในแอปนี้" },
          ].map((r) => (
            <div key={r.goal}>
              <span className="text-[#c9a84c]">{r.goal}:</span>
              <span className="text-gray-400"> {r.items}</span>
            </div>
          ))}
        </div>

        <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">เคล็ดลับ</h3>
        <ul className="space-y-1.5 text-sm text-gray-300 list-disc list-inside marker:text-[#c9a84c]">
          <li><span className="text-gray-200">ภาษา prompt:</span> สลับ “ไทยทั้งชุด” ได้ที่ Prompt Language</li>
          <li><span className="text-gray-200">Continuity:</span> Story Bible / STATE ฉีดเข้าทุกบท — แก้ที่เดียวใช้ทั้งเล่ม</li>
          <li><span className="text-gray-200">เซฟงาน:</span> ปุ่ม Save เก็บ project ไว้ในบัญชี (ต้องล็อกอิน)</li>
          <li><span className="text-gray-200">ส่งออก:</span> Copy ราย prompt / Copy all / Download .md หรือ .json</li>
          <li><span className="text-gray-200">Preset:</span> แนะนำ / ทั้งหมด / ล้าง เลือกกลุ่ม module ได้เร็ว</li>
        </ul>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
        active ? "border-[#c9a84c] text-[#c9a84c] bg-[#c9a84c]/10" : "border-white/10 text-gray-400 hover:border-[#c9a84c]/40"
      }`}
    >
      {label}
    </button>
  );
}
