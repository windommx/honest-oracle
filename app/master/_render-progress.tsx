"use client";

import { X } from "lucide-react";
import type { RenderProgress } from "@/lib/master-engine/offline";
import { TEXT_FAINT } from "./_tokens";

/**
 * What the render is doing, while it does it.
 *
 * Deliberately not one bar. The two phases are different kinds of work: the
 * chain runs sample by sample and its position is genuinely known, while the
 * audit is three whole-file passes with no useful interior position. A single
 * bar covering both would have to invent the second half, and a progress bar
 * that invents its own numbers teaches the operator to ignore progress bars.
 * So the first phase gets a real bar and the second says what it is doing.
 *
 * On a browser with no usable worker there is no bar at all, because the
 * thread that would paint it is the thread doing the work. It says so
 * instead — printed before the freeze starts, which is the only moment it
 * can be printed.
 */
export function RenderProgressBar({
  progress,
  offThread,
  onCancel,
}: {
  progress: RenderProgress | null;
  offThread: boolean;
  onCancel: () => void;
}) {
  if (!progress) return null;

  if (!offThread) {
    return (
      <p className="mt-2 text-[0.65rem] leading-relaxed" style={{ color: TEXT_FAINT }}>
        เบราว์เซอร์นี้ใช้ Web Worker ไม่ได้ จึงต้องเรนเดอร์บนเธรดหลัก — หน้าจะไม่ตอบสนองจนกว่าจะเสร็จ
      </p>
    );
  }

  const measuring = progress.phase === "measure";
  const percent = Math.round(progress.fraction * 100);

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <div
          className="h-1 flex-1 rounded-full bg-white/10 overflow-hidden"
          role="progressbar"
          aria-label="ความคืบหน้าการเรนเดอร์"
          aria-valuemin={0}
          aria-valuemax={100}
          // Omitted while measuring: an indeterminate bar with a number on it
          // would be a number nobody measured.
          aria-valuenow={measuring ? undefined : percent}
          aria-valuetext={measuring ? "กำลังวัดความดัง" : `เรนเดอร์ ${percent}%`}
        >
          <div
            className={`h-full bg-gold/60 transition-[width] duration-100 ${measuring ? "animate-pulse" : ""}`}
            style={{ width: measuring ? "100%" : `${percent}%` }}
          />
        </div>
        <button
          onClick={onCancel}
          className="p-1 rounded-md border border-white/10 text-gray-400 hover:border-gold/40 hover:text-gray-200 transition"
          aria-label="ยกเลิกการเรนเดอร์"
          title="ยกเลิก"
        >
          <X className="w-3 h-3" aria-hidden />
        </button>
      </div>
      <p className="mt-1 text-[0.62rem]" style={{ color: TEXT_FAINT }}>
        {measuring ? "กำลังวัดความดังและยอดคลื่นจริง…" : `เรนเดอร์ ${percent}% — หน้ายังใช้งานได้ตามปกติ`}
      </p>
    </div>
  );
}
