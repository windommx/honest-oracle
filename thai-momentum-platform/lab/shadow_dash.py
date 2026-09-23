# shadow_dash.py — Shadow Dashboard หน้าเดียว (offline kit)
# ใช้: streamlit run shadow_dash.py   (ต้อง pip install streamlit)
# shadow_log.jsonl ต่อแถว: {date, asset, rule_action, gates, nimble_action, nimble_conf,
#                           wick_ratio, close_pos, would_execute, outcome_R}
import json

import numpy as np
import pandas as pd
import streamlit as st

st.set_page_config(layout="wide")
st.title("🔬 THE CORE — Shadow Lab")

try:
    log = pd.read_json("shadow_log.jsonl", lines=True)
except ValueError:
    st.warning("ยังไม่มี shadow_log.jsonl — รัน nimble_runner.py ก่อน")
    st.stop()

# nimble_runner.py เขียน model_action/confidence — แดชบอร์ดนี้อ่าน nimble_action/nimble_conf (เดิม KeyError ทั้งหน้า)
for dst, src in (("nimble_action", "model_action"), ("nimble_conf", "confidence")):
    if dst not in log.columns and src in log.columns:
        log[dst] = log[src]
for col in ("rule_action", "nimble_action", "nimble_conf", "wick_ratio", "close_pos",
            "would_execute", "outcome_R", "gates"):
    if col not in log.columns:
        log[col] = np.nan
if "grammar_valid" in log.columns:   # parse ไม่ได้ = ไม่ใช่การตัดสินของโมเดล (fallback wait/0.0) — ไม่นับในสถิติ
    log = log[log["grammar_valid"] != False].copy()  # noqa: E712

t1, t2, t3, t4, t5 = st.tabs(["Agreement", "Calibration", "Shadow P&L", "Gate Kill", "Label Queue"])

# ---------- Tab 1: Rule vs Nimble ----------
with t1:
    st.subheader("Rule vs Nimble (double-key สองดอก)")
    rule_col = log.get("rule_action")
    nim_col = log.get("nimble_action")
    if rule_col is not None and nim_col is not None:
        st.dataframe(pd.crosstab(rule_col.fillna("NO_TRADE"), nim_col.fillna("NO_TRADE")))
        mask = rule_col.fillna("X") != nim_col.fillna("X")
        st.dataframe(log[mask], use_container_width=True)

# ---------- Tab 2: Calibration ----------
with t2:
    st.subheader("Calibration (conf vs ชนะจริง)")
    d = log.dropna(subset=["nimble_conf", "outcome_R"]).copy()
    if len(d):
        d["bin"] = pd.cut(d.nimble_conf, np.arange(0, 1.01, 0.1))
        cal = d.groupby("bin", observed=True).agg(
            pred=("nimble_conf", "mean"),
            real=("outcome_R", lambda x: (x > 0).mean()),
            n=("outcome_R", "size"))
        st.bar_chart(cal[["pred", "real"]])
        brier = ((d.nimble_conf - (d.outcome_R > 0)) ** 2).mean()
        st.metric("Brier Score", round(brier, 3), help="<0.15 = ผ่าน | เกินนี้ = ลดบทบาทโมเดล")
    else:
        st.info("ยังไม่มีแถวที่เติม outcome_R — รอผล 20 แท่งก่อนตัดสิน")

# ---------- Tab 3: Shadow P&L ----------
with t3:
    st.subheader("Shadow P&L (double-key only)")
    ex = log[log.get("would_execute") == True]  # noqa: E712
    if len(ex) and ex.get("outcome_R") is not None:
        st.line_chart(ex.dropna(subset=["outcome_R"]).outcome_R.cumsum())
        st.metric("Expectancy (R/ไม้)", round(ex.outcome_R.mean(), 2), f"{len(ex)} trades")
    else:
        st.info("ยังไม่มีไม้ที่ would_execute พร้อมผล")

# ---------- Tab 4: Gate Kill ----------
with t4:
    st.subheader("Gate ไหนฆ่า setup มากสุด")
    if log.get("gates") is not None:
        g = pd.json_normalize(log["gates"].dropna())
        if len(g):
            st.bar_chart((g == 0).sum().sort_values(ascending=False))
            st.caption("gate ที่ถูกตัดบ่อยสุด = ดริลเดือนถัดไปควรโฟกัส gate นั้น")

# ---------- Tab 5: Edge-case queue → labeling ----------
with t5:
    st.subheader("Edge Cases รอ label (พิธี 5 นาที/สัปดาห์)")
    rule_na = log.get("rule_action")
    nim_conf = log.get("nimble_conf", pd.Series(dtype=float))
    wick = log.get("wick_ratio")
    cpos = log.get("close_pos")
    ec = log[((rule_na.isna()) & (nim_conf >= 0.70))
             | ((rule_na.notna()) & (nim_conf < 0.75))
             | (wick.between(1.8, 2.2) if wick is not None else False)
             | (cpos.between(0.60, 0.75) if cpos is not None else False)]
    st.subheader(f"Edge Cases รอ label: {len(ec)}")
    st.dataframe(ec, use_container_width=True)
    st.download_button("Export labels queue", ec.to_json(lines=True, orient="records"),
                       "edge_queue.jsonl")

# ---------- Outcome filler (ฉบับ shadow — trail 3-bar) ----------
def outcome_R(bars, entry, stop, horizon=20):
    """bars = DataFrame แท่งหลังวันเข้า (ต้องมีคอลัมน์ Low/High)"""
    r2 = entry + 2 * (entry - stop)
    trail, half_booked, r = stop, False, -1.0
    for i, c in bars.iloc[:horizon].iterrows():   # horizon แท่ง "แรก" หลังวันเข้า (เดิม -horizon: = ท้ายสุด)
        if c.Low <= trail:
            return r if half_booked else -1.0
        if not half_booked and c.High >= r2:
            half_booked, r = True, 2.0
            trail = entry  # เท่าทุน
        if half_booked:
            trail = max(trail, bars.Low.rolling(3).min().loc[c.name])
        if half_booked and c.High > entry:
            r = max(r, (c.High - entry) / (entry - stop) * 0.5 + 1.0)
    return r


if __name__ == "__main__":
    json.dump({"hint": "เรียกผ่าน streamlit run shadow_dash.py"}, open("_dash_hint.json", "w"))
