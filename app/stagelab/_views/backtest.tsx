"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  NumberField,
  Slider,
  Spinner,
  StatCard,
  TableWrap,
  Td,
  Th,
  Toggle,
  ViewHeader,
  toneOfSign,
} from "../_ui";
import { CHART_COLORS, LineChart } from "../_chart";
import { post, reportError } from "../_api";
import { fmt, fmtBaht, fmtPct } from "@/lib/stagelab/utils";
import type { BacktestConfig, BacktestResult } from "@/lib/stagelab/backtest";

const DEFAULTS: BacktestConfig = {
  capital: 1_000_000,
  riskPct: 1,
  maxPositions: 8,
  commissionPct: 0.25,
  requireVolume: true,
  requireRs: true,
  marketFilter: false,
};

export default function BacktestView({ onSessionChange }: { onSessionChange: () => void }) {
  const [config, setConfig] = useState<BacktestConfig>(DEFAULTS);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      setResult(await post<BacktestResult>("/backtest", config));
    } catch (err) {
      reportError(err, "รัน Backtest ไม่สำเร็จ");
    } finally {
      setRunning(false);
      onSessionChange();
    }
  }

  const stats = result?.stats;

  return (
    <div className="space-y-5">
      <ViewHeader
        title="Backtest"
        subtitle="กลยุทธ์ Stage 2 บนซีรีส์รายสัปดาห์ 312 สัปดาห์ของทั้งจักรวาลหุ้น"
        actions={
          <Button size="sm" variant="primary" disabled={running} onClick={() => void run()}>
            {running ? "กำลังรัน…" : "รัน Backtest"}
          </Button>
        }
      />

      <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-100">
        <strong>อ่านผลลัพธ์นี้อย่างไร:</strong> ซีรีส์ราคาที่ใช้เป็นข้อมูลสังเคราะห์แบบกำหนดผลได้
        (เมล็ดสุ่มเดิมให้ผลเดิมเสมอ) ไม่ใช่ราคาจริงในอดีต ตัวเลขที่ได้จึงใช้ <em>เปรียบเทียบกฎกับกฎ</em>
        — เช่น เปิด/ปิดตัวกรองวอลุ่มแล้วอะไรเปลี่ยน — ไม่ใช่การพยากรณ์ผลตอบแทนที่คุณจะได้จริง
      </p>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card title="พารามิเตอร์" className="lg:col-span-1">
          <div className="space-y-3">
            <NumberField label="เงินทุนเริ่มต้น" value={config.capital} onChange={(n) => setConfig({ ...config, capital: n })} step={100_000} min={100_000} />
            <Slider label="ความเสี่ยงต่อไม้" value={config.riskPct} onChange={(n) => setConfig({ ...config, riskPct: n })} min={0.25} max={5} step={0.25} format={(n) => `${n}%`} />
            <Slider label="จำนวนไม้สูงสุดพร้อมกัน" value={config.maxPositions} onChange={(n) => setConfig({ ...config, maxPositions: n })} min={1} max={20} />
            <Slider label="ค่าคอมมิชชั่นต่อขา" value={config.commissionPct} onChange={(n) => setConfig({ ...config, commissionPct: n })} min={0} max={1} step={0.05} format={(n) => `${n}%`} />
            <Toggle label="ต้องมีวอลุ่มยืนยัน" checked={config.requireVolume} onChange={(v) => setConfig({ ...config, requireVolume: v })} />
            <Toggle label="ต้องมี RS เป็นบวก" checked={config.requireRs} onChange={(v) => setConfig({ ...config, requireRs: v })} />
            <Toggle label="เข้าเฉพาะตอนดัชนีอยู่ Stage 2" checked={config.marketFilter} onChange={(v) => setConfig({ ...config, marketFilter: v })} hint="ตัวกรองที่เปลี่ยนผลมากที่สุด" />
            <Button variant="subtle" size="sm" className="w-full" onClick={() => setConfig(DEFAULTS)}>
              คืนค่าเริ่มต้น
            </Button>
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-3">
          {!result ? (
            <Card>
              {running ? (
                <div className="py-16 text-center"><Spinner label="กำลังเดิน 312 สัปดาห์…" /></div>
              ) : (
                <EmptyState
                  title="ยังไม่ได้รัน"
                  hint="ปรับพารามิเตอร์ทางซ้าย แล้วกดรัน — ลองเปิด/ปิดทีละตัวเพื่อดูว่ากฎข้อไหนสร้างผลต่างจริง"
                  action={<Button size="sm" variant="primary" onClick={() => void run()}>รัน Backtest</Button>}
                />
              )}
            </Card>
          ) : (
            <>
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                <StatCard label="มูลค่าสุดท้าย" value={fmtBaht(stats!.finalValue)} sub={`จาก ${fmtBaht(stats!.initialCapital)}`} tone={toneOfSign(stats!.totalReturnPct)} />
                <StatCard label="ผลตอบแทนรวม" value={fmtPct(stats!.totalReturnPct)} sub={`CAGR ${fmtPct(stats!.cagrPct)}`} tone={toneOfSign(stats!.totalReturnPct)} />
                <StatCard label="Max Drawdown" value={fmtPct(stats!.maxDdPct)} tone={stats!.maxDdPct < -30 ? "bad" : stats!.maxDdPct < -20 ? "warn" : "good"} />
                <StatCard label="Win Rate" value={`${fmt(stats!.winRatePct, 0)}%`} sub={`${stats!.totalTrades} ไม้ · PF ${fmt(stats!.profitFactor, 2)}`} tone={stats!.winRatePct >= 50 ? "good" : "warn"} />
              </div>

              <Card
                title="เส้นมูลค่าพอร์ต เทียบกับการซื้อดัชนีแล้วถือ"
                subtitle={`${result.equity.length} สัปดาห์ · ส่วนต่างจากการถือเฉย ๆ ${fmtPct(result.benchmark.excessReturnPct)}`}
              >
                <LineChart
                  height={230}
                  caption={`มูลค่าพอร์ตจากกลยุทธ์ เทียบกับการซื้อดัชนีแล้วถือ ตลอด ${result.equity.length} สัปดาห์`}
                  xLabels={result.equity.map((e) => e.t)}
                  series={[
                    { label: "กลยุทธ์", values: result.equity.map((e) => e.value), color: CHART_COLORS.strategy },
                    { label: result.benchmark.label, values: result.benchmark.equity, color: CHART_COLORS.benchmark, dashed: true },
                  ]}
                />
                <p className="mt-2 text-xs leading-relaxed text-zinc-300">
                  {result.benchmark.excessReturnPct >= 0
                    ? `กลยุทธ์ชนะการถือเฉย ๆ อยู่ ${fmtPct(result.benchmark.excessReturnPct)} — โดยมี Drawdown ${fmtPct(stats!.maxDdPct)} เทียบกับ ${fmtPct(result.benchmark.maxDdPct)} ของดัชนี`
                    : `กลยุทธ์แพ้การถือดัชนีเฉย ๆ อยู่ ${fmtPct(Math.abs(result.benchmark.excessReturnPct))} — การคัดกรอง ตั้ง Stop และจัดขนาดไม้ทั้งหมดในรอบนี้ ยังไม่ชดเชยต้นทุนของมันเอง`}
                </p>
                <div className="mt-3 grid gap-2 grid-cols-2 sm:grid-cols-4 text-center">
                  <MiniStat label="กำไรเฉลี่ย" value={fmtPct(stats!.avgWinPct)} tone="good" />
                  <MiniStat label="ขาดทุนเฉลี่ย" value={fmtPct(stats!.avgLossPct)} tone="bad" />
                  <MiniStat label="ถือเฉลี่ย" value={`${fmt(stats!.avgHoldWeeks, 1)} สัปดาห์`} />
                  <MiniStat label="ดีสุด / แย่สุด" value={`${fmtPct(stats!.bestPct, 0)} / ${fmtPct(stats!.worstPct, 0)}`} />
                </div>
              </Card>

              <Card
                title="ความทนทาน — ช่วงแรกเทียบช่วงหลัง"
                subtitle="แบ่งช่วงเวลา 70/30 แล้ววัดแยกกัน จุดแบ่งตายตัว ปรับไม่ได้"
              >
                <div
                  className={`rounded-lg border px-3 py-2.5 text-xs leading-relaxed ${
                    result.robustness.verdict === "consistent"
                      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-100"
                      : result.robustness.verdict === "insufficient"
                        ? "border-zinc-700 bg-zinc-800/40 text-zinc-300"
                        : "border-red-500/30 bg-red-500/5 text-red-100"
                  }`}
                >
                  {result.robustness.note}
                </div>
                <div className="mt-3">
                  <TableWrap minWidth={520}>
                    <thead>
                      <tr>
                        <Th>ช่วง</Th>
                        <Th align="right">ผลตอบแทน</Th>
                        <Th align="right">CAGR</Th>
                        <Th align="right">Max DD</Th>
                        <Th align="right">ไม้</Th>
                        <Th align="right">Win Rate</Th>
                        <Th align="right">Profit Factor</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {[result.splits.inSample, result.splits.outOfSample].map((period) => (
                        <tr key={period.label}>
                          <Td className="text-xs text-zinc-200">
                            {period.label}
                            <span className="ml-1.5 text-[0.65rem] text-zinc-400">
                              {period.fromDate} → {period.toDate}
                            </span>
                          </Td>
                          <Td align="right" mono className={period.returnPct >= 0 ? "text-emerald-400" : "text-red-400"}>
                            {fmtPct(period.returnPct)}
                          </Td>
                          <Td align="right" mono className={period.cagrPct >= 0 ? "text-emerald-400" : "text-red-400"}>
                            {fmtPct(period.cagrPct)}
                          </Td>
                          <Td align="right" mono className="text-red-400">{fmtPct(period.maxDdPct)}</Td>
                          <Td align="right" mono>{period.trades}</Td>
                          <Td align="right" mono>{fmt(period.winRatePct, 0)}%</Td>
                          <Td align="right" mono>{fmt(period.profitFactor, 2)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                </div>
              </Card>

              <Card title="ความเสี่ยงที่ตัวเลขรวมไม่ได้บอก">
                <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
                  <StatCard
                    label="Sortino"
                    value={fmt(stats!.sortino, 2)}
                    sub="ผลตอบแทนต่อความผันผวนขาลง"
                    tone={stats!.sortino >= 1 ? "good" : stats!.sortino >= 0.5 ? "warn" : "bad"}
                  />
                  <StatCard
                    label="Calmar"
                    value={fmt(stats!.calmar, 2)}
                    sub="CAGR ต่อ Drawdown ที่ลึกที่สุด"
                    tone={stats!.calmar >= 0.5 ? "good" : stats!.calmar >= 0.25 ? "warn" : "bad"}
                  />
                  <StatCard
                    label="เวลาที่ถือหุ้นจริง"
                    value={`${fmt(stats!.exposurePct, 0)}%`}
                    sub="ของสัปดาห์ทั้งหมดที่มีไม้อยู่"
                  />
                  <StatCard
                    label="คาดหวังต่อไม้"
                    value={fmtPct(stats!.expectancyPct)}
                    sub="เฉลี่ยรวมทั้งไม้ที่ได้และเสีย"
                    tone={toneOfSign(stats!.expectancyPct)}
                  />
                  <StatCard
                    label="ติดใต้ยอดนานสุด"
                    value={`${stats!.longestDdWeeks} สัปดาห์`}
                    sub="ช่วงที่พอร์ตยังไม่กลับไปจุดสูงสุดเดิม"
                    tone={stats!.longestDdWeeks > 52 ? "bad" : stats!.longestDdWeeks > 26 ? "warn" : "neutral"}
                  />
                  <StatCard
                    label="ฟื้นจากหลุมลึกสุด"
                    value={stats!.recoveryWeeks === null ? "ยังไม่ฟื้น" : `${stats!.recoveryWeeks} สัปดาห์`}
                    tone={stats!.recoveryWeeks === null ? "bad" : "neutral"}
                  />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-zinc-400">
                  ตัวเลขสองแถวล่างสำคัญกว่าที่หน้าตามันบ่งบอก — Drawdown 30% ที่ฟื้นใน 8 สัปดาห์
                  กับ 30% ที่ใช้เวลาสองปี เป็นตัวเลขเดียวกันบนการ์ดสถิติ แต่คนละเรื่องกันโดยสิ้นเชิงเวลาต้องนั่งถือจริง
                </p>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="เหตุผลที่ออกจากไม้" subtitle="กฎข้อไหนเป็นคนปิดไม้ให้คุณ">
                  <TableWrap minWidth={360}>
                    <thead>
                      <tr>
                        <Th>เหตุผล</Th>
                        <Th align="right">จำนวน</Th>
                        <Th align="right">เฉลี่ย</Th>
                        <Th align="right">รวม</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.exitBreakdown.map((r) => (
                        <tr key={r.reason}>
                          <Td className="text-xs text-zinc-200">{r.reason}</Td>
                          <Td align="right" mono>{r.count}</Td>
                          <Td align="right" mono className={r.avgPct >= 0 ? "text-emerald-400" : "text-red-400"}>{fmtPct(r.avgPct)}</Td>
                          <Td align="right" mono className={r.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}>{fmtBaht(r.totalPnl)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                </Card>

                <Card title="ไม้ที่ดีที่สุดและแย่ที่สุด">
                  <TableWrap minWidth={360}>
                    <thead>
                      <tr>
                        <Th>หุ้น</Th>
                        <Th align="right">ผล</Th>
                        <Th align="right">ถือ</Th>
                        <Th>ออกเพราะ</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...result.topTrades.slice(0, 5), ...result.worstTrades.slice(0, 5)].map((t, i) => (
                        <tr key={`${t.symbol}-${t.entryDate}-${i}`}>
                          <Td><span className="font-mono text-zinc-100">{t.symbol}</span></Td>
                          <Td align="right" mono className={t.pnlPct >= 0 ? "text-emerald-400" : "text-red-400"}>{fmtPct(t.pnlPct)}</Td>
                          <Td align="right" mono>{t.holdWeeks}w</Td>
                          <Td><Badge tone={t.pnlPct >= 0 ? "good" : "bad"}>{t.exitReason}</Badge></Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "bad" }) {
  const color = tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : "text-zinc-200";
  return (
    <div className="rounded-lg border border-zinc-800 px-2 py-1.5">
      <div className="text-[0.65rem] text-zinc-400">{label}</div>
      <div className={`font-mono text-xs tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
