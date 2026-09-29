import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'ข้อกำหนดและข้อจำกัด — Omniscient Quant Engine',
  description: 'สิ่งที่แพลตฟอร์มนี้เป็นและไม่เป็น ที่มาของข้อมูล ข้อจำกัดของผลทดสอบ การใช้ LLM ความเป็นส่วนตัว และความปลอดภัย',
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="text-base font-semibold text-zinc-100">
        {title}
      </h2>
      <div className="space-y-2 text-sm leading-relaxed text-zinc-300">{children}</div>
    </section>
  );
}

/** หน้าสาธารณะ (เข้าได้โดยไม่ต้องยืนยันตัวตน) — ไม่มีข้อมูลของผู้ใช้ */
export default function TermsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-200 sm:px-6">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-zinc-400">Omniscient Quant Engine</p>
          <h1 className="text-2xl font-bold text-zinc-50">ข้อกำหนดและข้อจำกัดของการใช้งาน</h1>
          <p className="text-sm text-zinc-300">
            อ่านก่อนใช้ตัวเลขใดจากแพลตฟอร์มนี้ประกอบการตัดสินใจ — ทุกข้อด้านล่างเป็นข้อเท็จจริงของระบบ ไม่ใช่ข้อความทางการตลาด
          </p>
        </header>

        <Section id="what" title="1. สิ่งนี้คืออะไร และไม่ใช่อะไร">
          <p>
            เป็นเครื่องมือวิจัยการเทรดเชิงระบบ (5 Gates, walk-forward backtest, Meta-Risk, Apex sizing) สำหรับการศึกษาและทดลองของผู้ใช้เอง
          </p>
          <p>
            <strong className="text-zinc-100">ไม่ใช่คำแนะนำการลงทุน</strong> ไม่ใช่บริการของที่ปรึกษาการลงทุนที่ได้รับอนุญาตจากสำนักงาน ก.ล.ต. และไม่รับประกันผลตอบแทน
            การซื้อขายหลักทรัพย์มีความเสี่ยง ผู้ใช้ต้องตัดสินใจและรับผลของการตัดสินใจเอง
          </p>
        </Section>

        <Section id="data" title="2. ข้อมูลที่ระบบใช้">
          <p>
            ค่าเริ่มต้นเป็น <strong className="text-zinc-100">ข้อมูลจำลอง</strong> จาก generator (seed คงที่) ที่สร้างให้มีโครงสร้างคล้ายตลาดหุ้นไทย —
            ราคา งบ และเงินไหลในชุดนี้ <strong className="text-zinc-100">ไม่ใช่ราคาตลาดจริง</strong> แม้ชื่อหุ้นจะตรงกับหุ้นจริง
          </p>
          <p>
            ผู้ดูแลนำเข้าข้อมูลจริงแทนได้ (CSV หรือ Yahoo Finance ผ่านสคริปต์ / POST /api/data/ingest) — ผู้นำเข้ารับผิดชอบสิทธิ์การใช้ข้อมูลนั้นเอง
            ระบบบันทึกที่มา สิทธิ์ และวันที่ของทุกชุดข้อมูล และแสดงป้ายที่มาของข้อมูลที่แถบล่างของทุกหน้าเสมอ
          </p>
          <p>
            ความสดของข้อมูลจริงวัดเทียบปฏิทินวันซื้อขาย SET ที่ฝังในระบบ (ปี 2025–2026 แบบ best-effort — ต้องตรวจกับประกาศวันหยุดของ SET)
            ข้อมูลที่นำเข้าแบบมีแต่ราคา: สายวิเคราะห์ที่ต้องใช้งบการเงินหรือเงินไหลสถาบัน <em>งดออกเสียง</em> แทนการเดาค่า
          </p>
        </Section>

        <Section id="limits" title="3. ข้อจำกัดของผลทดสอบ">
          <ul className="list-disc space-y-1 pl-5">
            <li>กติกา (threshold/น้ำหนัก) ถูกจูนบนข้อมูลจำลองชุดเดียวกับที่ใช้แสดงผล — ผลย้อนหลังจึงดูดีกว่าที่ควรคาดหวังจากข้อมูลใหม่</li>
            <li>walk-forward แยกช่วงฝึก/ทดสอบและเว้นช่วง (embargo) แล้ว แต่ไม่ได้รวมต้นทุนธุรกรรม ภาษี slippage จริง หรือข้อจำกัดสภาพคล่องทั้งหมด</li>
            <li>ตัวเลขสำคัญแสดงพร้อมช่วงความเชื่อมั่น 95% (hit rate, P(win), R) — ช่วงกว้าง = ยังไม่รู้จริง</li>
            <li>หน้า &quot;ความทนทานข้าม seed&quot; บอกว่ากติกาให้ผลทางเดียวกันบนโลกจำลองอื่นหรือไม่ — ผ่านแล้วก็ยังไม่ใช่หลักฐานว่ามี edge ในตลาดจริง</li>
            <li>ล็อกกติกา (pre-registration) ก่อนดูผลรอบใหม่ทุกครั้ง — ทุกรายงานบอกว่าใช้กติกาชุดที่ล็อกไว้หรือไม่</li>
          </ul>
        </Section>

        <Section id="llm" title="4. การใช้ LLM">
          <p>
            ใช้เฉพาะ 3 จุด: หลอมรวมด้วย AI, AI Auditor และแชท AI Analyst — และเฉพาะเมื่อผู้ดูแลตั้งค่าผู้ให้บริการเท่านั้น (ไม่ตั้ง = ไม่มีข้อมูลใดถูกส่งออก)
          </p>
          <p>
            สิ่งที่ส่งไป: ตัวเลขและข้อสรุปที่ระบบคำนวณแล้ว (evidence JSON) กับคำถามที่ผู้ใช้พิมพ์ — ไม่มีรหัสผ่าน token หรือไฟล์ฐานข้อมูล
            ข้อความจาก LLM เป็นการเรียบเรียง ไม่ใช่การคำนวณ และอาจผิดได้
          </p>
        </Section>

        <Section id="privacy" title="5. ความเป็นส่วนตัวและความปลอดภัย">
          <ul className="list-disc space-y-1 pl-5">
            <li>ข้อมูลทั้งหมดอยู่ในฐานข้อมูล SQLite บนเครื่องที่รันระบบ — ไม่มีบัญชีผู้ใช้รายคนและไม่มีการเก็บข้อมูลส่วนบุคคล</li>
            <li>ค่าเริ่มต้นรับเฉพาะคำขอจากเครื่องเดียวกัน เปิดให้เครื่องอื่นต้องตั้งรหัสผ่าน (ผู้ดูแล/ผู้ชมแบบอ่านอย่างเดียว) และควรมี HTTPS ด้านหน้า</li>
            <li>การกระทำที่แก้ข้อมูลหรือเรียก LLM ถูกบันทึกว่าเข้ามาทางใด (local/basic/viewer/token) เวลาใด — ดูได้ที่ /api/audit-log</li>
            <li>สำเนาสำรองฐานข้อมูลถูกสร้างก่อนแทนที่ข้อมูลทุกครั้ง และอ่านได้เฉพาะเจ้าของไฟล์</li>
          </ul>
        </Section>

        <Section id="software" title="6. ซอฟต์แวร์">
          <p>
            ให้ใช้ตามสภาพ (as is) โดยไม่มีการรับประกันใด ๆ · repository ยังไม่ได้ระบุสัญญาอนุญาต (license) — ติดต่อเจ้าของ repository ก่อนนำไปเผยแพร่หรือใช้เชิงพาณิชย์
          </p>
        </Section>

        <footer className="border-t border-zinc-800 pt-4 text-sm">
          <Link href="/" className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200">
            ← กลับสู่แพลตฟอร์ม
          </Link>
        </footer>
      </article>
    </main>
  );
}
