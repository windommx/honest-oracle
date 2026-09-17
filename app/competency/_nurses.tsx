"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardPlus, Eye, FileText, History, PencilLine, Search, Trash2, UserPlus, Users } from "lucide-react";
import { CRITERIA, DEFAULT_POSITION, POSITION_SUGGESTIONS } from "@/lib/competency/criteria";
import { developmentPlan, levelInfo, scoreKey } from "@/lib/competency/scoring";
import { formatThaiDate } from "@/lib/competency/format";
import type { AssessmentDTO, CriterionAverage, NurseDetailDTO, NurseDTO } from "@/lib/competency/types";
import { api, errorMessage } from "./_api";
import { RadarChart, TEAM_COLOR, TrendChart } from "./_charts";
import { ACCENT } from "./_tokens";
import { toast } from "./_toast";
import { Button, Card, ConfirmDialog, cx, ErrorState, Field, inputClass, LevelBadge, MgmtBadge, Modal, NotAssessedBadge, Pips, Skeleton, Spinner } from "./_ui";
import type { EditTarget } from "./_assessment-form";

interface NursesTabProps {
  refreshKey: number;
  onDataChanged: () => void;
  onAssess: (nurseId: string) => void;
  onEditAssessment: (target: EditTarget) => void;
}

type SortKey = "name" | "score" | "date";

interface NurseFormState {
  fullName: string;
  nickname: string;
  position: string;
  mgmtLevel: "" | "6" | "7";
}

const emptyForm = (): NurseFormState => ({ fullName: "", nickname: "", position: DEFAULT_POSITION, mgmtLevel: "" });

export function NursesTab({ refreshKey, onDataChanged, onAssess, onEditAssessment }: NursesTabProps) {
  const [nurses, setNurses] = useState<NurseDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name");

  // Detail dialog
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<NurseDetailDTO | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [teamAverages, setTeamAverages] = useState<CriterionAverage[]>([]);

  // Add / edit nurse dialog
  const [formOpen, setFormOpen] = useState(false);
  const [formTarget, setFormTarget] = useState<NurseDTO | null>(null); // null = adding
  const [form, setForm] = useState<NurseFormState>(emptyForm);
  const [formBusy, setFormBusy] = useState(false);

  // Confirmations
  const [deleteNurse, setDeleteNurse] = useState<NurseDTO | null>(null);
  const [deleteAssessment, setDeleteAssessment] = useState<AssessmentDTO | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.nurses
      .list()
      .then((list) => {
        if (!cancelled) setNurses(list);
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
  }, [refreshKey, attempt]);

  // Load the profile (and the team means for the radar) whenever the dialog opens or data changes.
  useEffect(() => {
    if (!detailId) return;
    let cancelled = false;
    setDetailLoading(true);
    Promise.all([api.nurses.get(detailId), api.dashboard().then((d) => d.criteriaAverages).catch(() => [] as CriterionAverage[])])
      .then(([n, avg]) => {
        if (cancelled) return;
        setDetail(n);
        setTeamAverages(avg);
      })
      .catch((e) => {
        if (cancelled) return;
        toast(errorMessage(e, "โหลดข้อมูลพยาบาลไม่สำเร็จ"), { variant: "error" });
        setDetailId(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailId, refreshKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? nurses.filter((n) => n.fullName.toLowerCase().includes(q) || (n.nickname ?? "").toLowerCase().includes(q) || n.position.toLowerCase().includes(q))
      : nurses;
    return [...list].sort((a, b) => {
      if (sort === "score") return (b.latest?.totalScore ?? -1) - (a.latest?.totalScore ?? -1) || a.fullName.localeCompare(b.fullName, "th");
      if (sort === "date") return (b.latest?.assessDate ?? "").localeCompare(a.latest?.assessDate ?? "") || a.fullName.localeCompare(b.fullName, "th");
      return a.fullName.localeCompare(b.fullName, "th");
    });
  }, [nurses, search, sort]);

  function openAdd() {
    setFormTarget(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(n: NurseDTO) {
    setFormTarget(n);
    setForm({ fullName: n.fullName, nickname: n.nickname ?? "", position: n.position, mgmtLevel: n.mgmtLevel === 6 || n.mgmtLevel === 7 ? (String(n.mgmtLevel) as "6" | "7") : "" });
    setFormOpen(true);
  }

  async function submitForm() {
    if (!form.fullName.trim()) {
      toast("กรุณาระบุชื่อ-นามสกุล", { variant: "error" });
      return;
    }
    const input = {
      fullName: form.fullName.trim(),
      nickname: form.nickname.trim() || null,
      position: form.position.trim() || DEFAULT_POSITION,
      mgmtLevel: form.mgmtLevel ? (Number(form.mgmtLevel) as 6 | 7) : null,
    };
    setFormBusy(true);
    try {
      if (formTarget) {
        await api.nurses.update(formTarget.id, input);
        toast(`แก้ไขข้อมูล "${input.fullName}" แล้ว`, { variant: "success" });
      } else {
        await api.nurses.create(input);
        toast(`เพิ่มพยาบาล "${input.fullName}" แล้ว`, { variant: "success" });
      }
      setFormOpen(false);
      onDataChanged();
    } catch (e) {
      toast(errorMessage(e, "บันทึกไม่สำเร็จ"), { variant: "error" });
    } finally {
      setFormBusy(false);
    }
  }

  async function confirmDeleteNurse() {
    if (!deleteNurse) return;
    setConfirmBusy(true);
    try {
      await api.nurses.remove(deleteNurse.id);
      toast(`ลบ "${deleteNurse.fullName}" และผลประเมิน ${deleteNurse.assessmentCount} ครั้งแล้ว`, { variant: "success" });
      setDeleteNurse(null);
      if (detailId === deleteNurse.id) setDetailId(null);
      onDataChanged();
    } catch (e) {
      toast(errorMessage(e, "ลบไม่สำเร็จ — ข้อมูลยังอยู่"), { variant: "error" });
    } finally {
      setConfirmBusy(false);
    }
  }

  async function confirmDeleteAssessment() {
    if (!deleteAssessment) return;
    setConfirmBusy(true);
    try {
      await api.assessments.remove(deleteAssessment.id);
      toast(`ลบผลประเมินวันที่ ${formatThaiDate(deleteAssessment.assessDate)} แล้ว`, { variant: "success" });
      setDeleteAssessment(null);
      onDataChanged();
    } catch (e) {
      toast(errorMessage(e, "ลบไม่สำเร็จ — ผลประเมินยังอยู่"), { variant: "error" });
    } finally {
      setConfirmBusy(false);
    }
  }

  const latest = detail?.latest ?? null;
  const plan = useMemo(() => (latest ? developmentPlan(latest.scores) : null), [latest]);
  const radarSeries = useMemo(() => {
    if (!latest) return [];
    const mine = CRITERIA.map((c) => latest.scores[scoreKey(c.id)] ?? 0);
    const series = [{ name: detail?.nickname || detail?.fullName || "พยาบาล", values: mine, color: ACCENT, fillOpacity: 0.35 }];
    if (teamAverages.length) {
      series.unshift({ name: "ค่าเฉลี่ยทีม", values: CRITERIA.map((c) => teamAverages.find((t) => t.criterionId === c.id)?.averagePoint ?? 0), color: TEAM_COLOR, fillOpacity: 0.18 });
    }
    return series;
  }, [latest, teamAverages, detail]);
  const trendPoints = useMemo(
    () =>
      detail
        ? [...detail.assessments].reverse().map((a) => ({ label: formatThaiDate(a.assessDate), value: a.totalScore, level: a.level }))
        : [],
    [detail]
  );

  if (loading && nurses.length === 0 && !error) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="กำลังโหลดรายชื่อ">
        <Skeleton className="h-14" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => setAttempt((a) => a + 1)} />;
  }

  return (
    <div className="space-y-4">
      <Card
        title={
          <span className="flex items-center gap-2">
            <Users className="h-5 w-5 text-teal-700" aria-hidden />
            รายชื่อพยาบาลหน่วยไตเทียม
          </span>
        }
        description={`ทั้งหมด ${nurses.length} คน — เปิดโปรไฟล์เพื่อดูสมรรถนะรายเกณฑ์ แผนพัฒนา และประวัติการประเมิน`}
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-600" aria-hidden />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อ / ชื่อเล่น / ตำแหน่ง"
                aria-label="ค้นหาพยาบาล"
                className={cx(inputClass, "pl-9 sm:w-60")}
              />
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="เรียงลำดับ" className={cx(inputClass, "w-auto")}>
              <option value="name">เรียงตามชื่อ</option>
              <option value="score">เรียงตามคะแนนล่าสุด</option>
              <option value="date">เรียงตามวันที่ประเมิน</option>
            </select>
            <Button onClick={openAdd}>
              <UserPlus className="h-4 w-4" aria-hidden />
              เพิ่มพยาบาล
            </Button>
          </>
        }
        bodyClassName="px-0 py-0 sm:px-0"
      >
        <div className="max-h-[36rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">ชื่อ-นามสกุล</th>
                <th className="px-3 py-2 text-center font-medium">คะแนนล่าสุด</th>
                <th className="px-3 py-2 text-center font-medium">ระดับ</th>
                <th className="hidden px-3 py-2 text-center font-medium md:table-cell">วันที่ประเมิน</th>
                <th className="hidden px-3 py-2 text-center font-medium sm:table-cell">ครั้ง</th>
                <th className="px-3 py-2 text-center font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-slate-600">
                    {search ? "ไม่พบพยาบาลที่ค้นหา" : "ยังไม่มีรายชื่อพยาบาล — กด “เพิ่มพยาบาล” เพื่อเริ่มต้น"}
                  </td>
                </tr>
              )}
              {filtered.map((n) => (
                <tr key={n.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{n.fullName}</div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                      {n.nickname ? `(${n.nickname}) ` : ""}
                      {n.position}
                      <MgmtBadge level={n.mgmtLevel} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {n.latest ? <span className="text-lg font-bold text-teal-800">{n.latest.totalScore}</span> : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">{n.latest ? <LevelBadge level={n.latest.level} /> : <NotAssessedBadge />}</td>
                  <td className="hidden px-3 py-2 text-center text-slate-700 md:table-cell">{n.latest ? formatThaiDate(n.latest.assessDate) : "—"}</td>
                  <td className="hidden px-3 py-2 text-center text-slate-700 sm:table-cell">{n.assessmentCount}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-0.5">
                      <Button size="sm" variant="ghost" onClick={() => setDetailId(n.id)} aria-label={`ดูรายละเอียดของ ${n.fullName}`}>
                        <Eye className="h-4 w-4" aria-hidden />
                        <span className="hidden lg:inline">รายละเอียด</span>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onAssess(n.id)} aria-label={`ประเมิน ${n.fullName}`}>
                        <ClipboardPlus className="h-4 w-4" aria-hidden />
                        <span className="hidden lg:inline">ประเมิน</span>
                      </Button>
                      <button
                        onClick={() => setDeleteNurse(n)}
                        aria-label={`ลบ ${n.fullName}`}
                        className="rounded-lg p-1.5 text-red-700 transition hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Profile dialog ── */}
      <Modal
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        size="lg"
        title={
          detail ? (
            <span className="flex flex-wrap items-center gap-2">
              {detail.fullName}
              {detail.nickname && <span className="text-sm font-normal text-slate-600">({detail.nickname})</span>}
              <MgmtBadge level={detail.mgmtLevel} />
            </span>
          ) : (
            "โปรไฟล์พยาบาล"
          )
        }
        description={detail ? `${detail.position} · ประเมินแล้ว ${detail.assessmentCount} ครั้ง` : undefined}
      >
        {detailLoading && !detail ? (
          <Spinner label="กำลังโหลดโปรไฟล์" />
        ) : detail ? (
          <div className="space-y-5">
            {latest ? (
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-teal-100 bg-teal-50/60 p-4">
                <div>
                  <p className="text-xs text-slate-600">คะแนนรวมล่าสุด (เต็ม 100)</p>
                  <p className="text-3xl font-bold text-teal-800">{latest.totalScore}</p>
                </div>
                <LevelBadge level={latest.level} showBand className="text-sm" />
                {plan?.next && (
                  <p className="text-xs text-slate-600">
                    อีก <span className="font-semibold text-slate-900">{plan.next.pointsNeeded}</span> คะแนนถึง LEVEL {plan.next.level.level} {plan.next.level.thName}
                  </p>
                )}
                <span className="ml-auto text-sm text-slate-600">
                  {formatThaiDate(latest.assessDate)}
                  {latest.assessor ? ` · ${latest.assessor}` : ""}
                </span>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">ยังไม่มีผลการประเมินสำหรับพยาบาลคนนี้</div>
            )}

            {latest && plan && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">โปรไฟล์สมรรถนะรายเกณฑ์</p>
                  <p className="text-xs text-slate-600">ระดับ 1-5 ต่อเกณฑ์ เทียบกับค่าเฉลี่ยของหน่วย</p>
                  <RadarChart axes={CRITERIA.map((c) => c.shortName)} series={radarSeries} />
                  <ul className="flex flex-wrap justify-center gap-4 text-xs text-slate-600">
                    {radarSeries.map((s) => (
                      <li key={s.name} className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                        {s.name}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-900">คะแนนรายเกณฑ์ (ผลล่าสุด)</p>
                  <ul className="space-y-1.5">
                    {CRITERIA.map((c) => {
                      const p = latest.scores[scoreKey(c.id)] ?? 0;
                      return (
                        <li key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-teal-700 text-[10px] font-bold text-white">{c.id}</span>
                          <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{c.name}</span>
                          <Pips point={p} />
                          <span className="w-12 shrink-0 text-right text-xs font-bold text-teal-800">{p * 2}/10</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}

            {plan && plan.items.length > 0 && (
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">แผนพัฒนา — เกณฑ์ที่ควรยกระดับก่อน</p>
                  <Link href={`/competency/report/${detail.id}`} className="text-xs font-medium text-teal-700 hover:underline">
                    ดูแผนทั้งหมดในรายงาน →
                  </Link>
                </div>
                <p className="text-xs text-slate-600">อ่านจากแบบฟอร์มโดยตรง: ระดับที่ได้ตอนนี้ และสิ่งที่ต้องทำได้เพื่อขึ้นระดับถัดไป (+2 คะแนน/เกณฑ์)</p>
                <ol className="mt-3 space-y-2">
                  {plan.items.slice(0, 3).map((it) => (
                    <li key={it.criterion.id} className="rounded-lg bg-slate-50 p-3 text-xs">
                      <p className="font-semibold text-slate-900">
                        {it.criterion.id}. {it.criterion.name} — ตอนนี้ระดับ {it.point}: {it.current.title}
                      </p>
                      {it.next && (
                        <p className="mt-1 text-slate-700">
                          <span className="font-medium text-teal-800">→ ระดับ {it.next.point}:</span> {it.next.title}
                          {it.next.description ? ` — ${it.next.description}` : ""}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {trendPoints.length >= 2 && (
              <div>
                <p className="text-sm font-semibold text-slate-900">แนวโน้มคะแนนรวม</p>
                <p className="text-xs text-slate-600">ตามลำดับครั้งที่ประเมิน (เส้นประคือขอบล่างของแต่ละระดับ)</p>
                <TrendChart points={trendPoints} />
              </div>
            )}

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <History className="h-4 w-4 text-teal-700" aria-hidden />
                ประวัติการประเมิน
              </p>
              {detail.assessments.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-600">ยังไม่มีประวัติการประเมิน</p>
              ) : (
                <ul className="space-y-2">
                  {detail.assessments.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">{formatThaiDate(a.assessDate)}</p>
                        <p className="text-xs text-slate-600">
                          ผู้ประเมิน: {a.assessor || "ไม่ระบุ"}
                          {a.note ? ` · ${a.note}` : ""}
                        </p>
                      </div>
                      <span className="text-lg font-bold text-teal-800">{a.totalScore}</span>
                      <LevelBadge level={a.level} />
                      <Link
                        href={`/competency/report/${detail.id}?a=${a.id}`}
                        aria-label={`รายงานผลประเมินวันที่ ${formatThaiDate(a.assessDate)}`}
                        className="rounded-lg p-1.5 text-teal-700 transition hover:bg-teal-50"
                      >
                        <FileText className="h-4 w-4" aria-hidden />
                      </Link>
                      <button
                        onClick={() => onEditAssessment({ nurse: { id: detail.id, fullName: detail.fullName, nickname: detail.nickname }, assessment: a })}
                        aria-label={`แก้ไขผลประเมินวันที่ ${formatThaiDate(a.assessDate)}`}
                        className="rounded-lg p-1.5 text-slate-700 transition hover:bg-slate-100"
                      >
                        <PencilLine className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        onClick={() => setDeleteAssessment(a)}
                        aria-label={`ลบผลประเมินวันที่ ${formatThaiDate(a.assessDate)}`}
                        className="rounded-lg p-1.5 text-red-700 transition hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => openEdit(detail)}>
                  <PencilLine className="h-4 w-4" aria-hidden />
                  แก้ไขข้อมูล
                </Button>
                <Button variant="danger-outline" size="sm" onClick={() => setDeleteNurse(detail)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  ลบพยาบาลรายนี้
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {latest && (
                  <Link
                    href={`/competency/report/${detail.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-teal-600 hover:text-teal-800"
                  >
                    <FileText className="h-4 w-4" aria-hidden />
                    รายงาน / พิมพ์
                  </Link>
                )}
                <Button size="sm" onClick={() => onAssess(detail.id)}>
                  <ClipboardPlus className="h-4 w-4" aria-hidden />
                  ประเมินครั้งใหม่
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* ── Add / edit nurse ── */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="sm"
        title={formTarget ? "แก้ไขข้อมูลพยาบาล" : "เพิ่มพยาบาลใหม่"}
        description={formTarget ? undefined : "เพิ่มรายชื่อเข้าสู่หน่วย (ยังไม่บันทึกผลประเมิน)"}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submitForm();
          }}
        >
          <Field label="ชื่อ-นามสกุล" htmlFor="nf-fullname" required>
            <input id="nf-fullname" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="เช่น คุณสมหญิง ใจดี" className={inputClass} />
          </Field>
          <Field label="ชื่อเล่น" htmlFor="nf-nickname">
            <input id="nf-nickname" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} className={inputClass} />
          </Field>
          <Field label="ตำแหน่ง" htmlFor="nf-position">
            <input id="nf-position" list="nf-position-options" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className={inputClass} />
            <datalist id="nf-position-options">
              {POSITION_SUGGESTIONS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <Field label="ระดับบริหาร (ถ้ามี)" htmlFor="nf-mgmt" hint="LEVEL 6-7 กำหนดตามตำแหน่ง ไม่ได้มาจากคะแนน">
            <select id="nf-mgmt" value={form.mgmtLevel} onChange={(e) => setForm({ ...form, mgmtLevel: e.target.value as "" | "6" | "7" })} className={inputClass}>
              <option value="">ไม่มี</option>
              <option value="6">LEVEL 6 · หัวหน้าแผนก (Top Manager)</option>
              <option value="7">LEVEL 7 · ผู้จัดการศูนย์ (Director)</option>
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={formBusy}>
              ยกเลิก
            </Button>
            <Button type="submit" busy={formBusy}>
              {formTarget ? "บันทึกการแก้ไข" : "เพิ่มพยาบาล"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteNurse !== null}
        title="ยืนยันการลบพยาบาล"
        danger
        confirmLabel="ลบ"
        busy={confirmBusy}
        onCancel={() => setDeleteNurse(null)}
        onConfirm={confirmDeleteNurse}
        description={
          deleteNurse && (
            <>
              ต้องการลบ <span className="font-semibold">“{deleteNurse.fullName}”</span> หรือไม่? ผลการประเมินทั้งหมด {deleteNurse.assessmentCount} ครั้งจะถูกลบด้วย
              และไม่สามารถกู้คืนได้
            </>
          )
        }
      />
      <ConfirmDialog
        open={deleteAssessment !== null}
        title="ยืนยันการลบผลประเมิน"
        danger
        confirmLabel="ลบ"
        busy={confirmBusy}
        onCancel={() => setDeleteAssessment(null)}
        onConfirm={confirmDeleteAssessment}
        description={
          deleteAssessment && (
            <>
              ลบผลการประเมินวันที่ {formatThaiDate(deleteAssessment.assessDate)} (คะแนน {deleteAssessment.totalScore} · LEVEL {deleteAssessment.level}{" "}
              {levelInfo(deleteAssessment.level).thName}) หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้
            </>
          )
        }
      />
    </div>
  );
}
