# แผนสินค้า + ราคาเชิงลึก (Product & Pricing Strategy)

> เอกสารต่อจาก `PORTFOLIO.md` — เจาะรายละเอียด "สินค้าแต่ละตัว + โครงราคา + กลุ่มลูกค้า + โมเดลรายได้"
> เพื่อใช้ตั้งราคาและออกสินค้าดิจิทัลขายจริง
> สกุลเงิน: บาท (THB) · อ้างอิงราคาตั้งต้นที่มีในระบบแล้ว: Free ฿0 · Pro ฿299/เดือน · Premium ฿599/เดือน

---

## 0. ภาพรวมสายสินค้า (Product Lines)

| สาย | ตลาด | รูปแบบรายได้ | ความพร้อม |
|---|---|---|---|
| **A. NaraSuite SaaS** (consumer) | คนทั่วไป/พ่อแม่/คนเปลี่ยนชื่อ | Subscription + รายชิ้น | ✅ พร้อมขาย |
| **B. Honest Oracle** (consumer premium) | คนสนใจพัฒนาตน | รายชิ้น (PDF) + Subscription | ✅ พร้อมขาย |
| **C. Developer API** (B2D) | นักพัฒนา/แอปดูดวง | Usage/seat-based | ✅ มีโครงแล้ว |
| **D. B2B / White-label** (enterprise) | สำนักโหราศาสตร์/ธุรกิจ | License + setup fee | 🟡 ต่อยอด |
| **E. OMNISIM Toolkit** (technical) | ทีม ML/research | License/PyPI | 🟡 ต่อยอด |

หลักการตั้งราคา: **anchor ด้วย paradigm "Honest"** (ไม่ขายคำทำนายเกินจริง) → ราคาสมเหตุผล ขายที่ "คุณภาพรายงาน + ทำซ้ำได้ + integrate ได้" ไม่ใช่ขายความกลัว

---

## A. NaraSuite SaaS (Consumer Subscription)

### สินค้าย่อย (SKU) และราคารายชิ้น
| SKU | สินค้า | ราคารายชิ้น (แนะนำ) | เหตุผลตั้งราคา |
|---|---|---|---|
| NN-01 | NaraName — วิเคราะห์ชื่อบุคคล | ฿99 / ครั้ง | ราคาเข้าถึงง่าย เป็น entry product |
| NC-01 | NaraCorp — วิเคราะห์ชื่อแบรนด์/องค์กร | ฿990 / ครั้ง | B2B, มูลค่าต่อการตัดสินใจสูง |
| NB-01 | NaraChild — ตั้งชื่อเด็ก (พร้อม 5 ชื่อแนะนำ) | ฿499 / ครั้ง | อารมณ์สูง ตั้งครั้งเดียวทั้งชีวิต |
| NR-01 | NaraRename — แผนเปลี่ยนชื่อ 7 ขั้น | ฿699 / ครั้ง | รวมแผน soft transition |

### แพ็กเกจ Subscription (ปรับจากของเดิม)
| แผน | ราคา | สิทธิ์ | กลุ่มเป้าหมาย |
|---|---|---|---|
| **Free** | ฿0 | วิเคราะห์จำกัด/วัน · เก็บประวัติ · แชร์ลิงก์ manual | ทดลอง/ดึง lead |
| **Pro** | **฿299/เดือน** (หรือ ฿2,990/ปี ประหยัด 2 เดือน) | ไม่จำกัด/วัน · ประวัติยาว · ทุก SKU consumer · export PDF | ผู้ใช้จริงจัง/หมอดูรายย่อย |
| **Premium** | **฿599/เดือน** | ทุกอย่างใน Pro + **Public API + API keys** + โควตา API/วัน | นักพัฒนา/ผู้ให้บริการต่อ |

> เพิ่มทางเลือก **รายปี** ทุกแผน (ส่วนลด ~17%) เพื่อล็อก cashflow และลด churn

---

## B. Honest Oracle — แผนที่ชีวิต 100 ปี (Premium Consumer)

**จุดขาย:** deterministic (ผลเดิมทุกครั้ง) + รายงานเชิงลึก 4 หัวข้อ × 30 บรรทัด + แผนปฏิบัติ 40 ข้อ + กราฟชีวิต 100 ปี

| SKU | สินค้า | ราคา | หมายเหตุ |
|---|---|---|---|
| HO-FREE | อ่านผลออนไลน์ (จำกัด/วัน) | ฿0 | ดึง lead → upsell PDF |
| HO-PDF | **รายงาน PDF ฉบับเต็ม** (ดาวน์โหลด) | **฿199 / ฉบับ** | สินค้ารายชิ้นเรือธง |
| HO-GIFT | รายงานเป็นของขวัญ (e-certificate) | ฿249 / ฉบับ | ขายเทศกาล/วันเกิด |
| HO-SUB | อ่านไม่จำกัด + อัปเดตรายงาน | รวมใน Pro ฿299/เดือน | cross-sell กับ NaraSuite |

**Bundle แนะนำ:** "แพ็กครอบครัว" — 3 รายงาน PDF ฿499 (จากปกติ ฿597) เพื่อดันยอดต่อออร์เดอร์

---

## C. Developer API (B2D — ขายให้คนเอาไปต่อ)

มีโครงพร้อมแล้ว: `POST /api/public/oracle` + `x-api-key` + usage quota รายวัน

| แพ็กเกจ | ราคา/เดือน | โควตา | เหมาะกับ |
|---|---|---|---|
| **API Starter** | ฿599 (= Premium) | ~500 calls/วัน | แอปเล็ก/ทดลอง |
| **API Growth** | ฿1,990 | ~5,000 calls/วัน | แอปที่มีผู้ใช้จริง |
| **API Scale** | ฿5,900 | ~20,000 calls/วัน + SLA | ผู้ให้บริการรายใหญ่ |
| Overage | ฿0.50–1.00 / call ส่วนเกิน | — | ยืดหยุ่นช่วง peak |

**สิ่งที่ต้องเพิ่มก่อนขาย:** เอกสาร API (public) · dashboard แสดง usage ให้ลูกค้า · rate-limit ตามแพ็ก

---

## D. B2B / White-label (Enterprise — มูลค่าต่อดีลสูงสุด)

ขาย **MCAS engine + Honest Oracle** ให้ธุรกิจฝังใช้ในแบรนด์ตัวเอง

| ดีล | ราคา (แนะนำ) | ขอบเขต |
|---|---|---|
| **White-label License** | ฿30,000–80,000 setup + ฿5,900–15,000/เดือน | ฝัง engine, แบรนด์ลูกค้า, subdomain |
| **NaraCorp Enterprise** | ฿9,900–49,000 / โครงการ | วิเคราะห์ชื่อแบรนด์เชิงลึก + รายงาน + ปรึกษา |
| **Custom Integration** | ตั้งราคาตามงาน (฿50,000+) | เชื่อมระบบลูกค้า, ปรับ scoring |

**ลูกค้าเป้าหมาย:** สำนักโหราศาสตร์, บริษัทตั้งชื่อ, เอเจนซี branding, แอปดูดวงที่อยากมี engine จริง

---

## E. OMNISIM Toolkit (Technical — สายแยก)

ขายจุดแข็ง "Honest Validation / Model Integrity" ไม่ใช่ตัวทำนาย

| สินค้า | รูปแบบ | ราคา (แนะนำ) | ลูกค้า |
|---|---|---|---|
| **Validation Harness** | PyPI (open core) + Pro license | Free core / ฿9,900–29,000 ต่อทีม/ปี | ทีม ML/research |
| **Social-Dynamics Sandbox** | คอร์ส/เวิร์กช็อป + license | ฿3,900–9,900 / seat | การศึกษา/consulting |
| **Consulting** | งานที่ปรึกษา | ฿20,000+ / โปรเจกต์ | องค์กรที่ต้อง audit โมเดล |

> จุดขายที่ซื่อตรง: harness ตรวจได้ว่า "โมเดลมี skill จริงไหม" (มี `test_harness_detects_failure`, significance gate) — ตรงกับความต้องการ AI governance/integrity

---

## กลุ่มลูกค้า (Segments / Personas)

1. **ผู้บริโภคทั่วไป** — อยากรู้จักตัวเอง/ตัดสินใจ → NaraName, Honest Oracle PDF (ราคาต่ำ, volume สูง)
2. **พ่อแม่มือใหม่** — ตั้งชื่อลูก → NaraChild (อารมณ์สูง, ยอมจ่าย)
3. **คนกำลังเปลี่ยนชีวิต** — เปลี่ยนชื่อ/เปลี่ยนงาน → NaraRename (มูลค่าสูง)
4. **เจ้าของธุรกิจ/แบรนด์** — ตั้งชื่อบริษัท → NaraCorp Enterprise (ดีลใหญ่)
5. **นักพัฒนา/สตาร์ทอัป** — อยากได้ engine → Developer API (recurring)
6. **สำนัก/เอเจนซี** — อยากมีแบรนด์ตัวเอง → White-label (ดีลใหญ่สุด)
7. **ทีมเทคนิค/ML** — ต้องการ integrity tool → OMNISIM (ตลาดคนละกลุ่ม, กระจายความเสี่ยง)

---

## โมเดลรายได้ & การจัดบันเดิล

**3 ชั้นรายได้:**
- **Volume/entry** (฿99–199): NaraName, Honest Oracle PDF → ดึงคนเข้า + สร้าง awareness
- **Recurring** (฿299–5,900/เดือน): Subscription + API → รายได้สม่ำเสมอ (แกนหลักของ valuation)
- **High-ticket** (฿9,900+): B2B, White-label, Consulting → กำไรต่อดีลสูง

**Bundle / Upsell path:**
- Free → PDF รายชิ้น → Pro subscription → (ถ้าเป็น dev) Premium/API → (ถ้าเป็นธุรกิจ) White-label
- ทุกจุดมี transparency note คงจุดยืนแบรนด์

**ตัวเลขที่ต้องเก็บเพื่อปรับราคา:** conversion Free→Paid, ARPU, churn รายเดือน, ต้นทุนต่อ report (ถ้ามี AI cost), CAC ต่อช่องทาง

---

## สิ่งที่ต้องทำก่อนเปิดขายแต่ละสาย (Checklist)

- **A/B (SaaS + Oracle):** ต่อ Stripe production · เพิ่ม export PDF · หน้า pricing รายปี · invoice/ใบเสร็จ
- **C (API):** public API docs · usage dashboard ลูกค้า · rate-limit ต่อแพ็ก · ตัวอย่างโค้ด
- **D (B2B):** ใบเสนอราคา template · demo environment · สัญญา license
- **E (OMNISIM):** README/docs สำหรับขาย · แยก open-core vs pro · หน้า landing เทคนิค

---

*หลักยึด: ตั้งราคาบน "คุณค่าที่ทำซ้ำได้ + integrate ได้ + ซื่อตรง" ตาม paradigm หลัก
ทุกราคาข้างต้นเป็นจุดตั้งต้นให้ทดสอบตลาด ปรับได้ตามข้อมูล conversion จริง*
