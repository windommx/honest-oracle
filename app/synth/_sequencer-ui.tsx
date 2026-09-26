"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { Download, Eraser, Play, SlidersHorizontal, Square } from "lucide-react";
import { DRUM_IDS, type DrumId } from "@/lib/synth-engine/drums";
import type { SequencerPattern } from "@/lib/synth-engine/sequencer";
import {
  MAX_BPM,
  MIN_BPM,
  ROLL_ROWS,
  STEP_LENGTHS,
  applyToAllSteps,
  clearPattern,
  notesOutsideView,
  octaveContaining,
  patternHasContent,
  rollBase,
  setLength,
  toggleDrum,
  toggleNote,
} from "./_pattern";
import { isBlackKey, noteName } from "./_notes";
import { GOLD, GROUP_COLOR, TEXT_FAINT } from "./_tokens";

export interface SequencerPanelProps {
  pattern: SequencerPattern;
  onPatternChange: (p: SequencerPattern) => void;
  octave: number;
  onOctaveChange: (o: number) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  /** Step currently sounding, reported by the audio thread; -1 when stopped. */
  playhead: number;
  /** Sound a note when its cell is switched on, so writing is audible. */
  onPreviewNote: (note: number) => void;
  onPreviewDrum: (id: DrumId) => void;
  onExport: () => void;
  /** Render this pattern and hand it straight to MasterPro, no file in
   *  between. Null when there is nowhere to hand it to. */
  onSendToMaster: (() => void) | null;
  /** "" when idle; otherwise which of the two is running. */
  exporting: "" | "file" | "master";
  /** False before the audio engine has been started. */
  canPlay: boolean;
}

const DRUM_LABEL: Record<DrumId, string> = {
  kick: "Kick",
  snare: "Snare",
  hat: "Hat",
  perc: "Perc",
};

/** Narrow enough that 32 steps fit a laptop, wide enough to hit on a phone
 *  after the row scrolls sideways. */
const MIN_CELL_PX = 22;

export const SequencerPanel = memo(function SequencerPanel({
  pattern,
  onPatternChange,
  octave,
  onOctaveChange,
  playing,
  onPlayingChange,
  playhead,
  onPreviewNote,
  onPreviewDrum,
  onExport,
  onSendToMaster,
  exporting,
  canPlay,
}: SequencerPanelProps) {
  const steps = pattern.steps.length;

  /**
   * The BPM field holds text while it is being typed.
   *
   * Clamping on every keystroke makes the field impossible to use: typing the
   * "1" of 120 writes 1, which clamps to MIN_BPM and is rendered back under
   * the cursor, and clearing the field gives Number("") === 0, which clamps
   * too. Only the spinner arrows worked. The value is committed on blur and
   * on Enter instead, which is when the user has finished saying it.
   */
  const [bpmText, setBpmText] = useState(String(pattern.bpm));
  useEffect(() => setBpmText(String(pattern.bpm)), [pattern.bpm]);

  const commitBpm = () => {
    const parsed = Number(bpmText);
    if (!Number.isFinite(parsed) || bpmText.trim() === "") {
      setBpmText(String(pattern.bpm));
      return;
    }
    const bpm = Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, parsed)));
    setBpmText(String(bpm));
    if (bpm !== pattern.bpm) onPatternChange({ ...pattern, bpm });
  };
  const base = rollBase(octave);
  const rows = useMemo(
    // Top of the grid is the highest note, as on every piano roll ever drawn.
    () => Array.from({ length: ROLL_ROWS }, (_, i) => base + ROLL_ROWS - 1 - i),
    [base]
  );
  const columns = `3.4rem repeat(${steps}, minmax(${MIN_CELL_PX}px, 1fr))`;
  const hidden = useMemo(() => notesOutsideView(pattern, octave), [pattern, octave]);
  const first = pattern.steps[0];

  const clickNote = (index: number, note: number) => {
    const on = pattern.steps[index].notes.includes(note);
    onPatternChange(toggleNote(pattern, index, note));
    if (!on) onPreviewNote(note);
  };

  const clickDrum = (index: number, id: DrumId) => {
    const on = pattern.steps[index].drums.includes(id);
    onPatternChange(toggleDrum(pattern, index, id));
    if (!on) onPreviewDrum(id);
  };

  /** A heavier line at the start of each beat, so the bar is readable. */
  const beatStart = (i: number) => i % Math.max(1, pattern.stepsPerBeat) === 0;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/5">
        <h2 className="text-[0.62rem] tracking-widest uppercase" style={{ color: GROUP_COLOR.source }}>
          Sequencer · เพลงเดินเองบนเธรดเสียง
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onPlayingChange(!playing)}
            disabled={!canPlay}
            aria-pressed={playing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold text-black text-xs font-semibold hover:bg-gold-light transition disabled:opacity-30"
          >
            {playing ? <Square className="w-3.5 h-3.5" aria-hidden /> : <Play className="w-3.5 h-3.5" aria-hidden />}
            {playing ? "หยุดลูป" : "เล่นลูป"}
          </button>

          <button
            type="button"
            onClick={() => onPatternChange(clearPattern(pattern))}
            disabled={!patternHasContent(pattern)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-gray-300 hover:border-gold/40 transition disabled:opacity-30"
          >
            <Eraser className="w-3.5 h-3.5" aria-hidden />
            ล้าง
          </button>

          <button
            type="button"
            onClick={onExport}
            disabled={exporting !== "" || !patternHasContent(pattern)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-gray-300 hover:border-gold/40 transition disabled:opacity-30"
          >
            <Download className="w-3.5 h-3.5" aria-hidden />
            {exporting === "file" ? "กำลังเรนเดอร์…" : "บันทึก .wav"}
          </button>

          {onSendToMaster && (
            <button
              type="button"
              onClick={onSendToMaster}
              disabled={exporting !== "" || !patternHasContent(pattern)}
              title="เรนเดอร์แล้วส่งไป MasterPro โดยไม่ผ่านไฟล์ — ไม่มีการลดเหลือ 16 บิตระหว่างทาง"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-gray-300 hover:border-gold/40 transition disabled:opacity-30"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden />
              {exporting === "master" ? "กำลังส่ง…" : "ส่งไป MasterPro"}
            </button>
          )}
        </div>
      </div>

      {/* transport settings */}
      <div className="flex flex-wrap items-end gap-4 py-3 text-[0.7rem]" style={{ color: TEXT_FAINT }}>
        <label className="flex flex-col gap-1">
          <span>จังหวะ (BPM)</span>
          <input
            type="number"
            className="input w-20 tabular-nums"
            min={MIN_BPM}
            max={MAX_BPM}
            value={bpmText}
            onChange={(e) => setBpmText(e.target.value)}
            onBlur={commitBpm}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitBpm();
            }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="tabular-nums">สวิง {Math.round(pattern.swing * 100)}%</span>
          <input
            type="range"
            className="w-28"
            style={{ accentColor: GOLD }}
            min={0}
            max={0.9}
            step={0.01}
            value={pattern.swing}
            onChange={(e) => onPatternChange({ ...pattern, swing: Number(e.target.value) })}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="tabular-nums">ความยาวโน้ต {Math.round((first?.gate ?? 0.6) * 100)}%</span>
          <input
            type="range"
            className="w-28"
            style={{ accentColor: GOLD }}
            min={0.05}
            max={1}
            step={0.05}
            value={first?.gate ?? 0.6}
            onChange={(e) => onPatternChange(applyToAllSteps(pattern, { gate: Number(e.target.value) }))}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="tabular-nums">ความแรง {Math.round((first?.velocity ?? 0.9) * 100)}%</span>
          <input
            type="range"
            className="w-28"
            style={{ accentColor: GOLD }}
            min={0.1}
            max={1}
            step={0.05}
            value={first?.velocity ?? 0.9}
            onChange={(e) => onPatternChange(applyToAllSteps(pattern, { velocity: Number(e.target.value) }))}
          />
        </label>

        <div className="flex flex-col gap-1">
          <span>จำนวนขั้น</span>
          <div className="flex gap-1" role="group" aria-label="จำนวนขั้นของแพตเทิร์น">
            {STEP_LENGTHS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onPatternChange(setLength(pattern, n))}
                aria-pressed={steps === n}
                className={`px-2 py-1 rounded border text-[0.7rem] tabular-nums transition ${
                  steps === n ? "border-gold text-gold bg-gold/10" : "border-white/10 text-gray-400 hover:border-gold/40"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* the roll */}
      <div className="overflow-x-auto pb-1">
        <div className="min-w-max">
          {/* step numbers */}
          <div className="grid gap-px mb-1" style={{ gridTemplateColumns: columns }}>
            <div />
            {pattern.steps.map((_, i) => (
              <div
                key={i}
                aria-hidden
                className="text-center text-[0.55rem] tabular-nums"
                style={{ color: i === playhead ? GOLD : TEXT_FAINT, opacity: beatStart(i) ? 1 : 0.45 }}
              >
                {beatStart(i) ? i / pattern.stepsPerBeat + 1 : "·"}
              </div>
            ))}
          </div>

          <div role="group" aria-label="พิอาโนโรล">
            {rows.map((note) => (
              <div key={note} className="grid gap-px" style={{ gridTemplateColumns: columns }}>
                <div
                  className="text-[0.55rem] pr-1.5 text-right leading-[1.15rem] tabular-nums"
                  style={{ color: TEXT_FAINT, opacity: isBlackKey(note) ? 0.45 : 1 }}
                >
                  {noteName(note)}
                </div>
                {pattern.steps.map((step, i) => {
                  const on = step.notes.includes(note);
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${noteName(note)} ขั้นที่ ${i + 1}`}
                      onClick={() => clickNote(i, note)}
                      className={`h-[1.15rem] rounded-[2px] transition-colors ${
                        beatStart(i) ? "border-l border-white/20" : ""
                      }`}
                      style={{
                        backgroundColor: on
                          ? GROUP_COLOR.source
                          : i === playhead
                            ? "rgba(255,255,255,0.10)"
                            : isBlackKey(note)
                              ? "rgba(255,255,255,0.02)"
                              : "rgba(255,255,255,0.05)",
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* drum lanes */}
          <div role="group" aria-label="แทร็กกลอง" className="mt-2 pt-2 border-t border-white/5">
            {DRUM_IDS.map((id) => (
              <div key={id} className="grid gap-px" style={{ gridTemplateColumns: columns }}>
                <div className="text-[0.55rem] pr-1.5 text-right leading-[1.3rem]" style={{ color: TEXT_FAINT }}>
                  {DRUM_LABEL[id]}
                </div>
                {pattern.steps.map((step, i) => {
                  const on = step.drums.includes(id);
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${DRUM_LABEL[id]} ขั้นที่ ${i + 1}`}
                      onClick={() => clickDrum(i, id)}
                      className={`h-[1.3rem] rounded-[2px] transition-colors ${
                        beatStart(i) ? "border-l border-white/20" : ""
                      }`}
                      style={{
                        backgroundColor: on
                          ? GROUP_COLOR.effects
                          : i === playhead
                            ? "rgba(255,255,255,0.10)"
                            : "rgba(255,255,255,0.04)",
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[0.68rem]" style={{ color: TEXT_FAINT }}>
        <span>
          ช่วงเสียงที่แสดง {noteName(base)}–{noteName(base + ROLL_ROWS - 1)} — เลื่อนด้วยปุ่มอ็อกเทฟใต้คีย์บอร์ด
        </span>
        {hidden.length > 0 && (
          <button
            type="button"
            onClick={() => onOctaveChange(octaveContaining(hidden[0]))}
            className="underline underline-offset-2 hover:text-gold transition"
          >
            มีโน้ต {hidden.length} ตัวอยู่นอกจอ ({hidden.map(noteName).join(", ")}) — กดเพื่อเลื่อนไปหา
          </button>
        )}
      </div>
    </section>
  );
});

// Memoised: the audio thread posts a status roughly 47 times a second and
// each one re-renders the page, but this grid only changes when the pattern
// or the playhead does — and the playhead moves about 7 times a second at
// 104bpm. Without this, React reconciled 272 buttons (544 at 32 steps) 47
// times a second for nothing.
