/**
 * types.ts — shared types for the quant engine
 */

export type FeatureKey =
  | 'ret5'
  | 'ret21'
  | 'vol21'
  | 'rsi14'
  | 'volRatio'
  | 'obvSlope'
  | 'distHigh'
  | 'ma20Gap'
  | 'flow5'
  | 'pe'
  | 'pb'
  | 'roe'
  | 'de'
  | 'revG'
  | 'theta'
  | 'ltd';

export const FEATURE_KEYS: FeatureKey[] = [
  'ret5', 'ret21', 'vol21', 'rsi14', 'volRatio', 'obvSlope', 'distHigh',
  'ma20Gap', 'flow5', 'pe', 'pb', 'roe', 'de', 'revG', 'theta', 'ltd',
];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  ret5: 'Return 5d',
  ret21: 'Return 21d',
  vol21: 'Volatility 21d',
  rsi14: 'RSI 14',
  volRatio: 'Volume Ratio (5/60)',
  obvSlope: 'OBV Slope 21d',
  distHigh: 'Dist. from 252d High',
  ma20Gap: 'Close vs MA20',
  flow5: 'Net Flow 5d',
  pe: 'P/E',
  pb: 'P/B',
  roe: 'ROE',
  de: 'D/E',
  revG: 'Revenue Growth',
  theta: 'Copula Θ (Clayton)',
  ltd: 'Lower Tail Dependence',
};

export type ViewKey = 'PRICE' | 'TECHNICAL' | 'FLOW' | 'FUNDAMENTAL';

export const FEATURE_VIEWS: Record<ViewKey, FeatureKey[]> = {
  PRICE: ['ret5', 'ret21', 'distHigh', 'ma20Gap'],
  TECHNICAL: ['rsi14', 'volRatio', 'obvSlope', 'vol21'],
  FLOW: ['flow5', 'theta', 'ltd'],
  FUNDAMENTAL: ['pe', 'pb', 'roe', 'de', 'revG'],
};

export interface DayRow {
  t: number;
  date: Date;
  close: number;
  ret1: number;
  ret5: number;
  ret21: number;
  vol21: number;
  rsi14: number;
  volRatio: number;
  obvSlope: number;
  distHigh: number;
  ma20Gap: number;
  flow5: number;
  theta: number;
  thetaZ: number;
  ltd: number;
  decoupled: boolean;
  pe: number;
  pb: number;
  roe: number;
  de: number;
  revG: number;
  /** cross-sectional z-scores at date t */
  z: Record<FeatureKey, number>;
}

export interface StockPanel {
  symbol: string;
  name: string;
  sector: string;
  theme: string;
  beta: number;
  rows: DayRow[]; // aligned to dates from index START_T
}

export interface MarketState {
  dates: Date[];
  marketClose: number[];
  regime: Array<'risk_on' | 'risk_off'>;
  /** market-level factor time series (z-scored over time) */
  fStress: number[];
  fMomentum: number[];
  fFlow: number[];
  stocks: StockPanel[];
  /** คุณภาพข้อมูลจาก buildPanel: ช่องที่เติมด้วยราคาปิดล่าสุด + จำนวนวันหัว panel ที่ตัดทิ้ง */
  qc?: { filledCells: number; trimmedLeadingDays: number };
}

export interface GateSnapshot {
  g1: boolean;
  g2: boolean;
  g3: boolean;
  g4: boolean;
  g5: boolean;
}

export interface TradePlan {
  signal: 'ENTRY_PULLBACK' | 'ENTRY_MOMENTUM' | 'NO_TRADE';
  entryLow: number;
  entryHigh: number;
  trigger: number;
  stopStruct: number;
  stopHard: number;
  sizePct: number;
  cvar: number;
  var99: number;
  probUp: number;
  failingGates: string[];
  killSwitch: string;
  reasons: Record<string, string>;
}

export const START_T = 120; // first panel day index (need warmup for MA150 etc.)
