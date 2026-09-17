"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Award, ClipboardCheck, ClipboardPlus, FileText, Target, TrendingDown, Users } from "lucide-react";
import { COMPETENCY_LEVELS } from "@/lib/competency/criteria";
import { levelInfo } from "@/lib/competency/scoring";
import { formatThaiDate } from "@/lib/competency/format";
import type { DashboardDTO } from "@/lib/competency/types";
import { api, errorMessage } from "./_api";
import { HBarChart, LevelDistributionChart } from "./_charts";
import { toast } from "./_toast";
import { Button, Card, ErrorState, LevelBadge, MgmtBadge, NotAssessedBadge, Skeleton } from "./_ui";

interface OverviewTabProps {
  refreshKey: number;
  onDataChanged: () => void;
  onNavigate: (tab: "assess" | "nurses") => void;
  onAssess: (nurseId: string) => void;
}

export function OverviewTab({ refreshKey, onDataChanged, onNavigate, onAssess }: OverviewTabProps) {
  const [data, setData] = useState<DashboardDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .dashboard()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        // A failed load is a failed load — never render it as "nobody in the unit".
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, attempt]);

  const importSample = useCallback(async () => {
    setImporting(true);
    try {
      const { imported } = await api.importSample();
      toast(`นำเข้าข้อมูลตัวอย่าง ${imported} คน จากไฟล์ต้นฉบับแล้ว`, { variant: "success" });
      onDataChanged();
    } catch (e) {
      toast(errorMessage(e, "นำเข้าข้อมูลตัวอย่างไม่สำเร็จ"), { variant: "error" });
    } finally {
      setImporting(false);
    }
  }, [onDataChanged]);

  if (loading && !data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="กำลังโหลดภาพรวม">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <ErrorState message={error ?? "ไม่พบข้อมูล"} onRetry={() => setAttempt((a) => a + 1)} />;
  }

  const { summary, levelDistribution, criteriaAverages, weakestCriteria, ranking } = data;

  if (summary.totalNurses === 0) {
    return (
      <Card className="text-center" bodyClassName="py-12">
        <Users className="mx-auto h-12 w-12 text-teal-700" aria-hidden />
        <h2 className="mt-4 text-lg font-semibold text-slate-900">ยังไม่มีรายชื่อพยาบาลในหน่วยของคุณ</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          เริ่มจากบันทึกการประเมินคนแรก หรือโหลดข้อมูลตัวอย่าง 7 คนจากไฟล์ &quot;แบบประเมิน Level พยาบาลไตเทียม&quot;
          (ประเมิน 20 ธ.ค. 2562) เพื่อดูว่าแดชบอร์ดหน้าตาเป็นอย่างไร — ลบทิ้งได้ทุกเมื่อ
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={() => onNavigate("assess")}>
            <ClipboardPlus className="h-4 w-4" aria-hidden />
            บันทึกการประเมินคนแรก
          </Button>
          <Button variant="secondary" onClick={importSample} busy={importing}>
            นำเข้าข้อมูลตัวอย่าง 7 คน
          </Button>
        </div>
      </Card>
    );
  }

  const stats = [
    {
      title: "พยาบาลทั้งหมด",
      value: summary.totalNurses,
      unit: "คน",
      icon: Users,
      tone: "bg-teal-50 text-teal-800",
      sub: `บันทึกการประเมินรวม ${summary.totalAssessments} ครั้ง${summary.managementCount ? ` · ระดับบริหาร ${summary.managementCount} คน` : ""}`,
    },
    {
      title: "ประเมินแล้ว",
      value: summary.assessedCount,
      unit: "คน",
      icon: ClipboardCheck,
      tone: "bg-emerald-50 text-emerald-800",
      sub: summary.notAssessed > 0 ? `ยังไม่ประเมิน ${summary.notAssessed} คน` : "ประเมินครบทุกคน",
    },
    {
      title: "คะแนนเฉลี่ย (ผลล่าสุด)",
      value: summary.averageScore,
      unit: "/100",
      icon: Target,
      tone: "bg-amber-50 text-amber-800",
      sub: summary.latestAssessDate ? `ประเมินล่าสุด ${formatThaiDate(summary.latestAssessDate)}` : "ยังไม่มีผลประเมิน",
    },
    {
      title: "ระดับผู้ปฏิบัติขึ้นไป",
      value: summary.competentRate,
      unit: "%",
      icon: Award,
      tone: "bg-violet-50 text-violet-800",
      sub: `${summary.competentCount} จาก ${summary.assessedCount} คน (LEVEL 3-5)`,
    },
  ];

  const assessedRanking = ranking.filter((r) => r.latest);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.title} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${s.tone}`}>
              <s.icon className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-600">{s.title}</p>
              <p className="text-2xl font-bold tracking-tight text-slate-900">
                {s.value}
                <span className="ml-0.5 text-sm font-medium text-slate-600">{s.unit}</span>
              </p>
              <p className="truncate text-xs text-slate-600">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {weakestCriteria.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-amber-800">
            <TrendingDown className="h-5 w-5 shrink-0" aria-hidden />
            <p className="text-sm font-semibold">จุดที่ทีมควรพัฒนา (คะแนนเฉลี่ยต่ำสุด 3 เกณฑ์)</p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {weakestCriteria.map((c) => (
              <li key={c.criterionId} className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs text-slate-700">
                <span className="font-semibold">{c.criterionId}. {c.shortName}</span> เฉลี่ย {c.average}/10
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="การกระจายตามระดับ Competency" description="จำนวนพยาบาลแต่ละระดับ จากผลประเมินล่าสุดของแต่ละคน">
          <LevelDistributionChart data={levelDistribution} />
          <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
            {COMPETENCY_LEVELS.map((l) => (
              <li key={l.level} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} aria-hidden />
                L{l.level} {l.thName} ({l.band})
              </li>
            ))}
          </ul>
        </Card>

        <Card title="คะแนนเฉลี่ยรายเกณฑ์" description="เต็ม 10 คะแนนต่อเกณฑ์ เฉลี่ยจากผลประเมินล่าสุดของทุกคน">
          <HBarChart
            ariaLabel="คะแนนเฉลี่ยรายเกณฑ์ (เต็ม 10)"
            max={10}
            items={criteriaAverages.map((c) => ({
              key: String(c.criterionId),
              label: `${c.criterionId}. ${c.shortName}`,
              value: c.average,
              display: c.average.toFixed(1),
            }))}
          />
        </Card>
      </div>

      <Card title="คะแนนรวมรายบุคคล (ผลประเมินล่าสุด)" description="เต็ม 100 คะแนน — สีของแท่งคือระดับ Competency">
        {assessedRanking.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-600">ยังไม่มีผลการประเมิน</p>
        ) : (
          <div className="mx-auto max-w-3xl">
            {/* viewBox-scaled SVG: uncapped, a 1100px card rendered the labels at ~28px. */}
            <HBarChart
              ariaLabel="คะแนนรวมรายบุคคล (เต็ม 100)"
              max={100}
              labelWidth={170}
              items={assessedRanking.map((r) => ({
                key: r.nurseId,
                label: r.nickname || r.fullName,
                value: r.latest!.totalScore,
                display: `${r.latest!.totalScore} · L${r.latest!.level}`,
                color: levelInfo(r.latest!.level).color,
              }))}
            />
          </div>
        )}
      </Card>

      <Card
        title="ตารางสรุปผลการประเมิน"
        description="ผลประเมินล่าสุดของพยาบาลทุกคน เรียงตามคะแนนรวม (ตาราง OUTCOME ของแบบฟอร์ม)"
        actions={
          <a
            href={api.exportUrl}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-teal-600 hover:text-teal-800"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            ส่งออก CSV (เปิดใน Excel)
          </a>
        }
        bodyClassName="px-0 py-0 sm:px-0"
      >
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs text-slate-600">
              <tr>
                <th className="w-12 px-3 py-2 text-center font-medium">ลำดับ</th>
                <th className="px-3 py-2 font-medium">ชื่อ-นามสกุล</th>
                <th className="px-3 py-2 text-center font-medium">คะแนน (เต็ม 100)</th>
                <th className="px-3 py-2 text-center font-medium">ระดับ</th>
                <th className="hidden px-3 py-2 text-center font-medium md:table-cell">วันที่ประเมิน</th>
                <th className="hidden px-3 py-2 text-center font-medium sm:table-cell">ครั้ง</th>
                <th className="px-3 py-2 text-center font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ranking.map((row, idx) => (
                <tr key={row.nurseId} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-center text-slate-600">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{row.fullName}</div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                      {row.nickname ? `(${row.nickname}) ` : ""}
                      {row.position}
                      <MgmtBadge level={row.mgmtLevel} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {row.latest ? <span className="text-lg font-bold text-teal-800">{row.latest.totalScore}</span> : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">{row.latest ? <LevelBadge level={row.latest.level} /> : <NotAssessedBadge />}</td>
                  <td className="hidden px-3 py-2 text-center text-slate-700 md:table-cell">{row.latest ? formatThaiDate(row.latest.assessDate) : "—"}</td>
                  <td className="hidden px-3 py-2 text-center text-slate-700 sm:table-cell">{row.assessmentCount}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => onAssess(row.nurseId)}>
                        ประเมิน
                      </Button>
                      {row.latest && (
                        <Link
                          href={`/competency/report/${row.nurseId}`}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-teal-700 transition hover:bg-teal-50"
                        >
                          รายงาน
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
