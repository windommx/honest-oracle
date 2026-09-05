"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BookisdomLogo } from "./_logo";
import {
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
  Upload,
  FileText,
  HelpCircle,
  Share2,
  Languages,
  LayoutGrid,
  Play,
  BookMarked,
} from "lucide-react";
import { titleCase, copyText, slug, downloadBlob } from "./_utils";
import { GROUP_COLORS, Field, Stat, FilterChip } from "./_ui";

// The three modals live behind a click and drag in every analyzer (Thai, prose, codex,
// saga, sensory, radar, rename, register, translation, narrative) plus the EPUB builder.
// Loading them on first paint cost ~20 kB of First Load JS for UI most visits never open.
// ssr:false because they are browser-only panels; the brief load lands where a user
// already expects one — after they ask for the tool.
const GuideModal = dynamic(() => import("./_components").then((m) => m.GuideModal), { ssr: false });
const ThaiAnalyzerModal = dynamic(() => import("./_components").then((m) => m.ThaiAnalyzerModal), { ssr: false });
const ProseAnalyzerModal = dynamic(() => import("./_components").then((m) => m.ProseAnalyzerModal), { ssr: false });
import { getManuscript, listManuscripts } from "./_manuscript-store";
import { FirstRunOrientation, OnRamps } from "./_first-run";
import {
  BOOK_TYPES,
  MODULE_GROUPS,
  TH_GROUP_LABEL,
  STARTER_SEQUENCE,
  STARTER_GROUPS,
  defaultGroupsFor,
  generateAllPrompts,
  estimateTokens,
  diffConfigs,
  summarizeConfigDiff,
  type BookConfig,
  type BookTypeKey,
  type GeneratedPrompt,
  type PromptGroup,
} from "@/lib/bookisdom-engine/engine";

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

export default function BookisdomPage() {
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
  // Default matches the default book language (thai) so a Thai author gets Thai
  // scaffolding — incl. Thai title/blurb/KDP — out of the box.
  const [promptLanguage, setPromptLanguage] = useState<"en" | "th">("th");
  const [promptLangTouched, setPromptLangTouched] = useState(false);
  const couplePrimed = useRef(false);

  const [groups, setGroups] = useState<OptionalGroup[]>(defaultGroupsFor("nonfiction"));
  const [structure, setStructure] = useState<string>("");
  const [prompts, setPrompts] = useState<GeneratedPrompt[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<PromptGroup | "all">("all");
  const [showStarter, setShowStarter] = useState(false);

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
      structure: structure || undefined,
    }),
    [type, title, thesis, reader, voice, chapters, wordsPerChapter, subGenre, citationStyle, language, outline, storyBible, promptLanguage, structure]
  );

  const totalWords = chapters * wordsPerChapter;
  const filtered = filter === "all" ? prompts : prompts.filter((p) => p.group === filter);
  const shown = filtered.slice(0, visibleCount);
  const presentGroups = useMemo(() => Array.from(new Set(prompts.map((p) => p.group))), [prompts]);

  function toggleGroup(g: OptionalGroup) {
    setGroups((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  const hydratedRef = useRef(false);
  // A visitor is 'new' only on real signals: no deep-link config (?type/?project) and
  // no drafts already stored. Guessing wrong here would nag a returning writer.
  const [isNewcomer, setIsNewcomer] = useState(false);

  useEffect(() => {
    refreshProjects();
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("project");
    const typeParam = params.get("type");
    const deepLinked = !!(pid || typeParam);
    void listManuscripts().then((ms: unknown[]) => setIsNewcomer(!deepLinked && ms.length === 0));
    if (pid) loadProject(pid);
    else if (typeParam && typeParam in BOOK_TYPES) {
      // Deep-link from the /bookisdom/explore landing or the /bookisdom/start wizard:
      // preselect book type + genre (+ optional length, prompt language, modules).
      const tk = typeParam as BookTypeKey;
      setType(tk);
      const g = params.get("genre");
      setSubGenre(g && BOOK_TYPES[tk].sub_genres.includes(g) ? g : BOOK_TYPES[tk].sub_genres[0]);
      const ch = parseInt(params.get("chapters") ?? "", 10);
      if (ch >= 1 && ch <= 100) setChapters(ch);
      const w = parseInt(params.get("words") ?? "", 10);
      if (w >= 100 && w <= 20000) setWordsPerChapter(w);
      const pl = params.get("lang");
      if (pl === "th" || pl === "en") { setPromptLanguage(pl); setPromptLangTouched(true); }
      const grp = params.get("groups");
      if (grp) {
        const valid = new Set(MODULE_GROUPS.map((m) => m.key as string));
        const chosen = grp.split(",").map((s) => s.trim()).filter((s) => valid.has(s)) as OptionalGroup[];
        setGroups(chosen.length ? chosen : defaultGroupsFor(tk));
      } else setGroups(defaultGroupsFor(tk));
      const st = params.get("structure");
      if (st) setStructure(st);
    } else {
      // Restore the last working draft (client-side) so a non-logged-in setup
      // — including the Story Bible / STATE — survives a reload.
      try {
        const raw = window.localStorage.getItem("bookisdom.generator.draft");
        if (raw) {
          const d = JSON.parse(raw) as { config?: BookConfig; groups?: OptionalGroup[] };
          if (d.config) applyConfig(d.config);
          if (Array.isArray(d.groups)) setGroups(d.groups);
        }
      } catch {
        /* ignore */
      }
    }
    const mid = params.get("analyze");
    if (mid) {
      void getManuscript(mid).then((m) => {
        if (m) {
          setAnalyzeText(m.text);
          if (m.lang === "th") setShowAnalyzer(true);
          else setShowProse(true);
        }
      });
    }
    const tool = params.get("tool");
    if (tool === "thai") setShowAnalyzer(true);
    else if (tool === "prose") setShowProse(true);
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Couple prompt language to book language until the user overrides it: a Thai/
  // bilingual book uses Thai scaffolding, an English book uses English. Skips the
  // first run (mount/restore owns the initial value) and any manual override.
  useEffect(() => {
    if (!couplePrimed.current) {
      couplePrimed.current = true;
      return;
    }
    if (!promptLangTouched) setPromptLanguage(language === "english" ? "en" : "th");
  }, [language, promptLangTouched]);

  // Autosave the working draft to localStorage (after the initial restore).
  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      window.localStorage.setItem("bookisdom.generator.draft", JSON.stringify({ config, groups }));
    } catch {
      /* quota / unavailable — ignore */
    }
  }, [config, groups]);

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
      const res = await fetch("/api/bookisdom/projects");
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

  // Quick Start: fill the whole form with one coherent worked example (Thai noir),
  // including an outline whose beats reference the codex cast — so a first-time
  // user sees the entire value chain (config → codex → per-chapter injection)
  // with a single click, then hits Generate.
  function loadExample() {
    setType("novel");
    setSubGenre("mystery");
    setTitle("เงาใต้ท่าเรือ");
    setThesis("นักสืบเอกชนตามหาน้องสาวที่หายตัวไปในย่านท่าเรือเก่า ยิ่งเข้าใกล้ความจริง ยิ่งพบว่าคนที่เขาไว้ใจที่สุดเกี่ยวข้องกับการหายตัว");
    setReader("ผู้อ่านนิยายสืบสวนไทย 18-35 ชอบบรรยากาศ noir จังหวะเร็ว");
    setVoice("storytelling");
    setChapters(8);
    setWordsPerChapter(2500);
    setLanguage("thai");
    setPromptLanguage("th");
    setPromptLangTouched(true);
    setGroups(defaultGroupsFor("novel"));
    setOutline(
      "บทที่ 1: อนันต์ รับโทรศัพท์แจ้งว่า มาลี หายตัวไปจาก ตรอกเจริญกรุง\n" +
      "บทที่ 2: สืบร่องรอยแรก พบ กุญแจทองคำ ในห้องของมาลี\n" +
      "บทที่ 3: หมอลี เตือนให้เลิกตาม — มีคนใหญ่เกี่ยวข้อง\n" +
      "บทที่ 4: อนันต์ ลอบเข้า ท่าเรือคลองเตย ครั้งแรก เกือบถูกจับ\n" +
      "บทที่ 5: พบว่า เสือ ครอบครองท่าเรือ และรู้จักมาลีมาก่อน\n" +
      "บทที่ 6: หมอลี เปิดเผยอดีตของครอบครัวอนันต์\n" +
      "บทที่ 7: กุญแจทองคำ เปิดโกดังลับ — ความจริงเรื่องมาลี\n" +
      "บทที่ 8: เผชิญหน้า เสือ ที่ท่าเรือ บทสรุปของพี่น้อง"
    );
    setStoryBible(
      "[ตัวละคร]\n" +
      "อนันต์: นักสืบเอกชน อดีตตำรวจ\n" +
      "อยาก: หาน้องสาวให้เจอ\n" +
      "ต้องการจริง: ให้อภัยตัวเองเรื่องคดีเก่า\n" +
      "จุดอ่อน: กลัวความมืดตั้งแต่เด็ก\n" +
      "เสียง: ประโยคสั้น ห้วน ถามมากกว่าตอบ\n" +
      "คำติดปาก: ผมรับผิดชอบเอง\n" +
      "คำต้องห้าม: ก็ตามใจ, ไม่รู้สิ\n" +
      "มาลี: น้องสาวอนันต์ นักข่าวสายสืบสวน หายตัวไป\n" +
      "เสือ: เจ้าพ่อท่าเรือ\n" +
      "เสียง: พูดเบา ช้า ทุกคำมีน้ำหนัก ไม่เคยขู่ตรง ๆ\n" +
      "หมอลี: เจ้าของร้านยาจีน\n" +
      "รู้แล้ว: มาลีสืบเรื่องโกดังลับก่อนหายตัว, อดีตตำรวจของอนันต์\n\n" +
      "[สถานที่]\n" +
      "ท่าเรือคลองเตย: อาณาจักรของเสือ\n" +
      "ตรอกเจริญกรุง: ที่มาลีถูกพบครั้งสุดท้าย\n\n" +
      "[สิ่งของ]\n" +
      "กุญแจทองคำ: เปิดโกดังลับใต้ท่าเรือ\n\n" +
      "[ความสัมพันธ์]\n" +
      "อนันต์ - มาลี: พี่น้อง\n" +
      "อนันต์ -> เสือ: ตามล่า\n" +
      "เสือ -> มาลี: ลักพาตัว\n" +
      "หมอลี -> อนันต์: ให้เบาะแส\n\n" +
      "[ปมค้าง]\n" +
      "ความลับที่มาลีสืบอยู่ก่อนหายตัว: สูง\n" +
      "เหตุที่อนันต์ลาออกจากตำรวจ: กลาง"
    );
    setPrompts([]);
    setError("");
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

  // Hand a prompt to Bookisdom Studio: MASTER becomes the system prompt; the prompts
  // can be large, so pass via sessionStorage rather than the URL.
  function runInStudio(p: GeneratedPrompt) {
    const master = prompts.find((x) => x.id === "MASTER")?.prompt ?? "";
    try {
      window.sessionStorage.setItem(
        "bookisdom.studio.prefill",
        JSON.stringify({ system: p.id === "MASTER" ? "" : master, prompt: p.prompt })
      );
    } catch {
      /* ignore */
    }
    window.location.href = "/bookisdom/studio";
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
    const payload = { config, groups, generatedAt: new Date().toISOString(), prompts };
    downloadBlob(`${slug(config.title)}-prompts.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  // Import a project from a previously-exported .json (reads its `config`).
  function importProject(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as { config?: BookConfig; groups?: OptionalGroup[] } & Partial<BookConfig>;
        const cfg = (data && typeof data === "object" && data.config ? data.config : data) as BookConfig;
        if (cfg && typeof cfg === "object" && typeof cfg.type === "string" && BOOK_TYPES[cfg.type]) {
          applyConfig(cfg);
          if (Array.isArray(data.groups)) setGroups(data.groups);
          setError("");
          setNotice("นำเข้าโปรเจกต์แล้ว — กด Generate เพื่อสร้าง prompt");
        } else {
          setError("ไฟล์ไม่ถูกต้อง — ต้องเป็น .json ที่มี config");
        }
      } catch {
        setError("อ่านไฟล์ไม่สำเร็จ — รองรับเฉพาะ .json ที่ export จากที่นี่");
      }
    };
    reader.readAsText(file);
  }

  async function saveProject() {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const method = projectId ? "PATCH" : "POST";
      const url = projectId ? `/api/bookisdom/projects/${projectId}` : "/api/bookisdom/projects";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (res.status === 401) {
        setError("กรุณาเข้าสู่ระบบก่อนบันทึก project");
        return;
      }
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "ถึงขีดจำกัดโปรเจกต์");
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
        const pr = await fetch(`/api/bookisdom/projects/${id}`);
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
      const res = await fetch(`/api/bookisdom/projects/${id}`);
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
    setPromptLanguage(cfg.promptLanguage ?? (cfg.language === "english" ? "en" : "th"));
    setPromptLangTouched(true); // a loaded/imported project carries an explicit choice
  }

  async function toggleShare() {
    if (!projectId) return;
    const next = shareInfo.visibility === "public" ? "private" : "public";
    try {
      const res = await fetch(`/api/bookisdom/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      });
      if (!res.ok) throw new Error("เปลี่ยนการแชร์ไม่สำเร็จ");
      const data = await res.json();
      setShareInfo({ token: data.shareToken ?? shareInfo.token, visibility: next });
      if (next === "public" && data.shareToken) {
        const url = `${window.location.origin}/bookisdom/share/${data.shareToken}`;
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
    // Field-level diff vs. what was on screen, so the notice says exactly what
    // the restore changed (config is the source of truth — prompts just derive).
    const changed = summarizeConfigDiff(diffConfigs(config, cfg));
    applyConfig(cfg);
    const g = defaultGroupsFor(cfg.type);
    setGroups(g);
    setPrompts(generateAllPrompts(cfg, g));
    setNotice(
      changed
        ? `กู้คืนเวอร์ชันแล้ว — ที่ต่างจากก่อนหน้า: ${changed} · กด Save เพื่อบันทึกเป็นเวอร์ชันล่าสุด`
        : "กู้คืนเวอร์ชันแล้ว (เหมือนค่าบนจอทุกช่อง) — กด Save เพื่อบันทึกเป็นเวอร์ชันล่าสุด"
    );
  }

  async function deleteProject(id: string) {
    try {
      await fetch(`/api/bookisdom/projects/${id}`, { method: "DELETE" });
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
    <div className="min-h-screen bg-[#f3f5f9]">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <BookisdomLogo />
          {/* Five gold pills with no breakpoint overflowed a phone. Wrapping + a smaller
              gap keeps every action reachable on a narrow screen instead of pushing some
              off-canvas — many Thai writers are mobile-first. */}
          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 text-sm text-slate-700">
            <Link href="/bookisdom/dashboard" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#7a5c12]/30 text-[#7a5c12] hover:border-[#7a5c12] transition-colors text-xs">
              <LayoutGrid className="w-3.5 h-3.5" />
              แดชบอร์ด
            </Link>
            <Link href="/bookisdom/studio" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#7a5c12]/30 text-[#7a5c12] hover:border-[#7a5c12] transition-colors text-xs">
              <Play className="w-3.5 h-3.5" />
              Studio
            </Link>
            <Link href="/bookisdom/kdp" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#7a5c12]/30 text-[#7a5c12] hover:border-[#7a5c12] transition-colors text-xs">
              <BookMarked className="w-3.5 h-3.5" />
              KDP
            </Link>
            <button onClick={() => setShowAnalyzer(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#7a5c12]/30 text-[#7a5c12] hover:border-[#7a5c12] transition-colors text-xs">
              <Languages className="w-3.5 h-3.5" />
              วิเคราะห์ไทย
            </button>
            <button onClick={() => setShowProse(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#7a5c12]/30 text-[#7a5c12] hover:border-[#7a5c12] transition-colors text-xs">
              <Languages className="w-3.5 h-3.5" />
              Prose (EN)
            </button>
            <button onClick={() => setShowGuide(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#7a5c12]/30 text-[#7a5c12] hover:border-[#7a5c12] transition-colors text-xs">
              <HelpCircle className="w-3.5 h-3.5" />
              วิธีใช้
            </button>
          </div>
        </div>
      </nav>

      <div className="pt-24 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          <FirstRunOrientation show={isNewcomer} />
          <div className="mb-6">
            <h1 className="text-3xl font-bold accent-gradient">Bookisdom — Book Prompt Generator</h1>
            <p className="text-slate-600 mt-2 text-sm">
              สร้างชุด prompt ครบเซ็ตสำหรับแต่งหนังสือทุกประเภท — คัดลอกไปใช้กับ LLM ตัวไหนก็ได้ (ChatGPT / Claude / Gemini)
              <span className="block text-[0.7rem] text-faint mt-1">แพลตฟอร์มสร้าง “prompt” — ไม่ใช่ตัวเขียน AI · ไม่ต้องมี API key · ไม่มีค่า token</span>
            </p>
            <div className="mt-2.5">
              <OnRamps />
            </div>
            <button
              onClick={loadExample}
              className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-[#7a5c12]/40 text-[#7a5c12] hover:bg-[#d9a63a]/15 transition-colors"
            >
              ⚡ โหลดตัวอย่าง — นิยายสืบสวน 8 บท พร้อม outline + Story Codex (แก้/ลบได้ทุกช่อง)
            </button>
          </div>

          <div className="grid lg:grid-cols-[380px_1fr] gap-6">
            {/* CONFIG */}
            <aside className="glass-card rounded-2xl p-6 h-fit">
              <h2 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-3">Book Type</h2>
              <div className="grid grid-cols-2 gap-2 mb-6">
                {(Object.keys(BOOK_TYPES) as BookTypeKey[]).map((key) => {
                  const t = BOOK_TYPES[key];
                  const active = type === key;
                  return (
                    <button
                      key={key}
                      onClick={() => selectType(key)}
                      className={`p-3 rounded-xl border text-center transition-colors ${
                        active ? "border-[#7a5c12] bg-[#d9a63a]/10" : "border-black/10 bg-black/[0.03] hover:border-[#7a5c12]/40"
                      }`}
                    >
                      <div className="text-2xl">{t.icon}</div>
                      <div className={`text-xs mt-1 ${active ? "text-[#7a5c12]" : "text-slate-600"}`}>{t.label}</div>
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
                      onClick={() => {
                        setPromptLanguage(pl);
                        setPromptLangTouched(true);
                      }}
                      className={`flex-1 py-2 rounded-lg border text-xs transition-colors ${
                        promptLanguage === pl ? "border-[#7a5c12] text-[#7a5c12] bg-[#d9a63a]/10" : "border-black/10 text-slate-600 hover:border-[#7a5c12]/40"
                      }`}
                    >
                      {pl === "en" ? "English scaffolding" : "ไทยทั้งชุด"}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="mt-4 mb-1">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-semibold tracking-widest text-slate-600 uppercase">Extra Modules</h2>
                  <div className="flex gap-1">
                    <button onClick={() => { setGroups(STARTER_GROUPS as OptionalGroup[]); setShowStarter(true); }} className="text-[0.6rem] px-1.5 py-0.5 rounded border border-[#7a5c12]/40 text-[#7a5c12] hover:bg-[#d9a63a]/15" title="เปิดโมดูลสำหรับเริ่มนิยายจากไอเดีย + ดูลำดับ 7 ขั้น">
                      เริ่มจากไอเดีย
                    </button>
                    <button onClick={() => setGroups(defaultGroupsFor(type))} className="text-[0.6rem] px-1.5 py-0.5 rounded border border-black/10 text-slate-600 hover:border-[#7a5c12]/40 hover:text-[#6b5010]" title="กลุ่มที่แนะนำตามประเภทหนังสือ">
                      แนะนำ
                    </button>
                    <button onClick={() => setGroups(allGroups)} className="text-[0.6rem] px-1.5 py-0.5 rounded border border-black/10 text-slate-600 hover:border-[#7a5c12]/40 hover:text-[#6b5010]">
                      ทั้งหมด
                    </button>
                    <button onClick={() => setGroups([])} className="text-[0.6rem] px-1.5 py-0.5 rounded border border-black/10 text-slate-600 hover:border-[#7a5c12]/40 hover:text-[#6b5010]" title="เฉพาะ prompt หลัก">
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
                        className="accent-[#c8901f] mt-0.5"
                      />
                      <span className="text-xs">
                        <span className="text-slate-800">{g.label}</span>
                        <span className="block text-[0.65rem] text-faint leading-snug">{g.desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {groups.includes("agents") && (
                  <p className="mt-2 text-[0.62rem] text-emerald-700 leading-snug">
                    ℹ️ Agent Pack สร้าง “system prompt” สำหรับ multi-agent ที่คุณรันเอง (เช่น Claude Projects) — ไม่ได้รันในแอปนี้
                  </p>
                )}
                <button onClick={() => setShowStarter((v) => !v)} className="mt-2 text-[0.65rem] text-[#7a5c12] hover:underline">
                  {showStarter ? "− ซ่อนลำดับเริ่มจากไอเดีย" : "+ ลำดับเริ่มจากไอเดีย (7 ขั้น)"}
                </button>
                {showStarter && (
                  <ol className="mt-2 space-y-1.5 border-l border-[#7a5c12]/25 pl-3">
                    {STARTER_SEQUENCE.map((s) => (
                      <li key={s.key} className="text-[0.7rem] leading-snug">
                        <span className="text-[#7a5c12] font-semibold tabular-nums">{s.n}.</span>{" "}
                        <span className="text-slate-800">{s.titleTh}</span>
                        <span className="block text-[0.62rem] text-faint">
                          {s.whyTh} · <span className="text-slate-600">{s.promptIds.join(" + ")}</span>
                        </span>
                      </li>
                    ))}
                    <li className="text-[0.6rem] text-faint pt-1">
                      กด “Generate” แล้วรัน prompt ตามลำดับนี้ — ใส่ไอเดีย → อนุมัติ → ทำต่อ · คุณคุมทิศทางทั้งหมด
                    </li>
                  </ol>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 my-4">
                <Stat value={String(chapters)} label="Chapters" />
                <Stat value={totalWords >= 1000 ? `${Math.round(totalWords / 1000)}K` : String(totalWords)} label="Est. Words" />
                <Stat value={String(prompts.length)} label="Prompts" />
              </div>

              <button onClick={generate} className="w-full py-3 bg-[#d9a63a] text-black font-semibold rounded-xl hover:bg-[#c8901f] transition-colors flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4" />
                Generate Prompts
              </button>

              <label className="mt-2 w-full py-2 border border-black/10 text-slate-600 rounded-xl hover:border-[#7a5c12]/40 hover:text-[#6b5010] transition-colors flex items-center justify-center gap-1.5 text-xs cursor-pointer">
                <Upload className="w-4 h-4" /> นำเข้าโปรเจกต์ (.json)
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importProject(f);
                    e.target.value = "";
                  }}
                />
              </label>

              {prompts.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button onClick={downloadMd} className="py-2.5 border border-[#7a5c12]/30 text-[#7a5c12] rounded-xl hover:border-[#7a5c12] transition-colors flex items-center justify-center gap-1.5 text-xs">
                    <FileText className="w-4 h-4" /> .md
                  </button>
                  <button onClick={downloadJson} className="py-2.5 border border-[#7a5c12]/30 text-[#7a5c12] rounded-xl hover:border-[#7a5c12] transition-colors flex items-center justify-center gap-1.5 text-xs">
                    <FileJson className="w-4 h-4" /> .json
                  </button>
                  <button onClick={copyAll} className="py-2.5 border border-black/10 text-slate-700 rounded-xl hover:border-[#7a5c12]/40 transition-colors flex items-center justify-center gap-1.5 text-xs">
                    <Copy className="w-4 h-4" /> Copy all
                  </button>
                  <button onClick={saveProject} disabled={saving} className="py-2.5 border border-black/10 text-slate-700 rounded-xl hover:border-[#7a5c12]/40 transition-colors flex items-center justify-center gap-1.5 text-xs disabled:opacity-50">
                    <Save className="w-4 h-4" /> {projectId ? "Update" : "Save"}
                  </button>
                </div>
              )}

              {projectId && (
                <div className="mt-2 space-y-2">
                  <button onClick={toggleShare} className="w-full py-2.5 border border-black/10 text-slate-700 rounded-xl hover:border-[#7a5c12]/40 transition-colors flex items-center justify-center gap-1.5 text-xs">
                    <Share2 className="w-4 h-4" />
                    {shareInfo.visibility === "public" ? "คัดลอกลิงก์ / ปิดแชร์" : "เปิดแชร์ (ลิงก์อ่านอย่างเดียว)"}
                  </button>
                  {shareInfo.visibility === "public" && shareInfo.token && (
                    <a href={`/bookisdom/share/${shareInfo.token}`} target="_blank" rel="noreferrer" className="block text-center text-[0.65rem] text-[#7a5c12] hover:underline truncate">
                      /bookisdom/share/{shareInfo.token.slice(0, 12)}…
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

              {notice && <div className="mt-4 p-3 bg-[#d9a63a]/10 border border-[#7a5c12]/30 rounded-xl text-[#7a5c12] text-xs">{notice}</div>}
              {error && (
                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {projects.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase">Saved Projects</h3>
                    {projectId && (
                      <button onClick={newProject} className="text-[0.65rem] text-faint hover:text-[#6b5010]">+ New</button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {projects.map((p) => (
                      <div key={p.id} className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-xs ${projectId === p.id ? "border-[#7a5c12]/50 bg-[#d9a63a]/5" : "border-black/5 bg-black/[0.03]"}`}>
                        <button onClick={() => loadProject(p.id)} className="flex-1 text-left truncate" title={p.title}>
                          <span className="text-slate-800">{p.title}</span>
                          <span className="text-faint ml-1">· {titleCase(p.type)}</span>
                        </button>
                        <button onClick={() => deleteProject(p.id)} className="text-faint hover:text-red-700" title="Delete">
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
              <div className="glass-card rounded-2xl p-4 mb-4 border border-black/5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-[#7a5c12]" />
                    Story Bible / STATE
                    {storyBible.trim() && <span className="text-[0.6rem] text-green-800 normal-case">● injected</span>}
                  </h3>
                  <div className="flex items-center gap-2">
                    {!storyBible.trim() && (
                      <button
                        onClick={() => setStoryBible("[ตัวละคร]\nชื่อ: ลักษณะเด่น\n\n[สถานที่]\nชื่อ: คำอธิบาย\n\n[สิ่งของ]\nชื่อ: บทบาท\n\n[ความสัมพันธ์]\nA - B: ความสัมพันธ์\nA -> C: การกระทำ\n")}
                        className="text-[0.65rem] text-[#7a5c12] hover:text-[#6b5010]"
                      >
                        + แทรกโครง Codex
                      </button>
                    )}
                    {storyBible.trim() && (
                      <button onClick={() => setStoryBible("")} className="text-[0.65rem] text-faint hover:text-red-700">
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  value={storyBible}
                  onChange={(e) => setStoryBible(e.target.value)}
                  placeholder="วาง/แก้ codex ที่นี่ — หรือคัดลอกบล็อก <<<STATE>>> ที่โมเดลสร้างจากบทล่าสุดมาวาง แล้วกด Generate ใหม่ → ฉีดเป็น 'แหล่งความจริง' เข้าทุกบทอัตโนมัติ"
                  className="input min-h-[80px] resize-y font-mono text-[0.72rem]"
                />
                <p className="text-[0.62rem] text-faint mt-1">
                  ปิดช่องว่าง continuity ด้วย prompt ล้วน — แก้ที่นี่ที่เดียว ใช้กับทุกบท (กด Generate Prompts ใหม่เพื่อใช้ค่าล่าสุด)
                </p>
                <p className="text-[0.62rem] text-faint mt-1 leading-relaxed">
                  <span className="text-[#7a5c12]">Story Codex (GraphRAG):</span> ประกาศ entity ใต้หัวข้อ <code className="text-slate-600">[ตัวละคร] [สถานที่] [สิ่งของ] [ความสัมพันธ์]</code> →
                  สารบบทั้งเล่มฉีดเข้า master prompt ส่วนแต่ละบทจะได้เฉพาะ entity ที่ปรากฏใน beat บทนั้น + ตัวที่เชื่อมกัน (deterministic ไม่มี LLM แอบทำงาน)
                </p>
                <p className="text-[0.62rem] text-faint mt-1 leading-relaxed">
                  <span className="text-slate-600">กฎเขียน entry (จากแนวปฏิบัติที่เครื่องมือใหญ่ converge ตรงกัน):</span> เขียนเชิงบวกเสมอ (&quot;ตาบอด&quot; ไม่ใช่ &quot;มองไม่เห็น&quot; — คำปฏิเสธรั่วเข้า prose) · ข้อเท็จจริงสั้น ๆ ไม่ใช่ prose · เริ่มเล็กแล้วค่อยเติม · ความลับที่ยังไม่ควรโผล่ในเนื้อเรื่อง ใส่ใน <code className="text-slate-600">รู้แล้ว:</code> (knowledge lock) ไม่ใช่ในคำอธิบายตัวละคร
                </p>
              </div>

              {prompts.length === 0 ? (
                <div className="glass-card rounded-2xl p-10 text-center text-faint">
                  <Sparkles className="w-10 h-10 mx-auto mb-3 text-[#7a5c12]/40" />
                  <p>ตั้งค่าหนังสือทางซ้าย แล้วกด Generate Prompts</p>
                  <p className="text-xs mt-2 text-faint">
                    จะได้ชุด prompt ครบเซ็ต: Master, Overview, รายบท, Analysis, Revision, Front/Back Matter, Feedback
                  </p>
                  <button onClick={() => setShowGuide(true)} className="mt-4 text-xs text-[#7a5c12] hover:underline">
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
                        <div key={p.id} className="glass-card rounded-2xl overflow-hidden border border-black/5">
                          <div className="flex items-center justify-between gap-3 px-5 py-3">
                            <button onClick={() => setOpenId(open ? null : p.id)} aria-expanded={open} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                              <ChevronDown className={`w-4 h-4 text-faint transition-transform ${open ? "rotate-180" : ""}`} />
                              <span className="text-sm font-semibold text-slate-900 whitespace-nowrap">{p.id}</span>
                              <span className="text-xs text-faint truncate">{p.name}</span>
                            </button>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[0.6rem] text-faint tabular-nums" title="ประมาณจากอัตราส่วนตัวอักษร/token (heuristic) — จำนวนจริงต่างกันตามโมเดล">
                                ≈{estimateTokens(p.prompt).toLocaleString()} tok
                              </span>
                              <span className={`text-[0.6rem] px-1.5 py-0.5 border rounded ${GROUP_COLORS[p.group]}`}>{groupLabel(p.group)}</span>
                              <button onClick={() => runInStudio(p)} className="text-slate-600 hover:text-[#6b5010]" title="Run in Studio" aria-label={`Run ${p.id} in Studio`}>
                                <Play className="w-4 h-4" />
                              </button>
                              <button onClick={() => copyPrompt(p)} className="text-slate-600 hover:text-[#6b5010]" title="Copy" aria-label={`Copy ${p.id}`}>
                                {copiedId === p.id ? <Check className="w-4 h-4 text-green-800" /> : <Copy className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                          {open && (
                            <div className="px-5 pb-5">
                              <p className="text-[0.7rem] text-faint mb-1">{p.description}</p>
                              <p className="text-[0.65rem] text-faint italic mb-3">Usage: {p.usage}</p>
                              <pre className="bg-[#f3f5f9] border border-black/5 rounded-lg p-4 text-xs leading-6 text-slate-700 whitespace-pre-wrap max-h-[480px] overflow-y-auto">
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
                      className="w-full mt-3 py-2.5 border border-black/10 text-slate-600 rounded-xl hover:border-[#7a5c12]/40 hover:text-[#6b5010] transition-colors text-xs"
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
    </div>
  );
}

