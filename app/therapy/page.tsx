import Link from "next/link";
import { ArrowRight, ClipboardCheck, HeartPulse, Music, ShieldAlert } from "lucide-react";
import { INSTRUMENT_LIST, WITHHELD_INSTRUMENTS } from "@/lib/therapy-engine/instruments";
import { EVIDENCE_GRADES, GRADE_ORDER, INTERVENTIONS, VERIFICATION_NOTE, catalogTotals } from "@/lib/therapy-engine/evidence";
import { CRISIS_RESOURCES } from "@/lib/therapy-engine/safety";
import { Card, Chip, CitationLine, Disclaimer, GradeBadge, PrimaryLink, SecondaryLink, Stat } from "./_components";

// Every figure on this page is COMPUTED from the engine registries — the counts
// come from catalogTotals(), the instrument names from INSTRUMENT_LIST, the
// grades from EVIDENCE_GRADES. Nothing is typed into the marketing copy, so the
// hero cannot drift from the table it is advertising.

const HOW = [
  {
    icon: ClipboardCheck,
    title: "แบบคัดกรองที่มีอยู่จริง ไม่ใช่แบบทดสอบที่เราคิดเอง",
    body: "ใช้ GAD-7 และ PHQ-9 ซึ่งเป็นแบบคัดกรองสาธารณสมบัติที่ผ่านการตรวจสอบคุณสมบัติการวัด คะแนนคือผลรวมของข้อคำถาม จุดตัดเป็นค่าที่ตีพิมพ์ไว้ ไม่ใช่เกณฑ์ที่เราตั้งเอง",
  },
  {
    icon: Music,
    title: "ดนตรีบำบัดตามหลัก iso-principle",
    body: "เริ่มจังหวะที่ 'จับคู่' กับสภาวะปัจจุบันของคุณก่อน แล้วค่อย ๆ ไล่ลงสู่จังหวะเป้าหมาย — สูตรการไล่จังหวะเปิดให้ตรวจสอบได้ทุกช่วง",
  },
  {
    icon: ShieldAlert,
    title: "ความปลอดภัยมาก่อนคะแนน",
    body: "PHQ-9 ข้อ 9 (ความคิดทำร้ายตัวเอง) ถูกตรวจก่อนดูคะแนนรวมเสมอ คนที่ได้คะแนนรวม 1 จาก 27 ก็ขึ้นคำเตือนได้ เพราะความเสี่ยงไม่ใช่ฟังก์ชันของผลรวม",
  },
  {
    icon: HeartPulse,
    title: "ไม่มีคะแนนสุขภาพจิต 0–100",
    body: "เราไม่รวม GAD-7 กับ PHQ-9 เป็นดัชนีเดียว ไม่แปลงเป็นเปอร์เซ็นต์ และไม่พยากรณ์อนาคต — รายงานเฉพาะสิ่งที่วัดได้จริงเท่านั้น",
  },
];

export default function TherapyLanding() {
  const totals = catalogTotals();
  const strongest = INTERVENTIONS.filter((i) => i.grade === "strong");
  const music = INTERVENTIONS.find((i) => i.id === "music-listening")!;

  return (
    <main>
      {/* hero */}
      <section className="max-w-5xl mx-auto px-5 pt-16 pb-12 text-center">
        <Chip tone="gold">
          <span aria-hidden>●</span> Evidence-Based Platform · ดนตรีบำบัด
        </Chip>

        <h1 className="mt-5 text-4xl sm:text-5xl font-semibold leading-tight">
          <span className="bg-gradient-to-r from-gold-light to-gold-dark bg-clip-text text-transparent">
            แพลตฟอร์มดนตรีบำบัด
          </span>
          <br />
          เชิงหลักฐาน
        </h1>

        <p className="mt-5 text-gray-400 max-w-2xl mx-auto leading-relaxed">
          ประเมินด้วยแบบคัดกรองมาตรฐาน เลือก intervention จากตารางที่อ้างอิงงานวิจัยทุกบรรทัด
          แล้วฝึกฟัง/หายใจตามจังหวะที่คำนวณให้ — ทุกตัวเลขในแอปนี้ตรวจซ้ำเองได้
        </p>

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto">
          <Stat value={String(INSTRUMENT_LIST.length)} label="แบบคัดกรองมาตรฐาน" />
          <Stat value={String(totals.interventions)} label="intervention" />
          <Stat value={String(totals.citations)} label="งานวิจัยอ้างอิง" />
          <Stat value={`${totals.trials.toLocaleString("en-US")}+`} label="RCTs ในงานที่อ้างอิง" />
        </div>
        <p className="mt-3 text-[0.65rem] text-faint max-w-xl mx-auto leading-relaxed">{totals.overlapNoteTh}</p>

        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <PrimaryLink href="/therapy/assess">
            เริ่มประเมิน <ArrowRight className="w-4 h-4" />
          </PrimaryLink>
          <SecondaryLink href="/therapy/session">ข้ามไปฟัง/หายใจเลย</SecondaryLink>
          <SecondaryLink href="/therapy/interventions">ดูตารางหลักฐาน</SecondaryLink>
        </div>

        <p className="mt-6 text-[0.7rem] text-faint">
          ใช้ได้โดยไม่ต้องสมัครสมาชิก — คำตอบเก็บไว้ในเบราว์เซอร์นี้จนกว่าคุณจะเลือกซิงก์
        </p>
      </section>

      {/* how it works */}
      <section className="max-w-5xl mx-auto px-5 py-10">
        <div className="grid gap-4 sm:grid-cols-2">
          {HOW.map((h) => (
            <Card key={h.title}>
              <h2 className="flex items-start gap-2.5 font-semibold text-gray-100">
                <h.icon className="w-5 h-5 mt-0.5 shrink-0 text-gold" aria-hidden />
                {h.title}
              </h2>
              <p className="mt-2 text-sm text-gray-400 leading-relaxed">{h.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* the evidence ladder */}
      <section className="max-w-5xl mx-auto px-5 py-10">
        <h2 className="text-xl font-semibold">ระดับหลักฐาน — และเงื่อนไขของแต่ละระดับ</h2>
        <p className="text-sm text-faint mt-1">
          ระดับไม่ได้ให้ตามความชอบของผู้พัฒนา แต่ให้ตามรูปร่างของหลักฐานที่มี
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {GRADE_ORDER.map((g) => (
            <Card key={g}>
              <GradeBadge grade={g} />
              <p className="mt-2 text-[0.72rem] text-gray-400 leading-relaxed">{EVIDENCE_GRADES[g].requiresTh}</p>
              <p className="mt-2 text-[0.65rem] text-faint">
                {INTERVENTIONS.filter((i) => i.grade === g).length} รายการในตาราง
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* music therapy — the product's core */}
      <section className="max-w-5xl mx-auto px-5 py-10">
        <Card className="border-gold/25">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-xl font-semibold text-gray-100">{music.th}</h2>
            <GradeBadge grade={music.grade} />
          </div>
          <p className="mt-2 text-sm text-gray-400">{music.summaryTh}</p>

          <ul className="mt-4 space-y-1.5">
            {music.citations.map((c) => (
              <CitationLine key={c.title} c={c} />
            ))}
          </ul>

          <div className="mt-5">
            <Disclaimer>
              <span className="text-gray-300">ข้อจำกัดที่ต้องบอกก่อน: </span>
              {music.limitationTh}
            </Disclaimer>
          </div>

          <div className="mt-5">
            <Link href="/therapy/session" className="text-sm text-gold hover:text-gold-light inline-flex items-center gap-1.5">
              ไปที่ห้องฟัง — คำนวณจังหวะให้ตามหลัก iso-principle <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </Card>
      </section>

      {/* strongest evidence */}
      <section className="max-w-5xl mx-auto px-5 py-10">
        <h2 className="text-xl font-semibold">
          {strongest.length} intervention ที่มีหลักฐานแข็งแรงที่สุด
        </h2>
        <p className="text-sm text-faint mt-1">
          รวมรายการที่แอปนี้ให้บริการไม่ได้ด้วย — เพราะภาพที่ครบคือสิ่งที่คุณควรได้เห็น
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {strongest.map((i) => (
            <Card key={i.id}>
              <h3 className="font-medium text-gray-100 text-sm">{i.th}</h3>
              <p className="mt-1.5 text-[0.72rem] text-gray-400 leading-relaxed">{i.summaryTh}</p>
              {!i.selfAdministered && (
                <p className="mt-2 text-[0.65rem] text-faint">ต้องมีผู้ให้บริการสุขภาพ — แอปนี้ไม่ได้ให้บริการ</p>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* what we refuse to do */}
      <section className="max-w-5xl mx-auto px-5 py-10">
        <h2 className="text-xl font-semibold">สิ่งที่แพลตฟอร์มนี้ตั้งใจไม่ทำ</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Card>
            <h3 className="font-medium text-gray-100 text-sm">ไม่แสดงแบบประเมินที่ไม่มีสิทธิ์เผยแพร่</h3>
            <ul className="mt-2.5 space-y-2">
              {WITHHELD_INSTRUMENTS.map((w) => (
                <li key={w.name} className="text-[0.72rem] text-gray-400 leading-relaxed">
                  <span className="text-gray-300">{w.name}</span> — {w.reasonTh}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[0.7rem] text-faint">
              เรื่องการนอนจึงวัดจากบันทึกการนอนของคุณเองแทน แล้วคำนวณประสิทธิภาพการนอนด้วยสูตรที่แสดงไว้
            </p>
          </Card>
          <Card>
            <h3 className="font-medium text-gray-100 text-sm">ที่มาของตารางหลักฐาน</h3>
            <p className="mt-2.5 text-[0.72rem] text-gray-400 leading-relaxed">{VERIFICATION_NOTE}</p>
          </Card>
        </div>
      </section>

      {/* safety, always visible from the front door */}
      <section className="max-w-5xl mx-auto px-5 py-10">
        <Card>
          <h2 className="font-semibold text-gray-100">ถ้าตอนนี้ไม่ไหว</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {CRISIS_RESOURCES.map((r) => (
              <li key={r.phone} className="text-sm">
                <a href={`tel:${r.phone.replace(/-/g, "")}`} className="text-gold font-semibold tabular-nums">
                  {r.phone}
                </a>{" "}
                <span className="text-gray-300">{r.th}</span>{" "}
                <span className="text-[0.7rem] text-faint">{r.hoursTh}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </main>
  );
}
