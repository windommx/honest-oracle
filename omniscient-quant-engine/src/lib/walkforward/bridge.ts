// ============================================================
// สะพานไป PyBroker (pure) — ส่งออกแท่งราคา + สัญญาณ/แผนของ OQE เป็น CSV และสคริปต์ Python สำหรับ lib-pybroker 2.x
// ให้ตรวจผลซ้ำด้วยเครื่องมืออิสระ (เช่นใน Colab) ด้วยกติกาการส่งคำสั่งชุดเดียวกับโบรกเกอร์กระดาษ:
//   pullback = ตั้งซื้อที่ขอบบนโซน (ปัด tick) ได้ของเมื่อ low แตะที่ min(เปิด, ราคาตั้ง) · คำสั่งอยู่ orderDays แท่ง
//   momentum = ซื้อราคาเปิดแท่งถัดไป · stop = อ้างอิง − (อ้างอิง − stopHard) × ตัวคูณ (ปัด tick) · เป้า = targetR × R
//   ออกเพราะหมดเวลา = ราคาปิดแท่งที่ hold · ค่าธรรมเนียมครึ่งหนึ่งต่อคำสั่ง (ไป-กลับ = costPct)
// ตรวจแล้วกับ lib-pybroker 2.0.1 บนข้อมูลสาธิต: ไม้ปิด 89 = 89 · ชนะสุทธิ 41.6% เท่ากัน · ตรงกันทุกช่อง 84 ไม้
// ความต่างที่รู้: วันได้ของที่แตะ stop (OQE ออกวันนั้น · PyBroker ตรวจวันถัดไป) · เปิดกระโดดเหนือเป้า (OQE ออกที่ราคาเปิด)
//               · PyBroker วัด stop/เป้าเป็นระยะจากราคาได้ของ · ไม่ยกเลิกคำสั่งเมื่อเปิดต่ำกว่า stop · จับคู่ในแท่งที่ไม่มีการซื้อขายได้
// ============================================================

import type { MarketState } from '@/lib/quant/engine/types';
import type { GateBlockMatrix } from '@/lib/rhythm/compute';
import { EXEC, floorToTick } from '@/lib/workflow/execution';
import { signalSet } from '@/lib/winrate/signals';

export const PYBROKER_VERSION = '2.0.1';
export const BRIDGE_CSV = 'oqe_pybroker.csv';
export const BRIDGE_PY = 'oqe_pybroker.py';

const fmt = (v: number, d = 4) => (Number.isFinite(v) ? String(Math.round(v * 10 ** d) / 10 ** d) : '');
/** ตัวเลขทศนิยมแบบ Python (PyBroker บังคับให้ default/low/high/step เป็นชนิดเดียวกัน — 2 ต้องเขียนเป็น 2.0) */
const pyFloat = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));

/** CSV: date,symbol,open,high,low,close,volume,oqe_signal,oqe_kind,oqe_ref,oqe_stophard — ทุกหุ้นทุกวันตั้งแต่ต้นหน้าต่างสัญญาณ */
export function bridgeCsv(state: MarketState, gates: GateBlockMatrix): { csv: string; rows: number; symbols: number; signals: number } {
  const { dates, sigs } = signalSet(state, gates);
  const bySym = new Map<string, (typeof sigs)[number]>();
  for (const g of sigs) bySym.set(`${g.si}|${g.t}`, g);
  const lines = ['date,symbol,open,high,low,close,volume,oqe_signal,oqe_kind,oqe_ref,oqe_stophard'];
  let rows = 0;
  for (let t = gates.t0; t < dates.length; t++) {
    state.stocks.forEach((s, si) => {
      const o = s.ohlcv;
      const g = bySym.get(`${si}|${t}`);
      const ref = g ? (g.kind === 'pullback' ? floorToTick(g.plan.zoneHi) : g.plan.close) : NaN;
      lines.push(
        [
          dates[t],
          s.symbol,
          fmt(o.open[t]),
          fmt(o.high[t]),
          fmt(o.low[t]),
          fmt(s.rows[t].close),
          fmt(o.volume[t], 2),
          g ? 1 : 0,
          g ? (g.kind === 'pullback' ? 1 : 2) : 0,
          g ? fmt(ref) : '',
          g ? fmt(g.plan.stopHard) : '',
        ].join(','),
      );
      rows++;
    });
  }
  return { csv: `${lines.join('\n')}\n`, rows, symbols: state.stocks.length, signals: sigs.length };
}

/** จำนวนแถว/หุ้นของ CSV โดยไม่ต้องสร้างไฟล์ (แสดงบนหน้า) */
export const bridgeCounts = (state: MarketState, gates: GateBlockMatrix) => ({
  rows: state.stocks.length * Math.max(0, state.dates.length - gates.t0),
  symbols: state.stocks.length,
});

/** สคริปต์ Python (ทดสอบกับ lib-pybroker 2.0.1) — ค่าเริ่มต้นของ hyperparam = กติกาที่ล็อกอยู่ตอนนี้ */
export function bridgeScript(meta: { rulesHash: string; dataLabel: string }): string {
  const fee = EXEC.costPct / 2;
  const target = EXEC.targetR ?? 0;
  return `"""OQE -> PyBroker bridge (สร้างโดย Omniscient Quant Engine · กติกา ${meta.rulesHash.slice(0, 12)})

เล่นซ้ำสัญญาณ 5 ด่านของ OQE ใน PyBroker ${PYBROKER_VERSION} ด้วยกติกาการส่งคำสั่งชุดเดียวกับโบรกเกอร์กระดาษ:
- pullback: ตั้งซื้อที่ขอบบนโซนเข้า (ปัด tick ของ SET) ได้ของเมื่อ low แตะ ที่ min(open, limit) · คำสั่งอยู่ ${EXEC.orderDays} แท่ง
- momentum: ซื้อราคาเปิดแท่งถัดไป
- stop = ref - (ref - stop_hard) * stop_mult (ปัด tick) · เป้า = target_r * R · ถือครบ hold แท่ง = ขายราคาปิด
- ค่าธรรมเนียม ${fee}% ต่อคำสั่ง (ไป-กลับ ${EXEC.costPct}%)
แล้วรัน Strategy.optimize() แบบ walk-forward (จูนบน train ของแต่ละหน้าต่าง · วัดบน test ที่ไม่เคยเห็น)

ข้อมูล: ${meta.dataLabel}
วิธีใช้:  pip install -U lib-pybroker==${PYBROKER_VERSION}
          python ${BRIDGE_PY} ${BRIDGE_CSV}

โหมด OQE (ค่าเริ่มต้น): ทุกสัญญาณเป็นไม้แยกกันขนาดเท่ากัน (เหมือนการเล่นซ้ำของ OQE) · PORTFOLIO_MODE = True:
ถือหุ้นละไม้เดียว ไม้ละ 5% ของพอร์ต (เงินสดจำกัดจริง — ช่วงที่สัญญาณกระจุกจะได้ไม้น้อยลง)
ความต่างจาก OQE ที่รู้อยู่แล้ว (ทดสอบบนข้อมูลสาธิต: ตรงกันทุกช่อง 84 จาก 89 ไม้):
· วันได้ของที่ราคาลงถึง stop: OQE ออกวันนั้นเลย · PyBroker เริ่มตรวจ stop วันถัดไป
· เปิดกระโดดเหนือเป้า: OQE ออกที่ราคาเปิด · PyBroker ออกที่ราคาเป้า
· PyBroker วัด stop/เป้าเป็นระยะจากราคาได้ของ · ไม่ยกเลิกคำสั่งเมื่อเปิดต่ำกว่า stop · จับคู่คำสั่งในแท่งที่ไม่มีการซื้อขาย
· return_pct ของ PyBroker ยังไม่หักค่าธรรมเนียม (สคริปต์หักให้ในคอลัมน์ net_pct)
"""

import sys

import pandas as pd
import pybroker
from pybroker import Strategy, StrategyConfig
from pybroker.common import FeeMode, PriceType

CSV = sys.argv[1] if len(sys.argv) > 1 else "${BRIDGE_CSV}"
ORDER_DAYS = ${EXEC.orderDays}
FEE_PER_ORDER_PCT = ${fee}
PORTFOLIO_MODE = False
POSITION_SIZE = 0.05  # PORTFOLIO_MODE: สัดส่วนต่อไม้
NOTIONAL = 100_000  # โหมด OQE: มูลค่าต่อไม้ (บาท) — เงินตั้งต้นใหญ่พอจนไม่มีคำสั่งถูกปฏิเสธเพราะเงินไม่พอ


def set_tick(price):
    """ช่วงราคาขั้นต่ำของหุ้นใน SET (เหมือน setTick ของ OQE)"""
    for limit, tick in ((2, 0.01), (5, 0.02), (10, 0.05), (25, 0.1), (100, 0.25), (200, 0.5), (400, 1)):
        if price < limit:
            return tick
    return 2


def floor_to_tick(price):
    tick = set_tick(price)
    return round(int(price / tick + 1e-9) * tick, 2)


df = pd.read_csv(CSV, parse_dates=["date"])
pybroker.register_columns("oqe_signal", "oqe_kind", "oqe_ref", "oqe_stophard")

# ค่าเริ่มต้น = กติกาที่ล็อกใน OQE ตอนนี้ · ช่วงที่ optimize ค้นหาเป็นกริดตายตัว (ค่าเริ่มต้นไม่จำเป็นต้องอยู่บนกริด)
target_r = pybroker.hyperparam("target_r", default=${pyFloat(target)}, low=0.5, high=2.0, step=0.5)
stop_mult = pybroker.hyperparam("stop_mult", default=${pyFloat(EXEC.stopMult)}, low=1.0, high=2.0, step=0.5)
hold = pybroker.hyperparam("hold", default=${Math.round(EXEC.holdDays)}, low=5, high=10, step=5)

def limit_fill(limit):
    """ราคาได้ของของคำสั่งนี้: low แตะราคาตั้ง → min(open, limit) · ไม่แตะ → ราคาเปิด (> limit) ให้คำสั่งไม่ถูกจับคู่
    (สร้างต่อคำสั่ง เพราะหุ้นเดียวกันอาจมีคำสั่งรออยู่หลายใบที่ราคาตั้งต่างกัน)"""

    def fill(symbol, bar):
        open_ = float(bar.open[-1])
        return min(open_, limit) if float(bar.low[-1]) <= limit else open_

    return fill


def oqe_exec(ctx):
    if ctx.oqe_signal[-1] != 1 or (PORTFOLIO_MODE and ctx.long_pos()):
        return
    kind = int(ctx.oqe_kind[-1])
    ref = float(ctx.oqe_ref[-1])
    stop_hard = float(ctx.oqe_stophard[-1])
    m = float(ctx.hyperparam("stop_mult"))
    stop = floor_to_tick(stop_hard if m == 1 else ref - (ref - stop_hard) * m)
    risk = ref - stop
    if not risk > 0:
        return
    shares = ctx.calc_target_shares(POSITION_SIZE) if PORTFOLIO_MODE else int(NOTIONAL // ref)
    if shares <= 0:
        return
    ctx.buy_shares = shares
    if kind == 1:
        ctx.buy_limit_price = ref
        ctx.buy_fill_price = limit_fill(ref)
        ctx.buy_timeout_bars = ORDER_DAYS - 1
    else:
        ctx.buy_fill_price = PriceType.OPEN
    ctx.stop_loss = risk
    t = float(ctx.hyperparam("target_r"))
    if t > 0:
        ctx.stop_profit = t * risk
    ctx.hold_bars = int(ctx.hyperparam("hold"))
    ctx.sell_fill_price = PriceType.CLOSE


def avg_return(result):
    """คะแนนของ optimize: ผลตอบแทนเฉลี่ยต่อไม้ (ไม้น้อยกว่า 10 = ไม่นับ)"""
    m = result.metrics
    return float(m.avg_return_pct) if m.trade_count >= 10 else -1e9


def main():
    cash = 10_000_000 if PORTFOLIO_MODE else 1_000_000_000
    config = StrategyConfig(initial_cash=cash, fee_mode=FeeMode.ORDER_PERCENT, fee_amount=FEE_PER_ORDER_PCT)
    symbols = sorted(df["symbol"].unique())
    strategy = Strategy(df, df["date"].min(), df["date"].max(), config)
    strategy.add_execution(oqe_exec, symbols, hyperparams=[target_r, stop_mult, hold])

    result = strategy.backtest()
    trades = result.trades.copy()
    trades["net_pct"] = trades["return_pct"].astype(float) - 2 * FEE_PER_ORDER_PCT
    net = trades["net_pct"]
    print("== เล่นซ้ำด้วยกติกาที่ล็อก ==")
    print(f"ไม้ปิด {len(trades)} · ชนะสุทธิ {100 * (net > 0).mean():.1f}% · ผลสุทธิเฉลี่ย {net.mean():+.3f}% ต่อไม้")
    cols = [c for c in ("symbol", "entry_date", "exit_date", "entry", "exit", "net_pct", "bars", "stop", "mae", "mfe") if c in trades.columns]
    print(trades[cols].head(20).to_string())
    trades.to_csv("pybroker_trades.csv")

    # หน้าต่างของ PyBroker แบ่งตามเวลาเท่า ๆ กัน — เริ่มที่สัญญาณแรก (ช่วงก่อนนั้นไม่มีสัญญาณเลย)
    # สัญญาณที่กระจุกตามสภาวะตลาดทำให้บางหน้าต่าง train มีไม้ไม่พอ: หน้าต่างนั้น "ไม่ได้จูน" (คะแนน -1e9 ทุกแบบ)
    first = df.loc[df["oqe_signal"] == 1, "date"].min()
    print("\\n== Walk-forward optimize (จูนบน train · วัดบน test ที่ไม่เคยเห็น) ==")
    opt = strategy.optimize(avg_return, sampler="grid", windows=3, train_size=0.5, start_date=first)
    for w in opt.windows or ():
        tuned = w.train_score > -1e8
        note = f"train score {w.train_score:.3f}" if tuned else "train มีไม้ไม่ถึง 10 — ไม่ได้จูน (ค่าที่เห็นเป็นค่าเสมอกัน)"
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
