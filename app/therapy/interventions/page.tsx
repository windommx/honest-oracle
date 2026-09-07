"use client";

import { useState } from "react";
import { AlertTriangle, Ban, Clock, Coins } from "lucide-react";
import { EVIDENCE_GRADES, GRADE_ORDER, INTERVENTIONS, VERIFICATION_NOTE } from "@/lib/therapy-engine/evidence";
import type { EvidenceGrade, Intervention } from "@/lib/therapy-engine/types";
import { Card, CitationLine, Disclaimer, GradeBadge, PageHeader } from "../_components";
import { GRADE_COLOR } from "../_tokens";

function costLabel([lo, hi]: [number, number]): string {
  if (lo === 0 && hi === 0) return "ฟรี";
  if (lo === 0) return `ฟรี–฿${hi.toLocaleString("en-US")}`;
  return `฿${lo.toLocaleString("en-US")}–${hi.toLocaleString("en-US")}`;
}

function InterventionCard({ i }: { i: Intervention }) {
  return (
    <Card className="h-full flex flex-col">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-semibold text-gray-100">{i.th}</h3>
        <GradeBadge grade={i.grade} showLabel={false} />
      </div>
      <p className="text-[0.7rem] text-faint mt-0.5">{i.en}</p>

      <p className="mt-3 text-sm text-gray-400 leading-relaxed">{i.summaryTh}</p>

      <ul className="mt-4 space-y-1.5 flex-1">
        {i.citations.map((c) => (
          <CitationLine key={c.title} c={c} />
        ))}
      </ul>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-[0.7rem]">
        <div className="flex items-start gap-1.5">
          <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-faint" aria-hidden />
          <div>
            <dt className="sr-only">ขนาดที่ใช้ในงานวิจัย</dt>
            <dd className="text-gray-400">
              {i.dose
                ? `${i.dose.minutesPerSession[0]}–${i.dose.minutesPerSession[1]} นาที · ${
                    i.dose.sessionsPerWeek === 7 ? "ทุกวัน" : `${i.dose.sessionsPerWeek}×/สัปดาห์`
                  }`
                : "กำหนดโดยแพทย์"}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-1.5">
          <Coins className="w-3.5 h-3.5 mt-0.5 shrink-0 text-faint" aria-hidden />
          <div>
            <dt className="sr-only">ค่าใช้จ่าย</dt>
            <dd className="text-gray-400">{costLabel(i.costThb)}</dd>
          </div>
        </div>
      </dl>

      {/* Harms are never omitted, and an empty list is never shown as a green
          tick: "none reported in the cited sources" is a different claim from
          "none exist", and harmsNote carries the difference. */}
      <div className="mt-3 flex items-start gap-1.5 text-[0.7rem]">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: GRADE_COLOR.moderate }} aria-hidden />
        <p className="text-gray-400 leading-relaxed">
          {i.harms.length > 0 && <span className="text-gray-300">{i.harms.join(" · ")} — </span>}
          {i.harmsNote}
        </p>
      </div>

      <div className="mt-3 flex items-start gap-1.5 text-[0.7rem]">
        <Ban className="w-3.5 h-3.5 mt-0.5 shrink-0 text-faint" aria-hidden />
        <p className="text-faint leading-relaxed">{i.limitationTh}</p>
      </div>

      {!i.selfAdministered && (
        <p className="mt-3 text-[0.68rem] text-faint border-t border-white/5 pt-2.5">
          ต้องมีผู้ให้บริการสุขภาพ — แอปนี้ไม่ได้ให้บริการรายการนี้ และแสดงไว้เพื่อให้เห็นทางเลือกครบ
        </p>
      )}
    </Card>
  );
}

export default function InterventionsPage() {
  const [grade, setGrade] = useState<EvidenceGrade>("strong");
  const shown = INTERVENTIONS.filter((i) => i.grade === grade);

  return (
    <main className="max-w-6xl mx-auto px-5 py-12">
      <PageHeader
        eyebrow="การรักษาเชิงหลักฐาน"
        title={
          <>
            <span className="font-serif">Intervention</span> ที่มีหลักฐานรองรับ
          </>
        }
        lead="เรียงตามระดับหลักฐาน — จาก meta-analysis ถึงงานวิจัยเบื้องต้น"
      />

      <div role="tablist" aria-label="ระดับหลักฐาน" className="mt-8 flex flex-wrap gap-1 justify-center border-b border-white/10">
        {GRADE_ORDER.map((g) => {
          const active = g === grade;
          const count = INTERVENTIONS.filter((i) => i.grade === g).length;
          return (
            <button
              key={g}
              role="tab"
              aria-selected={active}
              onClick={() => setGrade(g)}
              className={`px-4 py-2.5 text-sm border-b-2 -mb-px transition ${
                active ? "text-gray-100" : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
              style={active ? { borderColor: GRADE_COLOR[g] } : undefined}
            >
              <GradeBadge grade={g} showLabel={false} />
              <span className="ml-2">{EVIDENCE_GRADES[g].th}</span>
              <span className="ml-1.5 text-faint tabular-nums">({count})</span>
            </button>
          );
        })}
      </div>

      <p className="mt-5 text-center text-sm text-gray-400 max-w-2xl mx-auto">
        <span className="text-gray-300">เงื่อนไขของระดับนี้: </span>
        {EVIDENCE_GRADES[grade].requiresTh}
      </p>

      {shown.length > 0 ? (
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {shown.map((i) => (
            <InterventionCard key={i.id} i={i} />
          ))}
        </div>
      ) : (
        // An empty rung is left visible rather than hidden. Hiding it would hide
        // that the ladder HAS this rung, and the tempting fix — quietly
        // re-grading something up or down to fill the tab — is exactly the move
        // the grade definitions exist to prevent.
        <Card className="mt-8 max-w-2xl mx-auto text-center">
          <p className="text-sm text-gray-300">
            ยังไม่มี intervention ในตารางนี้ที่อยู่ระดับ &ldquo;{EVIDENCE_GRADES[grade].th}&rdquo;
          </p>
          <p className="mt-2 text-[0.72rem] text-faint leading-relaxed">
            ช่องว่างนี้แสดงไว้ตามจริง — ทางเลือกอีกทางคือย้ายบางรายการมาลงระดับนี้เพื่อให้แท็บไม่ว่าง
            ซึ่งเป็นสิ่งที่นิยามของแต่ละระดับมีไว้เพื่อป้องกันพอดี
          </p>
        </Card>
      )}

      <div className="mt-10 max-w-3xl mx-auto">
        <Disclaimer>{VERIFICATION_NOTE}</Disclaimer>
      </div>
    </main>
  );
}
