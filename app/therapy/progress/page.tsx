"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Trash2 } from "lucide-react";
import { INSTRUMENT_LIST } from "@/lib/therapy-engine/instruments";
import { score } from "@/lib/therapy-engine/scoring";
import { buildSeries, describe, type SeriesPoint } from "@/lib/therapy-engine/trend";
import { summarise } from "@/lib/therapy-engine/sleep";
import type { InstrumentId } from "@/lib/therapy-engine/types";
import { toast } from "../../rush/_toast";
import { Card, Chip, Disclaimer, PageHeader, PrimaryLink } from "../_components";
import { SEVERITY_COLOR } from "../_tokens";
import { browserStorage, clearAll, readAssessments, readNights, readSessions, totalMinutes } from "../_store";

const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** A sparkline over the scores. Deliberately NOT a smoothed curve: joining four
 *  fortnightly points with a spline draws a trajectory between measurements that
 *  nobody took. Straight segments between real dots, and the dots stay visible. */
function Sparkline({ points, max }: { points: SeriesPoint[]; max: number }) {
  if (points.length < 2) return null;
  const W = 320;
  const H = 72;
  const first = points[0].at;
  const span = Math.max(1, points[points.length - 1].at - first);
  const xy = points.map((p) => ({
    x: ((p.at - first) / span) * (W - 12) + 6,
    y: H - 6 - (p.score.total / max) * (H - 12),
    p,
  }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20 mt-3" role="img" aria-label="แนวโน้มคะแนน">
      <polyline
        points={xy.map((c) => `${c.x},${c.y}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="text-gray-400"
      />
      {xy.map((c) => (
        <circle key={c.p.at} cx={c.x} cy={c.y} r={3.5} fill={SEVERITY_COLOR[c.p.score.band.id]} />
      ))}
    </svg>
  );
}

function InstrumentTrend({ id, points }: { id: InstrumentId; points: SeriesPoint[] }) {
  const inst = INSTRUMENT_LIST.find((i) => i.id === id)!;
  const series = buildSeries(id, points);

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-gray-100">{inst.th}</h2>
        <Chip>{inst.name}</Chip>
      </div>

      {series.points.length === 0 ? (
        <p className="mt-3 text-sm text-faint">{series.noteTh}</p>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-3">
            <span
              className="text-4xl font-semibold tabular-nums"
              style={{ color: SEVERITY_COLOR[series.points[series.points.length - 1].score.band.id] }}
            >
              {series.points[series.points.length - 1].score.total}
            </span>
            <span className="text-faint text-sm">/ {inst.max}</span>
            <span className="text-sm text-gray-300">
              {series.points[series.points.length - 1].score.band.th}
            </span>
          </div>

          <Sparkline points={series.points} max={inst.max} />

          <ol className="mt-1 space-y-0.5 text-[0.7rem] text-faint">
            {series.points.slice(-6).map((p) => (
              <li key={p.at} className="flex justify-between tabular-nums">
                <span>{fmtDate(p.at)}</span>
                <span>{p.score.total}</span>
              </li>
            ))}
          </ol>

          {series.overall ? (
            <div className="mt-4 space-y-1.5">
              <p className="text-sm text-gray-300">
                <span className="text-faint">ครั้งแรก → ล่าสุด: </span>
                {describe(series.overall)}
              </p>
              {series.latest && series.points.length > 2 && (
                <p className="text-sm text-gray-300">
                  <span className="text-faint">เทียบครั้งก่อน: </span>
                  {describe(series.latest)}
                </p>
              )}
              <p className="text-[0.7rem] text-faint leading-relaxed">{series.overall.causalNoteTh}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-faint">{series.noteTh}</p>
          )}
        </>
      )}
    </Card>
  );
}

export default function ProgressPage() {
  const [points, setPoints] = useState<SeriesPoint[]>([]);
  const [minutes, setMinutes] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [nights, setNights] = useState(0);
  const [mounted, setMounted] = useState(false);

  function load() {
    const store = browserStorage();
    // Scores are re-derived from the stored answers, never read from a stored
    // total — the same rule the server follows.
    const pts: SeriesPoint[] = [];
    for (const a of readAssessments(store)) {
      try {
        pts.push({ at: a.at, score: score(a.instrument, a.responses) });
      } catch {
        // An entry that no longer scores (a shortened instrument, a hand-edited
        // localStorage) is skipped rather than charted as a zero.
      }
    }
    const sessions = readSessions(store);
    setPoints(pts);
    setMinutes(totalMinutes(sessions));
    setSessionCount(sessions.length);
    setNights(summarise(readNights(store)).nights);
    setMounted(true);
  }

  useEffect(load, []);

  async function exportData() {
    // The server export is the complete one; this is the local half, so a user
    // who never signed in can still take their data with them.
    const store = browserStorage();
    const blob = new Blob(
      [
        JSON.stringify(
          { assessments: readAssessments(store), sessions: readSessions(store), sleepNights: readNights(store) },
          null,
          2
        ),
      ],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mindbridge-local-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function erase() {
    clearAll(browserStorage());
    load();
    toast("ลบข้อมูลในเบราว์เซอร์นี้แล้ว", { variant: "success" });
  }

  return (
    <main className="max-w-3xl mx-auto px-5 py-12">
      <PageHeader
        eyebrow="ความคืบหน้า"
        title="อะไรเปลี่ยนไปบ้าง"
        lead="รายงานเป็นคะแนน ไม่ใช่เปอร์เซ็นต์ และไม่พยากรณ์ว่าอีกกี่สัปดาห์จะดีขึ้น"
      />

      <div className="mt-8 grid gap-4">
        {INSTRUMENT_LIST.map((inst) => (
          <InstrumentTrend key={inst.id} id={inst.id} points={points} />
        ))}
      </div>

      <Card className="mt-4">
        <h2 className="font-semibold text-gray-100 text-sm">การฝึกที่ทำจริง</h2>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xl font-semibold tabular-nums text-gold">{mounted ? minutes : 0}</p>
            <p className="text-[0.65rem] text-faint">นาทีที่ฟัง/หายใจจริง</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums text-gold">{mounted ? sessionCount : 0}</p>
            <p className="text-[0.65rem] text-faint">เซสชัน</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums text-gold">{mounted ? nights : 0}</p>
            <p className="text-[0.65rem] text-faint">คืนที่บันทึกการนอน</p>
          </div>
        </div>
        <p className="mt-3 text-[0.7rem] text-faint leading-relaxed">
          นับเฉพาะนาทีที่ทำจริง เซสชันที่เลิกกลางคันนับเป็นนาทีที่ทำได้ ไม่ใช่นาทีที่ตั้งใจ —
          ตัวเลขที่นับความตั้งใจจะสวยกว่าและบอกอะไรไม่ได้
        </p>
      </Card>

      {points.length === 0 && mounted && (
        <div className="mt-6 text-center">
          <PrimaryLink href="/therapy/assess">ทำแบบประเมินครั้งแรก</PrimaryLink>
        </div>
      )}

      <Card className="mt-4">
        <h2 className="font-semibold text-gray-100 text-sm">ข้อมูลของคุณ</h2>
        <p className="mt-2 text-[0.72rem] text-gray-400 leading-relaxed">
          ข้อมูลในหน้านี้อ่านจากเบราว์เซอร์นี้ ถ้าเข้าสู่ระบบไว้ ระบบจะซิงก์สำเนาขึ้นบัญชีของคุณด้วย —
          ดาวน์โหลดหรือลบสำเนาบนเซิร์ฟเวอร์ได้ที่{" "}
          <Link href="/api/therapy/export" className="text-gold">
            /api/therapy/export
          </Link>
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => void exportData()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/15 text-gray-200 hover:bg-white/5 transition text-sm"
          >
            <Download className="w-4 h-4" aria-hidden /> ดาวน์โหลดข้อมูลในเครื่อง
          </button>
          <button
            onClick={erase}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition hover:bg-white/5"
            style={{ borderColor: SEVERITY_COLOR.severe, color: SEVERITY_COLOR.severe }}
          >
            <Trash2 className="w-4 h-4" aria-hidden /> ลบข้อมูลในเบราว์เซอร์นี้
          </button>
        </div>
      </Card>

      <div className="mt-6">
        <Disclaimer>
          กราฟนี้ไม่มีเส้นพยากรณ์ และไม่มีการคำนวณว่า &ldquo;ดีขึ้นกี่เปอร์เซ็นต์&rdquo; — GAD-7 และ PHQ-9
          ไม่มีศูนย์ที่แท้จริง การหารคะแนนสองครั้งเป็นเปอร์เซ็นต์จึงเป็นเลขที่ไม่มีความหมาย
        </Disclaimer>
      </div>
    </main>
  );
}
