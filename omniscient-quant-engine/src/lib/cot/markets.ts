// ตลาดล่วงหน้าที่มีรายงาน COT (ชุดเดียวกับเมนูในภาพตัวอย่าง) — base = ระดับราคาเริ่ม, vol = ความผันผวนรายสัปดาห์, oi = ขนาดสัญญาคงค้าง
import type { CotMarket } from './types';

export interface MarketSpec extends CotMarket {
  base: number;
  vol: number;
  oi: number;
  decimals: number;
}

const m = (id: string, name: string, group: string, exchange: string, unit: string, base: number, vol: number, oi: number, decimals = 2, financial = false): MarketSpec => ({
  id, name, group, exchange, unit, base, vol, oi, decimals, financial,
});

export const COT_MARKETS: MarketSpec[] = [
  m('eur', 'Euro FX', 'Currencies', 'CME', 'USD/EUR', 1.08, 0.012, 650_000, 4, true),
  m('jpy', 'Japanese Yen', 'Currencies', 'CME', 'USD/100 JPY', 0.68, 0.016, 250_000, 4, true),
  m('gbp', 'British Pound', 'Currencies', 'CME', 'USD/GBP', 1.27, 0.013, 220_000, 4, true),
  m('aud', 'Australian Dollar', 'Currencies', 'CME', 'USD/AUD', 0.66, 0.015, 180_000, 4, true),
  m('btc', 'Bitcoin', 'Crypto', 'CME', 'USD', 60_000, 0.07, 28_000, 0, true),
  m('eth', 'Ether', 'Crypto', 'CME', 'USD', 3_000, 0.09, 9_000, 0, true),
  m('spx', 'S&P 500 E-mini', 'Indices', 'CME', 'index pts', 5_200, 0.02, 2_200_000, 1, true),
  m('ndx', 'Nasdaq-100 E-mini', 'Indices', 'CME', 'index pts', 18_500, 0.028, 270_000, 1, true),
  m('dji', 'Dow Jones E-mini', 'Indices', 'CBOT', 'index pts', 39_000, 0.018, 95_000, 0, true),
  m('ty', '10-Year T-Note', 'Bonds', 'CBOT', '% of par', 110, 0.008, 4_300_000, 3, true),
  m('us', '30-Year T-Bond', 'Bonds', 'CBOT', '% of par', 118, 0.014, 1_700_000, 3, true),
  m('cl', 'Crude Oil WTI', 'Energy', 'NYMEX', 'USD/bbl', 78, 0.045, 1_650_000),
  m('ng', 'Natural Gas', 'Energy', 'NYMEX', 'USD/MMBtu', 2.8, 0.08, 1_450_000, 3),
  m('ho', 'Heating Oil', 'Energy', 'NYMEX', 'USD/gal', 2.6, 0.045, 320_000, 4),
  m('gold', 'Gold', 'Metals', 'COMEX', 'USD/oz', 2_350, 0.022, 520_000),
  m('silver', 'Silver', 'Metals', 'COMEX', 'USD/oz', 28, 0.035, 160_000, 3),
  m('copper', 'Copper', 'Metals', 'COMEX', 'USD/lb', 4.3, 0.03, 230_000, 4),
  m('platinum', 'Platinum', 'Metals', 'NYMEX', 'USD/oz', 980, 0.035, 80_000),
  m('palladium', 'Palladium', 'Metals', 'NYMEX', 'USD/oz', 1_000, 0.05, 22_000),
  m('corn', 'Corn', 'Grains', 'CBOT', 'USc/bu', 450, 0.035, 1_550_000),
  m('wheat', 'Wheat', 'Grains', 'CBOT', 'USc/bu', 580, 0.04, 420_000),
  m('soy', 'Soybeans', 'Grains', 'CBOT', 'USc/bu', 1_150, 0.03, 780_000),
  m('coffee', 'Coffee', 'Softs', 'ICE US', 'USc/lb', 230, 0.045, 200_000),
  m('sugar', 'Sugar No. 11', 'Softs', 'ICE US', 'USc/lb', 20, 0.04, 900_000),
  m('cocoa', 'Cocoa', 'Softs', 'ICE US', 'USD/t', 7_000, 0.06, 140_000, 0),
  m('cattle', 'Live Cattle', 'Livestock & Dairy', 'CME', 'USc/lb', 185, 0.02, 330_000),
  m('hogs', 'Lean Hogs', 'Livestock & Dairy', 'CME', 'USc/lb', 90, 0.035, 250_000),
];

export const COT_GROUPS = [...new Set(COT_MARKETS.map((x) => x.group))];

export function findMarket(id: string): MarketSpec | undefined {
  return COT_MARKETS.find((x) => x.id === id.toLowerCase());
}
