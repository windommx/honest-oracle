"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { COMPETENCY_LEVELS, CRITERIA } from "@/lib/competency/criteria";
import { criterionLevel, developmentPlan, levelInfo, scoreKey } from "@/lib/competency/scoring";
import { formatThaiDate } from "@/lib/competency/format";
import type { NurseDetailDTO } from "@/lib/competency/types";
import { api, errorMessage } from "../../_api";
import { TrendChart } from "../../_charts";
import { ModuleNav } from "../../_nav";
import { Button, cx, ErrorState, inputClass, LevelBadge, MgmtBadge, Spinner } from "../../_ui";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  INDIVIDUAL REPORT — the paper the head nurse files: one page per  ║
// ║  assessment with the ten rubric lines the assessor chose, the     ║
// ║  total, the band, the development plan and signature lines.      ║
// ║  Print styles live in globals.css (.competency + @media print).   ║
// ╚══════════════════════════════════════════════════════════════════╝

export default function CompetencyReportPage() {
  const params = useParams<{ id: string }>();
  const nurseId = typeof params?.id === "string" ? params.id : "";
  const [nurse, setNurse] = useState<NurseDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);

  useEffect(() => {
    if (!nurseId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.nurses
      .get(nurseId)
      .then((n) => {
        if (cancelled) return;
        setNurse(n);
        // ?a=<assessmentId> picks a specific entry; otherwise the latest. Read once, without
        // useSearchParams, so this dynamic page needs no Suspense boundary.
        const wanted = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("a") : null;
        setAssessmentId(wanted && n.assessments.some((a) => a.id === wanted) ? wanted : (n.latest?.id ?? null));
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nurseId, attempt]);

  const assessment = useMemo(() => nurse?.assessments.find((a) => a.id === assessmentId) ?? null, [nurse, assessmentId]);
  const plan = useMemo(() => (assessment ? developmentPlan(assessment.scores) : null), [assessment]);
  const trend = useMemo(
    () => (nurse ? [...nurse.assessments].reverse().map((a) => ({ label: formatThaiDate(a.assessDate), value: a.totalScore, level: a.level })) : []),
    [nurse]
  );

  return (
    <>
      <ModuleNav active="report" />
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
          <Link href="/competency" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            กลับไปแดชบอร์ด
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {nurse && nurse.assessments.length > 1 && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                ครั้งที่ประเมิน
                <select value={assessmentId ?? ""} onChange={(e) => setAssessmentId(e.target.value)} className={cx(inputClass, "w-auto")} aria-label="เลือกครั้งที่ประเมิน">
                  {nurse.assessments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {formatThaiDate(a.assessDate)} — {a.totalScore} คะแนน
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button onClick={() => window.print()} disabled={!assessment}>
              <Printer className="h-4 w-4" aria-hidden />
              พิมพ์ / บันทึก PDF
            </Button>
          </div>
        </div>

        {loading && !nurse ? (
          <Spinner label="กำลังโหลดรายงาน" />
        ) : error || !nurse ? (
          <ErrorState message={error ?? "ไม่พบข้อมูล"} onRetry={() => setAttempt((a) => a + 1)} />
        ) : (
          <article className="print-doc rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
            <header className="border-b border-slate-200 pb-4 text-center">
              <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">แบบสรุปผลการประเมิน Competency Level</h1>
              <p className="text-sm text-slate-600">พยาบาลหน่วยไตเทียม (Hemodialysis Nurse) · 10 เกณฑ์ · คะแนนเต็ม 100</p>
            </header>

            <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-slate-600">ชื่อ-นามสกุล</dt>
                <dd className="font-medium text-slate-900">
                  {nurse.fullName}
                  {nurse.nickname ? ` (${nurse.nickname})` : ""}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-slate-600">ตำแหน่ง</dt>
                <dd className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                  {nurse.position}
                  <MgmtBadge level={nurse.mgmtLevel} />
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-slate-600">วันที่ประเมิน</dt>
                <dd className="font-medium text-slate-900">{assessment ? formatThaiDate(assessment.assessDate, "long") : "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-slate-600">ผู้ประเมิน</dt>
                <dd className="font-medium text-slate-900">{assessment?.assessor || "—"}</dd>
              </div>
            </dl>

            {!assessment ? (
              <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-800">ยังไม่มีผลการประเมินสำหรับพยาบาลคนนี้</p>
            ) : (
              <>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-6 rounded-xl border border-teal-100 bg-teal-50/60 p-5">
                  <div className="text-center">
                    <p className="text-xs text-slate-600">คะแนนรวม</p>
                    <p className="text-4xl font-bold text-teal-800">
                      {assessment.totalScore}
                      <span className="text-base font-medium text-slate-600">/100</span>
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-600">ระดับ Competency</p>
                    <LevelBadge level={assessment.level} showBand className="mt-1 text-sm" />
                    <p className="mt-1 text-xs text-slate-600">{levelInfo(assessment.level).enName} · {levelInfo(assessment.level).group}</p>
                  </div>
                  {plan?.next && (
                    <div className="text-center text-xs text-slate-600">
                      อีก <span className="font-semibold text-slate-900">{plan.next.pointsNeeded}</span> คะแนน
                      <br />
                      ถึง LEVEL {plan.next.level.level} {plan.next.level.thName}
                    </div>
                  )}
                </div>

                <table className="mt-6 w-full border-collapse text-sm">
                  <caption className="mb-2 text-left text-sm font-semibold text-slate-900">ผลการประเมินรายเกณฑ์</caption>
                  <thead>
                    <tr className="bg-slate-100 text-left text-xs text-slate-600">
                      <th className="border border-slate-200 px-2 py-1.5 font-medium">เกณฑ์</th>
                      <th className="border border-slate-200 px-2 py-1.5 text-center font-medium">ระดับ</th>
                      <th className="border border-slate-200 px-2 py-1.5 font-medium">ระดับที่ประเมินได้ (ตามแบบฟอร์ม)</th>
                      <th className="border border-slate-200 px-2 py-1.5 text-center font-medium">คะแนน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CRITERIA.map((c) => {
                      const p = assessment.scores[scoreKey(c.id)];
                      const lv = typeof p === "number" ? criterionLevel(c, p) : undefined;
                      return (
                        <tr key={c.id} className="align-top">
                          <td className="border border-slate-200 px-2 py-1.5 font-medium text-slate-900">
                            {c.id}. {c.name}
                          </td>
                          <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-900">{p ?? "—"}</td>
                          <td className="border border-slate-200 px-2 py-1.5 text-slate-700">
                            {lv ? (
                              <>
                                <span className="font-medium text-slate-900">{lv.title}</span>
                                {lv.description && <span className="text-slate-600"> — {lv.description}</span>}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="border border-slate-200 px-2 py-1.5 text-center font-semibold text-teal-800">{typeof p === "number" ? p * 2 : "—"}/10</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-slate-50 font-semibold">
                      <td className="border border-slate-200 px-2 py-1.5 text-slate-900" colSpan={3}>
                        รวม
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-teal-800">{assessment.totalScore}/100</td>
                    </tr>
                  </tbody>
                </table>

                {plan && (
                  <section className="mt-6">
                    <h2 className="text-sm font-semibold text-slate-900">แผนพัฒนารายบุคคล</h2>
                    <p className="text-xs text-slate-600">
                      เรียงจากเกณฑ์ที่ได้ระดับต่ำสุด แต่ละข้อคือระดับถัดไปตามแบบฟอร์ม (+2 คะแนน/เกณฑ์)
                      {plan.mastered.length > 0 && ` · อยู่ระดับสูงสุดแล้ว ${plan.mastered.length} เกณฑ์`}
                    </p>
                    {plan.items.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-700">ทุกเกณฑ์อยู่ในระดับสูงสุดแล้ว</p>
                    ) : (
                      <ol className="mt-2 space-y-1.5 text-sm">
                        {plan.items.map((it) => (
                          <li key={it.criterion.id} className="rounded-lg border border-slate-200 px-3 py-2">
                            <span className="font-medium text-slate-900">
                              {it.criterion.id}. {it.criterion.name}
                            </span>{" "}
                            <span className="text-slate-600">(ระดับ {it.point} → {it.next?.point})</span>
                            {it.next && (
                              <p className="mt-0.5 text-slate-700">
                                {it.next.title}
                                {it.next.description ? ` — ${it.next.description}` : ""}
                              </p>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                )}

                {trend.length >= 2 && (
                  <section className="mt-6">
                    <h2 className="text-sm font-semibold text-slate-900">แนวโน้มคะแนนรวมทุกครั้งที่ประเมิน</h2>
                    <TrendChart points={trend} />
                  </section>
                )}

                {assessment.note && (
                  <section className="mt-6 text-sm">
                    <h2 className="font-semibold text-slate-900">หมายเหตุ</h2>
                    <p className="mt-1 whitespace-pre-line text-slate-700">{assessment.note}</p>
                  </section>
                )}

                <section className="mt-10 grid grid-cols-1 gap-8 text-center text-sm sm:grid-cols-3">
                  {["ผู้ประเมิน", "ผู้รับการประเมิน", "หัวหน้าหน่วยไตเทียม"].map((role) => (
                    <div key={role}>
                      <div className="mx-auto h-10 w-48 border-b border-slate-400" aria-hidden />
                      <p className="mt-2 text-slate-700">({role})</p>
                      <p className="text-xs text-slate-600">วันที่ ______ / ______ / ______</p>
                    </div>
                  ))}
                </section>

                <footer className="mt-8 border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-600">
                  เกณฑ์ระดับ: {COMPETENCY_LEVELS.map((l) => `LEVEL ${l.level} ${l.thName} (${l.band})`).join(" · ")}. คะแนนต่อเกณฑ์ = ระดับ × 2;
                  ระดับรวมคำนวณจากคะแนนรวมโดยตรงตามแบบฟอร์มต้นฉบับ ไม่มีการถ่วงน้ำหนัก
                </footer>
              </>
            )}
          </article>
        )}
      </main>
    </>
  );
}
