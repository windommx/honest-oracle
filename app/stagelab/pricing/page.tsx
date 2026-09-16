"use client";

import { useState } from "react";
import Link from "next/link";
import { FEATURE_LABELS, STAGE_PLANS, type StageFeature, type StagePlan } from "@/lib/stagelab/plans";

const ORDER: StageFeature[] = [
  "dashboard",
  "weekly",
  "screener",
  "watchlist",
  "portfolio",
  "journal",
  "tools",
  "learn",
  "alerts",
  "thesis",
  "backtest",
  "pro",
  "quant",
  "audit",
  "export",
];

const PLANS: StagePlan[] = [STAGE_PLANS.free, STAGE_PLANS.pro, STAGE_PLANS.team];

export default function StageLabPricing() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function checkout() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnTo: "stagelab" }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (res.status === 401) {
        window.location.href = "/login?callbackUrl=/stagelab/pricing";
        return;
      }
      if (body.url) {
        window.location.href = body.url;
        return;
      }
      // 501 when Stripe keys are absent — say so plainly instead of a dead button.
      setNote(body.error ?? "ยังเปิดรับชำระเงินไม่ได้ในขณะนี้");
    } catch {
      setNote("เชื่อมต่อระบบชำระเงินไม่สำเร็จ ลองอีกครั้งภายหลัง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-14">
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">แผนและราคา</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300">
          แผนฟรีไม่ใช่รุ่นทดลอง — มันคือรอบทบทวนรายสัปดาห์ครบทั้ง 5 ขั้น พอสำหรับเทรดจริงหนึ่งพอร์ต
          สิ่งที่ Pro เพิ่มให้คือโต๊ะวิจัย สำหรับคนที่อยากตรวจสอบสมมติฐานของตัวเองก่อนลงเงิน
        </p>
      </header>

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => {
          const highlight = plan.key === "pro";
          return (
            <div
              key={plan.key}
              className={`rounded-xl border p-5 ${
                highlight ? "border-emerald-500/40 bg-emerald-500/5" : "border-zinc-800 bg-zinc-900/50"
              }`}
            >
              <h2 className={`text-sm font-semibold ${highlight ? "text-emerald-200" : "text-zinc-100"}`}>
                {plan.label}
              </h2>
              <p className="mt-1 min-h-[2.5rem] text-xs leading-relaxed text-zinc-400">{plan.tagline}</p>
              <p className="mt-3 font-mono text-2xl tabular-nums text-zinc-50">
                {plan.priceThb === 0 ? "฿0" : `฿${plan.priceThb?.toLocaleString()}`}
                <span className="ml-1 text-xs text-zinc-400">{plan.priceThb === 0 ? "ตลอดไป" : "/เดือน"}</span>
              </p>
              <dl className="mt-4 space-y-1 text-[0.7rem] text-zinc-400">
                <Row label="Watchlist" value={`${plan.limits.watchlist} รายการ`} />
                <Row label="สถานะเปิดพร้อมกัน" value={`${plan.limits.positions}`} />
                <Row label="Thesis" value={plan.limits.theses === 0 ? "—" : `${plan.limits.theses}`} />
                <Row
                  label="ประมวลผลหนักต่อวัน"
                  value={plan.limits.computePerDay === 0 ? "—" : `${plan.limits.computePerDay} ครั้ง`}
                />
              </dl>
              <div className="mt-5">
                {plan.key === "free" ? (
                  <Link
                    href="/stagelab/app"
                    className="flex min-h-11 items-center justify-center rounded-lg border border-zinc-700 text-sm text-zinc-200 hover:border-zinc-600"
                  >
                    เริ่มใช้เลย
                  </Link>
                ) : plan.key === "pro" ? (
                  <button
                    onClick={() => void checkout()}
                    disabled={busy}
                    className="flex min-h-11 w-full items-center justify-center rounded-lg bg-emerald-500 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
                  >
                    {busy ? "กำลังเปิดหน้าชำระเงิน…" : "อัปเกรดเป็น Pro"}
                  </button>
                ) : (
                  <a
                    href="mailto:sales@example.com?subject=StageLab%20Team"
                    className="flex min-h-11 items-center justify-center rounded-lg border border-zinc-700 text-sm text-zinc-200 hover:border-zinc-600"
                  >
                    ติดต่อฝ่ายขาย
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {note && (
        <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-center text-xs text-amber-200">
          {note}
        </p>
      )}

      <section className="mt-12">
        <h2 className="text-sm font-semibold text-zinc-100">อะไรอยู่ในแผนไหน</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr>
                <th className="border-b border-zinc-800 px-2 py-2 text-left text-[0.7rem] uppercase tracking-wide text-zinc-400">
                  ความสามารถ
                </th>
                {PLANS.map((p) => (
                  <th
                    key={p.key}
                    className="border-b border-zinc-800 px-2 py-2 text-center text-[0.7rem] uppercase tracking-wide text-zinc-400"
                  >
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ORDER.map((feature) => (
                <tr key={feature}>
                  <td className="border-b border-zinc-800/60 px-2 py-2 text-xs text-zinc-200">
                    {FEATURE_LABELS[feature]}
                  </td>
                  {PLANS.map((p) => (
                    <td key={p.key} className="border-b border-zinc-800/60 px-2 py-2 text-center">
                      {p.features.includes(feature) ? (
                        <span className="text-emerald-400" aria-label="มีในแผนนี้">
                          ✓
                        </span>
                      ) : (
                        <span className="text-zinc-400" aria-label="ไม่มีในแผนนี้">
                          —
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-10 text-center text-[0.7rem] leading-relaxed text-zinc-400">
        ยกเลิกได้ทุกเมื่อ เมื่อยกเลิกแล้วข้อมูลของคุณยังอยู่ครบ เพียงกลับไปอยู่ภายใต้เพดานของแผนฟรี
        <br />
        StageLab ไม่ใช่คำแนะนำการลงทุน
      </p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{label}</dt>
      <dd className="font-mono tabular-nums text-zinc-300">{value}</dd>
    </div>
  );
}
