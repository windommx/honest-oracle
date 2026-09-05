# งานวิจัยใหม่ (2024–2026) ที่เกี่ยวกับหุ้นปันผล — เจาะลึกตามชั้นความรู้

ต่อจาก [`dividend-algorithm.md`](./dividend-algorithm.md). คำถาม: *มีงานใหม่อะไรบ้าง และแต่ละงานให้
"ความรู้ชนิดไหน" แก่เอนจิน* — ใช้สี่ชั้นของ [`docs/epistemology.md`](../epistemology.md):

| ชั้น | ความหมายในบริบทนี้ | รับเข้า `lib/dividend` เป็น |
|---|---|---|
| 1 **ประจักษ์ (paccakkha)** | ข้อเท็จจริงที่นับซ้ำได้จากงบ และงานวิจัยยืนยันว่า *การนับนั้น* ทำนายเหตุการณ์จริง | hard gate / cell |
| 2 **อนุมาน (anumāna)** | อัตราส่วนหรือสูตรเปิดเผยที่ทดสอบนอกตัวอย่างแล้ว แต่สัมประสิทธิ์หรือเกณฑ์เป็นของยืมมา | watch gate / ranking key / harness |
| 3 **สัญญา (saññā)** | ป้ายที่ทำงานได้ในบางตลาดบางช่วง มีอัตราพลาดที่รู้ | flag ที่ไม่ตัดสิน |
| 4 **อวิสัย (avisaya)** | ทำซ้ำไม่ได้ หรือหลักฐานถูกถอน หรือปนอนาคต | ปฏิเสธ — และบันทึกว่าทำไม |

Web-sourced September 2026. arXiv/SSRN ถูกบล็อกจาก proxy ของ session นี้ จึงอ่านผ่านหน้าสรุปและบทคัดย่อที่เข้าถึงได้ — ตรวจฉบับเต็มก่อนอ้างตัวเลขต่อ.

> **สรุปหนึ่งย่อหน้า:** งานใหม่ *ไม่ได้* เพิ่มตัวทำนายใหม่ที่แข็งกว่าประตูเดิม (ขาดทุน · coverage · หนี้)
> แต่ทำสามอย่าง: (ก) ยืนยันประตูเดิมในวิกฤตจริง (COVID) และในตลาดเกิดใหม่ (Piotroski) → ชั้น 1–2 แข็งขึ้น;
> (ข) เพิ่ม *หนึ่ง* สัญญาณเชิงราคาที่เป็นชั้น 2 คือ **D/P สูงผิดปกติทำนายการตัด ไม่ใช่ผลตอบแทน** (Welch & Goyal 2025);
> (ค) ปิดประตูชั้น 4 ให้สนิท: งาน LLM-วิเคราะห์งบที่โด่งดังที่สุด **ถูกถอน** และมีงานวัดได้แล้วว่า LLM
> "จำอนาคต" (look-ahead) — เหตุผลเชิงประจักษ์ที่จะไม่ให้ LLM เป็น verdict fn.

---

## ชั้น 1 — ประจักษ์: การนับที่งานใหม่ยืนยัน

### 1.1 ขาดทุน · leverage · เงินสด ในวิกฤตจริง (COVID-19, 2020–2022)
- **JFQA** — *The COVID-19 Pandemic and Corporate Dividend Policy* ([Cambridge](https://www.cambridge.org/core/journals/journal-of-financial-and-quantitative-analysis/article/covid19-pandemic-and-corporate-dividend-policy/9C98081C9A7F06CFEFA55906BE0AD22F)):
  จากบริษัทจ่ายปันผล ~1,400 แห่ง มี **213 ตัด และ 93 งด** ใน Q2/2020 — สูงกว่าไตรมาสปกติ 3–5 เท่า.
- **G-12 / G-7** ([PubMed](https://pubmed.ncbi.nlm.nih.gov/34658678/), [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC9398785/)):
  บริษัทที่ **กำไรสูงคงปันผล**, **leverage สูงตัด**, **เงินสดในมือลดผลกระทบ** (ยกเว้นยุโรปที่ผลอ่อนกว่า).
- **ผลต่อเอนจิน:** ประตู `loss`, `leverage`, `fcf_uncovered`+`cashRunway` ที่มีอยู่ คือชุดตัวแปรเดียวกับที่งานเหล่านี้พบ
  — และมันพบ *ในวิกฤต* ซึ่งเป็นช่วงที่ base rate การตัดพุ่งจาก ~2 % เป็น ~20 %. ไม่ต้องแก้กฎ แต่ **ต้องรายงานผลแยกปี**
  เพราะโมเดลที่ดูดีเฉพาะปีวิกฤต (หรือเฉพาะปีสงบ) ไม่ใช่โมเดลเดียวกัน — ดู §5.

### 1.2 Piotroski F-score ยังทำงานนอกสหรัฐ
- Walkshäusl 2020, *J. Asset Management* ([Springer](https://link.springer.com/article/10.1057/s41260-020-00157-2)): 2000–2018,
  high−low F-score ≈ **+10 %/ปี** ทั้ง developed non-US และ emerging, คงอยู่หลังคุม size / B-M / momentum / profitability / investment.
- Shi 2024, ตลาดจีน ([SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5144971)): high−low **0.57 %/เดือน** (EW), 0.50 % (VW).
- **ผลต่อเอนจิน:** F-score เป็น 9 การนับเปรียบเทียบ (ชั้น 1) ที่ประโยชน์ยืนยันข้ามตลาด → คงเป็น ranking key อันดับแรก.
  ข้อควรระวัง: หลักฐานเป็น *ผลตอบแทน* ไม่ใช่ *การตัดปันผล* โดยตรง — การใช้เป็นประตู `f_score < 5 → watch` จึงเป็นการ
  ยืมข้ามคำถาม (ชั้น 2 ไม่ใช่ 1) และ harness ต้องพิสูจน์บนข้อมูลจริงว่ามันลด false negative ของการตัดจริงหรือไม่.

### 1.3 Accrual (CFO > NI) — ส่วนที่ยังใช้ได้และส่วนที่ตายแล้ว
- Anomaly ของ Sloan ในฐานะ *กลยุทธ์ผลตอบแทน* เสื่อมในสหรัฐหลัง 2002 ([Green et al., Mgmt Sci](https://pubsonline.informs.org/doi/10.1287/mnsc.1110.1320))
  แต่ยังพบในตลาดเกิดใหม่และตลาดที่ข้อมูลไม่สมมาตร ([จีน](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9595132/), [ญี่ปุ่น 2024](https://www.tandfonline.com/doi/full/10.1080/23322039.2024.2318128)).
- **ผลต่อเอนจิน:** เราไม่ได้ใช้ accrual เพื่อหาผลตอบแทน แต่ใช้เพื่อถามว่า *กำไรที่จะจ่ายปันผลเป็นเงินสดจริงไหม* —
  คำถามนี้ไม่ขึ้นกับว่าตลาดราคามันถูกหรือไม่. ข้อค้นพบว่า anomaly "ถูก arbitrage ไปแล้ว" จึง **ไม่กระทบ** การใช้ CFO > NI เป็น test ชั้น 1.

## ชั้น 2 — อนุมาน: สูตรเปิดเผยที่งานใหม่เพิ่มหรือปรับ

### 2.1 D/P สูงผิดปกติ = ตลาดกำลังบอกว่าจะตัด (ใหม่ · รับเข้าแล้ว)
- **Welch & Goyal, สิงหาคม 2025** — *Dividend-Price Ratios and Payout Constraints* ([SSRN 5442914](https://ssrn.com/abstract=5442914)):
  ในระดับ *หุ้นรายตัว* อัตราส่วน D/P ที่สูงมาก **ทำนายการลดปันผลในอนาคต ไม่ใช่ผลตอบแทนที่สูงขึ้น** ตรงข้ามกับความสัมพันธ์ในช่วง D/P
  แคบ ๆ ของดัชนีรวม; และชี้ข้อจำกัดที่โมเดลเดิมมองข้าม: ปันผลไม่มีวันเกินราคาหุ้น.
- นี่คือหลักฐานเชิงวิชาการของ "yield trap" ที่ก่อนหน้านี้เรามีแค่จาก S&P DJI/practitioner.
- **ผลต่อเอนจิน (ทำแล้วในคอมมิตนี้):** เพิ่มกฎ `yield_extreme` — dividend yield > `yieldExtreme` (ค่าเริ่มต้น 12 %, เปิดเผยใน policy)
  → **watch**. เป็นชั้น 2 เพราะเกณฑ์ 12 % เป็นค่ายืม ไม่ใช่ค่าที่เปเปอร์ให้ (เปเปอร์พูดถึง "สูงมาก" ในการกระจายตัวข้ามหุ้น)
  — ขั้นถัดไปที่ถูกต้องกว่าคือเกณฑ์สัมพัทธ์กับจักรวาล (เช่น > percentile 95 ของปีนั้น) ซึ่งต้องมีจักรวาลจริงก่อน.
  ธง `yield_trap` เดิม (ราคาลง > 30 % + payout > 1) คงเป็นสัญญา.

### 2.2 Dividend smoothing — ทำไม label ต้องเป็น "ปีถัดไป" และ harness ต้อง lag
- Meta-analysis 99 งานของโมเดล Lintner ([Int. Rev. Fin. Analysis](https://www.sciencedirect.com/science/article/abs/pii/S1057521918301376)):
  smoothing มีจริงแต่ "ปานกลาง" และมี publication bias สองทิศ.
- *Payouts smoothing and income growth*, **Applied Economics 2025** ([T&F](https://www.tandfonline.com/doi/full/10.1080/00036846.2025.2551287)):
  การจ่ายทนต่อ shock กำไร *รายปี* แต่ **ไม่ทนต่อการเติบโตของกำไรในระยะยาว** — กำไรที่ทรุดหลายปีสะสมแล้วถึงตัด.
- **ผลต่อเอนจิน:** ยืนยันการออกแบบสองอย่างที่ทำไปแล้ว: (1) fixture ใช้นโยบายปันผลหน่วง 1 ปี; (2) `payout_eps_2y` (สองปีติด) เป็นประตูแข็ง
  ส่วนปีเดียวเป็นแค่ watch. **สิ่งที่ยังขาด:** cell "แนวโน้มกำไร 3 ปี" (เช่น EPS ปีล่าสุด / ค่าเฉลี่ย 3 ปี) เป็นตัวเลือกชั้น 2 ถัดไป —
  ยังไม่เพิ่มจนกว่า harness บนข้อมูลจริงจะบอกว่ามันลด false negative.

### 2.3 Factor replication — ทำไม "quality ก่อน yield" ถึงไม่ใช่ data mining
- Jensen, Kelly & Pedersen 2023, *J. Finance* ([Wiley](https://onlinelibrary.wiley.com/doi/full/10.1111/jofi.13249), [โค้ด](https://github.com/bkelly-lab/ReplicationCrisis)):
  ปัจจัยส่วนใหญ่จาก 153 ตัว **ทำซ้ำได้ทั้งใน/นอกตัวอย่างใน 93 ประเทศ** เมื่อใช้ Bayesian shrinkage; จัดเป็น 13 ธีม —
  profitability/quality เป็นธีมที่มีน้ำหนักในพอร์ต tangency, ส่วน dividend yield เดี่ยว ๆ อ่อน.
- **ผลต่อเอนจิน:** ให้เหตุผลชั้น 2 กับลำดับ lexicographic ที่เลือกไว้ (F-score ก่อน yield). ไม่เปลี่ยนโค้ด.
  ข้อควรระวัง: Harvey–Liu ยังยืนกราน hurdle t > 3 สำหรับปัจจัยใหม่ ([SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2345489)) —
  ทุก cell ที่เราจะ *เพิ่ม* ต้องผ่าน permutation test ของ harness ไม่ใช่แค่ "มีเปเปอร์รองรับ".

### 2.4 Altman Z'' — สูตรใช้ได้ แต่ค่าคงที่และเกณฑ์ต้องเปิดเผยว่าเป็นของยืม
- Review ข้ามอุตสาหกรรม 2024 ([ResearchGate](https://www.researchgate.net/publication/379837119_A_Comprehensive_Review_of_the_Altman_Z-Score_Model_Across_Industries)) และงานเหมือง JSE
  ([T&F 2024](https://www.tandfonline.com/doi/full/10.1080/10293523.2024.2397892)): ใช้ได้เป็น *early warning* แต่ต้องปรับตามภาคส่วน;
  บริการ/ดิจิทัลอ่อนสุด.
- รายละเอียดที่ตรวจพบ: ฉบับ EM ของ Altman มีค่าคงที่ **+3.25** เพื่อเทียบเป็นเรตติ้งพันธบัตร ([creditguru](https://www.creditguru.com/index.php/bankruptcy-and-insolvency/altman-z-score-insolvency-predictor-for-non-manufacturers-emerging-markets));
  โค้ดเราใช้ฉบับ *ไม่มี* ค่าคงที่ กับโซน 1.1 / 2.6 ซึ่งเป็นคู่ที่สอดคล้องกัน (เอกสารใน `altman.ts`) — **ห้าม** ผสมค่าคงที่ 3.25 กับโซนชุดนี้.
- **ผลต่อเอนจิน:** ไม่เปลี่ยนสูตร; เพิ่มคำเตือนใน README ว่า sector ธนาคาร/ประกัน/อสังหาต้อง policy แยก (มีอยู่แล้วใน backlog).

### 2.5 Validation ในระบอบเศรษฐกิจที่ต่างกัน (ใหม่ · รับเข้าแล้ว)
- *One Model Fits All?*, **Economies (MDPI) ธันวาคม 2025** ([doi](https://doi.org/10.3390/economies13120361)): SME สโลวาเกีย
  แบ่ง 2018–19 / 2020–21 / 2022–23 — ความสัมพันธ์ตัวชี้วัด–ความล้มเหลว **เลื่อนตามช่วง**; โมเดลเดียวครอบทุกช่วงเสียความแม่น.
- Look-ahead / regime: [Look-Ahead-Bench 2026](https://arxiv.org/abs/2601.13770) ใช้ "alpha decay ข้ามระบอบ" เป็นตัววัดว่าโมเดลจำอดีตหรือรู้จริง.
- **ผลต่อเอนจิน (ทำแล้วในคอมมิตนี้):** `walkForward` คืน confusion **ต่อปีทดสอบ**; `benchmark` รายงาน `byYear` และ `worstYear`;
  รายงาน Markdown พิมพ์ BA รายปี. ตัวเลขรวมที่สวยแต่ปีแย่สุดใกล้ 0.5 = โมเดลทำงานได้ในระบอบเดียว — ผู้อ่านเห็นเอง ไม่ต้องเชื่อค่าเฉลี่ย.

## ชั้น 3 — สัญญา: ป้ายที่มีอัตราพลาดที่รู้

### 3.1 Beneish M — ทำงานได้ 66–75 % และพลาด 17 % (คงเป็นธง)
- Beneish เอง (backtest): จับผู้แต่งบัญชีได้ **75 %**, false positive **17 %** ([Portfolio123](https://blog.portfolio123.com/detecting-financial-fraud-a-close-look-at-the-beneish-m-score/)).
- **โปแลนด์ 2025**, *CEMJ* ([Emerald](https://www.emerald.com/cemj/article/doi/10.1108/CEMJ-07-2024-0225/1304262/Evaluating-the-efficacy-of-modified-Beneish-and)):
  ฉบับ **5 ตัวแปร ที่เกณฑ์ −2.76** ให้ F-measure สูงสุด เหนือ Dechow F-score.
- **อินเดีย (ธนาคาร) 2025**: ~66 % ([ResearchGate](https://www.researchgate.net/publication/392336805_Assessing_the_effectiveness_of_the_Beneish_M-Score_Model_to_Detect_Financial_Manipulation_in_Selected_Indian_Public_and_Private_Banks));
  **อินโดนีเซีย 2022–24**: M-score แพ้ Altman (68 %); **Borsa Istanbul 2018–22** ใช้ Z+M ผ่าน random forest เทียบค่าปรับจริง ([SAGE 2025](https://journals.sagepub.com/doi/10.1177/21582440251386174)).
- **ผลต่อเอนจิน:** อัตราพลาด 17–34 % คือนิยามของ *saññā* — ถูกต้องแล้วที่เป็นธง ไม่ตัดสิน. ตัวเลือกถัดไป: เพิ่มฉบับ 5 ตัวแปร/−2.76 เป็นธงที่สอง
  (ต้องการ input น้อยกว่า — ไม่ต้องมี SGA/DEPI) เพื่อให้บริษัทที่ข้อมูลไม่ครบยังได้ธงแทน avisaya.

### 3.2 Dechow F-score — ทางเลือกที่ผลไม่คงเส้นคงวา
- เทียบกันหลายตลาด: บางงาน F ชนะ M, บางงานกลับกัน; ในสภาพเศรษฐกิจผันผวน M ชนะ (87.5 % vs 62.5 %, ZSE 2026)
  ([JEMBAR](https://journal-iasssf.com/index.php/JEMBAR/article/view/2025), [แอฟริกาใต้](https://www.tandfonline.com/doi/full/10.1080/23322039.2023.2190215)).
- **ผลต่อเอนจิน:** ไม่เพิ่ม — ความไม่คงเส้นคงวาข้ามตลาดหมายความว่าเราจะเลือกเกณฑ์ไม่ได้โดยไม่ fit กับข้อมูลเราเอง.

### 3.3 บริบทไทย
- ปันผล SET ปี 2025 **651 พันล้านบาท** สูงสุดเป็นประวัติการณ์ (+9.71 %) จาก 581 บริษัท; นำโดยพลังงาน ธนาคาร ICT
  ([Bangkok Post](https://www.bangkokpost.com/business/general/3177338/thai-dividend-payouts-hit-record-high-in-2025)).
- บริษัทไทยที่ครอบครัวถือหุ้นสูงจ่ายปันผล *สูงกว่า* ([RPBFMP 2023](https://www.worldscientific.com/doi/10.1142/S0219091523500066));
  กฎหมายไทยห้ามจ่ายเมื่อขาดทุนสะสม ([SET](https://www.set.or.th/en/listing/listed-company/simplified-regulations/disclosure/dividend-payment)).
- **ผลต่อเอนจิน:** (1) ข้อห้ามตามกฎหมายทำให้ `retainedEarnings < 0` เป็นประตูชั้น 1 ในไทยโดยเฉพาะ — ตอนนี้มันอยู่ใน Altman X2 เท่านั้น;
  เป็นรายการถัดไปที่ควรเพิ่มเมื่อมี policy แยกตลาด. (2) family ownership เป็นสัญญา: อธิบาย *ระดับ* payout แต่ยังไม่มีงานที่แสดงว่ามันทำนาย *การตัด*.

## ชั้น 4 — อวิสัย: สิ่งที่งานใหม่บอกให้ปฏิเสธ

### 4.1 LLM อ่านงบแล้วทำนาย — เปเปอร์หลักถูกถอน
- Kim, Muhn & Nikolaev 2024 (*Financial Statement Analysis with LLMs*, Chicago Booth): เคยรายงานว่า GPT-4 ทำนายทิศกำไรชนะนักวิเคราะห์.
  **ถูกถอนเมื่อ 20 ก.พ. 2025** หลังผู้เขียนร่วมพบ "ความไม่สอดคล้องในข้อมูลและการวิเคราะห์" ขณะพยายาม replicate
  ([arXiv 2407.17866](https://arxiv.org/abs/2407.17866), [Chicago Booth](https://www.chicagobooth.edu/research/fama-miller/finance-research/funding/a-demand-system-approach-for-fixed-income/financial-statement-analysis-with-large-language-models)).
- **Didisheim, Fraschini & Somoza, Economics Letters 2025** — *AI's predictable memory in financial analysis*
  ([ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0165176525004392)): LLM จำข้อมูลการเงินในอดีตได้ตามคาด
  โดยเฉพาะ **ความถี่ต่ำ (รายปี) และดัชนีรวม** — ซึ่งคือชนิดข้อมูลของงบรายปีพอดี.
- **Look-Ahead-Bench 2026** ([arXiv](https://arxiv.org/abs/2601.13770), [GitHub](https://github.com/benstaf/lookaheadbench)): Llama 3.1 / DeepSeek
  แสดง look-ahead bias ชัด (alpha decay) ต่างจากโมเดล point-in-time.
- **ผลต่อเอนจิน:** ปิดประตูด้วยหลักฐาน ไม่ใช่ด้วยหลักการอย่างเดียว: verdict fn ต้องเป็นกฎเปิดเผย; LLM ใช้ได้เพียงเขียน *คำอธิบาย* ของ
  เหตุผลที่เอนจินนับได้แล้ว (แบบเดียวกับ Rush Engine) — ห้ามให้มันเห็นชื่อบริษัทหรือปีก่อนตัดสิน.

### 4.2 ML ทำนายการตัดปันผลโดยตรง — ยังไม่มีงานที่ผ่านเกณฑ์
- งานที่พบ (Pakistan 2024 [ICMR](https://scholarhub.ui.ac.id/icmr/vol18/iss2/3/); decision-tree 70 ประเทศ [Springer](https://link.springer.com/chapter/10.1007/978-3-030-71869-5_2))
  ทำนาย *จ่าย/ไม่จ่าย* หรือ *ระดับ payout* — ไม่ใช่ *การตัด* — และไม่รายงาน walk-forward/embargo.
- **ผลต่อเอนจิน:** คง `Predictor` interface ไว้ให้เสียบโมเดล fit ได้ แต่จนกว่าจะมีโมเดลที่ชนะ `payout>1` ใน harness ของเราเอง ยังไม่มีอะไรจะรับ.

### 4.3 อุปมา "แอ่งดึงดูด" กับราคา — งาน verification ปี 2026 ตอกย้ำว่าใช้ได้เฉพาะเมื่อ verifier มีจริง
- งานตามหลัง FRM: *Adaptive Generate-Rank-Verify* ([arXiv 2605.17609](https://arxiv.org/abs/2605.17609)) และ
  *TTRL-CoCoV* ([arXiv 2606.03608](https://arxiv.org/abs/2606.03608)) ต่างตั้งอยู่บนสมมติฐานว่า **มี verifier ที่แพงแต่ถูกต้อง**
  (เช็กคำตอบเลข, รัน test) และปัญหาคือจะจ่ายค่าตรวจเมื่อไร.
- ในตลาด verifier ที่ถูกต้องของ "ปันผลจะถูกตัดไหม" คือ *เวลาหนึ่งปี* — ซื้อไม่ได้เร็วกว่านั้น. สิ่งที่เรามีคือ stability gate ซึ่งเป็น
  *fragility test* ชั้น 1–2 ไม่ใช่ verifier. คำอ้างใดที่ยกระดับมันเป็น "ตัวพิสูจน์ความถูกต้อง" ยังคงเป็นอวิสัย.

---

## 5. สิ่งที่เปลี่ยนในโค้ดจากบันทึกนี้

| การเปลี่ยนแปลง | ที่มา | ชั้น | ไฟล์ |
|---|---|---|---|
| กฎ `yield_extreme` (yield > 12 % → watch, เกณฑ์เปิดเผยใน policy) | Welch & Goyal 2025 | 2 | `verdict.ts`, `types.ts` |
| confusion ต่อปีทดสอบ + `byYear` / `worstYear` ใน benchmark และรายงาน | MDPI Economies 2025, Look-Ahead-Bench 2026 | harness | `validation.ts`, `io.ts` |

## 6. คิวถัดไป (เรียงตามชั้นและตามหลักฐาน)

1. **ชั้น 1 (ไทย):** `retainedEarnings < 0 → at-risk` ภายใต้ policy ตลาดไทย — เป็นข้อห้ามทางกฎหมาย ไม่ใช่สถิติ
2. **ชั้น 2:** เกณฑ์ `yield_extreme` แบบสัมพัทธ์ (percentile ของจักรวาลปีนั้น) แทนค่าคงที่ 12 % — ต้องมีจักรวาลจริง
3. **ชั้น 2:** cell แนวโน้มกำไร 3 ปี (จากหลักฐาน smoothing ระยะยาว 2025) — เพิ่มเมื่อ harness บนข้อมูลจริงแสดงว่าลด FN
4. **ชั้น 3:** Beneish ฉบับ 5 ตัวแปร / −2.76 เป็นธงสำรองเมื่อ input ไม่ครบ
5. **harness:** deflated Sharpe / Harvey–Liu haircut ก่อนอ้างผลตอบแทนของพอร์ตใด ๆ
