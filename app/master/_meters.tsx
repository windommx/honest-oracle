"use client";

import { LOUDNESS_TARGETS, type LoudnessTargetId } from "@/lib/master-engine/loudness";
import { GOLD, GROUP_COLOR, TEXT_FAINT, AUDIT_COLOR } from "./_tokens";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  METERS — a peak bar, and the two numbers that decide delivery.   ║
// ║                                                                    ║
// ║  Peak alone cannot tell an engineer anything about how loud a      ║
// ║  master will SOUND after a platform normalises it: two files with  ║
// ║  identical peaks can differ by 6 LU. So the number in the largest  ║
// ║  type here is LUFS, with the distance to the chosen target beside  ║
// ║  it, and the peak bar is the small one.                            ║
// ╚══════════════════════════════════════════════════════════════════╝

/** Bottom of the peak scale. Below this the bar would be a sliver. */
const FLOOR_DB = -60;

const marks = [0, -3, -6, -12, -24, -48];

export interface MetersProps {
  peak: number;
  shortTermLufs: number;
  gainReductionDb: number;
  targetId: LoudnessTargetId;
  onTargetChange: (id: LoudnessTargetId) => void;
  /** Loudness of the whole file, measured offline. -Infinity until measured. */
  integratedLufs: number;
}

const toDb = (g: number) => (g > 1e-5 ? 20 * Math.log10(g) : FLOOR_DB);
const clamp = (v: number) => Math.min(100, Math.max(0, v));

export function Meters({
  peak,
  shortTermLufs,
  gainReductionDb,
  targetId,
  onTargetChange,
  integratedLufs,
}: MetersProps) {
  const target = LOUDNESS_TARGETS.find((t) => t.id === targetId) ?? LOUDNESS_TARGETS[0];
  const peakDb = toDb(peak);
  const peakPercent = clamp(((peakDb - FLOOR_DB) / -FLOOR_DB) * 100);
  const reduction = clamp((Math.abs(gainReductionDb) / 12) * 100);

  const known = Number.isFinite(integratedLufs);
  const distance = known ? integratedLufs - target.lufs : 0;
  // Within a LU either way is on target for any platform; past that, say which
  // way and by how much rather than colouring it and leaving it at that.
  const verdict = !known
    ? "ยังไม่ได้วัด"
    : Math.abs(distance) <= 1
      ? "ตรงเป้า"
      : distance > 0
        ? `ดังเกิน ${distance.toFixed(1)} LU`
        : `เบากว่าเป้า ${Math.abs(distance).toFixed(1)} LU`;
  const verdictColor = !known
    ? TEXT_FAINT
    : Math.abs(distance) <= 1
      ? AUDIT_COLOR.ok
      : Math.abs(distance) <= 3
        ? AUDIT_COLOR.caution
        : AUDIT_COLOR.problem;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex flex-col gap-3">
      <div>
        <label className="block text-[0.6rem] tracking-widest uppercase mb-1" style={{ color: TEXT_FAINT }}>
          ปลายทาง
        </label>
        <select
          className="input w-full text-xs"
          value={targetId}
          onChange={(e) => onTargetChange(e.target.value as LoudnessTargetId)}
        >
          {LOUDNESS_TARGETS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} · {t.lufs} LUFS
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="text-[0.6rem] tracking-widest uppercase" style={{ color: TEXT_FAINT }}>
          ความดังทั้งไฟล์
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums" style={{ color: known ? GOLD : TEXT_FAINT }}>
            {known ? integratedLufs.toFixed(1) : "—"}
          </span>
          <span className="text-[0.7rem]" style={{ color: TEXT_FAINT }}>
            LUFS
          </span>
        </div>
        <div className="text-[0.7rem] mt-0.5" style={{ color: verdictColor }}>
          {verdict}
        </div>
      </div>

      <div>
        <div className="flex justify-between text-[0.6rem]" style={{ color: TEXT_FAINT }}>
          <span>ขณะเล่น (3 วินาที)</span>
          <span className="tabular-nums">
            {Number.isFinite(shortTermLufs) ? `${shortTermLufs.toFixed(1)} LUFS` : "—"}
          </span>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-[0.6rem] mb-1" style={{ color: TEXT_FAINT }}>
          <span>ยอดสัญญาณ</span>
          <span className="tabular-nums">{peak > 1e-5 ? `${peakDb.toFixed(1)} dB` : "—"}</span>
        </div>
        <div className="relative h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-75"
            style={{
              width: `${peakPercent}%`,
              backgroundColor: peakDb > -1 ? AUDIT_COLOR.problem : GROUP_COLOR.dynamics,
            }}
          />
          {marks.map((db) => (
            <div
              key={db}
              className="absolute top-0 bottom-0 w-px bg-black/40"
              style={{ left: `${clamp(((db - FLOOR_DB) / -FLOOR_DB) * 100)}%` }}
              aria-hidden
            />
          ))}
        </div>
      </div>

      <div>
        <div className="flex justify-between text-[0.6rem] mb-1" style={{ color: TEXT_FAINT }}>
          <span>ลิมิเตอร์ลดลง</span>
          <span className="tabular-nums">
            {gainReductionDb < -0.05 ? `${gainReductionDb.toFixed(1)} dB` : "0.0 dB"}
          </span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-75"
            style={{ width: `${reduction}%`, backgroundColor: GROUP_COLOR.character }}
          />
        </div>
      </div>
    </div>
  );
}
