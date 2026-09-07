"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Play, Square, Volume2 } from "lucide-react";
import { DEFAULT_PATCH, PRESETS } from "@/lib/synth-engine/presets";
import { LFO_TARGETS, type LfoTarget, type SynthPatch } from "@/lib/synth-engine/types";
import { toast } from "../rush/_toast";
import { Knob } from "./_knob";
import { Keyboard } from "./_keyboard";
import { Spectrum } from "./_spectrum";
import { PANELS } from "./_panels";
import { SynthClient, audioWorkletSupported } from "./_engine-client";
import { GROUP_COLOR, TEXT_FAINT } from "./_tokens";

export default function SynthPage() {
  const [patch, setPatch] = useState<SynthPatch>(DEFAULT_PATCH);
  const [presetId, setPresetId] = useState("init");
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [supported, setSupported] = useState(true);
  const [octave, setOctave] = useState(4);
  const [held, setHeld] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState({ activeVoices: 0, peak: 0 });

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
  }, [patch, running, starting]);

  const stop = useCallback(async () => {
    await client.current?.stop();
    setRunning(false);
    setHeld(new Set());
    setStatus({ activeVoices: 0, peak: 0 });
  }, []);

  const update = useCallback((key: keyof SynthPatch, value: number | LfoTarget) => {
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

      {/* spectrum */}
      <section className="mt-5">
        <Spectrum read={readSpectrum} sampleRate={sampleRate} active={running} />
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
          ด้วย
        </p>
      </footer>
    </main>
  );
}
