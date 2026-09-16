import Link from "next/link";
import { STAGE_PLANS } from "@/lib/stagelab/plans";

export const metadata = {
  title: "StageLab — ทำรอบทบทวนหุ้นรายสัปดาห์ให้จบใน 40 นาที",
};

const STEPS = [
  { n: "1", title: "ให้คะแนนตลาด", body: "ห้าข้อ ข้อละ 2 คะแนน ผลรวมบอกว่าสัปดาห์นี้ควรถือหุ้นกี่เปอร์เซ็นต์ — ก่อนจะคุยกันเรื่องหุ้นตัวไหน" },
  { n: "2", title: "จัดอันดับกลุ่ม", body: "หุ้นครึ่งหนึ่งเคลื่อนตามกลุ่มของมัน เลือกกลุ่มถูกก่อน แล้วค่อยเลือกหุ้น" },
  { n: "3", title: "กรองด้วย Funnel", body: "หกชั้นจากสภาพคล่องถึงการเติบโตของกำไร และบอกด้วยว่าชั้นไหนเป็นตัวตัด" },
  { n: "4", title: "ทบทวนพอร์ต", body: "ไล่ทีละไม้ เทียบ Stage กับ Stop แล้วให้ระบบบอกว่าควรถือ ลด หรือออก" },
  { n: "5", title: "เขียนแผน", body: "สิ่งที่จะซื้อที่ราคาเท่าไร และจะขายเมื่อเกิดอะไร — เขียนตอนตลาดปิด ไม่ใช่ตอนตลาดเปิด" },
];

const HONEST = [
  {
    q: "ข้อมูลราคาเป็นของจริงไหม",
    a: "ไม่ใช่ จักรวาลหุ้นในระบบเป็นชุดข้อมูลสังเคราะห์แบบกำหนดผลได้ — เมล็ดสุ่มเดิมให้ผลเดิมทุกครั้ง มันออกแบบมาให้ Funnel แคบลงอย่างสมจริงสำหรับฝึกและเปรียบเทียบกฎ ไม่ได้ต่อกับฟีดราคาจริง และเราไม่แสดงมันเป็นราคาตลาด",
  },
  {
    q: "แล้ว Backtest ล่ะ",
    a: "รันบนซีรีส์ชุดเดียวกัน จึงใช้ตอบคำถามแบบ “เปิดตัวกรองวอลุ่มแล้วอะไรเปลี่ยน” ได้ดี แต่ตอบคำถาม “ผมจะได้กำไรเท่าไร” ไม่ได้ และเราไม่ได้ทำท่าว่าตอบได้",
  },
  {
    q: "ระบบบอกให้ซื้ออะไรไหม",
    a: "ไม่ ระบบจัดระเบียบเกณฑ์ที่คุณตั้งไว้เองแล้วบอกว่าอะไรผ่านหรือไม่ผ่าน คำแนะนำในหน้าพอร์ตคือการอ่านกฎที่คุณเขียนไว้ก่อนเข้าไม้ ไม่ใช่การพยากรณ์ราคา",
  },
  {
    q: "ข้อมูลของผมใครเห็นได้บ้าง",
    a: "เฉพาะบัญชีของคุณ ทุกแถวผูกกับผู้ใช้และทุกคำสั่งกรองด้วยรหัสผู้ใช้เสมอ จักรวาลหุ้นเป็นข้อมูลอ้างอิงร่วมที่อ่านได้อย่างเดียว",
  },
];

export default function StageLabLanding() {
  const free = STAGE_PLANS.free;
  const pro = STAGE_PLANS.pro;

  return (
    <main className="mx-auto max-w-5xl px-4 py-14">
      <section className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">StageLab</p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-zinc-50 sm:text-4xl">
          ทำรอบทบทวนหุ้นรายสัปดาห์ให้จบ
          <br className="hidden sm:block" /> ในนั่งเดียว
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-zinc-300">
          ระบบ Stage Analysis ของ Stan Weinstein ทั้งชุด — ให้คะแนนตลาด จัดอันดับกลุ่ม กรองหุ้น
          ทบทวนพอร์ต แล้วจบด้วยแผนที่เขียนไว้ล่วงหน้า ตัดสินใจสัปดาห์ละครั้ง แทนที่จะตัดสินใจวันละสิบครั้ง
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href="/stagelab/app"
            className="inline-flex min-h-11 items-center rounded-lg bg-emerald-500 px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-emerald-400"
          >
            เริ่มใช้ฟรี
          </Link>
          <Link
            href="/stagelab/pricing"
            className="inline-flex min-h-11 items-center rounded-lg border border-zinc-700 px-5 text-sm text-zinc-200 transition-colors hover:border-zinc-600"
          >
            ดูแผนและราคา
          </Link>
        </div>
        <p className="mt-3 text-xs text-zinc-400">
          แผนฟรีทำรอบทบทวนได้ครบทั้ง 5 ขั้น ไม่มีกำหนดวันหมดอายุ
        </p>
      </section>

      <section className="mt-16">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-zinc-400">
          รอบทบทวน 5 ขั้น
        </h2>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 font-mono text-xs text-emerald-300">
                {s.n}
              </span>
              <h3 className="mt-2.5 text-sm font-medium text-zinc-100">{s.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="text-sm font-semibold text-zinc-100">{free.label} — เริ่มได้เลย</h2>
          <p className="mt-1 text-xs text-zinc-400">{free.tagline}</p>
          <ul className="mt-3 space-y-1.5 text-xs text-zinc-300">
            <li>• รอบทบทวนครบทั้ง 5 ขั้น</li>
            <li>• Screener พร้อม Funnel 6 ชั้น เต็มจักรวาลหุ้น</li>
            <li>• Watchlist {free.limits.watchlist} รายการ · พอร์ต {free.limits.positions} สถานะเปิด</li>
            <li>• Journal และเครื่องมือคำนวณขนาดไม้ทั้งหมด</li>
          </ul>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <h2 className="text-sm font-semibold text-emerald-200">{pro.label} — โต๊ะวิจัย</h2>
          <p className="mt-1 text-xs text-zinc-300">{pro.tagline}</p>
          <ul className="mt-3 space-y-1.5 text-xs text-zinc-200">
            <li>• Stock Thesis — หน้าเดียวจบ พร้อมคะแนนเทคนิค+พื้นฐานที่คำนวณจากหลักฐาน</li>
            <li>• Backtest กลยุทธ์ Stage 2 และ Risk Radar</li>
            <li>• Pro Desk — Short, Sector Rotation, Multi-Timeframe, Options</li>
            <li>• Quant Lab — มอนติคาร์โล กับดักปันผล คะแนน 360° และสมุดหลักฐานแบบ hash chain</li>
          </ul>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-zinc-400">
          สิ่งที่ระบบนี้ไม่ได้เป็น
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-xs text-zinc-400">
          เครื่องมือเกี่ยวกับวินัยที่ไม่ตรงไปตรงมากับผู้ใช้ ก็ไม่ควรมีใครเชื่อถือ
        </p>
        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          {HONEST.map((x) => (
            <div key={x.q} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <dt className="text-sm font-medium text-zinc-100">{x.q}</dt>
              <dd className="mt-1.5 text-xs leading-relaxed text-zinc-400">{x.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="mt-16 border-t border-zinc-800 pt-6 text-center">
        <Link
          href="/stagelab/app"
          className="inline-flex min-h-11 items-center rounded-lg bg-emerald-500 px-5 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
        >
          เข้าใช้งาน StageLab
        </Link>
        <p className="mt-4 text-[0.7rem] leading-relaxed text-zinc-400">
          StageLab ไม่ใช่คำแนะนำการลงทุน และไม่ใช่ผู้ให้บริการข้อมูลราคาหลักทรัพย์
          การตัดสินใจซื้อขายและผลที่ตามมาเป็นของผู้ใช้เอง
        </p>
      </footer>
    </main>
  );
}
