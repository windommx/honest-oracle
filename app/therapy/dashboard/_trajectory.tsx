"use client";

import { BANDS, CUTPOINTS } from "@/lib/therapy-engine/scoring";
import { noiseBand, reliableChangePoints } from "@/lib/therapy-engine/reliability";
import type { InstrumentId, SeverityBand } from "@/lib/therapy-engine/types";
import { SEVERITY_COLOR, TEXT_FAINT } from "../_tokens";

export interface TrajectoryPoint {
  at: number;
  total: number;
  band: SeverityBand;
  /** A safety-critical item was endorsed at this administration. */
  safetyFlag?: boolean;
}

const W = 640;
const H = 220;
const PAD_L = 30;
/** Wide enough to hold the cut-point label OUTSIDE the plot. Drawn inside, it
 *  sat on top of whatever data point happened to be near the cut — which on a
 *  trajectory heading for the cut-point is the most important point there is. */
const PAD_R = 62;
const PAD_T = 10;
const PAD_B = 26;

/**
 * Scores over time, drawn against two things a bare sparkline leaves out.
 *
 * THE SEVERITY BANDS, as horizontal zones, because a total means nothing
 * without the published cut-points it is read against — 11 is a number, "just
 * inside moderate" is the reading.
 *
 * THE NOISE BAND around the first score: the region a later score could land
 * in without the change being distinguishable from measurement error. This is
 * the part almost no progress chart has, and it is the one that stops a
 * two-point wiggle from being read as movement. Putting the instrument's
 * precision on the same picture as its readings is the only thing a chart can
 * do here that a table cannot.
 *
 * Deliberately NOT a smoothed curve. A spline through fortnightly points draws
 * a trajectory between measurements that nobody took, with local minima that
 * are pure interpolation — on a mental-health chart that is an invented good
 * week. Straight segments, and the measured points stay visible as dots.
 */
export function Trajectory({
  instrument,
  points,
}: {
  instrument: InstrumentId;
  points: TrajectoryPoint[];
}) {
  const bands = BANDS[instrument];
  const max = bands[bands.length - 1].to;
  const cut = CUTPOINTS[instrument].score;

  if (points.length === 0) {
    return (
      <p className="text-sm py-8 text-center" style={{ color: TEXT_FAINT }}>
        ยังไม่มีผลประเมิน
      </p>
    );
  }

  const first = points[0].at;
  const last = points[points.length - 1].at;
  // A single point has no span; give it the middle of the plot rather than
  // dividing by zero and putting it at the left edge as if time had started.
  const span = Math.max(1, last - first);
  const x = (at: number) =>
    points.length === 1 ? (PAD_L + (W - PAD_R)) / 2 : PAD_L + ((at - first) / span) * (W - PAD_L - PAD_R);
  const y = (total: number) => PAD_T + (1 - total / max) * (H - PAD_T - PAD_B);

  const noise = noiseBand(instrument, points[0].total);
  const threshold = reliableChangePoints(instrument);

  return (
    <figure className="mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={
          `แนวโน้มคะแนน ${points.length} ครั้ง จาก ${points[0].total} ถึง ${points[points.length - 1].total} คะแนน ` +
          `เต็ม ${max} — แถบสีจาง ${noise.low} ถึง ${noise.high} คะแนน คือช่วงที่แยกจากความคลาดเคลื่อนของเครื่องมือไม่ได้`
        }
      >
        {/* Severity zones, drawn to the NEXT band's cut-point rather than to
            their own last score. A band covering 0–4 and the next starting at
            5 leaves the strip between them unpainted, so the chart grew a thin
            unshaded stripe at every boundary — and the boundaries are exactly
            where a reader looks. The top of each zone is the score at which
            the next band begins, which is also where the published cut-point
            actually sits. */}
        {bands.map((b, i) => {
          const top = i + 1 < bands.length ? bands[i + 1].from : max;
          return (
            <rect
              key={b.id}
              x={PAD_L}
              y={y(top)}
              width={W - PAD_L - PAD_R}
              height={Math.max(0, y(b.from) - y(top))}
              fill={SEVERITY_COLOR[b.id]}
              opacity={0.07}
            />
          );
        })}

        {/* the region indistinguishable from the first measurement */}
        <rect
          x={PAD_L}
          y={y(noise.high)}
          width={W - PAD_L - PAD_R}
          height={Math.max(0, y(noise.low) - y(noise.high))}
          fill="currentColor"
          className="text-gray-300"
          opacity={0.12}
        />
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={y(points[0].total)}
          y2={y(points[0].total)}
          stroke="currentColor"
          className="text-gray-400"
          strokeWidth={1}
          strokeDasharray="2 3"
          opacity={0.7}
        />

        {/* the screening cut-point */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={y(cut)}
          y2={y(cut)}
          stroke={SEVERITY_COLOR.moderate}
          strokeWidth={1}
          strokeDasharray="5 4"
          opacity={0.8}
        />
        <text x={W - PAD_R + 5} y={y(cut) + 3} textAnchor="start" fontSize={9} fill={SEVERITY_COLOR.moderate}>
          จุดตัด {cut}
        </text>

        {/* axis */}
        {[0, Math.round(max / 2), max].map((v) => (
          <text key={v} x={PAD_L - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill="currentColor" className="text-gray-500">
            {v}
          </text>
        ))}

        {points.length > 1 && (
          <polyline
            points={points.map((p) => `${x(p.at)},${y(p.total)}`).join(" ")}
            fill="none"
            stroke="currentColor"
            className="text-gray-300"
            strokeWidth={1.5}
          />
        )}

        {points.map((p) => (
          <g key={p.at}>
            <circle cx={x(p.at)} cy={y(p.total)} r={4} fill={SEVERITY_COLOR[p.band.id]} />
            {/* Never hidden, never styled down: a safety endorsement is the one
                thing on this page that outranks every trend on it. */}
            {p.safetyFlag && (
              <circle
                cx={x(p.at)}
                cy={y(p.total)}
                r={8}
                fill="none"
                stroke={SEVERITY_COLOR.severe}
                strokeWidth={1.5}
              />
            )}
          </g>
        ))}
      </svg>

      <figcaption className="mt-2 text-[0.7rem] leading-relaxed" style={{ color: TEXT_FAINT }}>
        แถบสีจางแนวนอนคือช่วง {noise.low}–{noise.high} คะแนน รอบคะแนนครั้งแรก — คะแนนที่ตกอยู่ในแถบนี้
        ต่างจากครั้งแรกน้อยกว่า {threshold} คะแนน จึงยังแยกจากความคลาดเคลื่อนของการวัดไม่ได้
        ส่วนเส้นต่อจุดเป็นเส้นตรง ไม่ใช่เส้นโค้ง เพราะระหว่างสองครั้งที่วัดไม่มีใครวัดอะไรไว้
      </figcaption>
    </figure>
  );
}
