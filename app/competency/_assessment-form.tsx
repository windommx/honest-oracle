"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, PencilLine, RotateCcw, Save, Users } from "lucide-react";
import { CRITERIA, DEFAULT_POSITION, POSITION_SUGGESTIONS } from "@/lib/competency/criteria";
import { bandOf, levelInfo, scoreKey, totalFromLevels, validateScores, type Scores } from "@/lib/competency/scoring";
import { formatThaiDate, toDateInputValue } from "@/lib/competency/format";
import type { AssessmentDTO, NurseDTO } from "@/lib/competency/types";
import { api, errorMessage } from "./_api";
import { toast } from "./_toast";
import { Button, Card, cx, Field, inputClass, LevelBadge, MgmtBadge } from "./_ui";

export interface EditTarget {
  nurse: { id: string; fullName: string; nickname: string | null };
  assessment: AssessmentDTO;
}

interface AssessmentFormProps {
  refreshKey: number;
  /** Pre-select this nurse (from "ประเมิน" buttons elsewhere). */
  preselectNurseId?: string | null;
  /** When set, the form edits this assessment (PATCH) instead of creating one. */
  editing?: EditTarget | null;
  onSaved: (assessment: AssessmentDTO, wasEdit: boolean) => void;
  onCancelEdit?: () => void;
}

/** Today's calendar day where the assessor sits — the form's default date. */
function todayInput(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function AssessmentForm({ refreshKey, preselectNurseId, editing, onSaved, onCancelEdit }: AssessmentFormProps) {
  const [nurses, setNurses] = useState<NurseDTO[]>([]);
  const [nursesError, setNursesError] = useState<string | null>(null);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedNurseId, setSelectedNurseId] = useState("");
  const [fullName, setFullName] = useState("");
  const [nickname, setNickname] = useState("");
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const [mgmtLevel, setMgmtLevel] = useState<"" | "6" | "7">("");
  const [assessDate, setAssessDate] = useState(todayInput);
  const [assessor, setAssessor] = useState("");
  const [note, setNote] = useState("");
  const [levels, setLevels] = useState<Partial<Scores>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.nurses
      .list()
      .then((list) => {
        if (!cancelled) {
          setNurses(list);
          setNursesError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setNursesError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (preselectNurseId) {
      setMode("existing");
      setSelectedNurseId(preselectNurseId);
    }
  }, [preselectNurseId]);

  useEffect(() => {
    if (!editing) return;
    setMode("existing");
    setSelectedNurseId(editing.nurse.id);
    setLevels({ ...editing.assessment.scores });
    setAssessDate(toDateInputValue(editing.assessment.assessDate));
    setAssessor(editing.assessment.assessor ?? "");
    setNote(editing.assessment.note ?? "");
  }, [editing]);

  const totalScore = useMemo(() => totalFromLevels(levels), [levels]);
  const validation = useMemo(() => validateScores(levels), [levels]);
  const selectedCount = CRITERIA.length - validation.missing.length;
  const previewLevel = validation.ok ? bandOf(totalScore) : null;
  const selectedNurse = nurses.find((n) => n.id === selectedNurseId) ?? null;

  function setLevel(criterionId: number, point: number) {
    setLevels((prev) => ({ ...prev, [scoreKey(criterionId)]: point }));
  }

  function resetScores() {
    setLevels({});
    setNote("");
  }

  function resetAll() {
    resetScores();
    setSelectedNurseId("");
    setFullName("");
    setNickname("");
    setPosition(DEFAULT_POSITION);
    setMgmtLevel("");
    setAssessDate(todayInput());
  }

  async function save() {
    if (!editing && mode === "existing" && !selectedNurseId) {
      toast("กรุณาเลือกพยาบาลที่จะประเมิน", { variant: "error" });
      return;
    }
    if (!editing && mode === "new" && !fullName.trim()) {
      toast("กรุณาระบุชื่อ-นามสกุลของพยาบาลใหม่", { variant: "error" });
      return;
    }
    if (!validation.ok) {
      toast(`ประเมินยังไม่ครบ — เหลืออีก ${validation.missing.length} เกณฑ์: ${validation.message}`, { variant: "error" });
      return;
    }
    if (!assessDate) {
      toast("กรุณาระบุวันที่ประเมิน", { variant: "error" });
      return;
    }
    const scores = levels as Scores;
    setSaving(true);
    try {
      let saved: AssessmentDTO;
      if (editing) {
        saved = await api.assessments.update(editing.assessment.id, {
          scores,
          assessDate,
          assessor: assessor.trim() || null,
          note: note.trim() || null,
        });
      } else {
        saved = await api.assessments.create({
          ...(mode === "existing"
            ? { nurseId: selectedNurseId }
            : {
                nurse: {
                  fullName: fullName.trim(),
                  nickname: nickname.trim() || null,
                  position: position.trim() || DEFAULT_POSITION,
                  mgmtLevel: mgmtLevel ? (Number(mgmtLevel) as 6 | 7) : null,
                },
              }),
          scores,
          assessDate,
          assessor: assessor.trim() || null,
          note: note.trim() || null,
        });
      }
      const info = levelInfo(saved.level);
      toast(`${editing ? "แก้ไข" : "บันทึก"}ผลการประเมินสำเร็จ — ${saved.totalScore}/100 · LEVEL ${info.level} ${info.thName} (${info.enName})`, {
        variant: "success",
      });
      if (!editing) {
        // Keep nurse/date/assessor for the next entry in the same sitting; clear the scores.
        resetScores();
        if (mode === "new") {
          setFullName("");
          setNickname("");
          setPosition(DEFAULT_POSITION);
          setMgmtLevel("");
          setMode("existing");
        }
      }
      onSaved(saved, Boolean(editing));
    } catch (e) {
      toast(errorMessage(e, "บันทึกไม่สำเร็จ"), { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 pb-28">
      {editing ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-amber-800">
            <PencilLine className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <p className="text-sm">
              กำลังแก้ไขผลประเมินของ <span className="font-semibold">{editing.nurse.fullName}</span>
              {editing.nurse.nickname ? ` (${editing.nurse.nickname})` : ""} วันที่ {formatThaiDate(editing.assessment.assessDate)} — คะแนนเดิม{" "}
              {editing.assessment.totalScore}/100
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onCancelEdit}>
            ยกเลิกการแก้ไข
          </Button>
        </div>
      ) : (
        <Card
          title={
            <span className="flex items-center gap-2">
              <Users className="h-5 w-5 text-teal-700" aria-hidden />
              ผู้ถูกประเมิน
            </span>
          }
          description="เลือกจากรายชื่อในหน่วย หรือเพิ่มพยาบาลใหม่พร้อมบันทึกผลครั้งแรก"
        >
          <div role="radiogroup" aria-label="แหล่งที่มาของผู้ถูกประเมิน" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                ["existing", "เลือกจากรายชื่อเดิม", "พยาบาลที่มีข้อมูลอยู่ในระบบแล้ว"],
                ["new", "เพิ่มพยาบาลใหม่", "บันทึกรายชื่อใหม่พร้อมผลประเมินครั้งนี้"],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={cx(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition",
                  mode === value ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600" : "border-slate-200 hover:border-teal-400"
                )}
              >
                <input
                  type="radio"
                  name="nurse-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="mt-1 h-4 w-4 accent-teal-700"
                />
                <span>
                  <span className="block font-medium text-slate-900">{label}</span>
                  <span className="block text-xs text-slate-600">{hint}</span>
                </span>
              </label>
            ))}
          </div>

          {mode === "existing" ? (
            <div className="mt-4">
              <Field label="พยาบาล" htmlFor="nurse-select" required hint={nursesError ?? undefined}>
                <select
                  id="nurse-select"
                  value={selectedNurseId}
                  onChange={(e) => setSelectedNurseId(e.target.value)}
                  className={cx(inputClass, "sm:max-w-md")}
                >
                  <option value="">— เลือกพยาบาล —</option>
                  {nurses.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.fullName}
                      {n.nickname ? ` (${n.nickname})` : ""}
                      {n.latest ? ` — ล่าสุด ${n.latest.totalScore} คะแนน L${n.latest.level}` : " — ยังไม่ประเมิน"}
                    </option>
                  ))}
                </select>
              </Field>
              {nurses.length === 0 && !nursesError && (
                <p className="mt-2 text-xs text-slate-600">ยังไม่มีรายชื่อในระบบ — เลือก &quot;เพิ่มพยาบาลใหม่&quot; เพื่อเริ่มต้น</p>
              )}
              {selectedNurse && (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  {selectedNurse.position}
                  <MgmtBadge level={selectedNurse.mgmtLevel} />
                  {selectedNurse.latest && (
                    <>
                      · ผลล่าสุด {formatThaiDate(selectedNurse.latest.assessDate)} <LevelBadge level={selectedNurse.latest.level} />
                    </>
                  )}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="ชื่อ-นามสกุล" htmlFor="new-fullname" required>
                <input id="new-fullname" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="เช่น คุณสมหญิง ใจดี" className={inputClass} />
              </Field>
              <Field label="ชื่อเล่น" htmlFor="new-nickname">
                <input id="new-nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="เช่น หญิง" className={inputClass} />
              </Field>
              <Field label="ตำแหน่ง" htmlFor="new-position">
                <input id="new-position" list="position-options" value={position} onChange={(e) => setPosition(e.target.value)} className={inputClass} />
                <datalist id="position-options">
                  {POSITION_SUGGESTIONS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </Field>
              <Field label="ระดับบริหาร (ถ้ามี)" htmlFor="new-mgmt" hint="LEVEL 6-7 กำหนดตามตำแหน่ง ไม่ได้มาจากคะแนน">
                <select id="new-mgmt" value={mgmtLevel} onChange={(e) => setMgmtLevel(e.target.value as "" | "6" | "7")} className={inputClass}>
                  <option value="">ไม่มี</option>
                  <option value="6">LEVEL 6 · หัวหน้าแผนก (Top Manager)</option>
                  <option value="7">LEVEL 7 · ผู้จัดการศูนย์ (Director)</option>
                </select>
              </Field>
            </div>
          )}
        </Card>
      )}

      <Card title="ข้อมูลการประเมิน">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="วันที่ประเมิน" htmlFor="assess-date" required>
            <input id="assess-date" type="date" value={assessDate} onChange={(e) => setAssessDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="ผู้ประเมิน" htmlFor="assessor">
            <input id="assessor" value={assessor} onChange={(e) => setAssessor(e.target.value)} placeholder="เช่น หัวหน้าหน่วยไตเทียม" className={inputClass} />
          </Field>
          <Field label="หมายเหตุ" htmlFor="note">
            <input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ข้อสังเกตเพิ่มเติม (ถ้ามี)" className={inputClass} />
          </Field>
        </div>
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-teal-700" aria-hidden />
            แบบประเมิน 10 เกณฑ์
          </span>
        }
        description="เลือกระดับที่ตรงกับสมรรถนะจริงในแต่ละเกณฑ์ (ระดับ 1-5 = 2-10 คะแนน/เกณฑ์, รวมเต็ม 100) — ข้อความคือเกณฑ์ตามแบบฟอร์มต้นฉบับ"
        bodyClassName="space-y-4"
      >
        {CRITERIA.map((criterion) => {
          const selected = levels[scoreKey(criterion.id)];
          return (
            <fieldset key={criterion.id} className="rounded-xl border border-slate-200 p-3 sm:p-4">
              <legend className="flex flex-wrap items-center gap-2 px-1">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-xs font-bold text-white">{criterion.id}</span>
                <span className="font-semibold text-slate-900">{criterion.name}</span>
                {selected !== undefined && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-800 ring-1 ring-teal-200">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    ระดับ {selected} · {selected * 2} คะแนน
                  </span>
                )}
              </legend>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {criterion.levels.map((lv) => {
                  const isSelected = selected === lv.point;
                  return (
                    <button
                      key={lv.point}
                      type="button"
                      onClick={() => setLevel(criterion.id, lv.point)}
                      aria-pressed={isSelected}
                      aria-label={`เกณฑ์ ${criterion.id} ระดับ ${lv.point}: ${lv.title}`}
                      className={cx(
                        "rounded-lg border p-2.5 text-left transition",
                        isSelected ? "border-teal-600 bg-teal-50 ring-2 ring-teal-600/30" : "border-slate-200 bg-white hover:border-teal-400 hover:bg-teal-50/40"
                      )}
                    >
                      <span
                        className={cx(
                          "mb-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold",
                          isSelected ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700"
                        )}
                      >
                        ระดับ {lv.point} · {lv.point * 2} คะแนน
                      </span>
                      <span className="block text-xs font-semibold leading-snug text-slate-900">{lv.title}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-slate-600">{lv.description}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </Card>

      <div className="no-print fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-live="polite">
            <p className="text-sm text-slate-600">
              เลือกแล้ว{" "}
              <span className={cx("font-bold", validation.ok ? "text-teal-800" : "text-amber-800")} data-testid="selected-count">
                {selectedCount}/{CRITERIA.length}
              </span>{" "}
              เกณฑ์
            </p>
            <p className="text-sm text-slate-600">
              คะแนนรวม{" "}
              <span className="text-2xl font-bold text-teal-800" data-testid="total-score">
                {totalScore}
              </span>
              /100
            </p>
            {previewLevel !== null && <LevelBadge level={previewLevel} showBand />}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={editing ? resetScores : resetAll} disabled={saving}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              ล้างค่า
            </Button>
            <Button onClick={save} busy={saving}>
              <Save className="h-4 w-4" aria-hidden />
              {editing ? "บันทึกการแก้ไข" : "บันทึกผลประเมิน"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
