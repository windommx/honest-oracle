"use client";

import { Knob } from "@/components/knob";
import {
  BAND_COUNT,
  BAND_LABEL,
  type BandSettings,
  type MultibandSettings,
} from "@/lib/master-engine/multiband";
import { GROUP_COLOR, TEXT_FAINT } from "./_tokens";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  MULTIBAND PANEL — three compressors and the two lines between.   ║
// ║                                                                    ║
// ║  Each band shows the reduction it is applying, live, because a     ║
// ║  multiband is the one processor where a number is not enough: two  ║
// ║  bands can be set identically and do completely different work,    ║
// ║  and without per-band meters the operator is guessing which one    ║
// ║  is moving.                                                        ║
// ╚══════════════════════════════════════════════════════════════════╝

const MAX_REDUCTION_DB = 12;

export interface MultibandPanelProps {
  settings: MultibandSettings;
  onChange: (next: Partial<MultibandSettings>) => void;
  /** Live, negative, one per band. */
  reductionDb: readonly number[];
}

export function MultibandPanel({ settings, onChange, reductionDb }: MultibandPanelProps) {
  const setBand = (index: number, change: Partial<BandSettings>) => {
    onChange({ bands: settings.bands.map((b, i) => (i === index ? { ...b, ...change } : b)) });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/5">
        <h2 className="text-[0.62rem] tracking-widest uppercase" style={{ color: GROUP_COLOR.dynamics }}>
          Multiband · คุมแต่ละย่านแยกกัน
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[0.68rem]" style={{ color: TEXT_FAINT }}>
            <span>จุดตัดต่ำ</span>
            <input
              type="number"
              className="input w-20 tabular-nums text-xs"
              min={30}
              max={settings.crossoverHighHz - 50}
              step={10}
              value={Math.round(settings.crossoverLowHz)}
              onChange={(e) => {
                const hz = Number(e.target.value);
                if (Number.isFinite(hz)) onChange({ crossoverLowHz: hz });
              }}
            />
            <span>Hz</span>
          </label>
          <label className="flex items-center gap-1.5 text-[0.68rem]" style={{ color: TEXT_FAINT }}>
            <span>จุดตัดสูง</span>
            <input
              type="number"
              className="input w-24 tabular-nums text-xs"
              min={settings.crossoverLowHz + 50}
              max={18000}
              step={100}
              value={Math.round(settings.crossoverHighHz)}
              onChange={(e) => {
                const hz = Number(e.target.value);
                if (Number.isFinite(hz)) onChange({ crossoverHighHz: hz });
              }}
            />
            <span>Hz</span>
          </label>
          <button
            type="button"
            onClick={() => onChange({ enabled: !settings.enabled })}
            aria-pressed={settings.enabled}
            className={`px-3 py-1.5 rounded-lg border text-xs transition ${
              settings.enabled
                ? "border-gold text-gold bg-gold/10"
                : "border-white/10 text-gray-400 hover:border-gold/40"
            }`}
          >
            {settings.enabled ? "เปิดอยู่" : "ปิดอยู่"}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: BAND_COUNT }, (_, i) => {
          const band = settings.bands[i];
          const reduction = reductionDb[i] ?? 0;
          const range =
            i === 0
              ? `< ${Math.round(settings.crossoverLowHz)} Hz`
              : i === 1
                ? `${Math.round(settings.crossoverLowHz)}–${Math.round(settings.crossoverHighHz)} Hz`
                : `> ${Math.round(settings.crossoverHighHz)} Hz`;

          return (
            <div key={i} className="rounded-xl border border-white/10 p-3">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[0.7rem] font-medium" style={{ color: GROUP_COLOR.dynamics }}>
                  {BAND_LABEL[i]}
                </span>
                <span className="text-[0.6rem] tabular-nums" style={{ color: TEXT_FAINT }}>
                  {range}
                </span>
              </div>

              {/* The live meter. Drawn downward, because reduction is what it
                  measures and a bar that grows upward reads as level. */}
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-75"
                    style={{
                      width: `${Math.min(100, (Math.abs(reduction) / MAX_REDUCTION_DB) * 100)}%`,
                      backgroundColor: GROUP_COLOR.dynamics,
                    }}
                  />
                </div>
                <span className="text-[0.6rem] tabular-nums w-12 text-right" style={{ color: TEXT_FAINT }}>
                  {reduction < -0.05 ? `${reduction.toFixed(1)}` : "0.0"} dB
                </span>
              </div>

              <div className="flex flex-wrap gap-x-2 gap-y-2 justify-center">
                <Knob
                  label="Thresh"
                  value={band.thresholdDb}
                  min={-48}
                  max={0}
                  unit="dB"
                  precision={1}
                  color={GROUP_COLOR.dynamics}
                  onChange={(v) => setBand(i, { thresholdDb: v })}
                  size={44}
                />
                <Knob
                  label="Ratio"
                  value={band.ratio}
                  min={1}
                  max={20}
                  logarithmic
                  precision={1}
                  color={GROUP_COLOR.dynamics}
                  onChange={(v) => setBand(i, { ratio: v })}
                  size={44}
                />
                <Knob
                  label="Attack"
                  value={band.attackSeconds}
                  min={0.0005}
                  max={0.2}
                  unit="s"
                  logarithmic
                  color={GROUP_COLOR.dynamics}
                  onChange={(v) => setBand(i, { attackSeconds: v })}
                  size={44}
                />
                <Knob
                  label="Release"
                  value={band.releaseSeconds}
                  min={0.02}
                  max={1}
                  unit="s"
                  logarithmic
                  color={GROUP_COLOR.dynamics}
                  onChange={(v) => setBand(i, { releaseSeconds: v })}
                  size={44}
                />
                <Knob
                  label="Makeup"
                  value={band.makeupDb}
                  min={-12}
                  max={12}
                  unit="dB"
                  precision={1}
                  color={GROUP_COLOR.dynamics}
                  onChange={(v) => setBand(i, { makeupDb: v })}
                  size={44}
                />
              </div>

              <div className="flex gap-1.5 mt-2">
                {([
                  ["solo", "Solo", "ฟังเฉพาะย่านนี้"],
                  ["bypass", "Bypass", "ผ่านย่านนี้ไปโดยไม่บีบ"],
                ] as const).map(([key, label, hint]) => (
                  <button
                    key={key}
                    type="button"
                    title={hint}
                    onClick={() => setBand(i, { [key]: !band[key] })}
                    aria-pressed={band[key]}
                    aria-label={`${label} ${BAND_LABEL[i]}`}
                    className={`flex-1 px-2 py-1 rounded border text-[0.65rem] transition ${
                      band[key]
                        ? "border-gold text-gold bg-gold/10"
                        : "border-white/10 text-gray-400 hover:border-gold/40"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[0.65rem] leading-relaxed" style={{ color: TEXT_FAINT }}>
        จุดตัดเป็นแบบ Linkwitz-Riley อันดับ 4 — สามย่านรวมกลับมาแล้วเรียบภายใน 0.1 dB ตลอดย่านเสียง
        (มีเทสต์กวาดความถี่ตรวจไว้) ย่านที่ไม่ผ่านจุดตัดบนจะถูกส่งผ่าน all-pass ของจุดตัดนั้น
        เพื่อให้ทุกย่านมีเฟสเดียวกัน ไม่ใช่แค่ระดับเสียงเท่ากัน
      </p>
    </section>
  );
}
