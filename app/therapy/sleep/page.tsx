"use client";

import { useEffect, useState } from "react";
import { SLEEP_REFERENCE, isValidEntry, metricsFor, summarise, type SleepDiaryEntry } from "@/lib/therapy-engine/sleep";
import { getIntervention } from "@/lib/therapy-engine/evidence";
import { WITHHELD_INSTRUMENTS } from "@/lib/therapy-engine/instruments";
import { toast } from "../../rush/_toast";
import { Card, CitationLine, Disclaimer, GradeBadge, PageHeader } from "../_components";
import { SEVERITY_COLOR } from "../_tokens";
import { browserStorage, readNights, upsertNight } from "../_store";
import { localDate } from "../_dates";
import { outcomeMessage, syncNight } from "../_sync";

const FIELDS = [
  { key: "timeInBedMin", th: "อยู่บนเตียงรวม (นาที)", hint: "ตั้งแต่ปิดไฟจนลุกจากเตียง" },
  { key: "sleepLatencyMin", th: "ใช้เวลานานแค่ไหนกว่าจะหลับ (นาที)", hint: "" },
  { key: "wakeAfterSleepOnsetMin", th: "ตื่นกลางดึกรวม (นาที)", hint: "รวมทุกครั้งที่ตื่นระหว่างคืน" },
  { key: "terminalWakefulnessMin", th: "ตื่นแล้วนอนต่อบนเตียง (นาที)", hint: "หลังตื่นครั้งสุดท้าย ก่อนลุก" },
  { key: "awakenings", th: "ตื่นกี่ครั้ง", hint: "" },
] as const;

// Local, not UTC: see _dates.ts — the UTC version defaulted the diary to the
// wrong night before 07:00 in Bangkok, and blocked selecting the right one.
const today = () => localDate();

const EMPTY: SleepDiaryEntry = {
  date: today(),
  timeInBedMin: 480,
  sleepLatencyMin: 20,
  wakeAfterSleepOnsetMin: 10,
  terminalWakefulnessMin: 0,
  awakenings: 1,
};

export default function SleepPage() {
  const [nights, setNights] = useState<SleepDiaryEntry[]>([]);
  const [form, setForm] = useState<SleepDiaryEntry>(EMPTY);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setNights(readNights(browserStorage()));
    setForm({ ...EMPTY, date: today() });
    setMounted(true);
  }, []);

  const valid = isValidEntry(form);
  const summary = summarise(nights);
  const cbti = getIntervention("cbti")!;

  async function save() {
    if (!valid) {
      toast("เวลาที่ตื่นรวมกันมากกว่าเวลาที่อยู่บนเตียง — ตรวจสอบตัวเลขอีกครั้ง", { variant: "error" });
      return;
    }
    setNights(upsertNight(browserStorage(), form));
    const outcome = await syncNight(form);
    toast(`บันทึกคืนวันที่ ${form.date} · ${outcomeMessage(outcome)}`, {
      variant: outcome === "failed" ? "error" : "success",
    });
  }

  return (
    <main className="max-w-3xl mx-auto px-5 py-12">
      <PageHeader
        eyebrow="บันทึกการนอน"
        title="วัดการนอน ไม่ใช่ให้คะแนนการนอน"
        lead="กรอกตัวเลขที่คุณสังเกตได้เอง แล้วระบบคำนวณเวลานอนจริงและประสิทธิภาพการนอนด้วยสูตรที่แสดงให้เห็น"
      />

      <Card className="mt-8">
        <label className="block">
          <span className="text-[0.7rem] text-faint">วันที่ (เช้าที่ตื่น)</span>
          <input
            type="date"
            className="input mt-1"
            value={form.date}
            max={today()}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-[0.7rem] text-faint">{f.th}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className="input mt-1 tabular-nums"
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: Math.max(0, Number(e.target.value) || 0) })}
              />
              {f.hint && <span className="block text-[0.65rem] text-faint mt-0.5">{f.hint}</span>}
            </label>
          ))}
        </div>

        {/* The derivation is shown live, before saving: the number is meant to be
            re-derivable by the person who typed the inputs. */}
        {valid ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
            <p className="text-[0.72rem] text-gray-400">{metricsFor(form).formulaTh}</p>
            <p className="mt-1.5 text-sm">
              <span className="text-gray-300">ประสิทธิภาพการนอน </span>
              <span
                className="font-semibold tabular-nums"
                style={{
                  color:
                    metricsFor(form).efficiencyPct >= SLEEP_REFERENCE.efficiencyPct
                      ? SEVERITY_COLOR.minimal
                      : SEVERITY_COLOR.moderate,
                }}
              >
                {metricsFor(form).efficiencyPct}%
              </span>
              <span className="text-faint"> (ค่าอ้างอิง ≥{SLEEP_REFERENCE.efficiencyPct}%)</span>
            </p>
          </div>
        ) : (
          <p className="mt-4 text-[0.72rem]" style={{ color: SEVERITY_COLOR.severe }}>
            เวลาที่ตื่นรวมกันมากกว่าเวลาที่อยู่บนเตียง — คืนนี้เป็นไปไม่ได้ตามตัวเลขที่กรอก
          </p>
        )}

        <button
          onClick={() => void save()}
          disabled={!valid}
          className="mt-4 px-5 py-2.5 rounded-lg bg-gold text-black font-semibold hover:bg-gold-light transition disabled:opacity-40"
        >
          บันทึกคืนนี้
        </button>
        <p className="mt-2 text-[0.68rem] text-faint">บันทึกวันเดิมซ้ำจะเป็นการแก้ไข ไม่ใช่การเพิ่มรายการใหม่</p>
      </Card>

      {/* summary */}
      <Card className="mt-4">
        <h2 className="font-semibold text-gray-100 text-sm">สรุป {mounted ? summary.nights : 0} คืนล่าสุด</h2>
        {mounted && summary.nights > 0 ? (
          <>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-2xl font-semibold tabular-nums text-gold">{summary.meanEfficiencyPct}%</p>
                <p className="text-[0.65rem] text-faint">ประสิทธิภาพเฉลี่ย</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-gold">
                  {Math.floor(summary.meanTotalSleepMin / 60)}:{String(summary.meanTotalSleepMin % 60).padStart(2, "0")}
                </p>
                <p className="text-[0.65rem] text-faint">เวลานอนเฉลี่ย (ชม.)</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-gold">{summary.nightsAboveLatencyThreshold}</p>
                <p className="text-[0.65rem] text-faint">คืนที่หลับยาก &gt;{SLEEP_REFERENCE.latencyMin} นาที</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-gold">{summary.nightsAboveWasoThreshold}</p>
                <p className="text-[0.65rem] text-faint">คืนที่ตื่นกลางดึก &gt;{SLEEP_REFERENCE.wasoMin} นาที</p>
              </div>
            </div>

            {summary.meetsFrequencyCriterion && (
              <p className="mt-4 text-sm" style={{ color: SEVERITY_COLOR.moderate }}>
                เข้าเกณฑ์เชิงปริมาณที่ใช้ในงานวิจัย — เป็นเรื่องที่ควรคุยกับผู้ให้บริการสุขภาพ ไม่ใช่การวินิจฉัยโรคนอนไม่หลับ
              </p>
            )}

            <p className="mt-3 text-[0.7rem] text-faint leading-relaxed">{summary.noteTh}</p>

            <ol className="mt-4 space-y-1 text-[0.72rem]">
              {[...nights].reverse().slice(0, 14).map((n) => {
                const m = metricsFor(n);
                return (
                  <li key={n.date} className="flex items-baseline justify-between text-gray-400">
                    <span className="tabular-nums">{n.date}</span>
                    <span className="tabular-nums">
                      {Math.floor(m.totalSleepMin / 60)}:{String(m.totalSleepMin % 60).padStart(2, "0")} ชม. ·{" "}
                      {m.efficiencyPct}%
                    </span>
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <p className="mt-2 text-sm text-faint">{summary.noteTh}</p>
        )}
      </Card>

      {/* why there is no sleep questionnaire here */}
      <Card className="mt-4">
        <h2 className="font-semibold text-gray-100 text-sm">ทำไมหน้านี้ไม่มีแบบประเมินการนอน</h2>
        <ul className="mt-2.5 space-y-2">
          {WITHHELD_INSTRUMENTS.filter((w) => /PSQI|ISI/.test(w.name)).map((w) => (
            <li key={w.name} className="text-[0.72rem] text-gray-400 leading-relaxed">
              <span className="text-gray-300">{w.name}</span> — {w.reasonTh}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[0.72rem] text-gray-400 leading-relaxed">
          ทางเลือกที่เหลือคือคิดแบบประเมินขึ้นเองแล้วตั้งชื่อว่า &ldquo;คะแนนการนอน 0–100&rdquo; ซึ่งจะแก้ปัญหาลิขสิทธิ์
          ด้วยการสร้างปัญหาที่แย่กว่า — ตัวเลขที่ไม่มีใครตรวจสอบได้ เราจึงวัดจากบันทึกของคุณเองแทน
        </p>
        <div className="mt-4">
          <Disclaimer>{SLEEP_REFERENCE.sourceTh}</Disclaimer>
        </div>
      </Card>

      {/* CBT-I */}
      <Card className="mt-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-medium text-gray-100 text-sm">{cbti.th}</h2>
          <GradeBadge grade={cbti.grade} />
        </div>
        <p className="mt-2 text-sm text-gray-400">{cbti.summaryTh}</p>
        <ul className="mt-3 space-y-1.5">
          {cbti.citations.map((c) => (
            <CitationLine key={c.title} c={c} />
          ))}
        </ul>
        <div className="mt-3">
          <Disclaimer>{cbti.limitationTh}</Disclaimer>
        </div>
      </Card>
    </main>
  );
}
