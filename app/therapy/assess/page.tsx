"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { INSTRUMENT_LIST } from "@/lib/therapy-engine/instruments";
import { CUTPOINTS, interpret, score } from "@/lib/therapy-engine/scoring";
import { buildPlan } from "@/lib/therapy-engine/protocol";
import { summarise } from "@/lib/therapy-engine/sleep";
import type { Instrument, ScoreResult } from "@/lib/therapy-engine/types";
import { toast } from "../../rush/_toast";
import {
  Card,
  Chip,
  CitationLine,
  CrisisBanner,
  Disclaimer,
  GradeBadge,
  PageHeader,
  PrimaryLink,
  SecondaryLink,
  SeverityScale,
} from "../_components";
import { SEVERITY_COLOR } from "../_tokens";
import { addAssessment, browserStorage, readNights } from "../_store";
import { outcomeMessage, syncAssessment } from "../_sync";

/** Answers for one instrument, indexed by item position. `null` = unanswered,
 *  which is distinct from 0 ("ไม่มีเลย") — conflating the two would let a
 *  half-finished form score as if every skipped item were a zero. */
type Answers = (number | null)[];

const blank = (inst: Instrument): Answers => inst.items.map(() => null);

export default function AssessPage() {
  const [step, setStep] = useState(0); // index into INSTRUMENT_LIST
  const [answers, setAnswers] = useState<Answers[]>(INSTRUMENT_LIST.map(blank));
  const [item, setItem] = useState(0);
  const [done, setDone] = useState(false);
  const [savedWhere, setSavedWhere] = useState<string | null>(null);

  const instrument = INSTRUMENT_LIST[step];
  const current = answers[step];
  const answered = current.filter((a) => a !== null).length;

  const results = useMemo<ScoreResult[]>(() => {
    if (!done) return [];
    return INSTRUMENT_LIST.map((inst, i) => score(inst.id, answers[i] as number[]));
  }, [done, answers]);

  function choose(value: number) {
    const next = answers.map((a, i) => (i === step ? [...a] : a));
    next[step][item] = value;
    setAnswers(next);

    // Advance automatically — the whole instrument is one question repeated, so
    // a Next button on every item is friction with no decision behind it.
    if (item + 1 < instrument.items.length) {
      setItem(item + 1);
    } else if (step + 1 < INSTRUMENT_LIST.length) {
      setStep(step + 1);
      setItem(0);
    } else {
      void finish(next);
    }
  }

  async function finish(all: Answers[]) {
    setDone(true);
    const store = browserStorage();
    const at = Date.now();

    // Local first, always: the answers are recorded before any network call, so
    // a failed sync cannot lose them.
    INSTRUMENT_LIST.forEach((inst, i) => {
      addAssessment(store, { at, instrument: inst.id, responses: all[i] as number[] });
    });

    const outcomes = await Promise.all(
      INSTRUMENT_LIST.map((inst, i) => syncAssessment({ instrument: inst.id, responses: all[i] as number[] }))
    );
    // Report the weakest outcome — if either failed to sync, saying "synced"
    // would be a claim about a place the data is not.
    const worst = outcomes.includes("failed") ? "failed" : outcomes.includes("local-only") ? "local-only" : "synced";
    setSavedWhere(outcomeMessage(worst));
    if (worst === "failed") toast(outcomeMessage(worst), { variant: "error" });
  }

  function restart() {
    setAnswers(INSTRUMENT_LIST.map(blank));
    setStep(0);
    setItem(0);
    setDone(false);
    setSavedWhere(null);
  }

  if (done) return <Results results={results} savedWhere={savedWhere} onRestart={restart} />;

  const totalItems = INSTRUMENT_LIST.reduce((n, i) => n + i.items.length, 0);
  const doneItems = answers.reduce((n, a) => n + a.filter((x) => x !== null).length, 0);

  return (
    <main className="max-w-3xl mx-auto px-5 py-12">
      <PageHeader
        eyebrow={`ขั้นตอนที่ ${step + 1} จาก ${INSTRUMENT_LIST.length}`}
        title={instrument.th}
        lead={`${instrument.name} — ${instrument.stemTh} (${instrument.windowTh})`}
      />

      <div className="mt-8">
        <div className="flex items-center justify-between text-[0.7rem] text-faint mb-2">
          <span>
            คำถาม {item + 1} / {instrument.items.length}
          </span>
          <span>
            ตอบแล้ว {doneItems} / {totalItems}
          </span>
        </div>
        <div
          className="h-1 rounded-full bg-white/10 overflow-hidden"
          role="progressbar"
          aria-valuenow={doneItems}
          aria-valuemin={0}
          aria-valuemax={totalItems}
          aria-label="ความคืบหน้าของแบบประเมิน"
        >
          <div
            className="h-full bg-gold transition-[width] duration-300"
            style={{ width: `${(doneItems / totalItems) * 100}%` }}
          />
        </div>
      </div>

      <Card className="mt-6">
        <p className="text-[0.7rem] text-faint">
          ข้อ {instrument.items[item].n} / {instrument.items.length}
        </p>
        <h2 className="mt-1.5 text-lg sm:text-xl text-gray-100 leading-relaxed">{instrument.items[item].th}</h2>

        <div className="mt-6 grid gap-2">
          {instrument.options.map((o) => {
            const selected = current[item] === o.value;
            return (
              <button
                key={o.value}
                onClick={() => choose(o.value)}
                aria-pressed={selected}
                className={`text-left px-4 py-3 rounded-xl border transition ${
                  selected
                    ? "border-gold bg-gold/10 text-gray-100"
                    : "border-white/10 hover:border-gold/40 text-gray-300"
                }`}
              >
                <span className="text-faint tabular-nums mr-2.5">{o.value}</span>
                {o.th}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={() => {
              if (item > 0) setItem(item - 1);
              else if (step > 0) {
                setStep(step - 1);
                setItem(INSTRUMENT_LIST[step - 1].items.length - 1);
              }
            }}
            disabled={step === 0 && item === 0}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:hover:text-gray-400"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden /> ย้อนกลับ
          </button>
          <span className="text-[0.7rem] text-faint">
            {answered === instrument.items.length ? "ตอบครบแล้ว" : "แตะคำตอบเพื่อไปข้อถัดไป"}
          </span>
        </div>
      </Card>

      <div className="mt-6">
        <Disclaimer>
          ข้อความภาษาไทยนี้เป็นคำแปลของเราเอง ไม่ใช่ฉบับภาษาไทยที่ผ่านการตรวจสอบคุณสมบัติการวัดมาแล้ว —
          ผลจึงใช้ติดตามตัวเองได้ แต่ใช้แทนฉบับที่ผ่านการตรวจสอบไม่ได้ ({instrument.source.authors},{" "}
          {instrument.source.year}; {instrument.licence})
        </Disclaimer>
      </div>
    </main>
  );
}

function Results({
  results,
  savedWhere,
  onRestart,
}: {
  results: ScoreResult[];
  savedWhere: string | null;
  onRestart: () => void;
}) {
  // The sleep diary feeds the plan: a diary meeting the weekly criterion adds
  // CBT-I. Read at render time so a night logged earlier still counts.
  const sleepDisturbed = summarise(readNights(browserStorage())).meetsFrequencyCriterion;
  const plan = buildPlan({ scores: results, sleepDisturbed });

  return (
    <main className="max-w-3xl mx-auto px-5 py-12">
      <CrisisBanner safety={plan.safety} />

      <PageHeader eyebrow="ผลการคัดกรอง" title="ผลประเมินของคุณ" lead={plan.headlineTh} />

      <div className="mt-8 grid gap-4">
        {results.map((r) => {
          const reading = interpret(r);
          const inst = INSTRUMENT_LIST.find((i) => i.id === r.instrument)!;
          return (
            <Card key={r.instrument}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold text-gray-100">{inst.th}</h2>
                <Chip>{inst.name}</Chip>
              </div>

              <div className="mt-4 flex items-baseline gap-3">
                <span className="text-5xl font-semibold tabular-nums" style={{ color: SEVERITY_COLOR[r.band.id] }}>
                  {r.total}
                </span>
                <span className="text-faint text-sm">/ {inst.max}</span>
                <span className="text-lg" style={{ color: SEVERITY_COLOR[r.band.id] }}>
                  {r.band.th}
                </span>
              </div>

              <div className="mt-4">
                <SeverityScale instrument={r.instrument} band={r.band} />
              </div>

              <p className="mt-4 text-sm text-gray-300 leading-relaxed">{reading.th}</p>

              {reading.cutpointNote && (
                <p className="mt-2 text-[0.72rem] text-faint leading-relaxed">{reading.cutpointNote}</p>
              )}

              <p className="mt-3 text-[0.7rem] text-faint">
                คะแนนนี้คือผลรวมของ {inst.items.length} ข้อ — จุดตัดที่ {CUTPOINTS[r.instrument].score} เป็นค่าที่ตีพิมพ์ไว้
                ไม่ใช่เกณฑ์ที่เราตั้งเอง
              </p>
            </Card>
          );
        })}
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">แผนที่ระบบเสนอ</h2>
        <p className="text-sm text-faint mt-1">เรียงตามระดับหลักฐาน ไม่ได้เรียงตามสิ่งที่แอปนี้ให้บริการได้</p>

        <ul className="mt-5 space-y-3">
          {plan.steps.map((s) => (
            <li key={s.intervention.id}>
              <Card>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="font-medium text-gray-100">{s.intervention.th}</h3>
                  <GradeBadge grade={s.intervention.grade} />
                  {s.informationalOnly && <Chip>แอปนี้ให้บริการไม่ได้</Chip>}
                </div>
                <p className="mt-1.5 text-sm text-gray-400">{s.intervention.summaryTh}</p>
                <p className="mt-2 text-[0.72rem] text-gold">{s.doseTh}</p>
                <ul className="mt-2.5 space-y-1">
                  {s.intervention.citations.map((c) => (
                    <CitationLine key={c.title} c={c} />
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <Card>
          <h2 className="font-semibold text-gray-100 text-sm">กฎที่ทำให้ได้แผนนี้</h2>
          <ul className="mt-2.5 space-y-1.5 text-[0.72rem] text-gray-400 list-disc list-inside">
            {plan.rulesTh.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <div className="mt-4 space-y-2">
            {plan.disclaimersTh.map((d) => (
              <Disclaimer key={d}>{d}</Disclaimer>
            ))}
          </div>
        </Card>
      </section>

      <p className="mt-6 text-[0.72rem] text-faint">
        ประเมินซ้ำอีกครั้งใน {plan.reassessInWeeks} สัปดาห์ — เพราะข้อคำถามถามถึงช่วง 2 สัปดาห์ที่ผ่านมา
        ทำเร็วกว่านั้นคือการวัดช่วงเวลาเดิมซ้ำ
      </p>

      {savedWhere && <p className="mt-2 text-[0.72rem] text-faint">{savedWhere}</p>}

      <div className="mt-8 flex flex-wrap gap-3">
        <PrimaryLink href="/therapy/session">
          เริ่มฟัง/หายใจตามแผน <ArrowRight className="w-4 h-4" />
        </PrimaryLink>
        <SecondaryLink href="/therapy/progress">ดูแนวโน้ม</SecondaryLink>
        <button
          onClick={onRestart}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/15 text-gray-200 hover:bg-white/5 transition"
        >
          <RotateCcw className="w-4 h-4" aria-hidden /> ทำแบบประเมินอีกครั้ง
        </button>
      </div>

      <p className="mt-6 text-[0.7rem] text-faint">
        อยากดูตารางหลักฐานทั้งหมด?{" "}
        <Link href="/therapy/interventions" className="text-gold">
          ดู intervention ทุกรายการพร้อมงานวิจัยอ้างอิง
        </Link>
      </p>
    </main>
  );
}
