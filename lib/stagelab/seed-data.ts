// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  StageLab reference data.                                                ║
// ║                                                                          ║
// ║  STAGE_UNIVERSE is shared market data: a fictional-but-plausible SET      ║
// ║  universe, tiered so the screener funnel narrows realistically            ║
// ║  (61 → ~30 → … → a handful). It is NOT live market data and the UI says   ║
// ║  so — a platform that quietly presented invented prices as real quotes    ║
// ║  would be the one dishonest thing in a product about discipline.          ║
// ║                                                                          ║
// ║  The DEFAULT_* sets are the framework a new tenant is bootstrapped with:  ║
// ║  the discipline checklists and the sector board. A new account gets NO    ║
// ║  invented trades — positions and journal entries are the customer's own   ║
// ║  record and must start empty. DEMO_* is opt-in, behind an explicit        ║
// ║  button, and labelled as sample data in the UI.                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

export interface UniverseRow {
  symbol: string
  name: string
  sector: string
  price: number
  ma30w: number
  ma30wSlopePct: number
  weeklyVolumeM: number
  mansfieldRs: number
  epsGrowthPct: number
  rsScore: number
  fundScore: number
  stage: number
}

export const STAGE_UNIVERSE: UniverseRow[] = [
  { symbol: 'DELTA', name: 'Delta Electronics (Thailand)', sector: 'ETRON', price: 152.5, ma30w: 128.0, ma30wSlopePct: 1.8, weeklyVolumeM: 85, mansfieldRs: 2.4, epsGrowthPct: 32, rsScore: 9, fundScore: 8, stage: 2 },
  { symbol: 'KCE', name: 'KCE Technology', sector: 'ETRON', price: 38.25, ma30w: 32.1, ma30wSlopePct: 1.2, weeklyVolumeM: 42, mansfieldRs: 1.6, epsGrowthPct: 24, rsScore: 8, fundScore: 7, stage: 2 },
  { symbol: 'SVI', name: 'SVI Public Company', sector: 'ICT', price: 68.0, ma30w: 61.2, ma30wSlopePct: 0.9, weeklyVolumeM: 28, mansfieldRs: 1.1, epsGrowthPct: 21, rsScore: 8, fundScore: 7, stage: 2 },
  { symbol: 'KBANK', name: 'Kasikornbank', sector: 'BANK', price: 178.0, ma30w: 168.4, ma30wSlopePct: 0.5, weeklyVolumeM: 55, mansfieldRs: 0.7, epsGrowthPct: 18, rsScore: 7, fundScore: 8, stage: 2 },
  { symbol: 'PTTEP', name: 'PTT Exploration & Production', sector: 'ENERGY', price: 142.0, ma30w: 135.1, ma30wSlopePct: 0.4, weeklyVolumeM: 48, mansfieldRs: 0.5, epsGrowthPct: 16, rsScore: 6, fundScore: 8, stage: 2 },
  { symbol: 'HANA', name: 'Hana Microelectronics', sector: 'ICT', price: 42.0, ma30w: 39.0, ma30wSlopePct: 0.7, weeklyVolumeM: 12, mansfieldRs: 0.9, epsGrowthPct: 19, rsScore: 7, fundScore: 6, stage: 2 },
  { symbol: 'ADVANC', name: 'Advanced Info Service', sector: 'ICT', price: 232.0, ma30w: 225.5, ma30wSlopePct: 0.3, weeklyVolumeM: 35, mansfieldRs: 0.4, epsGrowthPct: 12, rsScore: 6, fundScore: 8, stage: 2 },
  { symbol: 'GULF', name: 'Gulf Energy Development', sector: 'UTIL', price: 48.5, ma30w: 44.2, ma30wSlopePct: 0.8, weeklyVolumeM: 90, mansfieldRs: 0.6, epsGrowthPct: 25, rsScore: 7, fundScore: 7, stage: 2 },
  { symbol: 'INTUCH', name: 'Intouch Holdings', sector: 'ICT', price: 34.0, ma30w: 33.2, ma30wSlopePct: 0.2, weeklyVolumeM: 15, mansfieldRs: 0.3, epsGrowthPct: 10, rsScore: 5, fundScore: 7, stage: 2 },
  { symbol: 'CPALL', name: 'CP All Public Company', sector: 'CONS', price: 62.0, ma30w: 59.1, ma30wSlopePct: 0.4, weeklyVolumeM: 60, mansfieldRs: 0.5, epsGrowthPct: 17, rsScore: 6, fundScore: 7, stage: 2 },
  { symbol: 'BDMS', name: 'Bangkok Dusit Medical Services', sector: 'HEALTH', price: 26.0, ma30w: 25.2, ma30wSlopePct: 0.3, weeklyVolumeM: 18, mansfieldRs: 0.2, epsGrowthPct: 20, rsScore: 5, fundScore: 8, stage: 2 },
  { symbol: 'AOT', name: 'Airports of Thailand', sector: 'TOUR', price: 66.0, ma30w: 65.1, ma30wSlopePct: 0.1, weeklyVolumeM: 70, mansfieldRs: -0.2, epsGrowthPct: 15, rsScore: 4, fundScore: 7, stage: 2 },
  { symbol: 'IVL', name: 'Indorama Ventures', sector: 'MATERIAL', price: 36.0, ma30w: 36.5, ma30wSlopePct: 0.3, weeklyVolumeM: 65, mansfieldRs: 0.1, epsGrowthPct: 18, rsScore: 5, fundScore: 6, stage: 1 },
  { symbol: 'TOP', name: 'Thai Oil', sector: 'ENERGY', price: 68.0, ma30w: 66.2, ma30wSlopePct: -0.2, weeklyVolumeM: 30, mansfieldRs: 0.3, epsGrowthPct: 20, rsScore: 5, fundScore: 6, stage: 2 },
  { symbol: 'PTT', name: 'PTT Public Company', sector: 'ENERGY', price: 32.0, ma30w: 32.8, ma30wSlopePct: 0.1, weeklyVolumeM: 75, mansfieldRs: 0.2, epsGrowthPct: 15, rsScore: 5, fundScore: 7, stage: 1 },
  { symbol: 'BEM', name: 'Bangkok Expressway & Metro', sector: 'UTIL', price: 9.5, ma30w: 9.1, ma30wSlopePct: 0.2, weeklyVolumeM: 22, mansfieldRs: -0.5, epsGrowthPct: 14, rsScore: 4, fundScore: 5, stage: 2 },
  { symbol: 'TRUE', name: 'True Corporation', sector: 'COMM', price: 8.2, ma30w: 9.6, ma30wSlopePct: -0.4, weeklyVolumeM: 45, mansfieldRs: -1.2, epsGrowthPct: 5, rsScore: 2, fundScore: 4, stage: 4 },
  { symbol: 'COM7', name: 'Com7 Public Company', sector: 'ICT', price: 5.8, ma30w: 6.9, ma30wSlopePct: -0.5, weeklyVolumeM: 25, mansfieldRs: -0.8, epsGrowthPct: 8, rsScore: 3, fundScore: 6, stage: 3 },
  { symbol: 'LH', name: 'Land & Houses', sector: 'PROP', price: 8.6, ma30w: 9.8, ma30wSlopePct: -0.6, weeklyVolumeM: 38, mansfieldRs: -1.0, epsGrowthPct: 6, rsScore: 2, fundScore: 5, stage: 4 },
  { symbol: 'SCC', name: 'The Siam Cement', sector: 'MATERIAL', price: 198.0, ma30w: 212.0, ma30wSlopePct: -0.5, weeklyVolumeM: 40, mansfieldRs: -0.9, epsGrowthPct: 9, rsScore: 3, fundScore: 6, stage: 4 },
  { symbol: 'BBL', name: 'Bangkok Bank', sector: 'BANK', price: 156.0, ma30w: 164.0, ma30wSlopePct: -0.3, weeklyVolumeM: 22, mansfieldRs: -0.4, epsGrowthPct: 11, rsScore: 4, fundScore: 7, stage: 3 },
  { symbol: 'KTB', name: 'Krungthai Bank', sector: 'BANK', price: 17.2, ma30w: 18.4, ma30wSlopePct: -0.4, weeklyVolumeM: 44, mansfieldRs: -0.6, epsGrowthPct: 9, rsScore: 3, fundScore: 5, stage: 3 },
  { symbol: 'PTTGC', name: 'PTT Global Chemical', sector: 'ENERGY', price: 42.0, ma30w: 47.5, ma30wSlopePct: -0.7, weeklyVolumeM: 33, mansfieldRs: -1.1, epsGrowthPct: 4, rsScore: 2, fundScore: 4, stage: 4 },
  { symbol: 'AMATA', name: 'Amata Corporation', sector: 'IND', price: 21.0, ma30w: 23.6, ma30wSlopePct: -0.5, weeklyVolumeM: 16, mansfieldRs: -0.8, epsGrowthPct: 7, rsScore: 3, fundScore: 5, stage: 3 },
  { symbol: 'WHA', name: 'WHA Corporation', sector: 'PROP', price: 4.1, ma30w: 4.5, ma30wSlopePct: -0.3, weeklyVolumeM: 20, mansfieldRs: -0.5, epsGrowthPct: 8, rsScore: 3, fundScore: 5, stage: 3 },
  { symbol: 'OR', name: 'PTT Oil & Retail Business', sector: 'ENERGY', price: 22.5, ma30w: 25.1, ma30wSlopePct: -0.4, weeklyVolumeM: 26, mansfieldRs: -0.7, epsGrowthPct: 10, rsScore: 3, fundScore: 6, stage: 3 },
  { symbol: 'SCGP', name: 'SCG Packaging', sector: 'MATERIAL', price: 31.5, ma30w: 34.2, ma30wSlopePct: -0.6, weeklyVolumeM: 24, mansfieldRs: -0.9, epsGrowthPct: 6, rsScore: 2, fundScore: 5, stage: 4 },
  { symbol: 'TU', name: 'Thai Union Group', sector: 'STAPLE', price: 12.8, ma30w: 13.9, ma30wSlopePct: -0.3, weeklyVolumeM: 19, mansfieldRs: -0.6, epsGrowthPct: 9, rsScore: 3, fundScore: 6, stage: 3 },
  { symbol: 'EGCO', name: 'Electricity Generating', sector: 'UTIL', price: 98.0, ma30w: 104.0, ma30wSlopePct: -0.4, weeklyVolumeM: 12, mansfieldRs: -0.5, epsGrowthPct: 11, rsScore: 3, fundScore: 6, stage: 3 },
  { symbol: 'STA', name: 'STA Ecogreen Energy', sector: 'AGRO', price: 22.0, ma30w: 20.1, ma30wSlopePct: 0.8, weeklyVolumeM: 3, mansfieldRs: 1.2, epsGrowthPct: 25, rsScore: 7, fundScore: 6, stage: 2 },
  { symbol: 'RJH', name: 'Ratchthani Leasing / RJH', sector: 'HEALTH', price: 15.0, ma30w: 14.1, ma30wSlopePct: 0.6, weeklyVolumeM: 5, mansfieldRs: 0.8, epsGrowthPct: 22, rsScore: 7, fundScore: 6, stage: 2 },
  { symbol: 'WICE', name: 'WICE Logistics', sector: 'SERVICE', price: 52.0, ma30w: 48.3, ma30wSlopePct: 0.9, weeklyVolumeM: 4, mansfieldRs: 1.0, epsGrowthPct: 28, rsScore: 7, fundScore: 6, stage: 2 },
  { symbol: 'PR9', name: 'Premium Site Industrial Estate', sector: 'PROP', price: 12.0, ma30w: 11.1, ma30wSlopePct: 0.5, weeklyVolumeM: 6, mansfieldRs: 0.6, epsGrowthPct: 18, rsScore: 6, fundScore: 5, stage: 2 },
  { symbol: 'SPALI', name: 'Supalai Public Company', sector: 'PROP', price: 52.0, ma30w: 50.2, ma30wSlopePct: 0.3, weeklyVolumeM: 8, mansfieldRs: 0.4, epsGrowthPct: 16, rsScore: 5, fundScore: 6, stage: 2 },
  { symbol: 'QH', name: 'Quality Houses', sector: 'PROP', price: 6.5, ma30w: 6.2, ma30wSlopePct: 0.4, weeklyVolumeM: 9, mansfieldRs: 0.5, epsGrowthPct: 15, rsScore: 5, fundScore: 5, stage: 2 },
  { symbol: 'III', name: 'Triple i Logistics', sector: 'IND', price: 22.0, ma30w: 21.0, ma30wSlopePct: 0.6, weeklyVolumeM: 7, mansfieldRs: 0.7, epsGrowthPct: 19, rsScore: 6, fundScore: 5, stage: 2 },
  { symbol: 'BA', name: 'Banharn Aviation / Bangkok Airways', sector: 'TOUR', price: 3.2, ma30w: 3.0, ma30wSlopePct: 0.5, weeklyVolumeM: 9, mansfieldRs: 0.4, epsGrowthPct: 20, rsScore: 5, fundScore: 5, stage: 2 },
  { symbol: 'CENTEL', name: 'Central Plaza Hotel', sector: 'TOUR', price: 40.0, ma30w: 44.0, ma30wSlopePct: -0.5, weeklyVolumeM: 14, mansfieldRs: -0.8, epsGrowthPct: 8, rsScore: 3, fundScore: 6, stage: 4 },
  { symbol: 'ERW', name: 'ERW Steel / E Ratchthani', sector: 'CONS', price: 3.4, ma30w: 3.8, ma30wSlopePct: -0.6, weeklyVolumeM: 13, mansfieldRs: -0.9, epsGrowthPct: 4, rsScore: 2, fundScore: 4, stage: 4 },
  { symbol: 'MINT', name: 'Minor International', sector: 'TOUR', price: 28.0, ma30w: 30.5, ma30wSlopePct: -0.3, weeklyVolumeM: 21, mansfieldRs: -0.4, epsGrowthPct: 10, rsScore: 4, fundScore: 7, stage: 3 },
  { symbol: 'BGRIM', name: 'B.Grimm Power', sector: 'UTIL', price: 18.5, ma30w: 20.2, ma30wSlopePct: -0.4, weeklyVolumeM: 17, mansfieldRs: -0.6, epsGrowthPct: 9, rsScore: 3, fundScore: 5, stage: 4 },
  { symbol: 'GPSC', name: 'Global Power Synergy', sector: 'UTIL', price: 56.0, ma30w: 60.1, ma30wSlopePct: -0.3, weeklyVolumeM: 15, mansfieldRs: -0.4, epsGrowthPct: 10, rsScore: 4, fundScore: 6, stage: 3 },
  { symbol: 'BHW', name: 'Bangkok Chain Hospital', sector: 'HEALTH', price: 8.2, ma30w: 9.0, ma30wSlopePct: -0.5, weeklyVolumeM: 11, mansfieldRs: -0.7, epsGrowthPct: 7, rsScore: 3, fundScore: 5, stage: 4 },
  { symbol: 'BCH', name: 'Bangkok Chain Hospital 2 / BCH', sector: 'HEALTH', price: 15.5, ma30w: 16.8, ma30wSlopePct: -0.4, weeklyVolumeM: 13, mansfieldRs: -0.5, epsGrowthPct: 9, rsScore: 3, fundScore: 5, stage: 3 },
  { symbol: 'HUMAN', name: 'Humanica Public Company', sector: 'ICT', price: 7.4, ma30w: 8.1, ma30wSlopePct: -0.5, weeklyVolumeM: 11, mansfieldRs: -0.6, epsGrowthPct: 6, rsScore: 3, fundScore: 4, stage: 4 },
  { symbol: 'KEX', name: 'Kerry Express Thailand', sector: 'SERVICE', price: 6.8, ma30w: 8.9, ma30wSlopePct: -1.1, weeklyVolumeM: 18, mansfieldRs: -1.5, epsGrowthPct: -3, rsScore: 1, fundScore: 3, stage: 4 },
  { symbol: 'LPN', name: 'LPN Development', sector: 'PROP', price: 9.8, ma30w: 10.6, ma30wSlopePct: -0.4, weeklyVolumeM: 12, mansfieldRs: -0.6, epsGrowthPct: 7, rsScore: 3, fundScore: 5, stage: 3 },
  { symbol: 'CRC', name: 'Central Retail Corporation', sector: 'CONS', price: 30.0, ma30w: 32.5, ma30wSlopePct: -0.4, weeklyVolumeM: 23, mansfieldRs: -0.7, epsGrowthPct: 8, rsScore: 3, fundScore: 6, stage: 3 },
  { symbol: 'AWC', name: 'Asset World Corporation', sector: 'PROP', price: 4.8, ma30w: 5.3, ma30wSlopePct: -0.5, weeklyVolumeM: 16, mansfieldRs: -0.8, epsGrowthPct: 5, rsScore: 2, fundScore: 5, stage: 4 },
  { symbol: 'TIDLOR', name: 'Ngern Tid Lor', sector: 'FIN', price: 36.0, ma30w: 38.5, ma30wSlopePct: -0.3, weeklyVolumeM: 14, mansfieldRs: -0.4, epsGrowthPct: 10, rsScore: 4, fundScore: 6, stage: 3 },
  { symbol: 'MTC', name: 'Muangthai Capital', sector: 'FIN', price: 22.5, ma30w: 24.8, ma30wSlopePct: -0.4, weeklyVolumeM: 19, mansfieldRs: -0.7, epsGrowthPct: 8, rsScore: 3, fundScore: 5, stage: 4 },
  { symbol: 'JMT', name: 'JMT Network Services', sector: 'SERVICE', price: 42.0, ma30w: 45.5, ma30wSlopePct: -0.3, weeklyVolumeM: 11, mansfieldRs: -0.3, epsGrowthPct: 9, rsScore: 4, fundScore: 6, stage: 3 },
  { symbol: 'SYNEX', name: 'Synnex (Thailand)', sector: 'ICT', price: 98.0, ma30w: 92.0, ma30wSlopePct: 0.6, weeklyVolumeM: 11, mansfieldRs: 0.8, epsGrowthPct: 16, rsScore: 7, fundScore: 6, stage: 2 },
  { symbol: 'TKC', name: 'Thai Kitchen foods / TKC', sector: 'ETRON', price: 58.0, ma30w: 66.0, ma30wSlopePct: -0.8, weeklyVolumeM: 21, mansfieldRs: -1.0, epsGrowthPct: 5, rsScore: 2, fundScore: 4, stage: 4 },
  { symbol: 'NEP', name: 'N.C.H. / New Electronics', sector: 'ETRON', price: 44.0, ma30w: 45.2, ma30wSlopePct: 0.1, weeklyVolumeM: 12, mansfieldRs: 0.1, epsGrowthPct: 12, rsScore: 5, fundScore: 5, stage: 1 },
  { symbol: 'AI', name: 'Asia Insurance', sector: 'FIN', price: 21.0, ma30w: 20.0, ma30wSlopePct: 0.3, weeklyVolumeM: 10.5, mansfieldRs: 0.4, epsGrowthPct: 13, rsScore: 5, fundScore: 5, stage: 2 },
  { symbol: 'KTBST', name: 'KTB Securities', sector: 'FIN', price: 12.5, ma30w: 13.4, ma30wSlopePct: -0.4, weeklyVolumeM: 10.2, mansfieldRs: -0.5, epsGrowthPct: 6, rsScore: 3, fundScore: 4, stage: 4 },
  { symbol: 'ROCK', name: 'Rockworth', sector: 'IND', price: 2.6, ma30w: 2.4, ma30wSlopePct: 0.2, weeklyVolumeM: 10.1, mansfieldRs: 0.3, epsGrowthPct: 14, rsScore: 5, fundScore: 4, stage: 2 },
  { symbol: 'NCL', name: 'NCL International Logistics', sector: 'SERVICE', price: 8.9, ma30w: 8.2, ma30wSlopePct: 0.4, weeklyVolumeM: 10.4, mansfieldRs: 0.5, epsGrowthPct: 15, rsScore: 6, fundScore: 4, stage: 2 },
  { symbol: 'A', name: 'Banpu / A Throne', sector: 'ENERGY', price: 5.2, ma30w: 5.6, ma30wSlopePct: -0.5, weeklyVolumeM: 27, mansfieldRs: -0.9, epsGrowthPct: 6, rsScore: 2, fundScore: 4, stage: 4 },
  { symbol: 'STARK', name: 'Stark Corporation', sector: 'IND', price: 1.2, ma30w: 2.8, ma30wSlopePct: -2.0, weeklyVolumeM: 30, mansfieldRs: -2.4, epsGrowthPct: -8, rsScore: 1, fundScore: 1, stage: 4 },]

export interface SectorSeed {
  name: string
  stage: number
  rsVsSet: number
  trend: string
  volume: string
  score: number
}

/** The SET sector board a new tenant starts from; they re-rank it every week. */
export const DEFAULT_SECTORS: SectorSeed[] = [
  { name: 'ETRON', stage: 2, rsVsSet: 2.1, trend: 'RISING', volume: 'HEAVY', score: 5 },
  { name: 'ICT', stage: 2, rsVsSet: 1.4, trend: 'RISING', volume: 'HEAVY', score: 5 },
  { name: 'BANK', stage: 2, rsVsSet: 0.8, trend: 'RISING', volume: 'HEAVY', score: 4 },
  { name: 'ENERGY', stage: 2, rsVsSet: 0.5, trend: 'RISING', volume: 'NORMAL', score: 4 },
  { name: 'TOUR', stage: 2, rsVsSet: -0.2, trend: 'FLAT', volume: 'NORMAL', score: 3 },
  { name: 'CONS', stage: 1, rsVsSet: -0.1, trend: 'FLAT', volume: 'NORMAL', score: 3 },
  { name: 'HEALTH', stage: 1, rsVsSet: -0.3, trend: 'FLAT', volume: 'LIGHT', score: 3 },
  { name: 'SERVICE', stage: 1, rsVsSet: -0.5, trend: 'FLAT', volume: 'LIGHT', score: 2 },
  { name: 'PROP', stage: 4, rsVsSet: -1.2, trend: 'FALLING', volume: 'NORMAL', score: 2 },
  { name: 'UTIL', stage: 4, rsVsSet: -1.0, trend: 'FALLING', volume: 'NORMAL', score: 2 },
  { name: 'MATERIAL', stage: 4, rsVsSet: -1.4, trend: 'FALLING', volume: 'LIGHT', score: 1 },
]

export interface ChecklistSeed {
  category: string
  label: string
  sortOrder: number
}

/** The routine itself — daily through quarterly. Straight from the manual. */
export const DEFAULT_CHECKLIST: ChecklistSeed[] = [
  { category: 'DAILY', label: 'เช็ค News/Events สำคัญ', sortOrder: 1 },
  { category: 'DAILY', label: 'ดู Futures ตลาดโลก', sortOrder: 2 },
  { category: 'DAILY', label: 'Review Watchlist', sortOrder: 3 },
  { category: 'DAILY', label: 'เช็ค Alert ที่ตั้งไว้', sortOrder: 4 },
  { category: 'WEEKLY', label: 'Market Stage Assessment', sortOrder: 1 },
  { category: 'WEEKLY', label: 'Sector Ranking', sortOrder: 2 },
  { category: 'WEEKLY', label: 'Stock Screening', sortOrder: 3 },
  { category: 'WEEKLY', label: 'Portfolio Review', sortOrder: 4 },
  { category: 'WEEKLY', label: 'Action Plan สำหรับสัปดาห์หน้า', sortOrder: 5 },
  { category: 'MONTHLY', label: 'Performance Analysis', sortOrder: 1 },
  { category: 'MONTHLY', label: 'Win Rate, Avg Win/Loss', sortOrder: 2 },
  { category: 'MONTHLY', label: 'Adjust System Parameters', sortOrder: 3 },
  { category: 'MONTHLY', label: 'Update Watchlist ระยะยาว', sortOrder: 4 },
  { category: 'QUARTERLY', label: 'Deep Performance Analysis', sortOrder: 1 },
  { category: 'QUARTERLY', label: 'Compare vs Benchmark', sortOrder: 2 },
  { category: 'QUARTERLY', label: 'Identify Patterns in Wins/Losses', sortOrder: 3 },
  { category: 'QUARTERLY', label: 'Refine Strategy', sortOrder: 4 },
]

/** Category display order — used by the API sort and the UI selector alike. */
export const CHECKLIST_CATEGORIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY'] as const

// ─── Opt-in sample book ──────────────────────────────────────────────────────
// Loaded only when the customer presses "โหลดข้อมูลตัวอย่าง", never on signup.

export const DEMO_WATCHLIST = [
  { symbol: 'DELTA', sector: 'ETRON', stage: 2, setup: 'Pullback to 30W MA', entryPrice: 148, stopLoss: 138, targetPrice: 185, rsScore: 9, fundScore: 8, priority: 'A', notes: 'RS แรงสุดในกลุ่ม ETRON รอย่อที่ MA' },
  { symbol: 'KCE', sector: 'ETRON', stage: 2, setup: 'Breakout', entryPrice: 38.5, stopLoss: 35, targetPrice: 48, rsScore: 8, fundScore: 7, priority: 'A', notes: null },
  { symbol: 'SVI', sector: 'ICT', stage: 2, setup: 'Pullback Entry', entryPrice: 66, stopLoss: 60, targetPrice: 82, rsScore: 8, fundScore: 7, priority: 'B', notes: null },
]

export const DEMO_POSITIONS = [
  { symbol: 'KBANK', sector: 'BANK', quantity: 200, entryPrice: 165, currentPrice: 178, entryStage: 2, currentStage: 2, stopLoss: 152, confidence: 'A', notes: 'Breakout ผ่าน resistance เก่า' },
  { symbol: 'PTTEP', sector: 'ENERGY', quantity: 300, entryPrice: 136.5, currentPrice: 142, entryStage: 2, currentStage: 2, stopLoss: 128, confidence: 'B', notes: null },
  { symbol: 'AOT', sector: 'TOUR', quantity: 500, entryPrice: 71, currentPrice: 66, entryStage: 2, currentStage: 3, stopLoss: 63.9, confidence: 'B', notes: 'เริ่มเข้าสู่ Stage 3 ระวัง' },
]

export const DEMO_JOURNAL = [
  { symbol: 'IVL', bias: 'CONFIRMATION', outcome: 'LOSS', pnlPct: -13.4, lesson: 'ถือต่อเพราะมองแต่ข่าวดี ทั้งที่ราคาหลุด MA ไปแล้ว — ควรตัดตามระบบ' },
  { symbol: 'KBANK', bias: 'NONE', outcome: 'WIN', pnlPct: 7.9, lesson: 'เข้าตาม Breakout + Volume ยืนยัน ถือตามแผน' },
]

export const DEMO_ACTIONS = [
  { type: 'BUY', content: 'ซื้อ DELTA ถ้าย่อถึง 148 (limit order)', done: false },
  { type: 'SELL', content: 'ลดครึ่ง AOT ถ้าปิดต่ำกว่า 64', done: false },
  { type: 'ALERT', content: 'ตั้ง Alert SVI ที่ 68 breakout', done: true },
  { type: 'EVENT', content: 'ติดตามประกาศกำไรไตรมาสสุดท้ายของ KCE', done: false },
]
