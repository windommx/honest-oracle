# 🔬 LAB KIT (Offline) — Thai Momentum Platform

ชุดสคริปต์ Python สำหรับรัน **ห้องแล็บเงา + หลักฐาน H1–H4** บนเครื่อง local (ข้อมูล OHLC จริงจาก AmiBroker) — เป็นฉบับ offline ของสิ่งที่แพลตฟอร์มเว็บทำอยู่แล้วในแท็บ **Evidence Board** และ **Shadow Lab**

## แผนที่ kit ↔ แพลตฟอร์ม

| Offline (lab/) | บนเว็บแพลตฟอร์ม | ที่เก็บ |
|---|---|---|
| `thai_fit.py all` → `evidence_report.json` | POST `/api/evidence/run` + แท็บ Evidence Board | `ResearchRun` (kind `thai_fit`) |
| `apply_verdict.py` → `config/config_th.json` | auto-apply จาก verdict (Q_SIGNAL audit) | `Setting` key `config_th` + `Decision` |
| `preflight.py` | ตรวจฟืนก่อน backfill | — |
| `state_gen.py` → `states/*.json` | `src/lib/lab/panel-state.ts` (จาก RawDaily) | — |
| `synth_state.py` | `src/lib/lab/synth-state.ts` | — |
| `nimble_runner.py` → `shadow_log.jsonl` | POST `/api/lab/run` (Nimble = LLM ผ่าน SDK) | `ShadowLog` |
| `shadow_dash.py` (streamlit) | แท็บ Shadow Lab (matrix/calibration/P&L/gate-kill) | GET `/api/lab/dashboard` |
| `labels.jsonl` (edge-case labeling) | Dialog "Label" ในแท็บ Shadow Lab | `EdgeLabel` |
| `build_dataset.py` → `train/val.jsonl` + `lora_nimble_core.yaml` | (อนาคต: fine-tune แล้วสวับโมเดลผ่าน 5 ด่าน) | — |
| `eval_harness.py` | POST `/api/lab/eval` (5-gate promotion) | `ResearchRun` (kind `lab_eval`) |
| `context_updater.py` (journal → circuit-breaker) | context zeros (paper mode) | — |
| `fetch_set_feed.py` → CSV + POST `/api/feed/ingest` | การ์ด "ดึงข้อมูลจริงจาก feed" (Yahoo) | `RawDaily` / `Snapshot` / `SymbolMeta` + `EventLog` (ingest) |
| `fetch_settrade_feed.py` (เทมเพลต Settrade Open API) | — | เดียวกัน |

## ฐานข้อมูลที่ kit อ่าน

SQLite ของแพลตฟอร์ม: `../db/custom.db` → ตาราง **RawDaily** (columns: `date` 'YYYY-MM-DD' · `symbol` · `close` · `val` · `liq5` 0/1) — ถ้า local ใช้ไฟล์ CSV OHLC เต็ม ให้ชี้ `load_px()` ไปที่ CSV ต่อ ticker ได้ทันที

## ติดตั้ง

```bash
pip install pandas numpy streamlit          # ชุดพื้นฐาน
pip install "settfex>=0.24"                 # ดึงข้อมูลจริงจาก SET (fetch_set_feed.py) — Python 3.11+
pip install yfinance                        # ทางเลือก: ผสาน OHLC จาก Yahoo ให้ SET Sniper
pip install llama-cpp-python                # เฉพาะถ้ารัน nimble_runner/eval_harness ด้วยโมเดล local
```

## ลำดับรัน (0→6) — คืนเดียวจบ

```bash
0  python preflight.py history.csv            # ต้อง ✅ ทุกแถว ก่อนจุดไฟ
1  python backfill.py history.csv 2022-01-01  # (สคริปต์ backfill ของ pipeline หลัก)
2  python thai_fit.py all | tee evidence_night.txt
3  python apply_verdict.py                    # คอนฟิกเปลี่ยนเอง + audit row
4  (บนแพลตฟอร์ม) bun run ic                   # signals v2 บนข้อมูลจริง
5  (บนแพลตฟอร์ม) backtest stops               # fixed vs bayesT vs bayesR
6  streamlit run shadow_dash.py               # เปิดแล็บเงา — label edge queue ≤5 เคส/สัปดาห์
```

## ตารางเฝ้า effect decay (ทุกเดือน)

```bash
# unix cron — วันที่ 1 ของเดือน 06:00
0 6 1 * * cd /path/to/momentum/lab && python thai_fit.py all && python apply_verdict.py
# Windows (schtasks): ปรับ TR เป็น path ของเครื่องคุณ
# schtasks /Create /SC MONTHLY /D 1 /ST 06:00 /TN "MomentumEvidence" /TR "cmd /c cd /d C:\momentum\lab && python thai_fit.py all && python apply_verdict.py"
```

ถ้า verdict พลิกเดือนใด → config เปลี่ยนเอง + audit row — เห็น effect ตาย **ในเดือนที่มันตาย** ไม่ใช่ปีถัดไป

## ⚠️ ธรรมาภิบาล

- ทุกตัวเลขในแล็บนี้คือ "เงา" — **ห้าม**เอา shadow P&L สวย ๆ มาเป็นเหตุผลเลื่อนวันเทรดจริงเร็วขึ้น
- เงื่อนไขเงินจริงคงเดิม: **THE CORE ผ่าน 100 ไม้ + compliance ≥90% ก่อน** แล้ว Nimble จึงขยับจากเงามาเป็นที่ปรึกษา
- ผล H1–H4 จากข้อมูลจำลองของแพลตฟอร์ม = โครงเดียวกับของจริง แต่**ตัวเลขไม่ใช่คำตอบตลาดจริง** — คำตอบจริงต้องมาจาก CSV จริงผ่าน kit นี้
