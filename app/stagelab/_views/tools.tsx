"use client";

import { useState } from "react";
import { Card, NumberField, Slider, StatCard, TableWrap, Tabs, Td, Th, ViewHeader } from "../_ui";
import { chandelier, fmt, fmtBaht, fmtPct, kelly, positionSize } from "@/lib/stagelab/utils";

type Tab = "sizing" | "exits" | "reference";

const TABS = [
  { key: "sizing" as const, label: "ขนาดไม้" },
  { key: "exits" as const, label: "แผนออก" },
  { key: "reference" as const, label: "ตารางอ้างอิง" },
];

export default function ToolsView() {
  const [tab, setTab] = useState<Tab>("sizing");
  return (
    <div className="space-y-5">
      <ViewHeader
        title="เครื่องมือ"
        subtitle="ตัวเลขทั้งหมดคำนวณในเครื่องคุณ ไม่มีการส่งขึ้นเซิร์ฟเวอร์"
      />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "sizing" && <SizingTab />}
      {tab === "exits" && <ExitsTab />}
      {tab === "reference" && <ReferenceTab />}
    </div>
  );
}

function SizingTab() {
  const [capital, setCapital] = useState(1_000_000);
  const [riskPct, setRiskPct] = useState(1.5);
  const [entry, setEntry] = useState(100);
  const [stop, setStop] = useState(93);

  const [winRate, setWinRate] = useState(60);
  const [avgWin, setAvgWin] = useState(12);
  const [avgLoss, setAvgLoss] = useState(7);

  const size = positionSize(capital, riskPct, entry, stop);
  const k = kelly(winRate, avgWin, avgLoss);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Position Size Calculator" subtitle="ขนาดไม้ที่ทำให้ขาดทุนสูงสุดเท่ากับความเสี่ยงที่ยอมรับ">
        <div className="space-y-3">
          <NumberField label="เงินทุนรวม (บาท)" value={capital} onChange={setCapital} step={10_000} min={0} />
          <Slider
            label="ความเสี่ยงต่อไม้"
            value={riskPct}
            onChange={setRiskPct}
            min={0.5}
            max={3}
            step={0.25}
            format={(n) => `${n}%`}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="ราคาเข้า" value={entry} onChange={setEntry} step={0.25} />
            <NumberField label="Stop Loss" value={stop} onChange={setStop} step={0.25} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 grid-cols-2">
          <StatCard label="เงินที่เสี่ยง" value={fmtBaht(size.riskAmount)} />
          <StatCard label="จำนวนหุ้น" value={size.shares.toLocaleString()} />
          <StatCard label="มูลค่าไม้" value={fmtBaht(size.positionValue)} />
          <StatCard
            label="% ของพอร์ต"
            value={`${fmt(size.capitalPct, 1)}%`}
            tone={size.capitalPct > 20 ? "bad" : size.capitalPct > 12 ? "warn" : "good"}
          />
        </div>

        {size.capitalPct > 20 && size.shares > 0 && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
            ไม้นี้กินพอร์ตเกิน 20% — Stop ที่แคบทำให้ขนาดไม้ใหญ่ขึ้น ความเสี่ยงต่อไม้ยังเท่าเดิมก็จริง
            แต่ความเสี่ยงจากการกระโดดข้าม Stop (gap) ไม่เท่าเดิม
          </p>
        )}
        <p className="mt-2 text-[0.7rem] text-zinc-400">
          จำนวนหุ้น = (ทุน × ความเสี่ยง%) ÷ |ราคาเข้า − Stop|
        </p>
      </Card>

      <Card title="Kelly Criterion" subtitle="สัดส่วนที่ทฤษฎีบอกว่าโตเร็วที่สุด — ในทางปฏิบัติใช้ครึ่งเดียว">
        <div className="space-y-3">
          <Slider label="Win Rate" value={winRate} onChange={setWinRate} min={10} max={90} format={(n) => `${n}%`} />
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="กำไรเฉลี่ยต่อไม้ (%)" value={avgWin} onChange={setAvgWin} step={0.5} />
            <NumberField label="ขาดทุนเฉลี่ยต่อไม้ (%)" value={avgLoss} onChange={setAvgLoss} step={0.5} />
          </div>
        </div>
        <div className="mt-4 grid gap-3 grid-cols-3">
          <StatCard label="Kelly f*" value={`${fmt(k.f, 1)}%`} tone={k.f > 25 ? "bad" : "neutral"} />
          <StatCard label="Half-Kelly" value={`${fmt(k.half, 1)}%`} tone="good" />
          <StatCard label="Expectancy" value={`${fmt(k.edge, 2)}`} tone={k.edge > 0 ? "good" : "bad"} />
        </div>
        {k.f > 25 && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
            f* เกิน 25% แปลว่าสถิติที่กรอกมาดีเกินจริง หรือกลุ่มตัวอย่างเล็กเกินไป — อย่าเดิมพันตามตัวเลขนี้ตรง ๆ
          </p>
        )}
        <p className="mt-2 text-[0.7rem] text-zinc-400">f* = (p×b − q) ÷ b เมื่อ b = กำไรเฉลี่ย ÷ ขาดทุนเฉลี่ย</p>
      </Card>

      <Card title="ขนาดไม้ตามความมั่นใจ" className="md:col-span-2">
        <TableWrap minWidth={520}>
          <thead>
            <tr>
              <Th>ระดับ</Th>
              <Th>เงื่อนไข</Th>
              <Th align="right">ความเสี่ยงต่อไม้</Th>
              <Th align="right">ขนาดไม้จากทุนตัวอย่าง</Th>
            </tr>
          </thead>
          <tbody>
            {[
              { tier: "A+", cond: "ครบทุกเงื่อนไข + Triple Confirm", risk: 2 },
              { tier: "A", cond: "Stage 2 + RS บวก + พื้นฐานแข็ง", risk: 1.5 },
              { tier: "B", cond: "ผ่านเกณฑ์พื้นฐาน ยังขาดตัวยืนยันบางตัว", risk: 1 },
              { tier: "C", cond: "สัญญาณคลุมเครือ", risk: 0.5 },
              { tier: "D", cond: "ไม่ผ่านเกณฑ์", risk: 0 },
            ].map((r) => (
              <tr key={r.tier}>
                <Td><span className="font-mono font-semibold text-zinc-100">{r.tier}</span></Td>
                <Td className="text-xs text-zinc-300">{r.cond}</Td>
                <Td align="right" mono className={r.risk === 0 ? "text-red-400" : "text-zinc-100"}>{r.risk}%</Td>
                <Td align="right" mono className="text-zinc-300">
                  {r.risk === 0 ? "—" : fmtBaht(positionSize(capital, r.risk, entry, stop).positionValue)}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </div>
  );
}

function ExitsTab() {
  const [high, setHigh] = useState(180);
  const [atr, setAtr] = useState(6);
  const [mult, setMult] = useState(3);
  const exit = chandelier(high, atr, mult);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Chandelier Exit" subtitle="Stop ที่ลากตามจุดสูงสุด ไม่ใช่ตามราคาทุน">
        <div className="space-y-3">
          <NumberField label="จุดสูงสุด 22 สัปดาห์" value={high} onChange={setHigh} step={1} />
          <NumberField label="ATR (22)" value={atr} onChange={setAtr} step={0.5} />
          <Slider label="ตัวคูณ" value={mult} onChange={setMult} min={2} max={4} step={0.5} format={(n) => `${n}×`} />
        </div>
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-4 text-center">
          <div className="text-[0.7rem] uppercase tracking-wide text-zinc-400">ระดับ Stop</div>
          <div className="mt-1 font-mono text-3xl font-semibold tabular-nums text-emerald-400">{fmt(exit)}</div>
          <div className="mt-1 text-[0.7rem] text-zinc-400">
            ห่างจากจุดสูงสุด {fmtPct(((exit - high) / high) * 100)}
          </div>
        </div>
        <p className="mt-2 text-[0.7rem] text-zinc-400">Chandelier = จุดสูงสุด − (ตัวคูณ × ATR)</p>
      </Card>

      <Card title="Playbook การออก">
        <dl className="space-y-3">
          {[
            { term: "Chandelier Exit", desc: "ใช้กับไม้ที่ยังอยู่ใน Stage 2 — ยอมให้ราคาแกว่งตามความผันผวนจริง ไม่ใช่ตามความกลัว" },
            { term: "Parabolic SAR", desc: "ใช้เมื่อราคาวิ่งชันผิดปกติ (blow-off) SAR จะไล่ขึ้นมาชนเร็วกว่าเส้นค่าเฉลี่ย" },
            { term: "Time-Based Exit", desc: "ถือครบ 8-12 สัปดาห์แล้วไม่ไปไหน = ต้นทุนค่าเสียโอกาส ตัดไปหาไม้ที่วิ่ง" },
            { term: "Climax Top Exit", desc: "แท่งวอลุ่มสูงสุดพร้อมราคาพุ่งแล้วปิดต่ำ = กระจายของ ออกครึ่งไม้ทันที" },
          ].map((x) => (
            <div key={x.term} className="border-l-2 border-zinc-700 pl-3">
              <dt className="text-xs font-semibold text-zinc-100">{x.term}</dt>
              <dd className="text-[0.7rem] leading-relaxed text-zinc-400">{x.desc}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
          ตั้งแผนออกให้เสร็จก่อนกดซื้อเสมอ — หลังเข้าไม้แล้ว สมองจะหาเหตุผลให้ทุกอย่างที่คุณอยากทำอยู่แล้ว
        </p>
      </Card>
    </div>
  );
}

function ReferenceTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="กฎการ Short ใน Stage 4">
        <TableWrap minWidth={420}>
          <thead>
            <tr>
              <Th>เงื่อนไข</Th>
              <Th>เกณฑ์</Th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Stage", "ยืนยัน Stage 4 แล้วเท่านั้น"],
              ["30W MA", "ราคาต่ำกว่า และ MA ชันลง"],
              ["Mansfield RS", "ติดลบต่อเนื่อง"],
              ["ปริมาณ", "วอลุ่มเพิ่มในวันลง"],
              ["ตลาดรวม", "Market Score ≤ 4"],
            ].map(([a, b]) => (
              <tr key={a}>
                <Td className="text-xs text-zinc-300">{a}</Td>
                <Td className="text-xs text-zinc-100">{b}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          ขาดทุนจากการ Short ไม่มีเพดาน ขนาดไม้จึงต้องเล็กกว่าฝั่งซื้อเสมอ
        </p>
      </Card>

      <Card title="Sector Rotation Cycle">
        <ol className="space-y-2">
          {[
            { phase: "Early Cycle", sectors: "ธนาคาร · อสังหา · ค้าปลีก", note: "ดอกเบี้ยเริ่มลง เศรษฐกิจกำลังฟื้น" },
            { phase: "Mid Cycle", sectors: "อุตสาหกรรม · เทคโนโลยี · วัสดุ", note: "กำไรเร่งตัว เป็นช่วงที่ Stage 2 เยอะที่สุด" },
            { phase: "Late Cycle", sectors: "พลังงาน · สินค้าโภคภัณฑ์", note: "เงินเฟ้อสูง ต้นทุนเริ่มกดดันกำไร" },
            { phase: "Recession", sectors: "สาธารณูปโภค · สุขภาพ · สินค้าจำเป็น", note: "เงินหนีเข้าของที่ขายได้ทุกสภาพตลาด" },
          ].map((p, i, arr) => (
            <li key={p.phase} className="rounded-lg border border-zinc-800 px-3 py-2">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold text-zinc-100">{p.phase}</span>
                <span className="text-[0.65rem] text-zinc-400">{i === arr.length - 1 ? "→ วนกลับ Early" : "↓"}</span>
              </div>
              <p className="text-[0.7rem] text-emerald-300">{p.sectors}</p>
              <p className="text-[0.65rem] text-zinc-400">{p.note}</p>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Multi-Timeframe Alignment" className="lg:col-span-2">
        <TableWrap minWidth={520}>
          <thead>
            <tr>
              <Th>กรอบเวลา</Th>
              <Th>ใช้ตอบคำถามอะไร</Th>
              <Th>ถ้าไม่ตรงกัน</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td className="text-xs text-zinc-100">รายเดือน</Td>
              <Td className="text-xs text-zinc-300">แนวโน้มใหญ่ยังอยู่ไหม</Td>
              <Td className="text-xs text-red-300">ไม่เข้าไม้ใหม่</Td>
            </tr>
            <tr>
              <Td className="text-xs text-zinc-100">รายสัปดาห์</Td>
              <Td className="text-xs text-zinc-300">Stage ปัจจุบันคืออะไร (กรอบหลักของระบบนี้)</Td>
              <Td className="text-xs text-red-300">ไม่เข้าไม้ใหม่</Td>
            </tr>
            <tr>
              <Td className="text-xs text-zinc-100">รายวัน</Td>
              <Td className="text-xs text-zinc-300">จังหวะเข้าเท่านั้น</Td>
              <Td className="text-xs text-amber-300">รอจังหวะใหม่ ไม่เปลี่ยนแผน</Td>
            </tr>
          </tbody>
        </TableWrap>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[0.7rem] text-emerald-300">
            ตรงกันทั้ง 3 = ไม้ A+
          </span>
          <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[0.7rem] text-amber-300">
            ตรง 2 จาก 3 = ลดขนาดไม้
          </span>
          <span className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[0.7rem] text-red-300">
            เดือนขัดกับสัปดาห์ = ไม่เข้า
          </span>
        </div>
      </Card>
    </div>
  );
}
