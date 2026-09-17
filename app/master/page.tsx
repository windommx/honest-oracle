"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, FolderOpen, Play, Repeat, Square, Wand2 } from "lucide-react";
import {
  CONSOLE_MODELS,
  DEFAULT_MASTER,
  type ConsoleModel,
  type EqBand,
  type MasterSettings,
} from "@/lib/master-engine/types";
import { MASTER_PRESETS } from "@/lib/master-engine/presets";
import { QUICK_FIXES, quickFix } from "@/lib/master-engine/quickfix";
import { renderMaster, type MasterRender } from "@/lib/master-engine/offline";
import { LOUDNESS_TARGETS, type LoudnessTargetId } from "@/lib/master-engine/loudness";
import { encodeWav, wavFilename } from "@/lib/audio-io/wav";
import { Knob } from "@/components/knob";
import { toast } from "../rush/_toast";
import { ACCEPTED_FILES, UnsupportedAudioError, loadAudioFile, type LoadedAudio } from "./_loader";
import { MasterClient, audioWorkletSupported } from "./_engine-client";
import { Waveform } from "./_waveform";
import { EqCurve } from "./_eq-curve";
import { Meters } from "./_meters";
import { AuditFace } from "./_audit-face";
import { ALL_KNOBS, PANELS } from "./_panels";
import { GROUP_COLOR, TEXT_FAINT } from "./_tokens";

const CONSOLE_LABEL: Record<ConsoleModel, string> = {
  clean: "Clean (ไม่แต่ง)",
  tape: "Tape (ฮาร์มอนิกคี่)",
  tube: "Tube (ฮาร์มอนิกคู่)",
  transformer: "Transformer (คู่ เน้นย่านต่ำ)",
  console: "Analog Console (คี่ นุ่ม)",
};

const EXPORT_DEPTHS = [16, 24] as const;

export default function MasterPage() {
  const [settings, setSettings] = useState<MasterSettings>(DEFAULT_MASTER);
  const [presetId, setPresetId] = useState("");
  const [audio, setAudio] = useState<LoadedAudio | null>(null);
  const [running, setRunning] = useState(false);
  const [supported, setSupported] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(true);
  const [mastered, setMastered] = useState(true);
  const [busy, setBusy] = useState<"" | "loading" | "rendering" | "exporting">("");
  const [status, setStatus] = useState({
    frame: 0,
    frames: 0,
    peak: 0,
    shortTermLufs: -Infinity,
    gainReductionDb: 0,
  });
  const [targetId, setTargetId] = useState<LoudnessTargetId>("streaming");
  const [render, setRender] = useState<MasterRender | null>(null);
  const [depth, setDepth] = useState<(typeof EXPORT_DEPTHS)[number]>(24);

  const client = useRef<MasterClient | null>(null);
  if (client.current === null && typeof window !== "undefined") client.current = new MasterClient();
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => setSupported(audioWorkletSupported()), []);

  useEffect(() => {
    const c = client.current;
    if (!c) return;
    c.onStatus = (s) =>
      setStatus({
        frame: s.frame,
        frames: s.frames,
        peak: s.peak,
        shortTermLufs: s.shortTermLufs,
        gainReductionDb: s.gainReductionDb,
      });
    return () => {
      c.onStatus = null;
      void c.stop();
    };
  }, []);

  const target = LOUDNESS_TARGETS.find((t) => t.id === targetId) ?? LOUDNESS_TARGETS[0];
  const sampleRate = audio?.sampleRate || client.current?.sampleRate || 48000;

  /** Start audio if it is not already running. Must come from a gesture. */
  const ensureEngine = useCallback(async (): Promise<boolean> => {
    const c = client.current;
    if (!c) return false;
    if (c.running) return true;
    const state = await c.start(settings);
    if (state === "running") {
      setRunning(true);
      if (audio) c.load(audio.left, audio.right);
      c.setLoop(looping);
      c.setMastered(mastered);
      return true;
    }
    setSupported(state !== "unsupported");
    toast(
      state === "unsupported"
        ? "เบราว์เซอร์นี้ไม่รองรับ AudioWorklet — เล่นเสียงไม่ได้ แต่ยังบันทึกไฟล์ได้"
        : "เริ่มเสียงไม่สำเร็จ",
      { variant: "error" }
    );
    return false;
  }, [settings, audio, looping, mastered]);

  const update = useCallback((change: Partial<MasterSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...change };
      client.current?.setSettings(change);
      return next;
    });
    setPresetId("");
    // The measured result belongs to the settings that produced it; keeping it
    // on screen after a knob move would show a reading of something else.
    setRender(null);
  }, []);

  const loadPreset = useCallback((id: string) => {
    const preset = MASTER_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    const next = { ...preset.settings, eq: preset.settings.eq.map((b) => ({ ...b })) };
    setSettings(next);
    setPresetId(id);
    setRender(null);
    client.current?.setSettings(next);
  }, []);

  const openFile = useCallback(
    async (file: File) => {
      setBusy("loading");
      try {
        const loaded = await loadAudioFile(file, () => client.current?.context ?? null);
        setAudio(loaded);
        setRender(null);
        setPlaying(false);
        client.current?.setPlaying(false);
        client.current?.load(loaded.left, loaded.right);
        setStatus((s) => ({ ...s, frame: 0, frames: loaded.left.length }));
        toast(
          `โหลด ${loaded.name} แล้ว — ${loaded.seconds.toFixed(1)} วินาที · ${loaded.sampleRate / 1000} kHz` +
            (loaded.bitDepth ? ` · ${loaded.bitDepth} บิต` : ""),
          { variant: "success" }
        );
      } catch (err) {
        toast(
          err instanceof UnsupportedAudioError || err instanceof RangeError
            ? err.message
            : `อ่านไฟล์ ${file.name} ไม่สำเร็จ`,
          { variant: "error" }
        );
      } finally {
        setBusy("");
      }
    },
    []
  );

  const togglePlay = useCallback(async () => {
    if (!audio) return;
    if (!(await ensureEngine())) return;
    const next = !playing;
    client.current?.setPlaying(next);
    setPlaying(next);
  }, [audio, playing, ensureEngine]);

  const measure = useCallback(() => {
    if (!audio) return;
    setBusy("rendering");
    requestAnimationFrame(() => {
      try {
        const result = renderMaster({
          left: audio.left,
          right: audio.right,
          sampleRate: audio.sampleRate,
          settings,
          targetLufs: target.lufs,
        });
        setRender(result);
      } catch (err) {
        toast(err instanceof Error ? err.message : "ตรวจไม่สำเร็จ", { variant: "error" });
      } finally {
        setBusy("");
      }
    });
  }, [audio, settings, target.lufs]);

  const exportFile = useCallback(() => {
    if (!audio) return;
    setBusy("exporting");
    requestAnimationFrame(() => {
      try {
        const result = renderMaster({
          left: audio.left,
          right: audio.right,
          sampleRate: audio.sampleRate,
          settings,
          targetLufs: target.lufs,
        });
        setRender(result);
        const bytes = encodeWav([result.left, result.right], result.sampleRate, depth);
        const base = audio.name.replace(/\.[^.]+$/, "");
        const filename = wavFilename(`${base}-mastered-${presetId || "custom"}`);
        const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        toast(
          `บันทึก ${filename} — ${result.integratedLufs.toFixed(1)} LUFS · ` +
            `${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB · เรนเดอร์ ${(result.elapsedMs / 1000).toFixed(1)} วินาที`,
          { variant: "success" }
        );
      } catch (err) {
        toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", { variant: "error" });
      } finally {
        setBusy("");
      }
    });
  }, [audio, settings, depth, presetId, target.lufs]);

  const setBand = useCallback(
    (index: number, band: EqBand) => {
      const eq = settings.eq.map((b, i) => (i === index ? band : b));
      update({ eq });
    },
    [settings.eq, update]
  );

  const readSpectrum = useCallback(() => client.current?.readSpectrum() ?? new Float32Array(0), []);

  const knobValue = useMemo(() => Object.fromEntries(ALL_KNOBS.map((k) => [k.key, settings[k.key]])), [settings]);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Master<span className="text-gold">Pro</span>
          </h1>
          <p className="text-[0.72rem] mt-1" style={{ color: TEXT_FAINT }}>
            เส้นโค้ง EQ บนจอคือฟิลเตอร์จริง และความดังวัดตาม ITU-R BS.1770 ไม่ใช่ค่า RMS ที่ตั้งชื่อใหม่
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_FILES}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void openFile(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={busy === "loading"}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-xs text-gray-300 hover:border-gold/40 transition disabled:opacity-40"
          >
            <FolderOpen className="w-4 h-4" aria-hidden />
            {busy === "loading" ? "กำลังอ่าน…" : "โหลดไฟล์"}
          </button>
          <button
            onClick={() => void togglePlay()}
            disabled={!audio || !supported}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gold text-black text-xs font-semibold hover:bg-gold-light transition disabled:opacity-30"
          >
            {playing ? <Square className="w-4 h-4" aria-hidden /> : <Play className="w-4 h-4" aria-hidden />}
            {playing ? "หยุด" : "เล่น"}
          </button>
          <button
            onClick={() => {
              const next = !looping;
              setLooping(next);
              client.current?.setLoop(next);
            }}
            aria-pressed={looping}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs transition ${
              looping ? "border-gold text-gold bg-gold/10" : "border-white/10 text-gray-400 hover:border-gold/40"
            }`}
          >
            <Repeat className="w-3.5 h-3.5" aria-hidden />
            วนซ้ำ
          </button>
          <div className="flex rounded-lg border border-white/10 overflow-hidden" role="group" aria-label="เทียบต้นฉบับกับที่มาสเตอร์แล้ว">
            {[
              { id: false, label: "RAW" },
              { id: true, label: "MASTERED" },
            ].map((option) => (
              <button
                key={option.label}
                onClick={() => {
                  setMastered(option.id);
                  client.current?.setMastered(option.id);
                }}
                aria-pressed={mastered === option.id}
                className={`px-3 py-2 text-xs transition ${
                  mastered === option.id ? "bg-gold/15 text-gold" : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportFile}
              disabled={!audio || busy !== ""}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-xs text-gray-300 hover:border-gold/40 transition disabled:opacity-30"
            >
              <Download className="w-4 h-4" aria-hidden />
              {busy === "exporting" ? "กำลังเรนเดอร์…" : "บันทึก .wav"}
            </button>
            {/* .input declares width:100%, so the size has to come from a
                wrapper rather than from a utility class fighting it. */}
            <div className="w-24 shrink-0">
              <select
                className="input text-xs"
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value) as (typeof EXPORT_DEPTHS)[number])}
                aria-label="ความละเอียดบิตของไฟล์ที่บันทึก"
              >
                {EXPORT_DEPTHS.map((d) => (
                  <option key={d} value={d}>
                    {d} บิต
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      {!supported && (
        <p role="alert" className="mt-4 text-sm" style={{ color: GROUP_COLOR.character }}>
          เบราว์เซอร์นี้ไม่รองรับ AudioWorklet — เล่นไม่ได้ แต่โหลดไฟล์ ปรับค่า ตรวจผล และบันทึก .wav ได้ทั้งหมด
          เพราะการเรนเดอร์ไม่ได้ใช้อุปกรณ์เสียง
        </p>
      )}

      <section className="mt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <h2 className="text-[0.65rem] tracking-widest uppercase" style={{ color: TEXT_FAINT }}>
            {audio ? audio.name : "ยังไม่ได้โหลดไฟล์"}
          </h2>
          {audio && (
            <span className="text-[0.65rem] tabular-nums" style={{ color: TEXT_FAINT }}>
              {audio.sampleRate / 1000} kHz
              {audio.bitDepth ? ` · ${audio.bitDepth} บิต` : ""} ·{" "}
              {audio.via === "wav" ? "อ่านเองจาก WAV" : "เบราว์เซอร์ถอดรหัสให้"}
            </span>
          )}
        </div>
        <Waveform
          left={audio?.left ?? null}
          right={audio?.right ?? null}
          sampleRate={sampleRate}
          frame={status.frame}
          onSeek={(frame) => {
            client.current?.seek(frame);
            setStatus((s) => ({ ...s, frame }));
          }}
        />
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-[1fr_260px]">
        <EqCurve
          settings={settings}
          sampleRate={sampleRate}
          onBandChange={setBand}
          readSpectrum={readSpectrum}
          active={running && playing}
        />
        <Meters
          peak={status.peak}
          shortTermLufs={status.shortTermLufs}
          gainReductionDb={status.gainReductionDb}
          targetId={targetId}
          onTargetChange={(id) => {
            setTargetId(id);
            setRender(null);
          }}
          integratedLufs={render?.integratedLufs ?? -Infinity}
        />
      </section>

      <section className="mt-5 flex flex-wrap items-end gap-4">
        <div>
          <h2 className="text-[0.65rem] tracking-widest uppercase mb-2" style={{ color: TEXT_FAINT }}>
            Presets
          </h2>
          <div className="flex flex-wrap gap-2">
            {MASTER_PRESETS.map((p) => (
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
        </div>

        <div>
          <h2 className="text-[0.65rem] tracking-widest uppercase mb-2" style={{ color: TEXT_FAINT }}>
            Quick fix
          </h2>
          <div className="flex flex-wrap gap-2">
            {QUICK_FIXES.map((q) => (
              <button
                key={q.id}
                onClick={() => update(quickFix(q.id, settings))}
                title={q.note}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-gray-300 hover:border-gold/40 active:bg-gold/20 transition"
              >
                <Wand2 className="w-3 h-3" aria-hidden />
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-[0.65rem] tracking-widest uppercase mb-2" style={{ color: TEXT_FAINT }}>
            Cut
          </h2>
          <div className="flex gap-2">
            {([
              ["lowCut", "LOW CUT", "ตัดต่ำกว่า 30 Hz ชัน 24 dB/oct"],
              ["hiCut", "HI CUT", "ตัดเหนือ 18 kHz ชัน 24 dB/oct"],
            ] as const).map(([key, label, hint]) => (
              <button
                key={key}
                onClick={() => update({ [key]: !settings[key] } as Partial<MasterSettings>)}
                aria-pressed={settings[key]}
                title={hint}
                className={`px-3 py-1.5 rounded-lg border text-xs transition ${
                  settings[key]
                    ? "border-gold text-gold bg-gold/10"
                    : "border-white/10 text-gray-400 hover:border-gold/40"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="block w-56">
          <span className="block text-[0.65rem] tracking-widest uppercase mb-2" style={{ color: TEXT_FAINT }}>
            Console
          </span>
          <select
            className="input text-xs"
            value={settings.consoleModel}
            onChange={(e) => update({ consoleModel: e.target.value as ConsoleModel })}
          >
            {CONSOLE_MODELS.map((m) => (
              <option key={m} value={m}>
                {CONSOLE_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
      </section>

      {presetId !== "" && (
        <p className="mt-2 text-[0.7rem]" style={{ color: TEXT_FAINT }}>
          {MASTER_PRESETS.find((p) => p.id === presetId)?.note}
        </p>
      )}

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
                <div key={k.key} title={k.hint}>
                  <Knob
                    label={k.label}
                    value={knobValue[k.key] as number}
                    min={k.min}
                    max={k.max}
                    unit={k.unit}
                    precision={k.precision}
                    color={GROUP_COLOR[panel.group]}
                    defaultValue={DEFAULT_MASTER[k.key]}
                    onChange={(v) => update({ [k.key]: v } as Partial<MasterSettings>)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/5">
            <h2 className="text-[0.62rem] tracking-widest uppercase" style={{ color: GROUP_COLOR.output }}>
              ตรวจผลลัพธ์
            </h2>
            <button
              onClick={measure}
              disabled={!audio || busy !== ""}
              className="px-2.5 py-1 rounded-lg border border-white/10 text-[0.7rem] text-gray-300 hover:border-gold/40 transition disabled:opacity-30"
            >
              {busy === "rendering" ? "กำลังวัด…" : "ตรวจ"}
            </button>
          </div>
          <AuditFace audit={render?.audit ?? null} />
          {render && (
            <p className="mt-3 text-[0.65rem]" style={{ color: TEXT_FAINT }}>
              วัดจากไฟล์ที่จะถูกบันทึกจริง ไม่ใช่จากมิเตอร์ตอนเล่น — เรนเดอร์{" "}
              {render.seconds.toFixed(1)} วินาที ใช้เวลา {(render.elapsedMs / 1000).toFixed(2)} วินาที
            </p>
          )}
        </div>
      </section>

      <footer className="mt-8 pt-4 border-t border-white/10 text-[0.7rem] leading-relaxed" style={{ color: TEXT_FAINT }}>
        <p>
          เอนจินอยู่ที่ <code>lib/master-engine/</code> — เป็นตัวประมวลผลสัญญาณ ไม่ใช่ตัวสร้างเสียงอย่าง{" "}
          <Link href="/synth" className="text-gold">
            SynthPro
          </Link>{" "}
          แต่ใช้ดีเลย์ไลน์และตัวสุ่มแบบมีเมล็ดร่วมกัน ทุกชั้นถูกวัดจากแซมเปิลจริงในชุดทดสอบ
        </p>
        <p className="mt-1.5">
          ลิมิเตอร์รับประกันยอด <em>ต่อแซมเปิล</em> เท่านั้น ยอดคลื่นจริงระหว่างแซมเปิลวัดแยกและรายงานในส่วนตรวจผล —
          ไม่ได้เคลมว่าจัดการให้แล้ว
        </p>
      </footer>
    </main>
  );
}
