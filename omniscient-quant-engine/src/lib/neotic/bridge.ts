// ============================================================
// สะพาน Neotic 3D → PyBroker (pure) — CSV ที่คำนวณตัวแปรของสแกนไว้ให้แล้ว (ชื่อคอลัมน์ตรงกับโค้ดตัวอย่างของต้นแบบ:
// rs_rank · dist_52wh · vol_ratio · eps_qoq · eps_yoy · ema_20) + สคริปต์ lib-pybroker 2.x ที่ใช้ API จริง
// (register_columns · stop_loss_pct · stop_profit_pct · hold_bars · sell_all_shares) แทนโค้ดตัวอย่างที่เรียก API ที่ไม่มีอยู่
// ตัวแปรทุกตัวเป็น point-in-time แบบเดียวกับหน้าสแกน — PyBroker ไม่ต้องคำนวณเอง (กันการคำนวณต่างกันสองที่)
// ตรวจแล้วกับ lib-pybroker 2.0.1 (ข้อมูลจำลองที่เติมวันปริมาณพุ่ง): ไม้ 14 = 14 · วัน/ราคาเข้าตรงทุกไม้ · ชนะสุทธิ 50% เท่ากัน
// · ตรงทุกช่อง 10 ไม้ · อีก 4 ไม้ต่างด้วยสาเหตุที่รู้ (stop/เป้าปัด tick · เปิดกระโดดเหนือเป้า · วันขายตาม EMA ที่ราคาลงถึง stop)
// ============================================================

import type { MarketState } from '@/lib/quant/engine/types';
import { PYBROKER_VERSION } from '@/lib/walkforward/bridge';
import { EXEC } from '@/lib/workflow/execution';
import { NEO, neoFeatures, passes, pointAt, type NeoFeatures } from './compute';

export const NEO_BRIDGE_CSV = 'neotic_pybroker.csv';
export const NEO_BRIDGE_PY = 'neotic_pybroker.py';

const fmt = (v: number, d = 4) => (Number.isFinite(v) ? String(Math.round(v * 10 ** d) / 10 ** d) : '');
const pyFloat = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));

/** CSV: date,symbol,open,high,low,close,volume,rs_rank,dist_52wh,vol_ratio,eps_qoq,eps_yoy,ema_20,neo_signal — ทุกหุ้นทุกวันในหน้าต่างของสแกน */
export function neoBridgeCsv(state: MarketState, f: NeoFeatures = neoFeatures(state)): { csv: string; rows: number; symbols: number; signals: number } {
  const lines = ['date,symbol,open,high,low,close,volume,rs_rank,dist_52wh,vol_ratio,eps_qoq,eps_yoy,ema_20,neo_signal'];
  let rows = 0;
  let signals = 0;
  for (let t = f.tStart; t <= f.tEnd; t++) {
    state.stocks.forEach((s, si) => {
      const b = f.bars[si];
      const p = pointAt(f, si, t);
      const sig = p !== null && passes(p, NEO.locked);
      if (sig) signals++;
      lines.push(
        [
          f.dates[t],
          s.symbol,
          fmt(b.open[t]),
          fmt(b.high[t]),
          fmt(b.low[t]),
          fmt(b.close[t]),
          fmt(b.volume[t], 2),
          b.volume[t] > 0 ? fmt(f.rsRank[si][t], 2) : '',
          fmt(f.dist[si][t], 3),
          fmt(f.volRatio[si][t], 3),
          fmt(f.qoq[si][t], 2),
          fmt(f.yoy[si][t], 2),
          fmt(f.ema[si][t]),
          sig ? 1 : 0,
        ].join(','),
      );
      rows++;
    });
  }
  return { csv: `${lines.join('\n')}\n`, rows, symbols: state.stocks.length, signals };
}

/** จำนวนแถว/หุ้นของ CSV โดยไม่ต้องสร้างไฟล์ */
export const neoBridgeCounts = (state: MarketState, f: NeoFeatures) => ({
  rows: state.stocks.length * Math.max(0, f.tEnd - f.tStart + 1),
  symbols: state.stocks.length,
});

/** สคริปต์ Python (lib-pybroker 2.0.1) — เกณฑ์/กติกาออกตามสเปกที่หน้าสแกนใช้ · แก้ค่าคงที่ด้านบนเพื่อทดลองได้ */
export function neoBridgeScript(meta: { dataLabel: string }): string {
  const fee = EXEC.costPct / 2;
  const L = NEO.locked;
  return `"""Neotic 3D -> PyBroker (สร้างโดย Omniscient Quant Engine)

ทดสอบกติกา Neotic 3D ใน PyBroker ${PYBROKER_VERSION} ด้วยตัวแปรที่ OQE คำนวณไว้แล้ว (point-in-time):
- เข้า: rs_rank >= RS_DIV · KNEE <= dist_52wh < DIST_B · eps_qoq > 0 และ eps_yoy > 0 · vol_ratio >= VOL_TRIGGER
        -> ซื้อราคาเปิดแท่งถัดไป
- ออก: stop ${NEO.stopPct}% · เป้า ${NEO.targetPct}% จากราคาได้ของ · ราคาปิดต่ำกว่า ema_20 -> ขายราคาเปิดแท่งถัดไป
        · ถือครบ ${NEO.maxHold} แท่ง -> ขายราคาปิด · ค่าธรรมเนียม ${fee}% ต่อคำสั่ง (ไป-กลับ ${EXEC.costPct}%)

ข้อมูล: ${meta.dataLabel}
วิธีใช้:  pip install -U lib-pybroker==${PYBROKER_VERSION}
          python ${NEO_BRIDGE_PY} ${NEO_BRIDGE_CSV}            # เล่นซ้ำด้วยเกณฑ์ตามสเปก
          python ${NEO_BRIDGE_PY} ${NEO_BRIDGE_CSV} --optimize # + walk-forward จูน RS_DIV และ VOL_TRIGGER

คอลัมน์ของ CSV ใช้ชื่อเดียวกับโค้ดตัวอย่าง (ctx.rs_rank · ctx.dist_52wh · ctx.vol_ratio · eps_qoq · eps_yoy · ctx.ema_20)
แต่ต้องอ่านค่าแท่งล่าสุดด้วย [-1] เพราะ PyBroker ส่งเป็นอาร์เรย์ · ใช้ stop_profit_pct (ไม่มี take_profit_pct)
· ไม่มี Strategy.walk_forward — ใช้ Strategy.optimize(..., windows=N) แทน

ความต่างจาก OQE ที่รู้อยู่แล้ว:
· stop/เป้าของ PyBroker = 5%/15% พอดี · OQE ปัด stop ลงตาม tick ของ SET และตั้งเป้า = 3R จาก stop นั้น
· วันได้ของที่ราคาลงถึง stop: OQE ออกวันนั้นเลย · PyBroker เริ่มตรวจ stop วันถัดไป
· OQE ยกเลิกคำสั่งเมื่อราคาเปิดต่ำกว่าราคาปิดวันสัญญาณเกิน ${NEO.stopPct}% · PyBroker ซื้อเสมอ
· เปิดกระโดดเหนือเป้า: OQE ออกที่ราคาเปิด · PyBroker ออกที่ราคาเป้า
· วันที่ขายตามเส้น EMA ที่ราคาเปิดแต่ระหว่างวันราคาลงถึง stop: OQE ขายที่ราคาเปิด (เกิดก่อน) · PyBroker ตรวจ stop ก่อน
· วันที่ต้องขายตามเส้น EMA ตรงกับวันสัญญาณใหม่ของหุ้นเดียวกัน: สคริปต์ขายก่อนและไม่ซื้อใหม่วันนั้น
ทดสอบแล้วบนข้อมูลจำลองที่เติมวันปริมาณพุ่ง: ไม้ 14 = 14 · วัน/ราคาเข้าตรงทุกไม้ · ชนะสุทธิเท่ากัน · ตรงทุกช่อง 10 ไม้
· return_pct ของ PyBroker ยังไม่หักค่าธรรมเนียม (สคริปต์หักให้ในคอลัมน์ net_pct)
"""

import sys

import pandas as pd
import pybroker
from pybroker import Strategy, StrategyConfig
from pybroker.common import FeeMode, PriceType

CSV = next((a for a in sys.argv[1:] if not a.startswith("--")), "${NEO_BRIDGE_CSV}")
OPTIMIZE = "--optimize" in sys.argv
RS_DIV = ${L.rsDiv}
KNEE = ${pyFloat(L.knee)}
DIST_B = ${pyFloat(L.distB)}
VOL_TRIGGER = ${pyFloat(L.volTrigger)}
STOP_PCT = ${pyFloat(NEO.stopPct)}
TARGET_PCT = ${pyFloat(NEO.targetPct)}
MAX_HOLD = ${NEO.maxHold}
FEE_PER_ORDER_PCT = ${fee}
PORTFOLIO_MODE = False
POSITION_SIZE = 0.05  # PORTFOLIO_MODE: สัดส่วนต่อไม้
NOTIONAL = 100_000  # โหมด OQE: มูลค่าต่อไม้ (บาท) — ทุกสัญญาณเป็นไม้แยกกันขนาดเท่ากัน

df = pd.read_csv(CSV, parse_dates=["date"])
pybroker.register_columns("rs_rank", "dist_52wh", "vol_ratio", "eps_qoq", "eps_yoy", "ema_20")

rs_div = pybroker.hyperparam("rs_div", default=RS_DIV, low=70, high=90, step=5)
vol_trigger = pybroker.hyperparam("vol_trigger", default=VOL_TRIGGER, low=2.0, high=3.5, step=0.5)


def last(arr):
    v = float(arr[-1])
    return None if v != v else v  # NaN -> None


def is_signal(ctx):
    rs, dist, vr = last(ctx.rs_rank), last(ctx.dist_52wh), last(ctx.vol_ratio)
    qoq, yoy = last(ctx.eps_qoq), last(ctx.eps_yoy)
    if None in (rs, dist, vr, qoq, yoy):
        return False
    green = qoq > 0 and yoy > 0
    zone_b = rs >= float(ctx.hyperparam("rs_div")) and KNEE <= dist < DIST_B
    return zone_b and green and vr >= float(ctx.hyperparam("vol_trigger"))


def neo_exec(ctx):
    pos = ctx.long_pos()
    ema = last(ctx.ema_20)
    if pos is not None and ema is not None and float(ctx.close[-1]) < ema:
        # ปิดต่ำกว่าเส้น EMA20 = จบแนวโน้ม -> ขายราคาเปิดแท่งถัดไป
        ctx.sell_fill_price = PriceType.OPEN
        ctx.sell_all_shares()
        return
    if not is_signal(ctx) or (PORTFOLIO_MODE and pos is not None):
        return
    shares = ctx.calc_target_shares(POSITION_SIZE) if PORTFOLIO_MODE else int(NOTIONAL // float(ctx.close[-1]))
    if shares <= 0:
        return
    ctx.buy_shares = shares
    ctx.buy_fill_price = PriceType.OPEN
    ctx.stop_loss_pct = STOP_PCT
    ctx.stop_profit_pct = TARGET_PCT
    ctx.hold_bars = MAX_HOLD
    ctx.sell_fill_price = PriceType.CLOSE  # ราคาออกเมื่อถือครบ MAX_HOLD


def avg_return(result):
    """คะแนนของ optimize: ผลตอบแทนเฉลี่ยต่อไม้ (ไม้น้อยกว่า 10 = ไม่นับ)"""
    m = result.metrics
    return float(m.avg_return_pct) if m.trade_count >= 10 else -1e9


def main():
    cash = 10_000_000 if PORTFOLIO_MODE else 1_000_000_000
    config = StrategyConfig(initial_cash=cash, fee_mode=FeeMode.ORDER_PERCENT, fee_amount=FEE_PER_ORDER_PCT)
    symbols = sorted(df["symbol"].unique())
    strategy = Strategy(df, df["date"].min(), df["date"].max(), config)
    strategy.add_execution(neo_exec, symbols, hyperparams=[rs_div, vol_trigger])

    result = strategy.backtest()
    trades = result.trades.copy()
    print(f"== Neotic 3D ตามสเปก (RS >= {RS_DIV} · ต่ำกว่าจุดสูงสุด {KNEE}-{DIST_B}% · ปริมาณ >= {VOL_TRIGGER}x) ==")
    if not len(trades):
        print("ไม่มีไม้ — ดูกรวยเงื่อนไขในหน้าสแกน Neotic 3D ของ OQE ว่าเงื่อนไขไหนไม่เกิด")
        return result, None
    trades["net_pct"] = trades["return_pct"].astype(float) - 2 * FEE_PER_ORDER_PCT
    net = trades["net_pct"]
    print(f"ไม้ปิด {len(trades)} · ชนะสุทธิ {100 * (net > 0).mean():.1f}% · ผลสุทธิเฉลี่ย {net.mean():+.3f}% ต่อไม้")
    cols = [c for c in ("symbol", "entry_date", "exit_date", "entry", "exit", "net_pct", "bars", "mae", "mfe") if c in trades.columns]
    print(trades[cols].head(20).to_string())
    trades.to_csv("neotic_pybroker_trades.csv")
    if not OPTIMIZE:
        return result, None

    # หน้าต่างของ PyBroker แบ่งตามเวลาเท่า ๆ กัน · train ที่มีไม้ไม่ถึง 10 = ไม่ได้จูน
    print("\\n== Walk-forward optimize: RS_DIV x VOL_TRIGGER (จูนบน train · วัดบน test ที่ไม่เคยเห็น) ==")
    opt = strategy.optimize(avg_return, sampler="grid", windows=3, train_size=0.5)
    for w in opt.windows or ():
        tuned = w.train_score > -1e8
        note = f"train score {w.train_score:.3f}" if tuned else "train มีไม้ไม่ถึง 10 — ไม่ได้จูน"
        print(w.test_start_date, "->", w.test_end_date, w.params, note)
    ot = opt.result.trades
    if len(ot):
        onet = ot["return_pct"].astype(float) - 2 * FEE_PER_ORDER_PCT
        print(f"นอกตัวอย่าง: ไม้ปิด {len(ot)} · ชนะสุทธิ {100 * (onet > 0).mean():.1f}% · ผลสุทธิเฉลี่ย {onet.mean():+.3f}% ต่อไม้")
    return result, opt


if __name__ == "__main__":
    main()
`;
}
