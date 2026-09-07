import { CRISIS_RESOURCES } from "@/lib/therapy-engine/safety";
import { CUTPOINTS } from "@/lib/therapy-engine/scoring";
import { INSTRUMENTS } from "@/lib/therapy-engine/instruments";
import { Card, Disclaimer, PageHeader } from "../_components";

// A server component with no state and no gate: this page must render for
// everyone, signed in or not, JavaScript or not.

export default function SafetyPage() {
  const item9 = INSTRUMENTS.phq9.items.find((i) => i.safetyCritical)!;

  return (
    <main className="max-w-3xl mx-auto px-5 py-12">
      <PageHeader
        eyebrow="ความปลอดภัย"
        title="ถ้าตอนนี้ไม่ไหว"
        lead="โทรได้เลย ไม่ต้องรอให้แน่ใจว่าอาการหนักพอ"
      />

      <div className="mt-8 grid gap-3">
        {CRISIS_RESOURCES.map((r) => (
          <Card key={r.phone}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <a href={`tel:${r.phone.replace(/-/g, "")}`} className="text-3xl font-semibold tabular-nums text-gold">
                {r.phone}
              </a>
              <span className="text-gray-200">{r.th}</span>
            </div>
            <p className="mt-1 text-[0.72rem] text-faint">{r.hoursTh}</p>
            {r.note && <p className="mt-1 text-[0.72rem] text-gray-400">{r.note}</p>}
          </Card>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">แอปนี้ตัดสินใจเตือนอย่างไร</h2>
        <Card className="mt-4">
          <ol className="space-y-3 text-sm text-gray-300 list-decimal list-inside">
            <li>
              ถ้าตอบข้อ {item9.n} ของ PHQ-9 (&ldquo;{item9.th}&rdquo;) มากกว่า 0 — ขึ้นคำเตือนสูงสุดทันที
              <span className="block text-[0.72rem] text-faint mt-1 ml-5 leading-relaxed">
                ตรวจก่อนดูคะแนนรวมเสมอ คนที่ตอบ 0 ทุกข้อยกเว้นข้อนี้จะได้คะแนนรวม 1 จาก 27 ซึ่งทุกเกณฑ์เรียกว่า
                &ldquo;น้อยมาก&rdquo; — แอปที่ตัดสินใจจากผลรวมจะแสดงข้อความยินดีให้คนคนนั้น
              </span>
            </li>
            <li>
              ถ้าคะแนนอยู่ในช่วงรุนแรงที่สุดของแบบประเมินใดแบบหนึ่ง — แนะนำให้ผู้ให้บริการสุขภาพนำการดูแล
            </li>
            <li>
              ถ้าคะแนนถึงจุดตัดของการคัดกรอง (GAD-7 ≥ {CUTPOINTS.gad7.score} หรือ PHQ-9 ≥ {CUTPOINTS.phq9.score}) —
              แนะนำให้ปรึกษาผู้ให้บริการสุขภาพ
            </li>
          </ol>
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">สิ่งที่กฎเหล่านี้ทำไม่ได้</h2>
        <Card className="mt-4">
          <p className="text-sm text-gray-300 leading-relaxed">
            กฎข้างบนเป็นตารางเงื่อนไขบนคำตอบของแบบสอบถาม ไม่ใช่การทำนายความเสี่ยง
            งานทบทวนงานวิจัยพบว่าเครื่องมือประเมินความเสี่ยงการฆ่าตัวตายมีค่าทำนายผลบวกต่ำเกินกว่าจะใช้จัดสรรการดูแลได้
            สิ่งที่กฎนี้ทำได้จริงคือ &ldquo;ตัดสินใจว่าจะแสดงเบอร์โทรเมื่อไหร่&rdquo; เท่านั้น
          </p>
          <p className="mt-3 text-sm text-gray-300 leading-relaxed">
            และการที่ไม่ขึ้นคำเตือน <span className="text-gray-100">ไม่ได้แปลว่าปลอดภัย</span> —
            แบบคัดกรองรู้เฉพาะสิ่งที่คุณตอบมาในช่วง 2 สัปดาห์ที่ถาม
          </p>
          <div className="mt-4">
            <Disclaimer>
              MindBridge ไม่ใช่บริการฉุกเฉิน ไม่มีเจ้าหน้าที่เฝ้าดูคำตอบของคุณแบบเรียลไทม์
              และไม่ได้ติดต่อใครแทนคุณ หากมีอันตรายเฉพาะหน้า โทร 1669 หรือ 191
            </Disclaimer>
          </div>
        </Card>
      </section>
    </main>
  );
}
