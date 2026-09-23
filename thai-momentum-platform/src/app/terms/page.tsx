import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, Database, FileCheck2, Landmark, Scale, ShieldCheck, UserLock } from "lucide-react"
import type { ReactNode } from "react"

// ข้อกำหนดการใช้งาน · การเปิดเผยความเสี่ยง · สิทธิ์การใช้ข้อมูล · กฎหมายหลักทรัพย์ · PDPA
// เปิดได้โดยไม่ต้องเข้าสู่ระบบ (public path ใน src/lib/security/paths.ts)

export const metadata: Metadata = {
  title: "ข้อกำหนดการใช้งานและการเปิดเผยความเสี่ยง — Thai Momentum Platform",
  description: "ไม่ใช่คำแนะนำการลงทุน · โหมดกระดาษ 100% · สิทธิ์การใช้ข้อมูลตลาด · PDPA",
}

const VERSION = "1.0"
const UPDATED = "23 กันยายน 2569"

const SECTIONS = [
  { id: "use", title: "ข้อกำหนดการใช้งาน" },
  { id: "risk", title: "การเปิดเผยความเสี่ยง" },
  { id: "data", title: "แหล่งข้อมูลและสิทธิ์การใช้ข้อมูล" },
  { id: "sec", title: "กฎหมายหลักทรัพย์ (ก.ล.ต.)" },
  { id: "pdpa", title: "ข้อมูลส่วนบุคคล (PDPA)" },
  { id: "audit", title: "บันทึกตรวจสอบย้อนหลังและการส่งออก" },
  { id: "liability", title: "การรับประกันและความรับผิด" },
] as const

function Section({ id, icon, title, children }: { id: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section id={id} className="feature scroll-mt-6 px-5 py-5 sm:px-7 sm:py-6">
      <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
        <span className="text-gold-ink">{icon}</span>
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-foreground/90 [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  )
}

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-ink hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> กลับสู่แพลตฟอร์ม
      </Link>

      <header className="hero-card px-6 py-7 sm:px-8">
        <p className="gold-kicker">Thai Momentum Platform · ข้อกำหนด</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">ข้อกำหนดการใช้งานและการเปิดเผยความเสี่ยง</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          ฉบับ {VERSION} · ปรับปรุงล่าสุด {UPDATED}
        </p>
        <div className="mt-5 rounded-2xl border border-gold/45 bg-gold-soft px-4 py-3.5 text-[15px] leading-relaxed text-foreground">
          <p className="flex items-center gap-2 font-bold">
            <AlertTriangle className="size-4 shrink-0" aria-hidden /> สรุปสั้น
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <b>ไม่ใช่คำแนะนำการลงทุน</b> — ทุกตัวเลข สัญญาณ และคะแนนเป็นผลการคำนวณเชิงสถิติเพื่อการศึกษา
            </li>
            <li>
              <b>โหมดกระดาษ (paper mode) 100%</b> — ระบบไม่ส่งคำสั่งซื้อขายจริงและไม่เชื่อมกับบัญชีซื้อขายใด ๆ
            </li>
            <li>ข้อมูลตลาดอาจผิดพลาด ล่าช้า หรือเป็นข้อมูลจำลอง (demo) — ตรวจกับแหล่งทางการก่อนใช้</li>
            <li>ห้ามนำข้อมูลตลาดหรือสัญญาณไปเผยแพร่/ขายต่อบุคคลอื่นโดยไม่มีสิทธิ์หรือใบอนุญาตที่เกี่ยวข้อง</li>
          </ul>
        </div>
        <nav aria-label="สารบัญ" className="mt-5 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-border bg-card/90 px-3 py-1 text-xs font-semibold text-foreground hover:border-gold/60 hover:text-gold-ink"
            >
              {s.title}
            </a>
          ))}
        </nav>
      </header>

      <div className="mt-6 space-y-5">
        <Section id="use" icon={<FileCheck2 className="size-5" aria-hidden />} title="1. ข้อกำหนดการใช้งาน">
          <ul>
            <li>แพลตฟอร์มนี้เป็นเครื่องมือวิจัยและการศึกษาส่วนบุคคลสำหรับวิเคราะห์โมเมนตัมหุ้นไทย</li>
            <li>ผู้ใช้เป็นผู้ตัดสินใจลงทุนและรับผิดชอบผลการตัดสินใจของตนเองทั้งหมด</li>
            <li>ห้ามใช้เพื่อหลอกลวง ชี้นำหรือสร้างราคาหลักทรัพย์ เผยแพร่ข้อมูลเท็จ หรือการกระทำใดที่ขัดต่อกฎหมาย</li>
            <li>
              ผู้ติดตั้งและเปิดให้บริการ (ผู้ดูแลระบบ) มีหน้าที่ตั้งรหัสผ่าน (TMP_AUTH_PASSWORD) ก่อนเปิดให้เครื่องอื่นเข้าถึง
              และรับผิดชอบการให้สิทธิ์ผู้ใช้อื่น
            </li>
          </ul>
        </Section>

        <Section id="risk" icon={<AlertTriangle className="size-5" aria-hidden />} title="2. การเปิดเผยความเสี่ยง">
          <ul>
            <li>
              <b>ไม่ใช่คำแนะนำการลงทุน:</b> คะแนนโมเมนตัม การตัดสินใจของ Jev, Flagship, SET Sniper, GTAA และผล backtest
              เป็นผลลัพธ์ของแบบจำลอง ไม่ได้คำนึงถึงวัตถุประสงค์ ฐานะการเงิน หรือความเสี่ยงที่รับได้ของผู้ใดโดยเฉพาะ
            </li>
            <li>
              <b>โหมดกระดาษ:</b> การ “อนุมัติ” ใน Human Gate และพอร์ตทั้งหมดเป็นการบันทึกเทรดจำลองเท่านั้น
              ผลจริงจะต่างจากนี้เพราะต้นทุน ภาษี ค่าธรรมเนียม สภาพคล่อง ราคาเปิดกระโดด และ slippage
            </li>
            <li>
              ผลในอดีตและผลทดสอบย้อนหลังไม่ได้รับประกันผลในอนาคต — แบบจำลองอาจ overfit กับข้อมูลในอดีต
              และอาจใช้ไม่ได้เมื่อสภาวะตลาดเปลี่ยน
            </li>
            <li>การลงทุนในหุ้นมีความเสี่ยง อาจขาดทุนเงินต้นทั้งหมด โดยเฉพาะหุ้นขนาดเล็กหรือสภาพคล่องต่ำ</li>
            <li>
              ข้อมูลตัวอย่าง (demo seed) เป็นตลาดสังเคราะห์ ไม่ใช่ราคาจริง · ผลจากโมเดลภาษา (Shadow Lab / LLM) อาจผิดพลาดได้
            </li>
          </ul>
        </Section>

        <Section id="data" icon={<Database className="size-5" aria-hidden />} title="3. แหล่งข้อมูลและสิทธิ์การใช้ข้อมูล">
          <ul>
            <li>
              <b>Yahoo Finance:</b> ดึงผ่าน endpoint สาธารณะที่ไม่เป็นทางการ เงื่อนไขของ Yahoo อนุญาตเฉพาะการใช้ส่วนบุคคลที่ไม่ใช่เชิงพาณิชย์
              ห้ามแจกจ่าย ขาย หรือเปิดให้ผู้อื่นใช้ข้อมูลต่อ
            </li>
            <li>
              <b>ข้อมูลตลาดของตลาดหลักทรัพย์แห่งประเทศไทย (SET):</b> ราคา ดัชนี และมูลค่าซื้อขายเป็นทรัพย์สินของ SET
              การนำไปแสดงหรือเผยแพร่ต่อบุคคลอื่น (เว็บไซต์ แอป กลุ่มแชต หรือบริการสมาชิก) ต้องได้รับอนุญาตผ่านผู้ให้บริการข้อมูลที่ได้รับอนุญาต
              (licensed information vendor) ของ SET หรือทำสัญญากับ SET โดยตรง
            </li>
            <li>
              <b>settfex:</b> ไลบรารีไม่เป็นทางการที่อ่านข้อมูลจากเว็บไซต์ SET — อยู่ภายใต้เงื่อนไขการใช้งานเว็บไซต์ของ SET ใช้ได้เพื่อการศึกษาส่วนตัวเท่านั้น
            </li>
            <li>
              <b>Settrade Open API:</b> ใช้ได้ตามสัญญาระหว่างผู้ใช้กับบริษัทหลักทรัพย์และ Settrade · <b>แหล่งข้อมูลต่างประเทศ</b> (เช่น Stooq)
              ใช้ได้ตามเงื่อนไขของผู้ให้บริการแต่ละราย
            </li>
            <li>เงื่อนไขของผู้ให้บริการข้อมูลเปลี่ยนแปลงได้ — ผู้ใช้ต้องตรวจสอบฉบับล่าสุดด้วยตนเอง</li>
          </ul>
        </Section>

        <Section id="sec" icon={<Landmark className="size-5" aria-hidden />} title="4. กฎหมายหลักทรัพย์ (สำนักงาน ก.ล.ต.)">
          <ul>
            <li>
              การให้คำแนะนำหรือส่งสัญญาณซื้อขายหลักทรัพย์แก่ผู้อื่นเป็นทางค้าหรือเพื่อค่าตอบแทน (เช่น ขายสัญญาณ กลุ่ม VIP บริการสมาชิก)
              อาจเข้าข่ายการประกอบธุรกิจ <b>ที่ปรึกษาการลงทุน</b> ตามพระราชบัญญัติหลักทรัพย์และตลาดหลักทรัพย์ พ.ศ. 2535
              ซึ่งต้องได้รับใบอนุญาตจากสำนักงานคณะกรรมการกำกับหลักทรัพย์และตลาดหลักทรัพย์ (ก.ล.ต.)
            </li>
            <li>การตัดสินใจลงทุนหรือจัดการเงินลงทุนแทนผู้อื่นต้องได้รับใบอนุญาตที่เกี่ยวข้องเช่นกัน</li>
            <li>
              การเผยแพร่ข้อมูลที่อาจทำให้ผู้อื่นสำคัญผิดเกี่ยวกับราคาหลักทรัพย์ หรือการสร้างราคา เป็นความผิดตามกฎหมายหลักทรัพย์
            </li>
            <li>ปรึกษาผู้เชี่ยวชาญด้านกฎหมายก่อนเปิดให้บุคคลอื่นใช้ผลลัพธ์ของแพลตฟอร์มนี้</li>
          </ul>
        </Section>

        <Section id="pdpa" icon={<UserLock className="size-5" aria-hidden />} title="5. ข้อมูลส่วนบุคคล (พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562)">
          <ul>
            <li>
              <b>ผู้ควบคุมข้อมูล</b> คือผู้ที่ติดตั้งและเปิดให้บริการแพลตฟอร์มนี้ (ผู้ดูแลระบบ) — ติดต่อผู้ดูแลเพื่อใช้สิทธิ์ขอเข้าถึง แก้ไข ลบ
              หรือคัดค้านการประมวลผลข้อมูล
            </li>
            <li>
              <b>Cookie:</b> ใช้ cookie เดียวคือ <code className="rounded bg-muted px-1">tmp_session</code> ซึ่งจำเป็นต่อการเข้าสู่ระบบ
              เก็บเพียงบทบาท (ผู้ดูแล/ผู้ชม) และเวลาหมดอายุ (7 วัน) ไม่มีชื่อ อีเมล หรือตัวระบุตัวบุคคล และไม่ใช้เพื่อติดตามพฤติกรรม
            </li>
            <li>
              <b>บันทึกของเซิร์ฟเวอร์</b> อาจมี IP address ของการเข้าสู่ระบบเพื่อความปลอดภัย (ฐานประโยชน์โดยชอบด้วยกฎหมาย)
              ผู้ดูแลควรกำหนดระยะเวลาเก็บ log ให้เหมาะสม
            </li>
            <li>
              <b>บันทึกตรวจสอบ (EventLog)</b> เก็บการกระทำสำคัญพร้อมบทบาทผู้กระทำ โดยไม่เก็บ IP — เป็น hash chain ที่แก้ไขย้อนหลังไม่ได้
              จึงไม่ควรใส่ข้อมูลส่วนบุคคลในหมายเหตุหรือข้อความใด ๆ ที่บันทึกลงระบบ
            </li>
            <li>
              ไม่มี analytics, tracker หรือโฆษณาของบุคคลที่สาม · ฟอนต์และไฟล์ทั้งหมดโหลดจากเซิร์ฟเวอร์เดียวกัน
              · เซิร์ฟเวอร์ติดต่อภายนอก (Yahoo, Stooq, ผู้ให้บริการ LLM) เฉพาะเมื่อสั่งดึงข้อมูลหรือรันแล็บ และส่งเพียงข้อมูลตลาด
            </li>
            <li>สำเนาสำรองฐานข้อมูล (data/backups) เก็บไว้ในเครื่องของผู้ดูแล 14 ชุดล่าสุด</li>
          </ul>
        </Section>

        <Section id="audit" icon={<ShieldCheck className="size-5" aria-hidden />} title="6. บันทึกตรวจสอบย้อนหลังและการส่งออก">
          <ul>
            <li>
              ทุกเหตุการณ์สำคัญ (สร้าง/นำเข้าข้อมูล อนุมัติคำสั่ง ปรับนโยบาย เข้า/ออกจากระบบ) ถูกผูกด้วย sha256 hash chain
              การแก้ไขย้อนหลังจะทำให้การตรวจสอบรายงานว่า “พัง” ทันที
            </li>
            <li>
              ส่งออกเป็นหลักฐานได้ที่ <code className="rounded bg-muted px-1">/api/events/export?format=csv</code> หรือ{" "}
              <code className="rounded bg-muted px-1">format=json</code> (ต้องเข้าสู่ระบบ) พร้อมสถานะการตรวจ chain
            </li>
          </ul>
        </Section>

        <Section id="liability" icon={<Scale className="size-5" aria-hidden />} title="7. การรับประกันและความรับผิด">
          <ul>
            <li>ซอฟต์แวร์และข้อมูลให้บริการ “ตามสภาพ” โดยไม่มีการรับประกันความถูกต้อง ความครบถ้วน หรือความเหมาะสมกับวัตถุประสงค์ใด</li>
            <li>ผู้พัฒนาและผู้ดูแลระบบไม่รับผิดชอบต่อความเสียหายใด ๆ ที่เกิดจากการใช้หรือการพึ่งพาผลลัพธ์ของแพลตฟอร์ม</li>
            <li>ข้อกำหนดนี้อาจปรับปรุงได้ — ฉบับและวันที่ปรับปรุงแสดงไว้ที่ด้านบนของหน้านี้</li>
          </ul>
        </Section>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Thai Momentum Platform · ข้อกำหนดฉบับ {VERSION} · {UPDATED}
      </p>
    </main>
  )
}
