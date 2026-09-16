"use client";

import { useState } from "react";
import { Card, StageBadge, TableWrap, Tabs, Td, Th, ViewHeader } from "../_ui";

type Tab = "stages" | "routine" | "rules";

const TABS = [
  { key: "stages" as const, label: "4 Stage" },
  { key: "routine" as const, label: "รอบการทำงาน" },
  { key: "rules" as const, label: "กฎที่ห้ามต่อรอง" },
];

const STAGES = [
  {
    n: 1,
    what: "ราคาเคลื่อนออกข้างหลังจากลงมานาน 30W MA เริ่มแบนราบ",
    volume: "เบาบาง มีแท่งวอลุ่มสูงเป็นระยะ (สะสมของ)",
    action: "ยังไม่ซื้อ ใส่ Watchlist และรอ breakout พร้อมวอลุ่ม",
  },
  {
    n: 2,
    what: "ราคาทะลุกรอบขึ้นเหนือ 30W MA และ MA ชันขึ้น",
    volume: "เพิ่มชัดในวันขึ้น เบาในวันย่อ",
    action: "ช่วงเดียวที่ระบบนี้อนุญาตให้ซื้อ",
  },
  {
    n: 3,
    what: "ราคาแกว่งออกข้างเหนือ MA ที่เริ่มแบน ทำยอดไม่ผ่าน",
    volume: "สูงแต่ราคาไปไม่ไหว (กระจายของ)",
    action: "ทยอยลดไม้ ไม่เพิ่มไม้ใหม่",
  },
  {
    n: 4,
    what: "ราคาหลุด 30W MA และ MA ชันลง",
    volume: "เพิ่มในวันลง",
    action: "ออกให้หมด ห้ามถัวเฉลี่ย",
  },
];

export default function LearnView() {
  const [tab, setTab] = useState<Tab>("stages");
  return (
    <div className="space-y-5">
      <ViewHeader
        title="คู่มือระบบ"
        subtitle="Stage Analysis ของ Stan Weinstein — ฉบับที่ระบบนี้นำมาใช้จริง"
      />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "stages" && (
        <div className="space-y-3">
          {STAGES.map((s) => (
            <Card key={s.n}>
              <div className="flex flex-wrap items-start gap-3">
                <StageBadge stage={s.n} />
                <dl className="grid flex-1 gap-2 sm:grid-cols-3">
                  <div>
                    <dt className="text-[0.65rem] uppercase tracking-wide text-zinc-400">ภาพบนกราฟ</dt>
                    <dd className="text-xs leading-relaxed text-zinc-200">{s.what}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.65rem] uppercase tracking-wide text-zinc-400">ปริมาณซื้อขาย</dt>
                    <dd className="text-xs leading-relaxed text-zinc-200">{s.volume}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.65rem] uppercase tracking-wide text-zinc-400">สิ่งที่ต้องทำ</dt>
                    <dd className="text-xs font-medium leading-relaxed text-emerald-300">{s.action}</dd>
                  </div>
                </dl>
              </div>
            </Card>
          ))}
          <Card title="ทำไมต้องเป็นกราฟรายสัปดาห์">
            <p className="text-xs leading-relaxed text-zinc-300">
              Stage คือสภาวะของอุปสงค์-อุปทานที่กินเวลาเป็นเดือน กราฟรายวันมีข่าวรายวันปนอยู่มากเกินกว่าจะเห็น
              โครงสร้างนั้น กรอบรายสัปดาห์ตัดเสียงรบกวนออกโดยไม่ต้องใช้ตัวกรองอะไรเพิ่ม — และทำให้คุณตัดสินใจ
              สัปดาห์ละครั้ง แทนที่จะตัดสินใจวันละสิบครั้ง
            </p>
          </Card>
        </div>
      )}

      {tab === "routine" && (
        <Card title="รอบทบทวน 5 ขั้น" subtitle="ทำสัปดาห์ละครั้ง ใช้เวลาราว 30–45 นาที">
          <ol className="space-y-3">
            {[
              { n: 1, title: "ประเมินตลาดรวม", body: "ให้คะแนน 5 ข้อ ข้อละ 2 คะแนน ผลรวมบอกว่าควรถือหุ้นกี่เปอร์เซ็นต์ของพอร์ต ตลาดที่ได้ 3 คะแนน ไม่มีหุ้นตัวไหนดีพอจะชดเชย" },
              { n: 2, title: "จัดอันดับกลุ่มอุตสาหกรรม", body: "หุ้นครึ่งหนึ่งเคลื่อนตามกลุ่มของมัน เลือกกลุ่มถูกก่อน แล้วค่อยเลือกหุ้น" },
              { n: 3, title: "กรองหุ้นด้วย Funnel", body: "หกชั้น เริ่มจากสภาพคล่อง จบที่การเติบโตของกำไร สิ่งที่มีค่าคือรู้ว่าชั้นไหนเป็นตัวตัด" },
              { n: 4, title: "ทบทวนพอร์ต", body: "ไล่ทีละไม้: Stage เปลี่ยนไหม ห่าง Stop เท่าไร ระบบแนะนำอะไร แล้วทำตามนั้น" },
              { n: 5, title: "เขียนแผนสัปดาห์หน้า", body: "สิ่งที่จะซื้อ ที่ราคาเท่าไร และสิ่งที่จะขายถ้าเกิดอะไรขึ้น เขียนตอนตลาดปิด ไม่ใช่ตอนตลาดเปิด" },
            ].map((s) => (
              <li key={s.n} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 font-mono text-xs text-emerald-300">
                  {s.n}
                </span>
                <div>
                  <p className="text-sm font-medium text-zinc-100">{s.title}</p>
                  <p className="text-xs leading-relaxed text-zinc-400">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {tab === "rules" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="กฎที่ห้ามต่อรอง">
            <ul className="space-y-2 text-xs leading-relaxed text-zinc-200">
              <li>• ซื้อเฉพาะ Stage 2 เท่านั้น — Stage 1 คือ “ยังไม่ใช่” ไม่ใช่ “เกือบใช่”</li>
              <li>• Stop เขียนก่อนเข้า และเลื่อนขึ้นได้อย่างเดียว</li>
              <li>• หลุด Stop = ขาย วันเดียวกัน ไม่รอสิ้นสัปดาห์</li>
              <li>• ไม่ถัวเฉลี่ยขาลง ไม่มีข้อยกเว้น</li>
              <li>• เข้าสู่ Stage 4 = ออกทั้งไม้ ไม่ว่าจะขาดทุนเท่าไร</li>
              <li>• ความเสี่ยงต่อไม้ไม่เกิน 2% ของพอร์ต</li>
            </ul>
          </Card>
          <Card title="สิ่งที่ตัวเลขในระบบนี้ไม่ได้บอก">
            <ul className="space-y-2 text-xs leading-relaxed text-zinc-300">
              <li>• Backtest วิ่งบนซีรีส์สังเคราะห์ ใช้เปรียบเทียบกฎกับกฎ ไม่ใช่พยากรณ์ผลตอบแทน</li>
              <li>• Monte Carlo ขยายสถิติจากไม้ที่คุณปิดจริง — ถ้ามีไม่กี่ไม้ ช่วงผลลัพธ์จะกว้างจนไร้ความหมาย</li>
              <li>• คะแนนพื้นฐานมาจากตัวเลขที่คุณกรอกเอง ระบบไม่ได้ดึงงบการเงินให้</li>
              <li>• ไม่มีสูตรไหนในนี้แทนการอ่านงบและเข้าใจธุรกิจได้</li>
            </ul>
          </Card>
          <Card title="Market Score: 5 ข้อ ข้อละ 2 คะแนน" className="md:col-span-2">
            <TableWrap minWidth={520}>
              <thead>
                <tr>
                  <Th>คะแนนรวม</Th>
                  <Th>อ่านว่า</Th>
                  <Th>สัดส่วนหุ้นในพอร์ต</Th>
                </tr>
              </thead>
              <tbody>
                <tr><Td mono className="text-emerald-400">8–10</Td><Td className="text-xs">Stage 2 ชัดเจน</Td><Td className="text-xs">80–100%</Td></tr>
                <tr><Td mono className="text-amber-400">6–7</Td><Td className="text-xs">Stage 2 อ่อน</Td><Td className="text-xs">50–70%</Td></tr>
                <tr><Td mono className="text-orange-400">4–5</Td><Td className="text-xs">ก้ำกึ่ง Stage 1/3</Td><Td className="text-xs">20–40%</Td></tr>
                <tr><Td mono className="text-red-400">0–3</Td><Td className="text-xs">Stage 4 ตลาดหมี</Td><Td className="text-xs">0–10%</Td></tr>
              </tbody>
            </TableWrap>
          </Card>
        </div>
      )}
    </div>
  );
}
