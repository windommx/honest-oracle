"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, CalendarRange, Moon } from "lucide-react";
import { INSTRUMENT_LIST } from "@/lib/therapy-engine/instruments";
import { CUTPOINTS, score } from "@/lib/therapy-engine/scoring";
import { summariseOutcome, type Administration } from "@/lib/therapy-engine/reliability";
import { summariseAdherence, byKind, type SessionRecord } from "@/lib/therapy-engine/adherence";
import { associate } from "@/lib/therapy-engine/association";
import { summarise as summariseSleep } from "@/lib/therapy-engine/sleep";
import { assessSafety } from "@/lib/therapy-engine/safety";
import type { InstrumentId } from "@/lib/therapy-engine/types";
import { Card, Chip, CrisisBanner, Disclaimer, PageHeader, PrimaryLink } from "../_components";
import { TEXT_FAINT, SEVERITY_COLOR } from "../_tokens";
import { browserStorage, readAssessments, readNights, readSessions } from "../_store";
import { localDateOf } from "../_dates";
import {
  AssociationPanel,
  DoseBars,
  OutcomeBadge,
  SleepEfficiency,
  ThresholdBars,
  WeekTable,
} from "./_panels";
import { Trajectory, type TrajectoryPoint } from "./_trajectory";
import { describePairing, pairDoseWithScores } from "./_pairing";
import { dashboardWindow, earliestRecord, nightsWithinWindow, withinWindow } from "./_window";

/** Windows the dashboard can be read over. "All" is included because a fixed
 *  window silently truncates a long course, and a dashboard that cannot show
 *  someone their whole history is withholding their own data from them. */
const WINDOWS = [
  { days: 30, th: "30 วัน" },
  { days: 90, th: "90 วัน" },
  { days: 365, th: "1 ปี" },
  { days: 0, th: "ทั้งหมด" },
] as const;

export default function DashboardPage() {
  const [windowDays, setWindowDays] = useState<number>(90);
  const [now, setNow] = useState<number | null>(null);
  const [raw, setRaw] = useState<{
    assessments: ReturnType<typeof readAssessments>;
    sessions: ReturnType<typeof readSessions>;
    nights: ReturnType<typeof readNights>;
  }>({ assessments: [], sessions: [], nights: [] });

  // Read after mount, and take the clock once into state. Reading either
  // during render would make the server's HTML and the browser's first paint
  // disagree — localStorage does not exist on the server, and Date.now() is
  // different by the time the page reaches the client.
  useEffect(() => {
    const store = browserStorage();
    setRaw({
      assessments: readAssessments(store),
      sessions: readSessions(store),
      nights: readNights(store),
    });
    setNow(Date.now());
  }, []);

  const view = useMemo(() => {
    if (now === null) return null;

    const earliest = earliestRecord(raw.assessments, raw.sessions);
    const w = dashboardWindow(now, windowDays, Number.isNaN(earliest) ? now : earliest);
    const { start: windowStart, end: windowEnd } = w;

    const assessments = withinWindow(raw.assessments, w);
    const sessions: SessionRecord[] = withinWindow(raw.sessions, w).map((s) => ({
      at: s.at,
      kind: s.kind,
      plannedMin: s.plannedMin,
      completedMin: s.completedMin,
    }));
    // By DATE, not by timestamp — see _window.ts for the morning this got
    // wrong and what it cost.
    const nights = nightsWithinWindow(raw.nights, w, localDateOf);

    // Scored on read, never stored — the same rule the rest of the product
    // follows, so a saved row cannot drift from the engine.
    const scored = assessments
      .map((a) => ({ at: a.at, result: score(a.instrument, a.responses) }))
      .filter((a) => Number.isFinite(a.result.total));

    const administrations: Administration[] = scored.map((s) => ({ at: s.at, score: s.result }));

    const outcomes = INSTRUMENT_LIST.map((inst) => {
      const mine = scored
        .filter((s) => s.result.instrument === inst.id)
        .sort((a, b) => a.at - b.at);
      const points: TrajectoryPoint[] = mine.map((m) => ({
        at: m.at,
        total: m.result.total,
        band: m.result.band,
        safetyFlag: m.result.safetyFlag,
      }));
      const pairing = pairDoseWithScores(
        mine.map((m) => ({ at: m.at, instrument: m.result.instrument, total: m.result.total })),
        sessions.map((s) => ({ at: s.at, completedMin: s.completedMin })),
        inst.id,
        localDateOf
      );
      return {
        instrument: inst.id as InstrumentId,
        name: inst.name,
        th: inst.th,
        points,
        summary: summariseOutcome(inst.id, administrations),
        association: associate(pairing.pairs),
        pairingNote: describePairing(pairing),
      };
    });

    const adherence = summariseAdherence(sessions, windowStart, windowEnd);
    const sleep = summariseSleep(nights);
    const kinds = byKind(sessions);
    // Safety is judged on the LATEST score of each instrument, not on the
    // window's average: an endorsement three weeks ago that has since resolved
    // is history, and one from yesterday is not.
    const latest = INSTRUMENT_LIST.map((inst) =>
      scored.filter((s) => s.result.instrument === inst.id).sort((a, b) => b.at - a.at)[0]
    )
      .filter(Boolean)
      .map((s) => s!.result);
    const safety = assessSafety(latest);
    const flagged = scored.filter((s) => s.result.safetyFlag).length;

    return {
      windowStart,
      windowEnd,
      outcomes,
      adherence,
      sleep,
      kinds,
      safety,
      flagged,
      nights,
      counts: {
        assessments: scored.length,
        sessions: sessions.length,
        nights: nights.length,
      },
    };
  }, [raw, windowDays, now]);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-5 py-6">
      <PageHeader
        eyebrow="MindBridge"
        title="ภาพรวม"
        lead="ทุกตัวเลขในหน้านี้คำนวณจากข้อมูลที่คุณบันทึกไว้เอง และแสดงความคลาดเคลื่อนของเครื่องมือไว้ข้าง ๆ เสมอ"
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <CalendarRange className="w-4 h-4" style={{ color: TEXT_FAINT }} aria-hidden />
        <div className="inline-flex rounded-lg border border-white/10 overflow-hidden" role="group" aria-label="ช่วงเวลา">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              onClick={() => setWindowDays(w.days)}
              aria-pressed={windowDays === w.days}
              className={`px-3 py-1.5 text-xs transition ${
                windowDays === w.days ? "bg-gold text-black font-medium" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {w.th}
            </button>
          ))}
        </div>
      </div>

      {view === null ? (
        <p className="mt-8 text-sm" style={{ color: TEXT_FAINT }}>
          กำลังอ่านข้อมูลจากเบราว์เซอร์นี้…
        </p>
      ) : (
        <>
          {view.safety.level !== "none" && (
            <div className="mt-5">
              <CrisisBanner safety={view.safety} />
            </div>
          )}

          {/* ── what this dashboard is built on ─────────────────────────── */}
          <section className="mt-5">
            <Card>
              <h2 className="font-semibold text-gray-100 text-sm">หน้านี้สร้างจากข้อมูลเท่านี้</h2>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {[
                  { n: view.counts.assessments, label: "ครั้งที่ประเมิน" },
                  { n: view.counts.sessions, label: "ครั้งที่ฝึก" },
                  { n: view.counts.nights, label: "คืนที่บันทึก" },
                  { n: view.adherence.weeks.length, label: "สัปดาห์ในช่วงนี้" },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="text-xl tabular-nums text-gray-100">{s.n}</div>
                    <div className="text-[0.7rem]" style={{ color: TEXT_FAINT }}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
              {/* A dashboard that looks the same at n=3 and n=30 is lying about
                  one of them. The counts sit at the TOP, before any chart. */}
              <p className="mt-3 text-[0.7rem] leading-relaxed" style={{ color: TEXT_FAINT }}>
                {view.counts.assessments < 2
                  ? "ยังเทียบแนวโน้มไม่ได้ ต้องมีผลประเมินอย่างน้อยสองครั้ง — กราฟด้านล่างจึงยังเป็นจุดเดียว ไม่ใช่เส้น"
                  : `ช่วง ${localDateOf(view.windowStart)} ถึง ${localDateOf(view.windowEnd)} — กราฟและตัวเลขทั้งหมดนับเฉพาะช่วงนี้`}
              </p>
            </Card>
          </section>

          {/* ── outcome per instrument ───────────────────────────────────── */}
          <section className="mt-5 grid gap-4 lg:grid-cols-2">
            {view.outcomes.map((o) => (
              <Card key={o.instrument}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold text-gray-100">{o.th}</h2>
                  <Chip>{o.name}</Chip>
                </div>

                {o.summary.overall ? (
                  <>
                    <div className="mt-3">
                      <OutcomeBadge change={o.summary.overall} />
                    </div>
                    <ThresholdBars change={o.summary.overall} />
                    <p className="mt-3 text-[0.7rem] leading-relaxed" style={{ color: TEXT_FAINT }}>
                      {o.summary.overall.noteTh}
                    </p>
                    {o.summary.latest && o.summary.administrations > 2 && (
                      <p className="mt-2 text-[0.7rem] leading-relaxed" style={{ color: TEXT_FAINT }}>
                        ครั้งล่าสุดเทียบครั้งก่อนหน้า: {o.summary.latest.fromTotal} →{" "}
                        {o.summary.latest.toTotal} — {o.summary.latest.reliable ? "เกิน" : "ไม่เกิน"}
                        ความคลาดเคลื่อนของเครื่องมือ
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-3 text-sm" style={{ color: TEXT_FAINT }}>
                    {o.summary.noteTh}
                  </p>
                )}

                <Trajectory instrument={o.instrument} points={o.points} />

                <div className="mt-4 pt-3 border-t border-white/5">
                  <h3 className="text-[0.72rem] uppercase tracking-wider" style={{ color: TEXT_FAINT }}>
                    การฝึกกับคะแนน
                  </h3>
                  <div className="mt-2">
                    <AssociationPanel result={o.association} pairingNote={o.pairingNote} />
                  </div>
                </div>
              </Card>
            ))}
          </section>

          {/* ── adherence ────────────────────────────────────────────────── */}
          <section className="mt-5 grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-gold" aria-hidden />
                <h2 className="font-semibold text-gray-100 text-sm">การฝึกที่ทำจริง</h2>
              </div>

              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {[
                  { v: `${view.adherence.totalCompletedMin}`, label: "นาทีรวม" },
                  { v: `${view.adherence.meanMinutesPerWeek.toFixed(0)}`, label: "นาที/สัปดาห์" },
                  {
                    v:
                      view.adherence.totalPlannedMin > 0
                        ? `${Math.round(view.adherence.completionRate * 100)}%`
                        : "—",
                    label: "ทำได้ตามที่ตั้งไว้",
                  },
                  { v: `${view.adherence.currentStreakWeeks}`, label: "สัปดาห์ต่อเนื่อง" },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="text-xl tabular-nums text-gray-100">{s.v}</div>
                    <div className="text-[0.7rem]" style={{ color: TEXT_FAINT }}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>

              <DoseBars summary={view.adherence} formatDate={localDateOf} />
              <p className="mt-2 text-[0.7rem] leading-relaxed" style={{ color: TEXT_FAINT }}>
                {view.adherence.noteTh}
              </p>

              <div className="mt-3 flex flex-wrap gap-3 text-[0.72rem]" style={{ color: TEXT_FAINT }}>
                <span>ดนตรี {view.kinds.music.completedMin} นาที ({view.kinds.music.sessions} ครั้ง)</span>
                <span>ลมหายใจ {view.kinds.breath.completedMin} นาที ({view.kinds.breath.sessions} ครั้ง)</span>
              </div>

              <WeekTable weeks={view.adherence.weeks} formatDate={localDateOf} />
            </Card>

            {/* ── sleep ──────────────────────────────────────────────────── */}
            <Card>
              <div className="flex items-center gap-2">
                <Moon className="w-4 h-4 text-gold" aria-hidden />
                <h2 className="font-semibold text-gray-100 text-sm">การนอน</h2>
              </div>

              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                {[
                  {
                    v: view.sleep.nights > 0 ? `${view.sleep.meanEfficiencyPct}%` : "—",
                    label: "ประสิทธิภาพเฉลี่ย",
                  },
                  {
                    v:
                      view.sleep.nights > 0
                        ? `${Math.floor(view.sleep.meanTotalSleepMin / 60)}:${String(
                            view.sleep.meanTotalSleepMin % 60
                          ).padStart(2, "0")}`
                        : "—",
                    label: "หลับจริงเฉลี่ย",
                  },
                  { v: `${view.sleep.nights}`, label: "คืนที่บันทึก" },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="text-xl tabular-nums text-gray-100">{s.v}</div>
                    <div className="text-[0.7rem]" style={{ color: TEXT_FAINT }}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>

              <SleepEfficiency nights={view.nights} />
              <p className="mt-2 text-[0.7rem] leading-relaxed" style={{ color: TEXT_FAINT }}>
                {view.sleep.noteTh}
              </p>
              {view.sleep.meetsFrequencyCriterion && (
                <p className="mt-2 text-[0.72rem] leading-relaxed" style={{ color: SEVERITY_COLOR.moderate }}>
                  เข้าเกณฑ์เชิงปริมาณที่ใช้กันในงานวิจัยการนอน — เป็นเรื่องที่ควรคุยกับผู้ให้การรักษา
                  ไม่ใช่การวินิจฉัยว่าเป็นโรคนอนไม่หลับ
                </p>
              )}
            </Card>
          </section>

          {/* ── safety history ───────────────────────────────────────────── */}
          {view.flagged > 0 && (
            <section className="mt-5">
              <Card>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" style={{ color: SEVERITY_COLOR.severe }} aria-hidden />
                  <h2 className="font-semibold text-gray-100 text-sm">ข้อที่ต้องดูเป็นพิเศษ</h2>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-gray-300">
                  ในช่วงนี้มี {view.flagged} ครั้งที่ตอบข้อเกี่ยวกับการทำร้ายตัวเองว่ามีอยู่บ้าง
                  — วงกลมรอบจุดในกราฟคือครั้งเหล่านั้น ข้อนี้ถูกนับแยกจากคะแนนรวมเสมอ
                  เพราะคะแนนรวมที่ต่ำไม่ได้แปลว่าข้อนี้ปลอดภัย
                </p>
                <div className="mt-3">
                  <PrimaryLink href="/therapy/safety">ดูแหล่งช่วยเหลือ</PrimaryLink>
                </div>
              </Card>
            </section>
          )}

          <Disclaimer>
            หน้านี้ไม่ใช่การวินิจฉัย GAD-7 และ PHQ-9 เป็นแบบ<em>คัดกรอง</em> ที่จุดตัด{" "}
            {CUTPOINTS.gad7.score} คะแนน ความจำเพาะอยู่ที่ {Math.round(CUTPOINTS.gad7.specificity * 100)}%
            แปลว่าในคนที่คัดกรองได้ผลบวก จะมีส่วนหนึ่งที่ไม่ได้เป็นภาวะนั้นจริง
            ตัวเลขความสัมพันธ์ในหน้านี้เป็นข้อมูลของคนคนเดียว ไม่มีกลุ่มเปรียบเทียบ
            จึงบอกทิศทางของเหตุไม่ได้ไม่ว่าค่าจะออกมาเท่าไร
          </Disclaimer>

          <footer className="mt-6 pt-4 border-t border-white/10 text-[0.72rem] leading-relaxed" style={{ color: TEXT_FAINT }}>
            <p>
              คะแนนถูกคำนวณใหม่ทุกครั้งที่อ่าน ไม่ได้เก็บค่าผลรวมไว้ — แถวที่บันทึกจึงเพี้ยนไปจากสูตรใน{" "}
              <code>lib/therapy-engine/</code> ไม่ได้ · ดู{" "}
              <Link href="/therapy/progress" className="text-gold">
                ความคืบหน้า
              </Link>{" "}
              สำหรับการส่งออกและลบข้อมูล
            </p>
          </footer>
        </>
      )}
    </main>
  );
}
