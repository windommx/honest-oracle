# ประเมิน 360 องศา — Omniscient Quant Engine

> คะแนนเป็นการประเมินของผู้พัฒนาเอง ไม่ใช่การรับรองจากบุคคลที่สาม — ทุกคะแนนอ้างหลักฐานที่รันซ้ำได้ · 10 = ผ่านเกณฑ์ใน §4 ทุกข้อ
> **รอบ 2 (29 ก.ย. 2569, Task 17 + COT dashboard, v1.2.0)** อยู่ด้านบน · รอบ 1 (28 ก.ย., หลัง Task 15) เก็บไว้ด้านล่างเป็นประวัติ
> **Task 18 (29 ก.ย. 2569, v1.3.0):** จำกัดขอบเขตเป็น **หุ้นไทยเท่านั้น** — แดชบอร์ด COT (ฟิวเจอร์สสหรัฐฯ) ถูกแทนด้วยแดชบอร์ด "เงินไหลนักลงทุน" ในโครงเดิม (SET 4 ประเภทนักลงทุน · NVDR · short sale รายหุ้น) · ตัวนำเข้ารับเฉพาะสกุลบาท · คะแนนรอบ 2 คงเดิม (ตัวเลขหลักฐานด้านล่างเป็นของรอบ 2)

## รอบ 2 — หลังปิดช่องว่าง (Task 17)

| # | มิติ | เริ่ม | รอบ 1 | **รอบ 2** | อะไรขยับคะแนน (หลักฐาน) | ยังจำกัดคะแนน |
|---|---|---|---|---|---|---|
| 1 | ความลึกของเครื่องมือ | 8.5 | 8.5 | **9** | กติกาเป็นข้อมูล + hash · robustness ข้าม seed · CI ของ hit rate/Kelly · ท่อนำเข้าข้อมูลจริง · provenance · แดชบอร์ด COT 27 ตลาด (Legacy/Disaggregated/COT Index) | ยังไม่มีผู้ใช้จริงยืนยัน · COT และหุ้นยังเป็นข้อมูลจำลอง |
| 2 | วิธีวิจัยและความโปร่งใส | 6 | 6 | **7.5** | pre-registration (`POST /api/rules`, stamp บนทุกรายงาน, test บังคับ bump เวอร์ชัน) · ป้าย "จูนบนข้อมูลจำลอง" · 5 seed รายงานครบทั้งที่ผลไม่สวย · `buildPanel` ท่อเดียว (seed demo = แท็บ Backtest ทุกตัวเลข) | น้ำหนัก synthesis/MDX ยังตั้งมือ · ไม่คุม multiple testing ข้าม 5 gates · ยังไม่มีผู้ตรวจภายนอก |
| 3 | หลักฐานว่าได้ผลจริง | 2 | 2 | **2** | ได้หลักฐาน "เชิงลบ" ที่ซื่อตรง: 5 seed = **MIXED** (hit rate 31.6–68.8%, ชนะซื้อถือ 2/5, G1/G3 ROBUST, G2/G5 NOISE) · seed demo กลยุทธ์ +6.1% vs ซื้อถือ +38.6% | ยังไม่มีผลบนข้อมูลจริงเลย |
| 4 | ข้อมูล | 3 | 3 | **5.5** | ingest CSV/Yahoo/API พร้อมตรวจ + backup + transaction · `DataSource` + ป้ายจาก DB ทุกหน้า · ปฏิทิน SET + ความสด · หุ้นขาดช่วง/ไม่มีงบ → งดออกเสียง | ยังไม่ได้ทดสอบกับข้อมูลจริง (Yahoo/CFTC ถูก proxy ปฏิเสธ) · ไม่มี corporate actions/หุ้นเพิกถอน · ไม่มี feed ที่มีสิทธิ์ใช้ |
| 5 | คุณภาพวิศวกรรม | 4 | 7.5 | **8.5** | ESLint ค่าเริ่มต้นครบ + max-warnings 0 · noImplicitAny · test 148 + ops 12 + smoke 44 ×2 + E2E 22 มุมมอง/14 interaction ใน CI · error boundary · race ของ seed ตอน warm-up ถูกจับโดย smoke DB เปล่าแล้วแก้ | งานหนักยังรันบน event loop (robustness ~3 วินาที/seed บล็อกคำขออื่น) · ไม่มีคนรีวิวโค้ด |
| 6 | ความปลอดภัย | 1.5 | 7 | **8** | บทบาทผู้ชมอ่านอย่างเดียว · ActionLog + `/api/audit-log` · security.deny log · zod ทุก input ที่แก้ข้อมูล · 500 ไม่เผยข้อความภายใน (errorId) · backup 0600 | รหัสผ่านร่วม ไม่มีบัญชีรายคน/MFA · TLS พึ่ง proxy · CSP unsafe-inline · ไม่มี pentest |
| 7 | UX/UI | 7.5 | 7.5 | **8.5** | axe **0 violation** ทุก 22 การตรวจ (เดิม violation ทุกมุมมอง) · คำแนะนำครั้งแรก · ปุ่มที่ใช้ไม่ได้บอกเหตุผล · Apex size ใน Decision · หน้าแรก 2.8 s (เดิม 4.6 s) | ยังไม่ทดสอบกับผู้ใช้จริง/screen reader |
| 8 | การปฏิบัติการ | 2 | 5 | **6.5** | backup/restore (ซ้อมกู้ใน test) · engine-check · warm-up · health: ความสด/อายุ backup/cache · JSON log | Docker image ยังไม่ได้ build · ไม่มี metrics/alert · backup อัตโนมัติต้องตั้ง cron เอง |
| 9 | กฎหมาย | 3.5 | 4 | **5** | `/terms` (ไม่ใช่คำแนะนำ, ข้อมูล, ข้อจำกัด, LLM, ความเป็นส่วนตัว, ไม่มี license) · บันทึกสิทธิ์ข้อมูลตอนนำเข้า | ทนายยังไม่ตรวจ · ประเด็นใบอนุญาต ก.ล.ต. · repo ไม่มี license |
| 10 | ความพร้อมเชิงธุรกิจ | 2 | 2 | **2.5** | ตำแหน่ง "ซอฟต์แวร์ใช้เองกับข้อมูลของผู้ใช้" ใช้งานได้จริงขึ้น (ingest + backup + roles) | ไม่มีลูกค้า/ราคา |
| | **เฉลี่ย** | **4.0** | **5.3** | **6.3** | | มิติ 3, 4, 10 ต้องการข้อมูลจริง เวลา และผู้ใช้ — โค้ดทำแทนไม่ได้ |

**หลักฐานรอบ 2 (รันซ้ำได้):** `bun run verify` exit 0 — typecheck · lint 0 · test 148 · ops 12 (ingest-csv → engine-check → backup → restore) · build · smoke 44/44 (demo DB) และ 44/44 (DB เปล่า, CI) · E2E 22/22 มุมมอง ผ่าน axe WCAG 2.1 AA + 2.2 target-size งบ 0 · 14/14 interaction · console error 0 · หน้าแรกแสดงผล ~2.8 s · Yahoo/CFTC: 403 ที่ egress proxy ของ sandbox (บันทึกไว้ ไม่ได้อ้อม)

**งานโค้ดที่เหลือ (เรียงตามผล):** ย้าย robustness/backtest ไป worker thread · importer ข้อมูลจริงของหน้าเงินไหล (ประเภทนักลงทุน / NVDR / short sale จากไฟล์ของ SET) · corporate actions + หุ้นเพิกถอน · บัญชีรายคน · build Docker image บนเครื่องจริง · metrics/alert

---

# รอบ 1 (ประวัติ) — สถานะ 28 ก.ย. 2569

## 1. คะแนน 10 มิติ

| # | มิติ | ก่อน | หลัง | หลักฐานที่ให้คะแนน | สิ่งที่จำกัดคะแนน |
|---|---|---|---|---|---|
| 1 | ความลึกของเครื่องมือ | 8.5 | **8.5** | 12 มุมมอง · 7 ชั้น + Meta-Risk + Apex · Clayton copula/PIT join/purged walk-forward/MC CVaR/ruin MC/Kelly-Vol/microstructure/13-strand synthesis อยู่ในโค้ดจริง ไม่ใช่ป้าย · API 16 เส้น | จักรวาลเดียว 22 หุ้นจำลอง · เกณฑ์ทุกตัวฝังในโค้ด (ไม่มี config-as-data) · ยังไม่มีผู้ใช้จริงยืนยันว่าตอบโจทย์ |
| 2 | วิธีวิจัยและความโปร่งใส | 6 | **6** | walk-forward train 252 / embargo 5 / test 21 · gate attribution ด้วย MWU + verdict SPEAKS_TRUTH/NOISE/INSUFFICIENT · calibration buckets · งบ join แบบ PIT · น้ำหนักทุกสายหลักฐานเปิดเผยใน UI · LLM ถูกล็อกกับ evidence JSON | **เกณฑ์ถูกจูนกับข้อมูลชุดเดียวกับที่ใช้วัดผล** (worklog Task 1-4: เปลี่ยน slope G1 21→42 วัน, threshold decouple, และ "เลือก seed 20250902 เพราะ regime ปลายทางดี") · ไม่มี pre-registration/hash ของกติกา (thai-momentum-platform มี) · ไม่มีการทดสอบข้าม seed · น้ำหนักสายหลักฐาน (.9/.7/…) กำหนดมือ ไม่ได้ validate · ไม่มีการคุม multiple testing ข้าม 5 gates |
| 3 | หลักฐานว่าได้ผลจริง | 2 | **2** | เครื่องมือวัดพร้อม: walk-forward, attribution, journal, synthesis archive | **ไม่มีผลบนข้อมูลจริงเลย** — backtest วัดโครงสร้างของ generator ที่เขียน regime script ไว้เอง (SIDEWAYS→CRISIS→RECOVERY→BULL…) ตัวเลขทุกตัวพิสูจน์ว่า "ท่อถูก" เท่านั้น |
| 4 | ข้อมูล | 3 | **3** | schema รองรับ OHLCV + PIT fundamentals + fund flow · generator deterministic + OHLC สอดคล้อง (มี test) · ป้าย "จำลอง" ทุกหน้า | ไม่มี adapter ข้อมูลจริง · ไม่มี corporate actions / หุ้นเพิกถอน / ปฏิทินวันหยุด / ตรวจความสด · ป้ายที่มาข้อมูลเป็นข้อความคงที่ ไม่ได้ derive จาก DB |
| 5 | คุณภาพวิศวกรรม | 4 | **7.5** | เกตเดียว `bun run verify` (typecheck · lint · test 65+3 · build · smoke 24 route ×2) + CI เขียว · TS strict · build ที่เคยหยิบ middleware ของแอปอื่นถูกล็อก root แล้ว · engine invariant tests ครบ 7 ชั้น | component 28 ไฟล์ **ไม่มี test เลย** และไม่มี E2E ใน CI · ESLint ปิดกฎสำคัญเกือบหมด (no-explicit-any, no-unused-vars, exhaustive-deps, react-hooks/purity…) เกต lint จึงอ่อน · `noImplicitAny: false` · งานคำนวณหนักครั้งแรกบล็อก event loop (backtest 1.6 s, seed 2.8 s) · cache ต่อ process บน globalThis · ไม่มี error boundary (`error.tsx`) · ไฟล์ UI 500–800 บรรทัด · ยังไม่มีคนรีวิวโค้ด |
| 6 | ความปลอดภัย | 1.5 | **7** | โหมด local รับเฉพาะ loopback · Basic + Bearer · CSRF ทุก mutation · rate limit LLM/seed/รายงานหนัก · brute-force limit · CSP + headers · ไม่มี X-Powered-By · audit critical 0 · ตรวจสดกับ server ทั้ง 2 โหมด (§3) | รหัสผ่านร่วมชุดเดียว ไม่มีบัญชีรายคน/MFA/เพิกถอน session · Basic บน http ธรรมดา = รหัสวิ่งเปล่า (ต้องมี TLS proxy) · CSP ยังต้อง `unsafe-inline` · limiter ในหน่วยความจำ (หลาย process = แยกถัง) · ไม่มี audit log การกระทำ · advisory moderate 2 / low 1 ใน template deps ที่ไม่ได้ใช้ · ยังไม่ผ่าน penetration test |
| 7 | UX/UI | 7.5 | **7.5** | ตรวจใน Chromium: 12 มุมมอง (1440) + 3 มุมมอง (390) — overflow แนวนอน 0 · page error 0 · console warning 0 · ปุ่มไม่มีชื่อ 0 · ปฏิสัมพันธ์หลัก 6/6 ผ่าน (⌘K, แชท/หลอมรวม/audit ตอบ 503 อย่างสุภาพเป็นภาษาไทย, journal seed ผ่าน CSRF, แถว MDX ใน Apex) · ดีไซน์/ภาษาไทย/ตัวเลข mono สม่ำเสมอทุกแท็บ · มือถือเป็นคอลัมน์เดียว + drawer | axe พบ violation ทุกมุมมอง: color-contrast 14–68 โหนด/มุมมอง, nested-interactive 22 (watchlist), scrollable-region-focusable 1–2, aria-* ผิด 2–6, aria-hidden-focus 1 · เป้าสัมผัส < 24px 13 จุด (ticker) · โหลดหน้าแรกเย็น 4.6 s · ยังไม่ทดสอบกับผู้ใช้จริง/screen reader · โหมดง่ายสำหรับมือใหม่ไม่มี (12 มุมมองเต็มตั้งแต่ครั้งแรก) |
| 8 | การปฏิบัติการ | 2 | **5** | `/api/health` (200/503 + ป้าย LLM) · `/api` index · Dockerfile + compose + entrypoint seed volume · `.env.example` ครบ · standalone รันด้วย node · smoke test ใช้หลัง deploy ได้ (`--base-url`) | **Docker image ยังไม่ได้ build** · ไม่มี backup/restore · ไม่มี structured log / metrics / alert · process เดียว + SQLite · ไม่มี runbook เหตุขัดข้อง |
| 9 | กฎหมาย | 3.5 | **4** | ป้าย "ไม่ใช่คำแนะนำการลงทุน" + "จำลองเพื่อสาธิต" ทุกหน้า · ข้อมูลจำลอง = ยังไม่มีประเด็นสิทธิ์ข้อมูลตลาด · ไม่เก็บข้อมูลส่วนบุคคล (ไม่มีบัญชีผู้ใช้) · README/.env.example เตือนเรื่องผู้ให้บริการ LLM | ไม่มีหน้า `/terms` และประกาศความเป็นส่วนตัว · ถ้าให้สัญญาณแก่ผู้อื่นเข้าข่ายธุรกิจที่ปรึกษาการลงทุน (ก.ล.ต.) · ถ้าต่อข้อมูลจริงต้องมีสิทธิ์ใช้ข้อมูล · ทนายยังไม่ได้ตรวจ |
| 10 | ความพร้อมเชิงธุรกิจ | 2 | **2** | ใช้เป็น demo / research terminal ได้ทันที · เอกสารครบพอให้คนอื่นติดตั้งเอง | ไม่มีลูกค้า ราคา หรือ positioning ที่ตัดสินแล้ว · คุณค่าจริงยังพิสูจน์ไม่ได้จนกว่าจะมีข้อมูลจริง (มิติ 3) |
| | **ภาพรวม (เฉลี่ย)** | **4.0** | **5.3** | | มิติที่ต่ำสุด (3, 4, 10) แก้ด้วยโค้ดอย่างเดียวไม่ได้ — ต้องการข้อมูลจริง เวลา และผู้ใช้ |

## 2. มุมมองรอบด้าน (360°)

**นักลงทุนสาย quant ที่ใช้เอง**
- ได้: เห็นเหตุผลทุกชั้นของสัญญาณ (5 gates + เหตุผลไทย, ขนาดไม้ที่ถูก min/override หลายชั้น, kill switch) — ไม่ใช่ตัวเลขลอย ๆ
- เสี่ยง: ทุกอย่างที่เห็นมาจากหุ้นจำลอง 22 ตัว · ถ้าเผลอเอาไปตัดสินหุ้นจริงคือผิดตั้งแต่ข้อมูล
- ต้องการก่อนใช้จริง: adapter ข้อมูลจริง + ป้ายที่มาข้อมูลที่ derive จาก DB + ผลนอกช่วงทดสอบอย่างน้อย 60 วันซื้อขาย

**นักวิจัย quant (ผู้ตรวจภายนอก)**
- ชอบ: purged walk-forward, attribution ที่ให้ผลลบตรง ๆ (NOISE), calibration, PIT
- ติง: เกณฑ์ถูกจูนบนชุดข้อมูลเดียวกับที่รายงานผล · seed ถูกเลือกให้ปลายทางมีสัญญาณ · ไม่มี prereg · ไม่มี robustness ข้าม seed/ช่วงเวลา · น้ำหนัก synthesis และ Risk MDX เป็นค่าคงที่ที่ตั้งเอง — "คะแนนบรรจบ" จึงเป็น heuristic ที่ต้องติดป้ายให้ชัดกว่านี้ (ไม่ใช่ความน่าจะเป็น)
- ขอ: ล็อกกติกาเป็น hash ก่อนรันข้อมูลจริง · รายงานผลข้าม seed ≥ 5 ชุด · แสดง CI ของ Kelly/hit rate (ไม้ ~70 = ช่วงกว้างมาก)

**วิศวกร**
- ชอบ: engine pure/deterministic ทดสอบง่าย · เกตเดียวเหมือน CI · type ครบ
- ติง: UI ไม่มี test · lint ปิดกฎ · compute หนักบน event loop · ไม่มี error boundary · deps template ค้าง 15+ ตัว
- ขอ: worker thread สำหรับ backtest/factors, component + E2E test, เปิดกฎ lint ทีละชุด

**ผู้ดูแลระบบ (ops)**
- มี: health, standalone, Docker/compose (ยังไม่ build), env ครบ
- ขาด: backup, log แบบ JSON, metric, alert, runbook · ต้องพิสูจน์ image บนเครื่องจริงก่อน

**ผู้ตรวจความปลอดภัย**
- มี: default-deny นอก localhost, CSRF, rate limit, headers, ไม่มี critical advisory
- ขาด: บัญชีรายคน/MFA, session revocation, TLS ในตัว (พึ่ง proxy), audit log, pentest

**กฎหมาย/compliance**
- ตอนนี้: ใช้เองกับข้อมูลจำลอง ไม่ขายสัญญาณ ไม่เก็บข้อมูลส่วนบุคคล — ความเสี่ยงต่ำ
- เมื่อไหร่ที่เปลี่ยน: ต่อข้อมูลจริง (สิทธิ์ข้อมูล), เปิดให้คนนอกใช้ (ข้อกำหนด/PDPA), ให้คำแนะนำแก่ผู้อื่น (ใบอนุญาต ก.ล.ต.)

**ธุรกิจ**
- ตำแหน่งที่เป็นไปได้ตามลำดับความเสี่ยง: (ก) ซอฟต์แวร์ติดตั้งใช้เองกับข้อมูลของผู้ใช้ (ข) research terminal white-label ให้ผู้มีใบอนุญาต (ค) SaaS สัญญาณรายย่อย (ต้องใบอนุญาต)
- ยังไม่มีข้อมูลตัดสิน — ต้องผ่านมิติ 3 ก่อนคุยราคา

## 3. หลักฐานที่ใช้ให้คะแนน (ตรวจจริง 28 ก.ย. 2569)

**เกตของแอป (sandbox: bun 1.3.11 + node 22 · CI ubuntu)**

| รายการ | ผล |
|---|---|
| `tsc --noEmit` · `eslint .` | 0 error (ทั้ง local และ CI) |
| `bun test src` · `bun test ./deploy` | 65 + 3 ผ่าน (rng · stats · market · engine 7 ชั้น · llm · security · smoke checker) |
| `next build` (standalone) | ผ่าน · server ที่ `.next/standalone/server.js` · Proxy = ของแอปนี้ |
| API smoke demo DB / DB เปล่า | 24/24 · 24/24 (auto-seed 2.8 s) |
| `bun audit --audit-level=critical` | 0 (moderate 2 · low 1 ใน next-intl / prismjs / jsdiff — ไม่มีโค้ดใช้) |
| CI `omniscient-quant-engine` run 1 · `web-tests` run 388 | ผ่านทั้งคู่ |

**เวลาตอบของ API (ครั้งแรกหลังเปิด server, demo DB)**

| route | ms |
|---|---|
| `/api/system` (โหลด panel + regime) | 1,448 |
| `/api/backtest` (walk-forward ครั้งแรก) | 1,620 |
| `/api/board` | 349 |
| `/api/meta-risk/TSE` · `/api/apex/TSE` | 226 · 144 |
| อื่น ๆ | < 160 |

งานเหล่านี้เป็น synchronous — ระหว่างคำนวณ server ไม่ตอบคำขออื่น (ผู้ใช้คนเดียวไม่รู้สึก หลายคนพร้อมกันจะเห็นค้าง)

**ความปลอดภัย (ยิงจริงกับ standalone server)**

| กรณี | ผล |
|---|---|
| โหมด local: loopback · Host แปลก · XFF ปลอม | 200 · 403 HTML · 403 JSON |
| POST ข้ามไซต์ · POST form-encoded · POST /api/audit ครั้งที่ 5 ใน 1 นาที | 403 · 415 · 429 |
| headers | CSP · X-Frame-Options DENY · nosniff · Referrer-Policy · ไม่มี X-Powered-By |
| โหมด auth: ไม่มี credential · Basic ถูก/ผิด · Bearer ถูก/ผิด · /api/health | 401 + WWW-Authenticate · 200/401 · 200/401 · 200 |

**ตรวจในเบราว์เซอร์ (Chromium ผ่าน Playwright บน build โปรดักชัน, ไม่ตั้งค่า LLM)**

ทุกมุมมองบนเดสก์ท็อป 1440×900 และ 3 มุมมองบนมือถือ 390×844 · โหลด Command Center ครั้งแรก (รวมคำนวณครั้งแรกของ server) 4.6 s · คำขอ 60 รายการ · page error 0

| จอ | มุมมอง | overflow แนวนอน | console error / warning | axe (WCAG 2.x A/AA) violation ×โหนด |
|---|---|---|---|---|
| 1440 | Command Center (โหลดครั้งแรก) | ไม่มี | 0 / 0 | aria-hidden-focus ×1 · color-contrast ×14 |
| 1440 | Terminal | ไม่มี | 0 / 0 | color-contrast ×68 · nested-interactive ×22 · scrollable-region-focusable ×1 |
| 1440 | ภาพรวม | ไม่มี | 1 / 0 | color-contrast ×55 · scrollable-region-focusable ×1 |
| 1440 | หลอมรวม | ไม่มี | 0 / 0 | color-contrast ×41 · scrollable-region-focusable ×1 |
| 1440 | Decision (L6) | ไม่มี | 1 / 0 | color-contrast ×49 |
| 1440 | Multi-View (L3) | ไม่มี | 0 / 0 | aria-valid-attr-value ×2 · color-contrast ×29 |
| 1440 | Dependence (L2) | ไม่มี | 0 / 0 | color-contrast ×25 · scrollable-region-focusable ×2 |
| 1440 | Risk & Sizing (L5) | ไม่มี | 0 / 0 | aria-input-field-name ×2 · color-contrast ×39 · scrollable-region-focusable ×1 |
| 1440 | Meta-Risk (L∞) | ไม่มี | 0 / 0 | color-contrast ×44 |
| 1440 | Apex (L7) | ไม่มี | 0 / 0 | aria-prohibited-attr ×6 · color-contrast ×28 · scrollable-region-focusable ×1 |
| 1440 | Backtest & Journal | ไม่มี | 0 / 0 | color-contrast ×41 · scrollable-region-focusable ×1 |
| 1440 | AI Auditor | ไม่มี | 0 / 0 | color-contrast ×18 |
| 1440 | Command Center (กลับมา) | ไม่มี | 1 / 0 | aria-hidden-focus ×1 · color-contrast ×14 |
| 390 | Command Center (กลับมา) | ไม่มี | 0 / 0 | aria-hidden-focus ×1 · color-contrast ×4 · scrollable-region-focusable ×1 |
| 390 | Apex (L7) | ไม่มี | 0 / 0 | aria-prohibited-attr ×6 · color-contrast ×14 · scrollable-region-focusable ×2 |
| 390 | Terminal | ไม่มี | 0 / 0 | color-contrast ×31 · nested-interactive ×22 · scrollable-region-focusable ×2 |

console error ทั้งหมด 3 รายการ — ทุกรายการคือ log "Failed to load resource: 503" ของปุ่ม AI ที่ตั้งใจให้ตอบ 503 เมื่อไม่มี LLM (ไม่ใช่ข้อผิดพลาดของหน้าเว็บ) · ปุ่มที่ไม่มีชื่อสำหรับ screen reader 0 · เป้าสัมผัสสูงต่ำกว่า 24px 13 จุด (แถบ ticker)

ปฏิสัมพันธ์ที่ตรวจจริง:
- ผ่าน — Terminal chat without LLM shows apology with reason
- ผ่าน — Synthesis AI button without LLM shows toast
- ผ่าน — Apex shows Risk MDX override row
- ผ่าน — Journal seed (PUT /api/journal) passes CSRF gate from the UI
- ผ่าน — AI Auditor without LLM shows graceful 503 message
- ผ่าน — Ctrl+K search → SCB opens Terminal with SCB in topbar

การอ่าน axe: violation เกือบทั้งหมดคือ **color-contrast** (ตัวอักษรรอง zinc-500/600 บนพื้นมืด; 14–68 โหนดต่อมุมมอง) ตามด้วย nested-interactive (ปุ่มดาว favorite ซ้อนในแถว watchlist), scrollable-region-focusable (พื้นที่เลื่อนไม่มี tabindex), aria-* ผิดที่ (Multi-View 2 critical, Apex 6, Risk 2) และ aria-hidden-focus (ticker ชุดที่สอง) — ทั้งหมดแก้ได้ในโค้ด (backlog §6 ข้อ 11) · สคริปต์ที่ใช้ตรวจอยู่นอก repo (Playwright + axe-core บนเครื่อง sandbox) และควรถูกเขียนเป็น E2E ใน CI (§6 ข้อ 5)

## 4. 10/10 ของแต่ละมิติหมายถึงอะไร

| มิติ | 10/10 หมายถึง | ใครทำได้ |
|---|---|---|
| ความลึกของเครื่องมือ | ทุกโมดูลมีคำอธิบาย มี test และมีคนใช้จริงอย่างน้อยหนึ่งกลุ่ม | โค้ด + ผู้ใช้ |
| วิธีวิจัยและความโปร่งใส | กติกาถูกล็อก (prereg + hash) ก่อนเห็นผล ผลทดสอบข้ามหลายชุดข้อมูล/seed ถูกรายงานทั้งหมด และผ่านการตรวจโดยนักวิจัย quant ภายนอก | โค้ด + ผู้ตรวจภายนอก |
| หลักฐานว่าได้ผลจริง | ข้อมูล SET จริง ≥ 10 ปีรวมหุ้นที่ถูกเพิกถอน · ผลนอกตัวอย่างบนกติกาที่ล็อกไว้ก่อน · paper track record ≥ 12 เดือน · บุคคลที่สามรันซ้ำได้ผลเดิม | ข้อมูลจริง + เวลา |
| ข้อมูล | feed ที่มีสิทธิ์ใช้ถูกต้อง มี corporate actions/หุ้นเพิกถอน ดึงอัตโนมัติพร้อมตรวจความสด และป้ายที่มาข้อมูล derive จาก DB | สัญญาข้อมูล + โค้ด |
| คุณภาพวิศวกรรม | CI เขียวทุก push · มี component + E2E test · lint เปิดกฎมาตรฐาน · API ตอบภายใน 1 วินาทีโดยไม่บล็อก · มีคนรีวิวโค้ด | โค้ด + ผู้รีวิว |
| ความปลอดภัย | บัญชีรายคน + สิทธิ์ตามบทบาท · TLS · CSRF · rate limit · audit log · secret ถูกวิธี · ผ่าน pentest | โค้ด + ผู้ทดสอบภายนอก |
| UX/UI | ทดสอบกับผู้ใช้จริง 5–8 คน · SUS ≥ 80 · axe 0 violation ทุกมุมมอง · ผ่าน WCAG AA | ผู้ใช้จริง |
| การปฏิบัติการ | deploy จริงพร้อม monitoring/alert · backup อัตโนมัติที่ซ้อมกู้คืนแล้ว · SLO · รองรับหลายผู้ใช้ | โค้ด + โครงสร้างพื้นฐาน |
| กฎหมาย | ใบอนุญาตหรือสัญญากับผู้ได้รับอนุญาต · สัญญาข้อมูล · ข้อกำหนด/ความเป็นส่วนตัวผ่านทนาย · PDPA | ทนาย + ก.ล.ต. |
| ความพร้อมเชิงธุรกิจ | ลูกค้าที่จ่ายเงิน · ราคาผ่านการทดสอบ · วัด retention ได้ · ต้นทุนต่อผู้ใช้ต่ำกว่ารายได้ | ลูกค้าจริง |

## 5. ขั้นตอนที่โค้ดทำแทนไม่ได้ (เรียงตามลำดับ · แต่ละขั้นมีเกณฑ์ผ่าน)

| ขั้น | ทำอะไร | ใช้เวลา | ผ่านเมื่อ |
|---|---|---|---|
| M0 ล็อกกติกา (โค้ด, ก่อน M1) | ย้ายเกณฑ์ทุกตัว (gates, น้ำหนัก synthesis, Risk MDX, Kelly) เป็น config-as-data + `paramsHash` แบบ thai-momentum-platform แล้ว freeze ก่อนแตะข้อมูลจริง | 1 สัปดาห์ | hash ถูกบันทึกและแสดงในทุกรายงาน |
| M1 ข้อมูลจริง | adapter → `Price`/`Fundamental`/`FundFlow` (PIT) อย่างน้อย 5 ปี ควร 10 · รัน walk-forward + attribution ใหม่โดยไม่แตะกติกา | 1–2 สัปดาห์ | ป้ายที่มาข้อมูลเป็น REAL · รายงานผ่าน/ไม่ผ่านเกณฑ์ที่ล็อกไว้ — ถ้า "ไม่มี edge" ให้เผยผลแล้วหยุด ห้ามจูน |
| M2 ผลนอกช่วงทดสอบ | paper trade ทุกวันด้วยกติกาเดิม เผย journal + hash ทุกสัปดาห์ | ≥ 60 วันซื้อขาย · 30 ไม้ที่ปิดแล้ว · ควร 6–12 เดือน | ผลตอบแทนส่วนเกินมีนัยสำคัญตามเกณฑ์ที่ล็อกไว้ |
| M3 กฎหมายและข้อมูล (ขนานกับ M2) | ทนายหลักทรัพย์เลือกเส้นทาง (ใช้เอง / white-label / ขอใบอนุญาต) · ตรวจข้อกำหนด · ใบเสนอราคาข้อมูลจาก SET/vendor | 1–3 เดือน | หนังสือความเห็นทนาย + ใบเสนอราคา หรือสัญญาพาร์ทเนอร์ |
| M4 pilot | deploy หลัง TLS + monitoring + backup · ผู้ใช้ beta 20–50 คน · ทดสอบการใช้งาน 5–8 คน · pentest | 1–2 เดือน | SUS ≥ 80 · ไม่มีช่องโหว่ high ค้าง · ผู้ใช้กลับมาทุกสัปดาห์ |
| M5 ธุรกิจ | ตั้งราคาจากสัมภาษณ์ 10–20 ราย · retention/conversion/ต้นทุนต่อผู้ใช้ | ต่อเนื่อง | ลูกค้าที่จ่ายเงิน + ต้นทุนต่อผู้ใช้ต่ำกว่ารายได้ |

## 6. งานโค้ดที่ทำต่อได้เลย (ไม่ต้องรอข้อมูลจริง) — เรียงตามผลต่อคะแนน

| ลำดับ | งาน | มิติที่ขยับ | ขนาด |
|---|---|---|---|
| 1 | pre-registration + `paramsHash` + config-as-data ของเกณฑ์ทุกตัว, ติดป้าย "จูนบนข้อมูลจำลอง" ที่ UI ของ gates/synthesis | 2 | กลาง |
| 2 | ทดสอบ robustness ข้าม seed ≥ 5 ชุด (hit rate/attribution/verdict ต้องไม่กลับด้าน) + แสดง CI ของ Kelly p/R และ hit rate | 2 | เล็ก–กลาง |
| 3 | adapter ข้อมูลจริง (CSV/Yahoo .BK ตามแบบ `thai-momentum-platform/src/lib/feed`) + ป้ายที่มาข้อมูลจาก DB + ปฏิทิน SET/ความสด | 4, 3 | กลาง–ใหญ่ |
| 4 | ย้าย backtest/factors/MC ไป worker thread + คิวงานหนัก (API ตอบทันที สถานะผ่าน polling) | 5 | กลาง |
| 5 | component tests (28 ไฟล์) + E2E Playwright ใน CI (พร้อมใช้: สคริปต์ที่ใช้ตรวจ §3 นำมาเป็นฐานได้) + เปิดกฎ ESLint ทีละชุด + `noImplicitAny: true` | 5 | กลาง |
| 6 | หน้า `/terms` + ประกาศความเป็นส่วนตัว + ป้าย LLM provider ใน UI เมื่อตั้งค่า | 9 | เล็ก |
| 7 | backup (VACUUM INTO) + structured log + `/api/health` ที่รายงาน cache/latency | 8 | เล็ก–กลาง |
| 8 | build/verify Docker image + compose บนเครื่องจริง (การ์ดงานเปิดไว้แล้ว) | 8 | เล็ก |
| 9 | ตัด template deps ที่ไม่ได้ใช้ (advisory moderate/low หายไปด้วย — การ์ดงานเปิดไว้แล้ว) | 6, 5 | เล็ก |
| 10 | บัญชีรายคน + session + audit log ถ้าจะมีผู้ใช้มากกว่าหนึ่งคน (ท่าเดียวกับ thai-momentum-platform) | 6 | ใหญ่ |
| 11 | `error.tsx` boundary + แก้ axe violation ตาม §3 + ให้ board/decision แสดงขนาดหลัง MDX | 5, 7 | เล็ก |

## 7. เช็คลิสต์กฎหมาย (ไม่ใช่คำแนะนำทางกฎหมาย)

ข้อเท็จจริงด้านกฎเกณฑ์ (ใบอนุญาตที่ปรึกษาการลงทุนของ ก.ล.ต., สิทธิ์ใช้ข้อมูล SET/Yahoo/settfex/Settrade, PDPA, ผู้ให้บริการ LLM) เหมือนกับที่รวบรวมไว้ใน `thai-momentum-platform/docs/scorecard.md` §4 — สถานะเฉพาะของแอปนี้:

- **วันนี้:** ใช้เองกับข้อมูลจำลอง ไม่ให้คำแนะนำแก่ผู้อื่น ไม่เก็บข้อมูลส่วนบุคคล → ไม่เข้าข่ายธุรกิจที่ปรึกษา และยังไม่มีประเด็นสิทธิ์ข้อมูล
- **ต่อข้อมูลจริง:** Yahoo ใช้ส่วนตัวเท่านั้น · ข้อมูล SET ที่นำไปแสดงต่อผู้อื่นต้องมีสัญญากับ SET/vendor
- **เปิดให้คนอื่นใช้:** ต้องมีข้อกำหนดการใช้งาน + ประกาศความเป็นส่วนตัว (ยังไม่มีทั้งคู่) · ถ้าเก็บบัญชี/อีเมล = PDPA
- **ให้สัญญาณแก่ผู้อื่นโดยได้ค่าตอบแทน:** ธุรกิจที่ปรึกษาการลงทุน ต้องมีใบอนุญาตหรือทำผ่านผู้ได้รับอนุญาต · ก.ล.ต. กำลังทบทวนกติกาคำแนะนำออนไลน์ (รับฟังความเห็นถึง 15 ต.ค. 2569) ต้องติดตาม
- **LLM:** evidence ที่ส่งออกไม่มีข้อมูลส่วนบุคคล แต่ต้องแจ้งในข้อกำหนดเมื่อเปิดใช้ผู้ให้บริการภายนอก

## 8. ความพร้อมเชิงธุรกิจ (สั้น — ยังไม่ถึงเวลาตัดสิน)

- ก่อนคุยเรื่องราคา ต้องผ่าน M1–M2 ก่อน: คุณค่าของแพลตฟอร์มคือ "หลักฐานว่าเอนจินมี edge บนข้อมูลจริง" ซึ่งตอนนี้ยังเป็นศูนย์
- รูปแบบที่ความเสี่ยงต่ำสุดคือ **ซอฟต์แวร์ติดตั้งใช้เองกับข้อมูลของผู้ใช้** (ข้อมูลไม่ผ่านเรา ไม่ให้คำแนะนำ) — ตรงกับสถาปัตยกรรมตอนนี้ (SQLite, standalone, Basic auth) มากที่สุด
- จุดอ้างอิงราคาและตัวชี้วัดที่ต้องเก็บ ใช้ชุดเดียวกับ `thai-momentum-platform/docs/scorecard.md` §5
