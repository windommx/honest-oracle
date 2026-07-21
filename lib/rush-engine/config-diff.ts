// Field-level diff between two BookConfigs — the honest way to compare project
// "versions": prompts derive deterministically from config, so diffing the
// SOURCE (config) tells the whole story; diffing derived prompt text would just
// restate it noisily. Pure/deterministic.

import type { BookConfig } from "./types";

export interface ConfigChange {
  field: string;
  from: string;
  to: string;
}

const LABEL_TH: Record<string, string> = {
  type: "ประเภท",
  title: "ชื่อเรื่อง",
  thesis: "แก่นเรื่อง",
  reader: "ผู้อ่าน",
  voice: "โทนเสียง",
  chapters: "จำนวนบท",
  wordsPerChapter: "คำต่อบท",
  subGenre: "แนวย่อย",
  citationStyle: "รูปแบบอ้างอิง",
  language: "ภาษา",
  outline: "โครงเรื่อง (outline)",
  storyBible: "Story Codex",
  promptLanguage: "ภาษา prompt",
  structure: "โครงเรื่อง (structure)",
};

const clip = (v: unknown, max = 40): string => {
  const s = v === undefined || v === null || v === "" ? "—" : String(v);
  return s.length > max ? s.slice(0, max) + "…" : s;
};

/** Compare every declared BookConfig field; long text fields (outline/storyBible)
 *  are clipped so the report stays scannable. Returns [] when identical. */
export function diffConfigs(a: BookConfig, b: BookConfig): ConfigChange[] {
  const fields = Object.keys(LABEL_TH) as Array<keyof BookConfig>;
  const out: ConfigChange[] = [];
  for (const f of fields) {
    const av = a[f];
    const bv = b[f];
    if ((av ?? "") === (bv ?? "")) continue;
    out.push({ field: LABEL_TH[f as string] ?? String(f), from: clip(av), to: clip(bv) });
  }
  return out;
}

/** One-line Thai summary for a restore notice. "" when identical. */
export function summarizeConfigDiff(changes: ConfigChange[], max = 4): string {
  if (!changes.length) return "";
  const parts = changes.slice(0, max).map((c) => `${c.field}: ${c.from} → ${c.to}`);
  const more = changes.length - max;
  return parts.join(" · ") + (more > 0 ? ` · และอีก ${more} รายการ` : "");
}
