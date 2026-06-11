# สรุปผลงานทั้งหมด (Portfolio) — สำหรับออกแบบเป็น Digital Products

> เอกสารนี้เรียบเรียงจากงานทั้งหมดที่อยู่ใน repository นี้ เพื่อใช้เป็นแผนที่ตั้งต้น
> ในการออกแบบและพัฒนาเป็นสินค้าดิจิทัลขายจริง
> โครงสร้าง: **Paradigm (กระบวนทัศน์) → Platforms (แพลตฟอร์ม) → Tech (เทคโนโลยี) → Products (สินค้า) → Roadmap**

---

## 1. Paradigm — กระบวนทัศน์หลัก (สิ่งที่ทำให้งานนี้ "ต่าง")

งานทั้งหมดยึด 4 แนวคิดร่วมกัน ซึ่งเป็นจุดขายเชิงคุณค่า ไม่ใช่แค่ฟีเจอร์:

### 1.1 Honest / Transparent — "เครื่องมือสะท้อนตน ไม่ใช่คำทำนาย"
- ทุกผลลัพธ์มี **Transparency note** กำกับว่าเป็น *self-reflection / decision-support* ไม่ใช่การการันตีชะตา
- เป็นจุดยืนทางจริยธรรมที่หาได้ยากในตลาดดูดวง/วิเคราะห์ชื่อ → ใช้เป็น **brand positioning** ได้ทันที
- ปรากฏใน Honest Oracle, หน้า NaraSuite และ note ในผล MCAS

### 1.2 Deterministic Seeded Generation — "ผลเดิมทุกครั้ง ตรวจสอบได้"
- ผลลัพธ์ผูกกับ seed จากข้อมูลนำเข้า (ชื่อ + วันเกิด + เวลา + สถานที่) ผ่าน `fnv1a32` + `mulberry32`
  (`lib/honest-oracle/engine.ts`)
- ไม่สุ่มรายครั้ง → reproducible, แชร์ลิงก์แล้วได้ผลเดิม, สร้าง "ลายเซ็น" เฉพาะตัว (`HO-XXXX-XXXX`)
- คุณค่าเชิงสินค้า: ความน่าเชื่อถือ + ทำ **report ขายเป็นไฟล์** ได้โดยไม่เพี้ยน

### 1.3 MCAS — Multi-Criteria Auspiciousness Scoring (โหราศาสตร์ไทยเชิงคำนวณ)
- แปลงหลักโหราศาสตร์ไทยดั้งเดิมเป็นสกอร์หลายเกณฑ์ที่คำนวณอัตโนมัติ (`lib/engine.ts`):
  - **กาลกิณี** (อักษรต้องห้ามตามวันเกิด, 8 วัน)
  - **เลขศาสตร์** (ค่าเส้น/strokes + เลขมงคล)
  - **วรรคทักษา** 7 มิติ (บริวาร/อายุ/เดชะ/ศรี/มูละ/อุตสาหะ/มนตรี)
  - **สัทศาสตร์** (plosive/nasal/liquid/fricative, ความซับซ้อนเสียง)
  - **ธาตุ 5 มิติ** (วันเกิด/ชื่อ/ฤกษ์/ทิศ/ดิจิทัล)
- คุณค่า: เปลี่ยน "ศาสตร์อัตวิสัย" เป็น **API/สกอร์ที่ integrate ได้**

### 1.4 Honest Validation / Fail-Closed — "กล้ารายงานว่าโมเดลไม่เก่ง"
- มาจาก OMNISIM: harness ที่ตรวจว่าโมเดล "ไม่มี skill จริง" แทนที่จะกลบ
  (`omnisim/validation.py`, `omnisim/RESULTS.md`)
- Fail-closed: ผลที่ไม่แน่นอน (Z3 `unknown`/timeout) ถือว่า **invalid** ไม่ใช่อนุญาตให้ทำ
- คุณค่าเชิงสินค้า: เป็นแกน "AI/Model Integrity" — ขายได้กับกลุ่ม research/enterprise ที่ต้องการความซื่อตรง

---

## 2. Platforms — แพลตฟอร์มที่สร้างไว้แล้ว

### 2.1 NaraSuite — Full-Stack Thai Name SaaS (Next.js)
แพลตฟอร์มหลัก รวม **5 บริการ** ภายใต้แบรนด์เดียว (`app/page.tsx`):

| บริการ | สิ่งที่ทำ | แกนเทคนิค | route |
|---|---|---|---|
| **NaraName** | วิเคราะห์ชื่อบุคคล | กาลกิณี, เลขศาสตร์, วรรคทักษา, สัทศาสตร์ | `/analyze` |
| **NaraCorp** | วิเคราะห์ชื่อองค์กร/แบรนด์ | CAI/MCAI, Resonant Triangle, Corporate Taksa, Shadow Power | `/corporate` |
| **NaraChild** | ตั้งชื่อเด็กแรกเกิด | Warakkasa by Gender, Ayatana 6, Development Goals | `/child` |
| **NaraRename** | เปลี่ยนชื่อเดิมให้มงคล | 7-Step Protocol, Soft Transition, Problem Analysis | `/rename` |
| **Honest Oracle** | แผนที่ชีวิต 100 ปี | Life Graph, Timeline, Sharing, Premium API | `/oracle` |

**Honest Oracle** (โมดูลเด่นสุด, ผลิตได้เป็นโปรดักต์เดี่ยว):
- กราฟชีวิต 100 ปี + timeline ระดับ good/warn/danger (`engine.ts` สร้าง 100 จุด)
- รายงานเฉพาะตัวเชิงลึก: 4 หัวข้อ (ตัวตน/งาน-เงิน/ความสัมพันธ์/เหตุการณ์สำคัญ) หัวข้อละ 30 บรรทัด
  + แผนปฏิบัติ 40 ข้อแบบมี timebox
- หน้า: Landing `/oracle`, App `/oracle/app`, History, API Keys, Pricing, Admin, Share `/oracle/share/[token]`

### 2.2 OMNISIM Deep Core — Python SDK (social-dynamics + validation)
แพ็กเกจ Python อิสระ (`omnisim/`) — เป็นได้ทั้ง sandbox จำลองสังคม และ harness ตรวจสอบโมเดล:

| Component | Module | ฐานวิชาการ |
|---|---|---|
| Incremental Z3 (push/pop, UNSAT core, fail-closed) | `z3_physics` | De Moura & Bjørner 2008 |
| Causal DAG (Kahn topo-sort, ancestry, path search) | `causal_dag` | Kahn 1962 |
| Gillespie SSA (exact stochastic) | `gillespie` | Gillespie 1977 |
| Independent Cascade + greedy influence max | `social_contagion` | Kempe-Kleinberg-Tardos 2003 |
| Cognitive bias resolver | `cognitive_bias` | engineered |
| DPO pair builder | `dpo_builder` | engineered |
| Bifocal memory / event bus / neural-symbolic bridge | (3 modules) | engineered |
| **Validation harness** (baselines, skill, significance) | `validation` | — |

- สถานะ: **158 tests pass** (with z3), mypy clean, CI 3 jobs
- จุดขายที่ซื่อตรง: บน real data (Twitter rumor cascades) ตัว forecaster **แพ้ baseline** —
  และ harness ตรวจจับได้ → "ความซื่อตรง" คือความสำเร็จ (ดู `omnisim/RESULTS.md`)

---

## 3. Tech Stack & Infrastructure (พร้อมขายเชิง production)

**Frontend/Backend (NaraSuite):**
- Next.js 14 (App Router) + TypeScript + Tailwind
- Prisma + PostgreSQL (Neon/Supabase/Railway)
- NextAuth (Credentials) — มี register/login, role-based (`user`/admin)
- **Stripe billing** — checkout + webhook (`/api/billing/*`)
- **Public API + API keys** — `POST /api/public/oracle` ด้วย `x-api-key`
- **Usage quota รายวัน** ต่อแผน (`lib/server/usage.ts`, model `UsageDay`)
- Admin: จัดการ users + stats (`/oracle/admin`, `/api/admin/*`)
- Data models (Prisma): User, Analysis, CorporateAnalysis, ChildAnalysis, RenameAnalysis,
  OracleReading, ApiKey, UsageDay, Subscription

**SDK (OMNISIM):** Python, dependency-light, z3-solver เป็น optional, CI/mypy, pyproject

**โครงราคาที่วางไว้แล้ว** (`app/oracle/pricing/page.tsx`):
- Free ฿0 · Pro ฿299/เดือน · Premium ฿599/เดือน (Public API + API keys)

---

## 4. Digital Products — แปลงเป็นสินค้าขายได้ (จัดกลุ่มตามความพร้อม)

### A. พร้อมขายเร็วที่สุด (ของมีอยู่แล้ว ปรับนิดเดียว)
1. **NaraSuite SaaS (subscription)** — Free/Pro/Premium ที่วางไว้แล้ว เปิด Stripe ก็ขายได้
2. **Honest Oracle — แผนที่ชีวิต 100 ปี (รายชิ้น/รายเดือน)** — ขายเป็นรายงานเฉพาะตัว
3. **PDF Report ดาวน์โหลด** — แปลงผล deterministic เป็นไฟล์ขายชิ้นละ (เพิ่ม export PDF)
4. **API-as-a-Product** — ขาย API key สำหรับนักพัฒนา/แอปดูดวง (มี usage quota แล้ว)

### B. ต่อยอดได้ด้วยงานปานกลาง
5. **White-label Name Engine** — ขาย MCAS engine ให้ร้านตั้งชื่อ/สำนักโหราศาสตร์ฝัง
6. **NaraCorp สำหรับธุรกิจ** — แพ็กเกจวิเคราะห์ชื่อแบรนด์/บริษัท (B2B, ราคาสูงต่อชิ้น)
7. **ของขวัญดิจิทัล** — รายงานตั้งชื่อเด็ก (NaraChild) เป็น gift card/e-certificate

### C. ใช้ OMNISIM เป็นสินค้าแยกสาย (กลุ่มเทคนิค/องค์กร)
8. **Model Integrity / Validation Toolkit** — ขาย harness ตรวจ "โมเดลมี skill จริงไหม"
   ให้ทีม ML/research (เด่นเรื่องความซื่อตรง + significance gate)
9. **Social-Dynamics Sandbox** — เครื่องมือสอน/จำลองสถานการณ์ (education/consulting)

---

## 5. Roadmap แนะนำ (ลำดับการลงมือ)

**Phase 1 — เปิดขายของที่มี (1–2 สัปดาห์)**
- ต่อ Stripe production + ตั้ง env, ทดสอบ checkout/webhook ครบ
- เพิ่ม **export PDF** ให้ Honest Oracle (ทำเป็นสินค้ารายชิ้นได้ทันที)
- ทำหน้า landing ขายที่เน้น paradigm "Honest/Transparent"

**Phase 2 — ขยายช่องทางรายได้ (3–4 สัปดาห์)**
- เปิด API tier + เอกสาร API + dashboard usage ให้ลูกค้า
- แพ็กเกจ B2B (NaraCorp) + ใบเสนอราคา
- ระบบ referral/affiliate

**Phase 3 — สินค้าเทคนิค (OMNISIM)**
- ทำ docs + ตัวอย่างให้ validation harness เป็น product แยก (PyPI / private license)
- พิจารณา hosted API สำหรับ social-dynamics simulation

---

## 6. จุดแข็งที่ควรใช้เป็นแกนการตลาด
1. **ซื่อตรง (Honest):** ไม่ขายคำทำนายเกินจริง — เป็น differentiator ที่คู่แข่งเลียนแบบยาก
2. **คำนวณได้/ทำซ้ำได้:** deterministic + API → integrate และ scale เป็นสินค้าได้
3. **ครบวงจร:** บุคคล → องค์กร → เด็ก → เปลี่ยนชื่อ → แผนที่ชีวิต (cross-sell ในแบรนด์เดียว)
4. **มีทั้งสาย consumer (NaraSuite) และ technical (OMNISIM):** กระจายความเสี่ยงตลาด

---

*หมายเหตุ: ทุกผลิตภัณฑ์ในตระกูลนี้คงจุดยืน "เครื่องมือเพื่อการสะท้อนตนและประกอบการตัดสินใจ
ไม่ใช่การทำนายอนาคต" ตาม paradigm หลัก เพื่อรักษาความน่าเชื่อถือของแบรนด์*
