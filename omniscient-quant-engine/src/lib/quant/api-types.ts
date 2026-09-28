/** Shared client-side types mirroring the API responses */

export interface GateSnapshotT {
  g1: boolean;
  g2: boolean;
  g3: boolean;
  g4: boolean;
  g5: boolean;
}

export interface RegimeInfo {
  date: string;
  regime: string;
  stress: number;
  momentum: number;
  flow: number;
  momentumSlope20: number;
  decoupleCount: number;
  marketChg1d: number;
}

export interface BoardRowT {
  symbol: string;
  name: string;
  sector: string;
  theme: string;
  price: number;
  chg1d: number;
  chg5d: number;
  chg21d: number;
  rsi: number;
  phase: string;
  phaseNum: number;
  gates: GateSnapshotT;
  signal: string;
  probUp: number;
  maxSizePct: number;
  cvar: number;
  thetaZ: number;
  ltd: number;
  decoupled: boolean;
  entryLow: number;
  entryHigh: number;
  stopStruct: number;
  stopHard: number;
  failingGates: string[];
  flow5: number;
  pe: number;
  pb: number;
}

export interface BoardResponse {
  regime: RegimeInfo;
  rows: BoardRowT[];
  summary: {
    nPullback: number;
    nMomentum: number;
    nNoTrade: number;
    decoupleAlerts: string[];
    psiStress: number;
    drift: 'STABLE' | 'MODERATE' | 'HEAVY';
  };
}

export interface FactorInfoT {
  id: string;
  name: string;
  desc: string;
  explained: number;
  viewVariance: Record<string, number>;
  topLoadings: Array<{ feature: string; loading: number }>;
}

export interface EnrichRowT {
  theme: string;
  hits: number;
  count: number;
  bgRatio: number;
  geneRatio: number;
  q: number;
  p: number;
  members: string[];
  hitsSymbols: string[];
}

export interface FactorsResponse {
  factors: FactorInfoT[];
  explainedTotal: number;
  exposures: Array<Record<string, number>>;
  storyStock: { symbol: string; share: number } | null;
  pcaScatter: Array<{ symbol: string; pc1: number; pc2: number; outlier: boolean; sector: string; name?: string }>;
  enrichment: Record<string, EnrichRowT[]>;
  bipartite: {
    factors: string[];
    edges: Array<{ factor: string; symbol: string; loading: number }>;
    hubs: Array<{ symbol: string; degree: number; weight: number }>;
  };
  trajectories: Array<{ date: string; F1: number; F2: number; F3: number; F4: number; se1: number; se2: number; se3: number; se4: number }>;
  regimeLabel: string;
  volcano: {
    points: Array<{ stock: string; featureLabel: string; d: number; q: number; negLogQ: number; significant: boolean }>;
    nRiskOn: number;
    nRiskOff: number;
    nSignificant: number;
    upCount: number;
    downCount: number;
    topFeatures: Array<{ stock: string; featureLabel: string; d: number; q: number; negLogQ: number; significant: boolean }>;
  };
}

export interface TradePlanT {
  signal: string;
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

export interface DecisionResponse {
  symbol: string;
  name: string;
  sector: string;
  theme: string;
  beta: number;
  row: {
    date: string;
    close: number;
    ret1: number;
    ret5: number;
    ret21: number;
    rsi: number;
    vol21: number;
    flow5: number;
    pe: number;
    pb: number;
    roe: number;
    de: number;
    revG: number;
    distHigh: number;
    theta: number;
    thetaZ: number;
    ltd: number;
    decoupled: boolean;
  };
  eval: {
    gates: GateSnapshotT;
    signal: string;
    phase: string;
    probUp: number;
    plan: TradePlanT;
    reasons: Record<string, string>;
  };
  risk: {
    volAnn: number;
    var95: number;
    var99: number;
    cvar975: number;
    hardStop: number;
    structStop: number;
    maxSizePct: number;
    paths: number;
    lossHistogram: Array<{ x: number; n: number }>;
  };
  priceSeries: Array<{ date: string; close: number; volume: number; ma20: number | null; obv: number }>;
  gateHist: Array<{ date: string; g1: boolean; g2: boolean; g3: boolean; g4: boolean; g5: boolean; signal: string }>;
  depSeries: Array<{ date: string; theta: number; thetaZ: number; ltd: number; decoupled: boolean }>;
  kde: { xs: number[]; ys: number[] };
  fundamentals: Array<{ announceDate: string; period: string; pe: number; pb: number; roe: number; de: number; revenueGrowth: number; netProfitM: number }>;
}

export interface DependenceResponse {
  symbols: string[];
  matrix: number[][];
  decouples: Array<{ symbol: string; thetaZ: number; theta: number; ltd: number; decoupled: boolean; psi: number }>;
}

export interface BacktestResponse {
  metrics: {
    nDays: number;
    nSignals: number;
    hitRate: number;
    cumStrat: number;
    cumBase: number;
    sharpe: number;
    maxDD: number;
    avgEdge: number;
    sortino: number;
    calmar: number;
    profitFactor: number;
    expectancy: number;
  };
  equity: Array<{ date: string; equity: number; buyHold: number }>;
  attribution: Array<{ gate: string; meanWhenPass: number; meanWhenFail: number; edge: number; p: number; nPass: number; verdict: string }>;
  calibration: Array<{ bucket: string; predicted: number; actual: number; n: number }>;
  recentSignals: Array<{ date: string; symbol: string; prob: number; fwdRet: number; g1: boolean; g2: boolean; g3: boolean; g4: boolean; g5: boolean }>;
}

export interface JournalEntryT {
  id: string;
  createdAt: string;
  runDate: string;
  symbol: string;
  signal: string;
  gates: GateSnapshotT;
  price: number;
  entryLow: number | null;
  entryHigh: number | null;
  stopStruct: number | null;
  stopHard: number | null;
  sizePct: number | null;
  cvar: number | null;
  probUp: number | null;
  status: string;
  pnlPct: number | null;
  notes: string | null;
}

export interface AuditReportT {
  id: string;
  createdAt: string;
  summary: string;
  rootCause: string;
  recommendedAction: string;
  riskAdjustment: number;
  confidence: number;
  gateAttributionRef: unknown;
  raw: Record<string, unknown>;
}

export interface SystemStatus {
  seeded: boolean;
  stocks: number;
  days: number;
  firstDate: string;
  lastDate: string;
  regime: RegimeInfo;
}

// ─────────────── หลอมรวม (Convergent-Evidence Synthesis) ───────────────

export type VoteT = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface EvidenceStrandT {
  key: string;
  label: string;
  layer: string;
  gate?: string;
  vote: VoteT;
  weight: number;
  effWeight: number;
  trusted: boolean;
  value: string;
  detail: string;
}

export interface SynthesisVerdictT {
  code: 'STRONG_LONG' | 'LEAN_LONG' | 'MIXED' | 'LEAN_SHORT' | 'STRONG_SHORT';
  label: string;
  action: string;
}

export interface SynthesisDossierT {
  symbol: string;
  name: string;
  sector: string;
  theme: string;
  date: string;
  price: number;
  regime: string;
  regimeStress: number;
  regimeMomentumSlope: number;
  drift: string;
  strands: EvidenceStrandT[];
  score: number;
  agreement: number;
  nLong: number;
  nShort: number;
  nNeutral: number;
  verdict: SynthesisVerdictT;
  strengthNotes: string[];
  weaknessNotes: string[];
  killSwitches: string[];
  roadmap: string[];
  attribution: Array<{ gate: string; edge: number; verdict: string }>;
  plan: TradePlanT;
}

export interface SynthesisNarrativeT {
  headline: string;
  summary: string;
  convergence: string;
  risks: string[];
}

export interface SynthesisHistoryT {
  id: string;
  createdAt: string;
  symbol: string;
  runDate: string;
  price: number;
  score: number;
  agreement: number;
  nLong: number;
  nShort: number;
  nNeutral: number;
  verdict: string;
  regime: string;
}

export interface SynthesisGetResponse {
  dossier: SynthesisDossierT;
  history: SynthesisHistoryT[];
}

export interface SynthesisPostResponse {
  dossier: SynthesisDossierT;
  narrative: SynthesisNarrativeT;
  reportText: string;
  savedId: string;
}

// ─────────────── Meta-Risk (Part IV + V: ruin math / defense in depth / self-repudiating) ───────────────

export interface RuinRowT {
  lossPct: number;
  recoveryPct: number;
  difficulty: string;
}

export interface RuinPathStatsT {
  pRuin30: number;
  pRuin50: number;
  medianMaxDD: number;
  medianFinal: number;
  paths: number;
}

export interface DefenseLayerT {
  layer: string;
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'N/A';
  evidence: string;
}

export interface ReflexivityStateT {
  phase: 'PRE_IGNITION' | 'IGNITION' | 'RUNNING' | 'EXHAUSTION' | 'COLLAPSE';
  label: string;
  detail: string;
}

export interface DeathConditionT {
  model: string;
  condition: string;
  live: string;
  triggered: boolean;
}

export interface ChecklistItemT {
  part: 'IV' | 'V';
  question: string;
  answer: string;
  pass: boolean | null;
}

export interface MdxDimT {
  key: string;
  name: string;
  weight: number;
  score: number;
  band: 'ต่ำ' | 'กลาง' | 'สูง' | 'วิกฤต';
  evidence: string;
}

export interface RiskMdxT {
  composite: number;
  band: MdxDimT['band'];
  override: 'OK' | 'HALF' | 'ZERO';
  overrideNote: string;
  dims: MdxDimT[];
  topRisk: { key: string; name: string; score: number; evidence: string } | null;
}

export interface AntifragilityIndexT {
  index: number;
  verdict: string;
  components: Array<{ key: string; name: string; score: number; evidence: string }>;
}

export interface MetaRiskDossierT {
  symbol: string;
  name: string;
  date: string;
  price: number;
  regime: string;
  totalPlannedPct: number;
  cashImpliedPct: number;
  ruinRows: RuinRowT[];
  planLoss: Array<{ label: string; lossPct: number; recoveryPct: number }>;
  entry: { low: number; high: number; stopStruct: number; stopHard: number; sizePct: number; cvar: number; rr: number };
  ruinFixed: RuinPathStatsT;
  ruinScaled: RuinPathStatsT;
  ruinInputs: { p: number; avgWinPct: number; avgLossPct: number; n: number; riskPerTrade: number; source: string };
  defense: DefenseLayerT[];
  advanced: { sortino: number; calmar: number; profitFactor: number; expectancy: number; maxDD: number; hitRate: number };
  reflexivity: ReflexivityStateT;
  deaths: DeathConditionT[];
  checklist: ChecklistItemT[];
  absorbingBarrier: { inGame: boolean; verdict: string };
  riskMdx: RiskMdxT;
  antifragility: AntifragilityIndexT;
}

export interface MetaRiskResponse {
  dossier: MetaRiskDossierT;
}

// ─────────────── Apex Layer (L7: Kelly × Vol Targeting / microstructure / crisis MC / registry) ───────────────

export interface MirageFlagT {
  flagged: boolean;
  reason: string;
}

export interface KnightClassT {
  cls: 'RISK' | 'UNCERTAINTY';
  reason: string;
  haircut: number;
}

export interface MicroMetricsT {
  clv20: number;
  clv5: number;
  spreadBps: number;
  amihudBps: number;
  bigLotPct: number;
  volRatio: number;
  adv20MB: number;
  mirage: MirageFlagT;
  exitComplexity: number;
  exitVerdict: string;
  slippagePct: number;
  gapCount60: number;
  knight: KnightClassT;
}

export interface KellySizingT {
  p: number;
  r: number;
  fullKelly: number;
  kellyFraction: number;
  fracKelly: number;
  volAnn: number;
  targetVol: number;
  volTargetMult: number;
  ddThrottle: number;
  uncertaintyHaircut: number;
  riskPerTradePct: number;
  lossAtStopPct: number;
  kellySizePct: number;
  cvarSizePct: number;
  sizeBeforeMdxPct: number;
  mdxOverride: 'OK' | 'HALF' | 'ZERO' | 'NONE';
  mdxComposite: number | null;
  finalSizePct: number;
  riskPerTradeFinalPct: number;
  edgeGuard: boolean;
  source: string;
  note: string;
}

export interface CrisisScenarioT {
  key: string;
  name: string;
  desc: string;
  plannedLossPct: number;
  actualLossPct: number;
  portDamagePct: number;
  stopExecuted: boolean | null;
  survived: boolean;
  note: string;
}

export interface CrisisResultT {
  scenarios: CrisisScenarioT[];
  survivalScore: number;
  verdict: string;
  paths: number;
}

export interface RegistryRowT {
  id: string;
  name: string;
  version: string;
  layer: string;
  metric: string;
  health: number;
  status: 'ACTIVE' | 'PROBATION' | 'DEAD';
  note: string;
}

export interface RegistryResultT {
  rows: RegistryRowT[];
  systemHealth: number;
  nActive: number;
  nProbation: number;
  nDead: number;
  verdict: string;
}

export interface ReflexivityStateT2 {
  phase: 'PRE_IGNITION' | 'IGNITION' | 'RUNNING' | 'EXHAUSTION' | 'COLLAPSE';
  label: string;
  detail: string;
}

export interface ApexDossierT {
  symbol: string;
  name: string;
  date: string;
  price: number;
  regime: string;
  beta: number;
  kelly: KellySizingT;
  micro: MicroMetricsT;
  crisis: CrisisResultT;
  registry: RegistryResultT;
  reflex: ReflexivityStateT2;
  entry: { low: number; high: number; stopStruct: number; stopHard: number; cvarSizePct: number };
  signal: string;
  verdict: {
    headline: string;
    finalSizePct: number;
    riskPerTradePct: number;
    execution: string[];
    risky: boolean;
  };
}

export interface ApexResponse {
  dossier: ApexDossierT;
}

// ───────────────────── Terminal (Market Intelligence Dashboard) ─────────────────────

export interface QuoteRowT {
  symbol: string;
  name: string;
  sector: string;
  theme: string;
  price: number;
  chg1d: number;
  chg5d: number;
  chg21d: number;
  rsi: number;
  signal: string;
  phase: string;
  phaseNum: number;
  probUp: number;
  decoupled: boolean;
  gates: GateSnapshotT;
  entryLow: number;
  entryHigh: number;
  stopStruct: number;
  stopHard: number;
  maxSizePct: number;
  volume: number;
  adv20: number;
  volRatio: number;
  spark: number[];
  valueM: number;
}

export interface QuotesResponse {
  regime: RegimeInfo;
  summary: {
    nPullback: number;
    nMomentum: number;
    nNoTrade: number;
    decoupleAlerts: string[];
    psiStress: number;
    drift: 'STABLE' | 'MODERATE' | 'HEAVY';
  };
  lastDate: string;
  quotes: QuoteRowT[];
}

export interface OhlcBarT {
  date: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface SeriesResponse {
  symbol: string;
  name: string;
  sector: string;
  theme: string;
  tf: string;
  firstDate: string;
  lastDate: string;
  bars: OhlcBarT[];
  ind: {
    ema20: Array<number | null>;
    ema50: Array<number | null>;
    sma20: Array<number | null>;
    bbU: Array<number | null>;
    bbM: Array<number | null>;
    bbL: Array<number | null>;
    donU: Array<number | null>;
    donL: Array<number | null>;
    vwap: Array<number | null>;
  };
  swings: Array<{ i: number; price: number; type: 'H' | 'L' }>;
  sr: { supports: number[]; resistances: number[] };
  adv20: number;
  lastQuote: { price: number; chg1d: number; volume: number; volRatio: number };
}

export interface AnalystBriefT {
  symbol: string;
  name: string;
  sector: string;
  theme: string;
  date: string;
  trend: {
    dir: 'UP' | 'DOWN' | 'SIDE';
    label: string;
    close: number;
    ema20: number;
    ema50: number;
    distHighPct: number;
    ret21Pct: number;
  };
  signal: string;
  phase: string;
  gates: GateSnapshotT;
  plan: {
    entryLow: number;
    entryHigh: number;
    trigger: number;
    stopStruct: number;
    stopHard: number;
    sizePct: number;
    cvar: number;
    probUp: number;
    failingGates: string[];
    killSwitch: string;
    reasons: Record<string, string>;
  };
  indicators: {
    rsi: number;
    macdH: number;
    macdHPrev: number;
    volRatio: number;
    volume: number;
    adv20: number;
    flow5: number;
    thetaZ: number;
    decoupled: boolean;
    vol21: number;
    pe: number;
    pb: number;
  };
  sr: { supports: number[]; resistances: number[] };
  synth: { headline: string; summary: string; score: number; verdict: string; runDate: string } | null;
  brief: string[];
}
