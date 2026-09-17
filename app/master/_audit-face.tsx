"use client";

import { Frown, Meh, Smile } from "lucide-react";
import { AUDIT_MEANING, type AuditResult } from "@/lib/master-engine/audit";
import { AUDIT_COLOR, TEXT_FAINT } from "./_tokens";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  THE FACE — and everything it is standing in for.                 ║
// ║                                                                    ║
// ║  A face is a score, and a score with nothing behind it is a number ║
// ║  that looks like a judgement. This one is never shown on its own:  ║
// ║  the findings that produced it are listed underneath, each with    ║
// ║  the measurement that triggered it and the control that fixes it,  ║
// ║  and the smiling state says in words that nothing tripped a check  ║
// ║  rather than that the master is good.                              ║
// ╚══════════════════════════════════════════════════════════════════╝

const ICON = { ok: Smile, caution: Meh, problem: Frown } as const;

export interface AuditFaceProps {
  audit: AuditResult | null;
}

export function AuditFace({ audit }: AuditFaceProps) {
  if (!audit) {
    return (
      <div className="flex items-center gap-2 text-[0.7rem]" style={{ color: TEXT_FAINT }}>
        <Meh className="w-8 h-8 opacity-30" aria-hidden />
        <span>ยังไม่ได้ตรวจ — กด &ldquo;ตรวจผลลัพธ์&rdquo;</span>
      </div>
    );
  }

  const Icon = ICON[audit.severity];
  const color = AUDIT_COLOR[audit.severity];

  return (
    <div>
      <div className="flex items-start gap-3">
        <Icon className="w-9 h-9 shrink-0" style={{ color }} aria-hidden />
        <p className="text-[0.72rem] leading-snug" style={{ color: TEXT_FAINT }}>
          {AUDIT_MEANING[audit.severity]}
        </p>
      </div>

      {audit.findings.length > 0 && (
        <ul className="mt-3 space-y-2">
          {audit.findings.map((f) => (
            <li key={f.id} className="rounded-lg border border-white/10 p-2.5">
              <div className="text-[0.75rem] font-medium" style={{ color: AUDIT_COLOR[f.severity] }}>
                {f.title}
              </div>
              <div className="text-[0.68rem] tabular-nums mt-0.5" style={{ color: TEXT_FAINT }}>
                {f.measured}
              </div>
              <div className="text-[0.68rem] mt-1 text-gray-400">{f.fix}</div>
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[0.65rem]" style={{ color: TEXT_FAINT }}>
        {[
          ["ความดัง", Number.isFinite(audit.measurements.integratedLufs) ? `${audit.measurements.integratedLufs.toFixed(1)} LUFS` : "—"],
          ["ยอดคลื่นจริง", `${audit.measurements.truePeakDb.toFixed(2)} dBTP`],
          ["ยอดต่อแซมเปิล", `${audit.measurements.samplePeakDb.toFixed(2)} dBFS`],
          ["สหสัมพันธ์", audit.measurements.correlation.toFixed(2)],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt>{label}</dt>
            <dd className="tabular-nums text-gray-400">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
