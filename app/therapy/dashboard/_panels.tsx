"use client";

import type { AdherenceSummary, WeekBucket } from "@/lib/therapy-engine/adherence";
import type { AssociationResult } from "@/lib/therapy-engine/association";
import type { SleepDiaryEntry } from "@/lib/therapy-engine/sleep";
import { SLEEP_REFERENCE, metricsFor } from "@/lib/therapy-engine/sleep";
import { OUTCOME_LABEL, type ReliableChange } from "@/lib/therapy-engine/reliability";
import { SEVERITY_COLOR, TEXT_FAINT } from "../_tokens";

/** Outcome category → the severity colour that carries the same valence. The
 *  ladder is already in the reader's eye from the severity scale; inventing a
 *  second colour language for the same idea would cost more than it buys. */
const OUTCOME_COLOR: Record<ReliableChange["category"], string> = {
  recovered: SEVERITY_COLOR.minimal,
  improved: SEVERITY_COLOR.mild,
  unchanged: SEVERITY_COLOR.moderate,
  deteriorated: SEVERITY_COLOR.severe,
};

/**
 * The outcome of a course, in the four categories routine outcome monitoring
 * uses — rather than an arrow, which can only point two ways and therefore
 * has to call measurement noise a direction.
 */
export function OutcomeBadge({ change }: { change: ReliableChange }) {
  const colour = OUTCOME_COLOR[change.category];
  const sign = change.deltaPoints > 0 ? "+" : "";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="px-2 py-0.5 rounded-full text-[0.7rem] font-medium"
        style={{ backgroundColor: `${colour}22`, color: colour }}
      >
        {OUTCOME_LABEL[change.category].th}
      </span>
      <span className="text-sm tabular-nums text-gray-300">
        {change.fromTotal} → {change.toTotal}{" "}
        <span style={{ color: TEXT_FAINT }}>
          ({sign}
          {change.deltaPoints} คะแนน)
        </span>
      </span>
    </div>
  );
}

/**
 * The two thresholds a change is judged against, side by side.
 *
 * They answer different questions and are different sizes, and the whole point
 * of showing both is that PHQ-9's conventional MCID (5) sits BELOW its
 * reliable-change threshold (6) — so a change can be "clinically important"
 * and still be indistinguishable from answering the questionnaire twice.
 */
export function ThresholdBars({ change }: { change: ReliableChange }) {
  const size = Math.abs(change.deltaPoints);
  const scale = Math.max(size, change.thresholdPoints, change.mcidPoints, 1);
  const rows = [
    {
      label: "เปลี่ยนจริง",
      value: size,
      colour: change.reliable ? SEVERITY_COLOR.minimal : SEVERITY_COLOR.moderate,
    },
    { label: `เกินความคลาดเคลื่อน ≥${change.thresholdPoints}`, value: change.thresholdPoints, colour: SEVERITY_COLOR.moderate },
    { label: `เกณฑ์ MCID ≥${change.mcidPoints}`, value: change.mcidPoints, colour: SEVERITY_COLOR.mild },
  ];
  return (
    <div className="mt-3 space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-[0.7rem]">
          <span className="w-40 shrink-0 text-right" style={{ color: TEXT_FAINT }}>
            {r.label}
          </span>
          <span className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
            <span
              className="block h-full rounded-full"
              style={{ width: `${(r.value / scale) * 100}%`, backgroundColor: r.colour }}
            />
          </span>
          <span className="w-6 tabular-nums text-gray-300">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Practice minutes per week, with every week present.
 *
 * A bar of height zero for a week nobody practised, not a gap — the gap is
 * what makes a lapsed course look like a kept one.
 */
export function DoseBars({ summary, formatDate }: { summary: AdherenceSummary; formatDate: (ms: number) => string }) {
  const peak = Math.max(1, ...summary.weeks.map((w) => w.completedMin));
  const H = 92;

  return (
    <div className="mt-3">
      <div className="flex items-end gap-[3px]" style={{ height: H }}>
        {summary.weeks.map((w) => (
          <div
            key={w.startAt}
            className="flex-1 min-w-[4px] rounded-t-sm"
            style={{
              height: `${Math.max(w.empty ? 2 : 4, (w.completedMin / peak) * H)}px`,
              backgroundColor: w.empty ? "currentColor" : SEVERITY_COLOR.minimal,
              opacity: w.empty ? 0.14 : 0.75,
            }}
            title={`${formatDate(w.startAt)} — ${w.completedMin} นาที จาก ${w.plannedMin} ที่ตั้งไว้`}
            role="img"
            aria-label={`สัปดาห์ที่ ${w.index + 1}: ฝึก ${w.completedMin} นาที จาก ${w.plannedMin} นาทีที่ตั้งไว้`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[0.62rem]" style={{ color: TEXT_FAINT }}>
        <span>{summary.weeks.length > 0 ? formatDate(summary.weeks[0].startAt) : ""}</span>
        <span>สูงสุด {peak} นาที/สัปดาห์</span>
      </div>
    </div>
  );
}

/**
 * Sleep efficiency per night against the 85% reference.
 *
 * Per night rather than a single mean, because sleep restriction is titrated
 * on the recent pattern and a mean over a month hides the week that matters.
 */
export function SleepEfficiency({ nights }: { nights: readonly SleepDiaryEntry[] }) {
  const recent = nights
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-28);

  if (recent.length === 0) {
    return (
      <p className="text-sm py-6 text-center" style={{ color: TEXT_FAINT }}>
        ยังไม่มีบันทึกการนอน
      </p>
    );
  }

  const H = 84;
  const target = SLEEP_REFERENCE.efficiencyPct;
  return (
    <div className="mt-3">
      <div className="relative flex items-end gap-[3px]" style={{ height: H }}>
        {/* the CBT-I reference line, positioned on the same 0..100 scale as
            the bars so the comparison is geometric rather than asserted */}
        <div
          className="absolute left-0 right-0 border-t border-dashed pointer-events-none"
          style={{ bottom: `${(target / 100) * H}px`, borderColor: SEVERITY_COLOR.moderate }}
          aria-hidden
        />
        {recent.map((n) => {
          const m = metricsFor(n);
          const ok = m.efficiencyPct >= target;
          return (
            <div
              key={n.date}
              className="flex-1 min-w-[4px] rounded-t-sm"
              style={{
                height: `${Math.max(3, (m.efficiencyPct / 100) * H)}px`,
                backgroundColor: ok ? SEVERITY_COLOR.minimal : SEVERITY_COLOR.moderate,
                opacity: 0.8,
              }}
              title={`${n.date} — ${m.efficiencyPct}% (${m.totalSleepMin} นาที จาก ${n.timeInBedMin} บนเตียง)`}
              role="img"
              aria-label={`${n.date}: ประสิทธิภาพการนอน ${m.efficiencyPct} เปอร์เซ็นต์`}
            />
          );
        })}
      </div>
      <p className="mt-2 text-[0.68rem] leading-relaxed" style={{ color: TEXT_FAINT }}>
        เส้นประคือ {target}% ซึ่งเป็นค่าอ้างอิงที่ใช้กันในงานวิจัยการนอน — {recent.length} คืนล่าสุด ·
        ประสิทธิภาพ = เวลาที่หลับจริง ÷ เวลาบนเตียง
      </p>
    </div>
  );
}

/**
 * The association panel.
 *
 * Renders a number ONLY when one can be computed; below the arithmetic floor
 * it renders the reason instead. The `requiredRho` line is the most useful
 * thing here, because it turns a null result from "no effect" into "this many
 * measurements cannot see an effect this size".
 */
export function AssociationPanel({ result, pairingNote }: { result: AssociationResult; pairingNote: string }) {
  const tone =
    result.verdict === "worth-discussing"
      ? SEVERITY_COLOR.mild
      : result.verdict === "inconclusive"
        ? SEVERITY_COLOR.moderate
        : SEVERITY_COLOR.moderatelySevere;

  return (
    <div>
      {result.rho === null ? (
        <p className="text-sm" style={{ color: tone }}>
          ยังคำนวณไม่ได้
        </p>
      ) : (
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-2xl font-semibold tabular-nums" style={{ color: tone }}>
            ρ = {result.rho.toFixed(2)}
          </span>
          <span className="text-sm tabular-nums" style={{ color: TEXT_FAINT }}>
            p = {result.p!.toFixed(3)} · {result.exact ? "นับทุกการจัดเรียง" : "ค่าประมาณ"} · n = {result.n}
          </span>
        </div>
      )}

      {result.rho !== null && (
        <div className="mt-3 flex items-center gap-2 text-[0.7rem]">
          <span className="w-28 shrink-0 text-right" style={{ color: TEXT_FAINT }}>
            ต้องการอย่างน้อย
          </span>
          <span className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden relative">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.min(100, Math.abs(result.rho) * 100)}%`, backgroundColor: tone }}
            />
            <span
              className="absolute top-[-2px] bottom-[-2px] w-px"
              style={{ left: `${result.requiredRho * 100}%`, backgroundColor: SEVERITY_COLOR.severe }}
              aria-hidden
            />
          </span>
          <span className="w-10 tabular-nums text-gray-300">{result.requiredRho.toFixed(2)}</span>
        </div>
      )}

      <p className="mt-3 text-[0.7rem] leading-relaxed" style={{ color: TEXT_FAINT }}>
        {result.noteTh}
      </p>
      <p className="mt-1.5 text-[0.7rem] leading-relaxed" style={{ color: TEXT_FAINT }}>
        {pairingNote}
      </p>
    </div>
  );
}

/** Weeks, as a compact table, for the reader who wants the numbers rather than
 *  the picture. A chart without its data underneath is an assertion. */
export function WeekTable({ weeks, formatDate }: { weeks: WeekBucket[]; formatDate: (ms: number) => string }) {
  const shown = weeks.slice(-8);
  return (
    <table className="mt-3 w-full text-[0.7rem] tabular-nums">
      <thead style={{ color: TEXT_FAINT }}>
        <tr className="text-left">
          <th className="font-normal py-1">สัปดาห์</th>
          <th className="font-normal py-1 text-right">ครั้ง</th>
          <th className="font-normal py-1 text-right">ทำได้</th>
          <th className="font-normal py-1 text-right">ตั้งไว้</th>
          <th className="font-normal py-1 text-right">%</th>
        </tr>
      </thead>
      <tbody className="text-gray-300">
        {shown.map((w) => (
          <tr key={w.startAt} className="border-t border-white/5">
            <td className="py-1">{formatDate(w.startAt)}</td>
            <td className="py-1 text-right">{w.sessions}</td>
            <td className="py-1 text-right">{w.completedMin}</td>
            <td className="py-1 text-right">{w.plannedMin}</td>
            <td className="py-1 text-right" style={{ color: w.empty ? TEXT_FAINT : undefined }}>
              {w.plannedMin > 0 ? `${Math.round(w.completionRate * 100)}%` : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
