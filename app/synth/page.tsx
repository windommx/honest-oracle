"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Play, Square, Volume2 } from "lucide-react";
import { DEFAULT_PATCH, PRESETS } from "@/lib/synth-engine/presets";
import { LFO_TARGETS, OSC_SOURCES, type LfoTarget, type OscSource, type SynthPatch } from "@/lib/synth-engine/types";
import { DRUM_IDS, type DrumId } from "@/lib/synth-engine/drums";
import type { SequencerPattern } from "@/lib/synth-engine/sequencer";
import { toast } from "../rush/_toast";
import { Knob } from "./_knob";
import { Keyboard } from "./_keyboard";
import { Spectrum } from "./_spectrum";
import { PANELS } from "./_panels";
import { SequencerPanel } from "./_sequencer-ui";
import { demoPattern } from "./_pattern";
import { exportPatternToWav } from "./_export";
import { SynthClient, audioWorkletSupported } from "./_engine-client";
import { GROUP_COLOR, TEXT_FAINT } from "./_tokens";

/** Short labels for the voice architectures. */
const SOURCE_LABEL: Record<OscSource, string> = {
  classic: "Classic",
  granular: "Granular",
  karplus: "String",
  user: "Drawn",
};

export default function SynthPage() {
  const [patch, setPatch] = useState<SynthPatch>(DEFAULT_PATCH);
  const [presetId, setPresetId] = useState("init");
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [supported, setSupported] = useState(true);
  const [octave, setOctave] = useState(4);
  const [held, setHeld] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState({ activeVoices: 0, peak: 0, step: -1 });
  const [pattern, setPattern] = useState<SequencerPattern>(demoPattern);
  const [looping, setLooping] = useState(false);
  const [exporting, setExporting] = useState(false);

  const client = useRef<SynthClient | null>(null);
  if (client.current === null && typeof window !== "undefined") client.current = new SynthClient();

  // Checked after mount: the server has no AudioWorklet, so rendering the
  // unsupported notice during SSR would flash it for everyone.
  useEffect(() => setSupported(audioWorkletSupported()), []);

  useEffect(() => {
    const c = client.current;
    if (!c) return;
    c.onStatus = (s) => setStatus(s);
    return () => {
      c.onStatus = null;
      void c.stop();
    };
  }, []);

  const start = useCallback(async () => {
    const c = client.current;
    if (!c || running || starting) return;
    setStarting(true);
    const state = await c.start(patch);
    setStarting(false);
    if (state === "running") {
      // The worklet is constructed fresh on every start, so it knows nothing
      // about a pattern written before the first press of Start.
      c.setPattern(pattern);
      setRunning(true);
      return;
    }
    setSupported(state !== "unsupported");
    toast(
      state === "unsupported"
        ? "เบราว์เซอร์นี้ไม่รองรับ AudioWorklet — เล่นเสียงไม่ได้"
        : "เริ่มเสียงไม่สำเร็จ — ลองโหลดหน้าใหม่อีกครั้ง",
      { variant: "error" }
    );
  }, [patch, pattern, running, starting]);

  const stop = useCallback(async () => {
    await client.current?.stop();
    setRunning(false);
    setLooping(false);
    setHeld(new Set());
    setStatus({ activeVoices: 0, peak: 0, step: -1 });
  }, []);

  /** Every pattern edit goes straight to the audio thread, which is why an edit
   *  made while the loop plays is heard on the next step rather than after a
   *  restart. */
  const changePattern = useCallback((next: SequencerPattern) => {
    setPattern(next);
    client.current?.setPattern(next);
  }, []);

  const toggleLoop = useCallback((play: boolean) => {
    if (!client.current?.running) return;
    client.current.setSequencerRunning(play);
    setLooping(play);
  }, []);

  const exportWav = useCallback(() => {
    setExporting(true);
    // A frame before the render starts, so the button actually repaints into
    // its loading state — the render blocks the main thread.
    requestAnimationFrame(() => {
      try {
        const result = exportPatternToWav({
          pattern,
          patch,
          presetName: presetId || "patch",
          sampleRate: client.current?.sampleRate || 48000,
        });
        toast(
          `บันทึกแล้ว ${result.filename} — ${result.seconds.toFixed(1)} วินาที · ` +
            `${(result.byteLength / 1024 / 1024).toFixed(1)} MB`,
          { variant: "success" }
        );
      } catch (err) {
        toast(err instanceof Error ? err.message : "เรนเดอร์ไฟล์ไม่สำเร็จ", { variant: "error" });
      } finally {
        setExporting(false);
      }
    });
  }, [pattern, patch, presetId]);

  const update = useCallback((key: keyof SynthPatch, value: number | LfoTarget | OscSource) => {
    setPatch((prev) => {
      const next = { ...prev, [key]: value } as SynthPatch;
      client.current?.setPatch({ [key]: value });
      return next;
    });
    setPresetId("");
  }, []);

  const loadPreset = useCallback((id: string) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPatch(preset.patch);
    setPresetId(id);
    client.current?.setPatch(preset.patch);
  }, []);

  const noteOn = useCallback((note: number, velocity: number) => {
    // Guarded on the engine, not on `running`, so a key press before Start is
    // simply inaudible rather than leaving the display showing a held note that
    // is making no sound.
    if (!client.current?.running) return;
    client.current.noteOn(note, velocity);
    setHeld((prev) => (prev.has(note) ? prev : new Set(prev).add(note)));
  }, []);

  const noteOff = useCallback((note: number) => {
    client.current?.noteOff(note);
    setHeld((prev) => {
      if (!prev.has(note)) return prev;
      const next = new Set(prev);
      next.delete(note);
      return next;
    });
  }, []);

  const hitDrum = useCallback((id: DrumId) => {
    client.current?.triggerDrum(id, 1);
  }, []);

  /** Audition a cell as it is switched on. A main-thread timer is fine here and
   *  nowhere else: this is one audible click, not a tempo. */
  const previewNote = useCallback((note: number) => {
    const c = client.current;
    if (!c?.running) return;
    c.noteOn(note, 0.85);
    window.setTimeout(() => c.noteOff(note), 180);
  }, []);

  const readSpectrum = useCallback(() => client.current?.readSpectrum() ?? new Float32Array(0), []);
  const sampleRate = client.current?.sampleRate || 48000;

  const peakDb = useMemo(
    () => (status.peak > 1e-5 ? 20 * Math.log10(status.peak) : -100),
    [status.peak]
  );

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-5 py-8">
      {/* header */}
      <header className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Synth<span className="text-gold">Pro</span>
          </h1>
          <p className="text-[0.72rem] mt-1" style={{ color: TEXT_FAINT }}>
            PolyBLEP · ladder filter · plate reverb — รันใน AudioWorklet ด้วยโค้ดชุดเดียวกับที่ชุดทดสอบตรวจ
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="text-[0.7rem] tabular-nums" style={{ color: TEXT_FAINT }}>
            {running ? `${sampleRate / 1000}kHz · ${status.activeVoices} เสียง` : "หยุดอยู่"}
          </div>
          <div className="flex items-center gap-1.5" title="ระดับสัญญาณออก">
            <Volume2 className="w-3.5 h-3.5" style={{ color: TEXT_FAINT }} aria-hidden />
            <div className="w-24 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-75"
                style={{
                  width: `${Math.min(100, Math.max(0, ((peakDb + 60) / 60) * 100))}%`,
                  backgroundColor: peakDb > -1 ? GROUP_COLOR.modulation : GROUP_COLOR.envelope,
                }}
              />
            </div>
          </div>
          <button
            onClick={() => (running ? void stop() : void start())}
            disabled={starting || !supported}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gold text-black font-semibold hover:bg-gold-light transition disabled:opacity-40"
          >
            {running ? <Square className="w-4 h-4" aria-hidden /> : <Play className="w-4 h-4" aria-hidden />}
            {starting ? "กำลังเริ่ม…" : running ? "หยุด" : "เริ่มเสียง"}
          </button>
        </div>
      </header>

      {!supported && (
        <p role="alert" className="mt-4 text-sm" style={{ color: GROUP_COLOR.modulation }}>
          เบราว์เซอร์นี้ไม่รองรับ AudioWorklet — หน้านี้แสดงค่าและปรับได้ แต่จะไม่มีเสียง
        </p>
      )}

      {/* presets */}
      <section className="mt-5">
        <h2 className="text-[0.65rem] tracking-widest uppercase mb-2" style={{ color: TEXT_FAINT }}>
          Presets
        </h2>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => loadPreset(p.id)}
              aria-pressed={presetId === p.id}
              title={p.note}
              className={`px-3 py-1.5 rounded-full border text-xs transition ${
                presetId === p.id
                  ? "border-gold text-gold bg-gold/10"
                  : "border-white/10 text-gray-400 hover:border-gold/40"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
        {presetId !== "" && (
          <p className="mt-2 text-[0.7rem]" style={{ color: TEXT_FAINT }}>
            {PRESETS.find((p) => p.id === presetId)?.note}
          </p>
        )}
      </section>

      {/* voice architecture */}
      <section className="mt-5 flex flex-wrap items-center gap-4">
        <div>
          <h2 className="text-[0.65rem] tracking-widest uppercase mb-2" style={{ color: TEXT_FAINT }}>
            Voice
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="สถาปัตยกรรมเสียง">
            {OSC_SOURCES.map((src) => (
              <button
                key={src}
                onClick={() => update("oscSource", src)}
                aria-pressed={patch.oscSource === src}
                className={`px-3 py-1.5 rounded-full border text-xs transition ${
                  patch.oscSource === src
                    ? "border-gold text-gold bg-gold/10"
                    : "border-white/10 text-gray-400 hover:border-gold/40"
                }`}
              >
                {SOURCE_LABEL[src]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-[0.65rem] tracking-widest uppercase mb-2" style={{ color: TEXT_FAINT }}>
            Drums
          </h2>
          <div className="flex flex-wrap gap-2">
            {DRUM_IDS.map((id) => (
              <button
                key={id}
                onClick={() => hitDrum(id)}
                disabled={!running}
                className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-gray-300 hover:border-gold/40 active:bg-gold/20 transition disabled:opacity-30 capitalize"
              >
                {id}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* spectrum */}
      <section className="mt-5">
        <Spectrum read={readSpectrum} sampleRate={sampleRate} active={running} />
      </section>

      {/* sequencer */}
      <section className="mt-5">
        <SequencerPanel
          pattern={pattern}
          onPatternChange={changePattern}
          octave={octave}
          onOctaveChange={setOctave}
          playing={looping}
          onPlayingChange={toggleLoop}
          playhead={looping ? status.step : -1}
          onPreviewNote={previewNote}
          onPreviewDrum={hitDrum}
          onExport={exportWav}
          exporting={exporting}
          canPlay={running}
        />
        {!running && (
          <p className="mt-2 text-[0.72rem]" style={{ color: TEXT_FAINT }}>
            เขียนแพตเทิร์นได้เลยแม้ยังไม่เปิดเสียง — และบันทึกเป็นไฟล์ .wav ได้โดยไม่ต้องเปิดเสียงด้วย
            เพราะการเรนเดอร์ไม่ได้ใช้อุปกรณ์เสียงเลย
          </p>
        )}
      </section>

      {/* control surface */}
      <section className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PANELS.map((panel) => (
          <div key={panel.title} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <h2
              className="text-[0.62rem] tracking-widest uppercase mb-3 pb-2 border-b border-white/5"
              style={{ color: GROUP_COLOR[panel.group] }}
            >
              {panel.title}
            </h2>
            <div className="flex flex-wrap gap-x-3 gap-y-3 justify-center">
              {panel.knobs.map((k) => (
                <Knob
                  key={k.key}
                  label={k.label}
                  value={patch[k.key]}
                  min={k.min}
                  max={k.max}
                  unit={k.unit}
                  logarithmic={k.log}
                  precision={k.precision}
                  integer={k.integer}
                  group={panel.group}
                  defaultValue={DEFAULT_PATCH[k.key]}
                  onChange={(v) => update(k.key, v)}
                />
              ))}
            </div>

            {panel.group === "modulation" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(["lfo1Target", "lfo2Target"] as const).map((field, i) => (
                  <label key={field} className="block">
                    <span className="block text-[0.6rem] mb-1" style={{ color: TEXT_FAINT }}>
                      LFO {i + 1} → ปลายทาง
                    </span>
                    <select
                      className="input"
                      value={patch[field]}
                      onChange={(e) => update(field, e.target.value as LfoTarget)}
                    >
                      {LFO_TARGETS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      {/* keyboard */}
      <section className="mt-6">
        <Keyboard
          octave={octave}
          onOctaveChange={setOctave}
          onNoteOn={noteOn}
          onNoteOff={noteOff}
          held={held}
        />
        {!running && (
          <p className="mt-2 text-[0.72rem]" style={{ color: TEXT_FAINT }}>
            กด &ldquo;เริ่มเสียง&rdquo; ก่อน — เบราว์เซอร์อนุญาตให้เปิดเสียงได้เฉพาะหลังผู้ใช้กดเท่านั้น
          </p>
        )}
      </section>

      <footer className="mt-8 pt-4 border-t border-white/10 text-[0.7rem] leading-relaxed" style={{ color: TEXT_FAINT }}>
        <p>
          เอนจินอยู่ที่ <code>lib/synth-engine/</code> — เป็นฟังก์ชันบริสุทธิ์ที่ render ลงบัฟเฟอร์
          เบราว์เซอร์เรียกผ่าน AudioWorklet ส่วนชุดทดสอบเรียกฟังก์ชันเดียวกันลงอาเรย์ธรรมดา
          จึงตรวจสอบเสียงที่ออกมาได้จริงแทนที่จะตรวจแค่ไดอะแกรม
        </p>
        <p className="mt-1.5">
          เสียงเดียวกันนี้ถูกใช้ในห้องฝึกของ{" "}
          <Link href="/therapy/session" className="text-gold">
            MindBridge
          </Link>{" "}
          ด้วย — และไฟล์ที่บันทึกจากที่นี่เอาไปต่อที่{" "}
          <Link href="/master" className="text-gold">
            MasterPro
          </Link>{" "}
          ได้เลย
        </p>
      </footer>
    </main>
  );
}
