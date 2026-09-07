"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Music, Pause, Play, Square, Wind } from "lucide-react";
import {
  AROUSAL_BPM,
  BREATH_PATTERNS,
  breathsPerMinute,
  cycleSeconds,
  isoRamp,
  phaseAt,
  type BreathPatternId,
} from "@/lib/therapy-engine/music";
import { getIntervention } from "@/lib/therapy-engine/evidence";
import { score } from "@/lib/therapy-engine/scoring";
import type { SeverityBand } from "@/lib/therapy-engine/types";
import { toast } from "../../rush/_toast";
import { Card, Chip, CitationLine, Disclaimer, GradeBadge, PageHeader } from "../_components";
import { SEVERITY_COLOR } from "../_tokens";
import { addSession, browserStorage, readAssessments } from "../_store";
import { outcomeMessage, syncSession } from "../_sync";
import { TherapyAudio, audioSupported } from "../_audio";

type Mode = "music" | "breath";

const DURATIONS = [5, 12, 20, 30, 40] as const;

const mmss = (totalSeconds: number) => {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** The band from the most recent assessment, used to pick the opening tempo.
 *  Falls back to "moderate" when there is no history — stated in the UI rather
 *  than silently assumed. */
function lastBand(): { band: SeverityBand["id"]; fromHistory: boolean } {
  const recent = readAssessments(browserStorage()).filter((a) => a.instrument === "gad7").at(-1);
  if (!recent) return { band: "moderate", fromHistory: false };
  try {
    return { band: score("gad7", recent.responses).band.id, fromHistory: true };
  } catch {
    return { band: "moderate", fromHistory: false };
  }
}

export default function SessionPage() {
  const [mode, setMode] = useState<Mode>("music");
  const [minutes, setMinutes] = useState<number>(20);
  const [pattern, setPattern] = useState<BreathPatternId>("cyclic-sighing");
  const [band, setBand] = useState<{ band: SeverityBand["id"]; fromHistory: boolean }>({
    band: "moderate",
    fromHistory: false,
  });
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [supported, setSupported] = useState(true);

  const audio = useRef<TherapyAudio | null>(null);
  const startedAt = useRef<number | null>(null);
  const accumulated = useRef(0);
  const lastCue = useRef<string>("");

  // Read the browser-only bits after mount: reading localStorage during render
  // would make the server and client markup disagree.
  useEffect(() => {
    setBand(lastBand());
    setSupported(audioSupported());
  }, []);

  const plan = useMemo(
    () => isoRamp(AROUSAL_BPM[band.band], 62, mode === "breath" ? 5 : minutes),
    [band.band, minutes, mode]
  );
  const sessionMinutes = mode === "breath" ? minutes : plan.totalMinutes;
  const totalSeconds = sessionMinutes * 60;

  const segment = useMemo(() => {
    const m = elapsed / 60;
    return plan.segments.find((s) => m >= s.startMin && m < s.endMin) ?? plan.segments[plan.segments.length - 1];
  }, [elapsed, plan]);

  const breath = BREATH_PATTERNS[pattern];
  const breathNow = phaseAt(breath, elapsed);

  const stop = useCallback(
    async (completed: boolean) => {
      audio.current?.stop();
      audio.current = null;
      setRunning(false);

      const done = Math.min(sessionMinutes, Math.round(accumulated.current / 60));
      startedAt.current = null;
      accumulated.current = 0;
      setElapsed(0);

      // A session is logged whatever happened, including a zero-minute one:
      // abandoning after ninety seconds is real adherence data, and dropping it
      // would make the progress page flatter than the truth.
      const entry = {
        at: Date.now(),
        kind: mode,
        plannedMin: sessionMinutes,
        completedMin: done,
        ...(mode === "music" ? { startBpm: plan.startBpm, targetBpm: plan.targetBpm } : { breathPattern: pattern }),
      } as const;
      addSession(browserStorage(), entry);
      const outcome = await syncSession(entry);
      toast(
        `${completed ? "จบเซสชัน" : "หยุดเซสชัน"} — บันทึก ${done} นาที · ${outcomeMessage(outcome)}`,
        { variant: outcome === "failed" ? "error" : "success" }
      );
    },
    [mode, pattern, plan.startBpm, plan.targetBpm, sessionMinutes]
  );

  // The session clock. Elapsed time is derived from wall-clock deltas rather
  // than counted in ticks, so a throttled background tab does not silently
  // under-report how long the user actually listened.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (startedAt.current === null) return;
      const next = accumulated.current + (Date.now() - startedAt.current) / 1000;
      setElapsed(next);
      if (next >= totalSeconds) {
        accumulated.current = totalSeconds;
        void stop(true);
      }
    }, 200);
    return () => clearInterval(id);
  }, [running, totalSeconds, stop]);

  // Follow the ramp: push each segment's tempo to the audio engine as it opens.
  useEffect(() => {
    if (running && mode === "music") audio.current?.setBpm(segment.bpm);
  }, [running, mode, segment.bpm]);

  // One breath cue per phase, keyed so a re-render inside a phase cannot retrigger it.
  useEffect(() => {
    if (!running || mode !== "breath") return;
    const key = `${Math.floor(elapsed / cycleSeconds(breath))}:${breathNow.phase.kind}`;
    if (key === lastCue.current) return;
    lastCue.current = key;
    audio.current?.cueBreath(
      breathNow.phase.kind === "exhale" ? "down" : breathNow.phase.kind === "hold" ? "hold" : "up",
      breathNow.phase.seconds
    );
  }, [running, mode, elapsed, breath, breathNow.phase.kind, breathNow.phase.seconds]);

  useEffect(() => () => audio.current?.stop(), []);

  function play() {
    const engine = audio.current ?? new TherapyAudio();
    const ok = engine.start({
      bpm: mode === "music" ? plan.startBpm : 60,
      pulse: mode === "music",
      pad: true,
      volume: 0.35,
    });
    if (!ok) {
      setSupported(false);
      toast("เบราว์เซอร์นี้เล่นเสียงไม่ได้ — ใช้ตัวจับเวลาและจังหวะที่แสดงไว้แทนได้", { variant: "error" });
      return;
    }
    audio.current = engine;
    startedAt.current = Date.now();
    setRunning(true);
  }

  function pause() {
    if (startedAt.current !== null) accumulated.current += (Date.now() - startedAt.current) / 1000;
    startedAt.current = null;
    audio.current?.stop();
    audio.current = null;
    setRunning(false);
  }

  const music = getIntervention("music-listening")!;
  const breathwork = getIntervention("cyclic-sighing")!;
  const shown = mode === "music" ? music : breathwork;
  const progress = totalSeconds > 0 ? Math.min(1, elapsed / totalSeconds) : 0;

  return (
    <main className="max-w-3xl mx-auto px-5 py-12">
      <PageHeader
        eyebrow="ห้องฝึก"
        title={mode === "music" ? "ฟังตามหลัก iso-principle" : "หายใจตามจังหวะ"}
        lead={
          mode === "music"
            ? "เริ่มจังหวะที่จับคู่กับสภาวะปัจจุบัน แล้วค่อย ๆ พาลงสู่จังหวะเป้าหมาย"
            : "จังหวะหายใจที่กำหนดไว้ตามโปรโตคอลของงานวิจัย"
        }
      />

      <div className="mt-8 flex justify-center gap-2">
        {(["music", "breath"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              if (running) return;
              setMode(m);
              setMinutes(m === "breath" ? 5 : 20);
            }}
            disabled={running}
            aria-pressed={mode === m}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm transition disabled:opacity-40 ${
              mode === m ? "border-gold bg-gold/10 text-gold" : "border-white/10 text-gray-400 hover:border-gold/40"
            }`}
          >
            {m === "music" ? <Music className="w-4 h-4" aria-hidden /> : <Wind className="w-4 h-4" aria-hidden />}
            {m === "music" ? "ดนตรี" : "หายใจ"}
          </button>
        ))}
      </div>

      {/* the player */}
      <Card className="mt-6 text-center">
        {mode === "music" ? (
          <>
            <p className="text-[0.7rem] text-faint">{segment.labelTh}</p>
            <p className="mt-2 text-6xl font-semibold tabular-nums text-gold">{segment.bpm}</p>
            <p className="text-sm text-faint">BPM</p>
          </>
        ) : (
          <>
            <p className="text-[0.7rem] text-faint">{breath.th}</p>
            {/* The circle IS the pacer: it grows through an inhale, holds, and
                shrinks through an exhale, so the timing is visible to someone
                who has muted the tab.

                It scales via `transform`, inside a FIXED-SIZE box. Animating
                width/height instead reflows the page on every frame, which
                pushed the progress bar and the จบและบันทึก button up and down
                by 80px throughout a session — a moving stop button on a
                relaxation exercise. transform does not affect layout, so
                everything below the circle now stays put. */}
            <div className="mt-4 h-[200px] flex items-center justify-center">
              <div
                className="w-[200px] h-[200px] rounded-full border-2 flex items-center justify-center transition-transform duration-500 ease-in-out"
                style={{
                  borderColor: SEVERITY_COLOR.minimal,
                  transform: `scale(${
                    breathNow.phase.kind === "exhale"
                      ? 1 - breathNow.progress * 0.42
                      : breathNow.phase.kind === "hold"
                        ? 1
                        : 0.58 + breathNow.progress * 0.42
                  })`,
                }}
              >
                <span className="text-sm text-gray-200">{running ? breathNow.phase.th : "พร้อมเริ่ม"}</span>
              </div>
            </div>
            <p className="mt-4 text-[0.7rem] text-faint">
              {breathsPerMinute(breath)} ครั้ง/นาที · รอบละ {cycleSeconds(breath)} วินาที
            </p>
          </>
        )}

        <div className="mt-6">
          <div
            className="h-1 rounded-full bg-white/10 overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(elapsed)}
            aria-valuemin={0}
            aria-valuemax={totalSeconds}
            aria-label="ความคืบหน้าของเซสชัน"
          >
            <div className="h-full bg-gold" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="mt-2 text-sm tabular-nums text-gray-300">
            {mmss(elapsed)} <span className="text-faint">/ {mmss(totalSeconds)}</span>
          </p>
        </div>

        <div className="mt-6 flex justify-center gap-3">
          {!running ? (
            <button
              onClick={play}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gold text-black font-semibold hover:bg-gold-light transition"
            >
              <Play className="w-4 h-4" aria-hidden /> {elapsed > 0 ? "เล่นต่อ" : "เริ่ม"}
            </button>
          ) : (
            <button
              onClick={pause}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg border border-white/15 text-gray-200 hover:bg-white/5 transition"
            >
              <Pause className="w-4 h-4" aria-hidden /> พัก
            </button>
          )}
          <button
            onClick={() => void stop(false)}
            disabled={elapsed === 0 && !running}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/15 text-gray-200 hover:bg-white/5 transition disabled:opacity-30"
          >
            <Square className="w-4 h-4" aria-hidden /> จบและบันทึก
          </button>
        </div>

        {!supported && (
          <p className="mt-4 text-[0.7rem] text-faint">
            เบราว์เซอร์นี้เล่นเสียงไม่ได้ — ตัวเลข BPM และตัวจับเวลายังใช้ได้ตามปกติ
          </p>
        )}
      </Card>

      {/* setup */}
      <Card className="mt-4">
        <h2 className="text-sm font-medium text-gray-100">ตั้งค่าเซสชัน</h2>

        <fieldset className="mt-3" disabled={running}>
          <legend className="text-[0.7rem] text-faint mb-1.5">ความยาว (นาที)</legend>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                onClick={() => setMinutes(d)}
                aria-pressed={minutes === d}
                className={`px-3 py-1.5 rounded-full border text-sm transition disabled:opacity-40 ${
                  minutes === d ? "border-gold text-gold bg-gold/10" : "border-white/10 text-gray-400 hover:border-gold/40"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </fieldset>

        {mode === "breath" && (
          <fieldset className="mt-4" disabled={running}>
            <legend className="text-[0.7rem] text-faint mb-1.5">รูปแบบการหายใจ</legend>
            <div className="grid gap-2">
              {Object.values(BREATH_PATTERNS).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPattern(p.id)}
                  aria-pressed={pattern === p.id}
                  className={`text-left px-3.5 py-2.5 rounded-xl border transition disabled:opacity-40 ${
                    pattern === p.id ? "border-gold bg-gold/10" : "border-white/10 hover:border-gold/40"
                  }`}
                >
                  <span className="text-sm text-gray-200">{p.th}</span>
                  <span className="block text-[0.68rem] text-faint mt-0.5">{p.sourceTh}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {mode === "music" && (
          <div className="mt-4">
            <p className="text-[0.7rem] text-faint mb-1.5">แผนการไล่จังหวะ</p>
            <ol className="grid gap-1.5">
              {plan.segments.map((s) => (
                <li
                  key={s.index}
                  className={`flex items-baseline justify-between text-[0.72rem] px-3 py-1.5 rounded-lg ${
                    running && s.index === segment.index ? "bg-gold/10 text-gold" : "text-gray-400"
                  }`}
                >
                  <span>
                    {mmss(s.startMin * 60)}–{mmss(s.endMin * 60)} · {s.labelTh}
                  </span>
                  <span className="tabular-nums">{s.bpm} BPM</span>
                </li>
              ))}
            </ol>
            <p className="mt-2.5 text-[0.68rem] text-faint leading-relaxed">{plan.methodTh}</p>
            <p className="mt-1.5 text-[0.68rem] text-faint">
              จังหวะเริ่มต้นมาจาก{" "}
              {band.fromHistory
                ? `ผลประเมิน GAD-7 ล่าสุดของคุณ (ระดับ${band.band === "minimal" ? "น้อยมาก" : band.band === "mild" ? "เล็กน้อย" : band.band === "moderate" ? "ปานกลาง" : "รุนแรง"})`
                : "ค่าเริ่มต้นระดับปานกลาง เพราะยังไม่มีผลประเมินในเบราว์เซอร์นี้"}{" "}
              — เป็นการจับคู่ตามกฎที่เปิดเผยไว้ ไม่ใช่การวัดระดับความตื่นตัวจริง
            </p>
          </div>
        )}
      </Card>

      {/* the honest part */}
      <Card className="mt-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-medium text-gray-100 text-sm">{shown.th}</h2>
          <GradeBadge grade={shown.grade} />
          <Chip>หลักฐานเบื้องหลังโหมดนี้</Chip>
        </div>
        <ul className="mt-3 space-y-1.5">
          {shown.citations.map((c) => (
            <CitationLine key={c.title} c={c} />
          ))}
        </ul>
        <div className="mt-4">
          <Disclaimer>
            <span className="text-gray-300">สิ่งที่เสียงนี้ไม่ใช่: </span>
            {shown.limitationTh}
          </Disclaimer>
        </div>
        {mode === "music" && (
          <p className="mt-3 text-[0.72rem] text-gray-400 leading-relaxed">
            วิธีใช้ที่ตรงกับหลักฐานมากที่สุด: ปิดเสียงของแอป แล้วเปิด{" "}
            <span className="text-gray-200">เพลงที่คุณชอบเอง</span> ที่ราว {segment.bpm} BPM
            ตามช่วงที่แสดงไว้ — งานวิจัยที่ได้ผลชัดที่สุดคือการฟังเพลงที่ผู้ฟังเลือกเอง
          </p>
        )}
      </Card>
    </main>
  );
}
