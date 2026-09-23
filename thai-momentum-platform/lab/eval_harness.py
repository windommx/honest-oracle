# eval_harness.py — ตรวจโมเดล Nimble ก่อน promote ผ่าน 5 ด่าน (offline kit)
# ใช้: python eval_harness.py --base models/nimble-9b --new models/nimble-9b-core \
#        [--labels labels.jsonl] [--shadow shadow_log.jsonl] [--n 500]
# หมายเหตุ: บนเว็บแพลตฟอร์มตัวเดียวกันนี้ทำงานเป็น POST /api/lab/eval (LLM ผ่าน SDK)
import argparse
import json
from pathlib import Path

import numpy as np

from nimble_runner import prompt_state
from state_gen import rule_engine
from synth_state import generate_batch

SYSTEM_PROMPT = ("You are THE CORE risk manager. Decide ONLY from the five gates "
                 "(regime, selection, level, trigger, risk) plus context circuit-breakers. "
                 "action=ENTER_LONG iff all gates=1 and day_pnl_R>-2. "
                 "confidence = calibrated probability this is a grade-A setup.")

GENERIC_PROMPT = ("You are a trading assistant. Respond with ONLY a JSON object with keys "
                  "action (ENTER_LONG|NO_TRADE), confidence (0..1), gates (five 0|1 sub-keys), "
                  "edge_case_note.")

SCHEMA = {
    "type": "object",
    "properties": {
        "action": {"enum": ["ENTER_LONG", "NO_TRADE"]},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "gates": {"type": "object",
                  "properties": {k: {"type": "integer", "enum": [0, 1]} for k in
                                 ["regime", "selection", "level", "trigger", "risk"]},
                  "required": ["regime", "selection", "level", "trigger", "risk"]},
        "edge_case_note": {"type": "string"},
    },
    "required": ["action", "confidence", "gates"],
}


def core_action(verdict: dict):
    """คำตอบครูของ kit (buy/hold/exit/reduce/wait) → ภาษา THE CORE: "ENTER_LONG" | None (= NO_TRADE)
    THE CORE ตัดสินเฉพาะการเปิดไม้ใหม่ → buy = ENTER_LONG, ที่เหลือทั้งหมด = NO_TRADE
    (เดิมเทียบ "wait"/"buy" ตรง ๆ กับ ENTER_LONG/NO_TRADE → G1 = 0 เสมอแม้โมเดลถูกทุกข้อ)"""
    return "ENTER_LONG" if (verdict or {}).get("action") == "buy" else None


def core_label(label):
    """ป้ายมนุษย์ได้ทั้งภาษา THE CORE (ENTER_LONG/NO_TRADE) และภาษาครู (buy/wait/…) — None = อ่านไม่ออก"""
    if label in ("ENTER_LONG", "buy"):
        return "ENTER_LONG"
    if label in ("NO_TRADE", "wait", "hold", "exit", "reduce"):
        return "NO_TRADE"
    return None


class EvalHarness:
    """รัน 5 ด่าน promotion gate + ออกรายงาน (llama.cpp local)"""

    def __init__(self, model_path: str):
        from llama_cpp import Llama  # lazy — ต้องติดตั้งเฉพาะเครื่อง local
        self.model = Llama(model_path, n_gpu_layers=-1, verbose=False)

    # ---------- ตัวช่วย ----------
    def _decide(self, llm, state, system_prompt=SYSTEM_PROMPT):
        try:
            r = llm.create_chat_completion(
                messages=[{"role": "system", "content": system_prompt},
                          {"role": "user", "content": json.dumps(prompt_state(state), ensure_ascii=False)}],
                response_format={"type": "json_schema", "json_schema": {"schema": SCHEMA}},
                temperature=0.0, max_tokens=220)
            return json.loads(r["choices"][0]["message"]["content"])
        except Exception as e:  # ล้มเหลว = NO_TRADE conf 0 (นับเป็น grammar fail ด้วย)
            return {"action": "NO_TRADE", "confidence": 0.0, "gates": {k: 0 for k in
                    ["regime", "selection", "level", "trigger", "risk"]}, "error": str(e)}

    def _agreement(self, llm, states, system_prompt=SYSTEM_PROMPT):
        """คืน (agree, valid_grammar, n) — ใช้ร่วมกันทั้งด่าน 1/4"""
        agree = valid = 0
        for s in states:
            dec = self._decide(llm, s, system_prompt)
            rule_action = core_action(rule_engine(s))
            model_action = dec.get("action")
            # คำตอบที่ล้ม (error → fallback NO_TRADE) ไม่ใช่การตัดสินของโมเดล — ห้ามนับว่าตรงกัน
            if "error" not in dec and ((rule_action == model_action)
                                       or (not rule_action and model_action == "NO_TRADE")):
                agree += 1
            if "error" not in dec and dec.get("action") in ("ENTER_LONG", "NO_TRADE") \
                    and isinstance(dec.get("confidence"), (int, float)) \
                    and all(k in dec.get("gates", {}) for k in
                            ["regime", "selection", "level", "trigger", "risk"]):
                valid += 1
        return agree, valid, len(states)

    # ---------- 5 ด่าน ----------
    def gate1_and_4(self, n=500):
        states = generate_batch(n, seed=123)
        agree, valid, n = self._agreement(self.model, states)
        return agree / n, valid / n

    def gate2_human_edge(self, labels_path):
        if not Path(labels_path).exists():
            print(f"⚠️  {labels_path} not found — skip"); return None
        labels = []
        for line in open(labels_path, encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            try:
                labels.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        agree = n = 0
        for l in labels:
            # รับทั้ง {date, asset, label} (state อยู่ใน states/) และ {date, state, action} ของ build_dataset.py
            s = l.get("state")
            if s is None:
                path = Path("states") / f"{l.get('date')}_{l.get('asset')}.json"
                if not path.exists():
                    print(f"⚠️  ไม่พบ {path} — ข้ามป้ายนี้")
                    continue
                s = json.loads(path.read_text(encoding="utf-8"))
            label = core_label(l.get("label") or l.get("action"))
            if label is None:
                continue
            n += 1
            dec = self._decide(self.model, s)
            if "error" not in dec and dec.get("action") == label:
                agree += 1
        return agree / n if n else None

    def gate3_calibration(self, shadow_log_path):
        if not Path(shadow_log_path).exists():
            print(f"⚠️  {shadow_log_path} not found — skip"); return None
        logs = [json.loads(l) for l in open(shadow_log_path, encoding="utf-8") if l.strip()]
        v = [l for l in logs if l.get("outcome_R") is not None and l.get("nimble_conf") is not None]
        if len(v) < 10:
            return None
        confs = np.array([l["nimble_conf"] for l in v])
        outs = np.array([1 if l["outcome_R"] > 0 else 0 for l in v])
        return float(np.mean((confs - outs) ** 2))

    def gate5_no_regression(self, base_model_path, n=250):
        from llama_cpp import Llama
        base = Llama(base_model_path, n_gpu_layers=-1, verbose=False)
        states = generate_batch(max(1, n // 2), seed=789)
        base_agree, _, _ = self._agreement(base, states, GENERIC_PROMPT)
        new_agree, _, _ = self._agreement(self.model, states)
        return new_agree >= base_agree, base_agree, new_agree

    def run_full_eval(self, base_model_path, labels_path="labels.jsonl",
                      shadow_log_path="shadow_log.jsonl", n=500):
        print("🧪 Running 5-Gate Promotion Evaluation...\n")
        results, details = {}, {}

        print("1/5 + 4/5 Synthetic Agreement & Grammar...")
        g1, g4 = self.gate1_and_4(n)
        results["synthetic_agreement"], results["grammar_validity"] = round(g1, 4), round(g4, 4)
        print(f"   → agree {g1:.3f} (need ≥0.97) | grammar {g4:.3f} (need 1.00)")

        print("2/5 Human Edge Agreement...")
        g2 = self.gate2_human_edge(labels_path)
        results["human_edge_agreement"] = None if g2 is None else round(g2, 4)
        print(f"   → {'skip' if g2 is None else f'{g2:.3f} (need ≥0.85)'}")

        print("3/5 Calibration (Brier)...")
        g3 = self.gate3_calibration(shadow_log_path)
        results["brier_score"] = None if g3 is None else round(g3, 4)
        print(f"   → {'skip' if g3 is None else f'{g3:.3f} (need <0.15)'}")

        print("5/5 No Regression...")
        g5, base_agree, new_agree = self.gate5_no_regression(base_model_path, n)
        results["no_regression"] = bool(g5)
        details["gate5"] = {"base_agree": base_agree, "new_agree": new_agree}
        print(f"   → {'PASS' if g5 else 'FAIL'} (base {base_agree} vs new {new_agree})")

        passed = (results["synthetic_agreement"] >= 0.97
                  and (results["human_edge_agreement"] is None or results["human_edge_agreement"] >= 0.85)
                  and (results["brier_score"] is None or results["brier_score"] < 0.15)
                  and results["grammar_validity"] == 1.0
                  and results["no_regression"])
        results["PROMOTION"] = "APPROVED" if passed else "REJECTED"

        report = {"results": results, "details": details, "n": n}
        out = f"eval_report_{Path(self.model.model_path).stem}.json"
        json.dump(report, open(out, "w"), indent=2, ensure_ascii=False)
        print(f"\n{'✅ APPROVED — swap ไฟล์โมเดลใน runner ได้' if passed else '🚫 REJECTED — archive + อ่าน failure cases'}")
        print(f"Report saved: {out}")
        return report


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True, help="โมเดลฐาน (เทียบ no-regression)")
    ap.add_argument("--new", required=True, help="โมเดล finetune ที่จะ promote")
    ap.add_argument("--labels", default="labels.jsonl")
    ap.add_argument("--shadow", default="shadow_log.jsonl")
    ap.add_argument("--n", type=int, default=500)
    a = ap.parse_args()
    EvalHarness(a.new).run_full_eval(a.base, a.labels, a.shadow, a.n)
