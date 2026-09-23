#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Regression tests ของ LAB KIT (offline) — ไม่แตะ db/custom.db และไม่ใช้เครือข่าย
รัน:  python3 lab/tests_lab/test_lab_kit.py     (หรือ pytest lab/tests_lab ถ้ามี pytest)
"""

import json
import math
import os
import runpy
import sqlite3
import sys
import tempfile
import types
from pathlib import Path

LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB))

import build_dataset as bd  # noqa: E402
import eval_harness as eh  # noqa: E402
import nimble_runner as nr  # noqa: E402
import state_gen as sg  # noqa: E402
import synth_state as ss  # noqa: E402

SYMS = {"AAA": 10.0, "MMM": 50.0, "ZZZ": 300.0}   # ระดับราคาต่างกันชัด ๆ


def _make_db(path: Path, days: int = 40, skip: dict | None = None) -> list[str]:
    """RawDaily ขนาดเล็ก (date, symbol, close, val) — วันทำการจ-ศ"""
    import datetime as dt
    dates, d = [], dt.date(2026, 1, 5)
    while len(dates) < days:
        if d.weekday() < 5:
            dates.append(d.isoformat())
        d += dt.timedelta(days=1)
    cx = sqlite3.connect(str(path))
    cx.execute('CREATE TABLE "RawDaily" (date TEXT, symbol TEXT, close REAL, val REAL)')
    for i, day in enumerate(dates):
        for sym, base in SYMS.items():
            if skip and day in skip.get(sym, ()):
                continue
            cx.execute('INSERT INTO "RawDaily" VALUES (?,?,?,?)',
                       (day, sym, base * (1 + 0.002 * i), 1e7 + (base * 1e4)))
    cx.commit()
    cx.close()
    return dates


def _run_state_gen(db: Path, out: Path, *extra: str) -> None:
    old_argv, old_db = sys.argv, sg.DB_PATH
    try:
        sg.DB_PATH = db
        sys.argv = ["state_gen.py", "--out", str(out), "--context", str(out / "none.json"), *extra]
        assert sg.main() == 0
    finally:
        sys.argv, sg.DB_PATH = old_argv, old_db


# ---------------------------------------------------------------- state_gen
def test_state_gen_builds_each_symbol_from_its_own_bars():
    """เดิม main ส่ง df ทั้งตลาดเข้า build() → ทุก state ได้แท่งของหุ้นตัวท้ายตาราง (ZZZ)"""
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        dates = _make_db(tmp / "t.db")
        _run_state_gen(tmp / "t.db", tmp / "states")
        files = sorted((tmp / "states").glob("*.json"))
        assert len(files) == 3, files
        for f in files:
            st = json.loads(f.read_text(encoding="utf-8"))
            want = round(SYMS[st["symbol"]] * (1 + 0.002 * (len(dates) - 1)), 4)
            assert abs(st["close"] - want) < 1e-6, (st["symbol"], st["close"], want)
            assert abs(st["bars"][-1]["c"] - want) < 1e-6


def test_state_gen_non_trading_date_falls_back_to_previous_day():
    """WARN เคยบอกว่า 'ใช้วันล่าสุดก่อนหน้าแทน' แต่ไม่ได้ทำ → watchlist ว่าง เขียน 0 state"""
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        dates = _make_db(tmp / "t.db")
        import datetime as dt
        last = dt.date.fromisoformat(dates[-1])
        weekend = (last + dt.timedelta(days=(5 - last.weekday()) % 7 or 7)).isoformat()
        _run_state_gen(tmp / "t.db", tmp / "states", "--date", weekend)
        files = sorted((tmp / "states").glob("*.json"))
        assert len(files) == 3
        assert all(f.name.startswith(dates[-1]) for f in files), [f.name for f in files]


def test_market_context_breadth_ignores_missing_symbols():
    """หุ้นพักการซื้อขาย/IPO (ret20 = NaN) ห้ามนับเป็นหุ้นลง"""
    import pandas as pd
    rows = []
    for i in range(30):
        day = f"2026-02-{i + 1:02d}" if i < 28 else f"2026-03-{i - 27:02d}"
        for s in range(10):
            if s >= 8 and i < 12:          # 2 ตัวเพิ่งเข้าตลาด → ret20 วันสุดท้าย = NaN
                continue
            rows.append({"date": day, "symbol": f"S{s}", "c": 100 + i})   # ขึ้นทุกตัว
    df = pd.DataFrame(rows)
    mkt = sg.market_context(df, df["date"].max())
    assert mkt["breadth"] == 1.0, mkt   # เดิม 0.8 (8/10)


def test_load_db_on_empty_rawdaily_is_graceful():
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "e.db"
        cx = sqlite3.connect(str(p))
        cx.execute('CREATE TABLE "RawDaily" (date TEXT, symbol TEXT, close REAL, val REAL)')
        cx.commit()
        cx.close()
        old_argv, old_db = sys.argv, sg.DB_PATH
        try:
            sg.DB_PATH = p
            sys.argv = ["state_gen.py", "--out", str(Path(tmp) / "states")]
            assert sg.main() == 2
        finally:
            sys.argv, sg.DB_PATH = old_argv, old_db


# ---------------------------------------------------------------- synth_state
CLAIM = {"stop_hit_gap": ("exit", "R5.0"), "wick_trap": ("wait", "S1"), "close_weak": ("wait", "S2"),
         "day_locked": ("wait", "R6.1"), "freeze_active": ("wait", "R3.1"), "missed_run": ("wait", "R3.2"),
         "rr_too_small": ("wait", "R5.2"), "vol_too_high": ("wait", "S3"), "target_hit": ("exit", "R5.3"),
         "regime_flip": ("wait", "R2.0")}


def test_edge_cases_produce_documented_labels():
    """wick_trap/close_weak เคยกลายเป็น R3.2 ~50% (ATR 1% วางพอดีขอบ missed)"""
    g = ss.StateGenerator(seed=7)
    for kind, (action, rule) in CLAIM.items():
        for seed in range(300):
            v = g.gen_edge(kind, seed=seed)["verdict"]
            assert v["action"] == action and rule in v["rules"], (kind, seed, v)


def test_generate_batch_module_function():
    """eval_harness import generate_batch จาก synth_state — เดิมไม่มี → ImportError ทั้งสคริปต์"""
    a = ss.generate_batch(20, seed=123)
    b = ss.generate_batch(20, seed=123)
    assert len(a) == 20 and json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


# ---------------------------------------------------------------- leakage
def test_training_prompt_does_not_contain_the_answer():
    rows = bd.source_synthetic(40, seed=3)
    for state, verdict, _src, _split in rows:
        rec = bd.chatml_record(state, verdict)
        user = json.loads(rec["messages"][1]["content"])
        assert "verdict" not in user
        assert not any(str(f).startswith("edge:") for f in user.get("flags", []))
        assert "edge" not in user.get("meta", {})
        assert "verdict" in state            # ไม่แก้ state ต้นฉบับ


def test_inference_prompt_does_not_contain_the_answer():
    seen = {}

    class Spy:
        def create_chat_completion(self, messages, **kw):
            seen["user"] = json.loads(messages[1]["content"])
            return {"choices": [{"message": {"content": '{"action":"wait","confidence":0.8,"reason_th":"x"}'}}]}

    nr.judge_state(Spy(), ss.gen_edge("wick_trap", seed=1))
    assert "verdict" not in seen["user"] and "edge" not in seen["user"]["meta"]


# ---------------------------------------------------------------- nimble_runner
class _FakeLLM:
    def __init__(self, content):
        self.content = content

    def create_chat_completion(self, **kw):
        return {"choices": [{"message": {"content": self.content}}]}


def test_judge_state_survives_odd_but_valid_json():
    st = ss.gen_normal(seed=1)
    cases = {
        '{"action":"buy","confidence":0.9,"reason_th":"x"}': (True, "buy", 0.9),
        '{"action":"buy","confidence":"0.85","reason_th":"x"}': (True, "buy", 0.85),
        '["buy"]': (False, "wait", 0.0),                                           # เดิม AttributeError
        '"wait"': (False, "wait", 0.0),                                            # เดิม AttributeError
        '{"action":"buy","confidence":"high","reason_th":"x"}': (False, "wait", 0.0),  # เดิม ValueError
        '{"action":"buy","confidence":NaN,"reason_th":"x"}': (False, "wait", 0.0),     # เดิม NaN ผ่าน grammar
        '{"action":"buy","confidence":85,"reason_th":"x"}': (False, "wait", 0.0),
        '{"action":"buy","reason_th":"x"}': (False, "wait", 0.0),                  # confidence เป็น required
        'not json': (False, "wait", 0.0),
    }
    for content, (valid, action, conf) in cases.items():
        r = nr.judge_state(_FakeLLM(content), st)
        assert r["grammar_valid"] is valid, (content, r)
        assert r["action"] == action and r["confidence"] == conf, (content, r)
        assert math.isfinite(r["confidence"])


def test_state_key_matches_platform_makekey():
    # ค่าเดียวกับ src/lib/lab/lab.test.ts (makeKey ของ TS)
    assert nr.state_key("2026-09-19", "KCE") == "d82f4f8a9359"
    assert nr.state_key("2026-09-22", "ปตท") == "95aef57ec7cd"


# ---------------------------------------------------------------- eval_harness
class _CoreModel:
    """โมเดล THE CORE ที่ตอบตรงครูทุกข้อ (หรือ error ตาม mode)"""

    def __init__(self, mode="perfect"):
        self.mode = mode

    def create_chat_completion(self, messages, **kw):
        st = json.loads(messages[1]["content"])
        assert "verdict" not in st
        if self.mode == "boom":
            raise RuntimeError("model crashed")
        act = "ENTER_LONG" if sg.rule_engine(st)["action"] == "buy" else "NO_TRADE"
        gates = {k: 1 for k in ["regime", "selection", "level", "trigger", "risk"]}
        return {"choices": [{"message": {"content": json.dumps({"action": act, "confidence": 0.9, "gates": gates})}}]}


def _harness(model):
    h = eh.EvalHarness.__new__(eh.EvalHarness)   # ข้าม __init__ (ต้องใช้ llama_cpp)
    h.model = model
    return h


def test_eval_g1_maps_teacher_to_core_vocabulary():
    states = ss.generate_batch(60, seed=123)
    h = _harness(_CoreModel())
    agree, valid, n = h._agreement(h.model, states)
    assert (agree, valid, n) == (60, 60, 60)          # เดิม agree = 0 เสมอ


def test_eval_errors_never_count_as_agreement():
    states = ss.generate_batch(30, seed=5)
    h = _harness(_CoreModel("boom"))
    agree, valid, n = h._agreement(h.model, states)
    assert (agree, valid) == (0, 0) and n == 30


def test_eval_gate2_accepts_both_label_formats_and_skips_missing_states():
    h = _harness(_CoreModel())
    st = ss.gen_edge("day_locked", seed=2)            # ครู → wait = NO_TRADE
    with tempfile.TemporaryDirectory() as tmp:
        cwd = os.getcwd()
        os.chdir(tmp)
        try:
            Path("states").mkdir()
            Path(f"states/{st['date']}_{st['symbol']}.json").write_text(json.dumps(st), encoding="utf-8")
            lines = [
                {"date": st["date"], "state": st, "action": "wait"},                  # รูปแบบ build_dataset.py
                {"date": st["date"], "asset": st["symbol"], "label": "NO_TRADE"},     # รูปแบบ states/
                {"date": "2026-01-01", "asset": "NOPE", "label": "ENTER_LONG"},       # ไฟล์ state หาย → ข้าม
            ]
            Path("labels.jsonl").write_text("\n".join(json.dumps(x) for x in lines) + "\n", encoding="utf-8")
            assert h.gate2_human_edge("labels.jsonl") == 1.0
        finally:
            os.chdir(cwd)


# ---------------------------------------------------------------- shadow_dash
_ST_STUB = '''
class _Stop(Exception):
    pass
class _Ctx:
    def __enter__(self): return self
    def __exit__(self, *a): return False
def _noop(*a, **k): pass
set_page_config = title = subheader = warning = info = caption = dataframe = _noop
bar_chart = line_chart = metric = download_button = _noop
def tabs(names): return [_Ctx() for _ in names]
def stop(): raise _Stop()
'''


def _run_dash(tmp: Path) -> dict:
    stub = tmp / "stub" / "streamlit"
    stub.mkdir(parents=True)
    (stub / "__init__.py").write_text(_ST_STUB, encoding="utf-8")
    cwd = os.getcwd()
    sys.path.insert(0, str(tmp / "stub"))
    os.chdir(tmp)
    try:
        return runpy.run_path(str(LAB / "shadow_dash.py"), run_name="shadow_dash_test")
    finally:
        os.chdir(cwd)
        sys.path.remove(str(tmp / "stub"))
        sys.modules.pop("streamlit", None)


def test_shadow_dash_reads_nimble_runner_log_format():
    """เดิม KeyError ['nimble_conf', 'outcome_R'] บน log ที่ nimble_runner.py เขียนเอง"""
    st = ss.gen_normal(seed=1)
    rows = [{"key": f"k{i}", "date": "2026-09-19", "asset": f"S{i}", "model_action": "buy" if i % 2 else "wait",
             "confidence": 0.8, "conf_pass": True, "grammar_valid": i != 3, "rule_action": "wait",
             "state": st} for i in range(5)]
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        (tmp / "shadow_log.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")
        g = _run_dash(tmp)
        assert len(g["log"]) == 4                        # แถว grammar_valid=false ไม่นับเป็นการตัดสิน
        assert "nimble_action" in g["log"].columns


def test_shadow_dash_outcome_uses_first_bars_after_entry():
    import pandas as pd
    rows = [{"date": "2026-09-19", "asset": "S0", "rule_action": "wait", "nimble_action": "wait", "nimble_conf": 0.5}]
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        (tmp / "shadow_log.jsonl").write_text(json.dumps(rows[0]) + "\n", encoding="utf-8")
        outcome_R = _run_dash(tmp)["outcome_R"]
    # entry 100 stop 95: แท่งที่ 2 หลังเข้าหลุด stop → -1 ; 40 แท่งท้ายวิ่งขึ้นอย่างเดียว
    lows = [99, 94] + [101 + i for i in range(40)]
    bars = pd.DataFrame({"Low": lows, "High": [x + 1 for x in lows]})
    assert outcome_R(bars, 100.0, 95.0, horizon=20) == -1.0      # เดิมดู 20 แท่ง "ท้ายสุด" → ไม่เห็น stop


# ---------------------------------------------------------------- runner
if __name__ == "__main__":
    tests = [(k, v) for k, v in sorted(globals().items()) if k.startswith("test_") and isinstance(v, types.FunctionType)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"PASS {name}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL {name}: {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)
