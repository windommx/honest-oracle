"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { GROUP_LABELS, NAV, type NavItem, type ViewKey } from "./_nav";
import type { StageFeature } from "@/lib/stagelab/plans";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ⌘K palette.                                                             ║
// ║                                                                          ║
// ║  This is a tool someone opens every Sunday and moves through thirteen    ║
// ║  views in half an hour. Reaching for the sidebar each time is the kind   ║
// ║  of friction that makes a weekly routine feel like work.                 ║
// ║                                                                          ║
// ║  Locked views stay in the list, greyed. Hiding them would mean the only  ║
// ║  people who learn the paid tier exists are the ones who go looking.      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/**
 * Subsequence match, the same rule editors use: every character of the query
 * must appear in order. "qnl" finds "Quant Lab"; "lqna" finds nothing.
 * Returns a score (lower is better) or null.
 */
function fuzzyScore(query: string, target: string): number | null {
  if (query === "") return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let ti = 0;
  let score = 0;
  let lastHit = -1;
  for (const ch of q) {
    const hit = t.indexOf(ch, ti);
    if (hit === -1) return null;
    // Contiguous runs and early matches rank above scattered ones.
    score += hit - lastHit - 1 + (hit === 0 ? 0 : 1);
    lastHit = hit;
    ti = hit + 1;
  }
  return score;
}

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  features,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (v: ViewKey) => void;
  features: StageFeature[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const labelId = useId();

  const results = useMemo(() => {
    const scored = NAV.map((item) => {
      const haystack = `${item.label} ${item.key} ${item.hint} ${GROUP_LABELS[item.group]}`;
      const score = fuzzyScore(query.trim(), haystack);
      return score === null ? null : { item, score };
    }).filter((x): x is { item: NavItem; score: number } => x !== null);

    // Unlocked first at equal relevance — the reachable answer should be the
    // one under the cursor when someone hits Enter without looking.
    scored.sort((a, b) => {
      const aLocked = features.includes(a.item.feature) ? 0 : 1;
      const bLocked = features.includes(b.item.feature) ? 0 : 1;
      if (aLocked !== bLocked) return aLocked - bLocked;
      return a.score - b.score;
    });
    return scored.map((x) => x.item);
  }, [query, features]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    // rAF: the input is not in the document until after this effect's paint.
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      restoreTo.current?.focus?.();
    };
  }, [open]);

  // Keep the highlighted row on screen when arrowing past the fold.
  // scrollIntoView is optional in the DOM spec and absent in jsdom and some
  // embedded webviews; a keyboard nicety must not take the palette down with
  // it, so the call is feature-detected rather than assumed.
  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    if (typeof row?.scrollIntoView === "function") row.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = useCallback(
    (item: NavItem) => {
      onNavigate(item.key);
      onClose();
    },
    [onNavigate, onClose],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (results.length ? (i + 1) % results.length : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
        return;
      }
      if (e.key === "Enter" && results[active]) {
        e.preventDefault();
        choose(results[active]);
      }
    },
    [results, active, choose, onClose],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 p-4 pt-[12vh]">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onKeyDown={onKeyDown}
      >
        <h2 id={labelId} className="sr-only">
          ค้นหาและไปยังหน้าต่าง ๆ
        </h2>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="พิมพ์เพื่อค้นหา…"
          aria-label="ค้นหาหน้า"
          aria-controls={`${labelId}-list`}
          aria-activedescendant={results[active] ? `${labelId}-${results[active].key}` : undefined}
          className="w-full border-b border-zinc-800 bg-transparent px-4 py-3.5 text-sm text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
        />
        <ul
          ref={listRef}
          id={`${labelId}-list`}
          role="listbox"
          aria-label="ผลการค้นหา"
          className="max-h-80 overflow-y-auto p-1.5"
        >
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-zinc-400">ไม่พบหน้าที่ตรงกับคำค้น</li>
          )}
          {results.map((item, i) => {
            const locked = !features.includes(item.feature);
            return (
              <li key={item.key}>
                <button
                  id={`${labelId}-${item.key}`}
                  role="option"
                  aria-selected={i === active}
                  data-active={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(item)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                    i === active ? "bg-emerald-500/10" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${locked ? "text-zinc-400" : "text-zinc-100"}`}>
                      {item.label}
                    </span>
                    <span className="block truncate text-[0.7rem] text-zinc-400">{item.hint}</span>
                  </span>
                  <span className="shrink-0 text-[0.6rem] uppercase tracking-wide text-zinc-400">
                    {GROUP_LABELS[item.group]}
                  </span>
                  {locked && (
                    <span className="shrink-0 text-[0.6rem] font-medium text-amber-400">PRO</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <footer className="flex items-center gap-3 border-t border-zinc-800 px-3 py-2 text-[0.65rem] text-zinc-400">
          <span>
            <kbd className="rounded border border-zinc-700 px-1">↑</kbd>{" "}
            <kbd className="rounded border border-zinc-700 px-1">↓</kbd> เลื่อน
          </span>
          <span>
            <kbd className="rounded border border-zinc-700 px-1">Enter</kbd> เปิด
          </span>
          <span>
            <kbd className="rounded border border-zinc-700 px-1">Esc</kbd> ปิด
          </span>
        </footer>
      </div>
    </div>
  );
}

/** Wire ⌘K / Ctrl+K, ignoring the shortcut while a text field has focus. */
export function useCommandPalette(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      setOpen((v) => !v);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return [open, setOpen];
}
