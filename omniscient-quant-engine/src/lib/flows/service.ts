// ============================================================
// ต่อข้อมูลเงินไหลเข้ากับ panel ของแพลตฟอร์ม (server-only)
// ราคา/ปริมาณมาจาก MarketState เดียวกับ Terminal/Decision (ข้อมูลจำลองหรือข้อมูลจริงที่นำเข้า)
// SET = SET proxy ของแพลตฟอร์ม · หุ้นรายตัว = OHLCV ของหุ้นนั้น — cache ผูกกับ MarketState (เวอร์ชันข้อมูลเปลี่ยน = คำนวณใหม่)
// ============================================================

import { loadMarketState } from '@/lib/quant/engine/panel';
import type { MarketState } from '@/lib/quant/engine/types';
import { barsFromClose, generateMarketFlows, generateStockFlows } from './generate';
import { MARKET_GROUPS, STOCK_GROUPS, type FlowBar, type FlowEntitiesResponse, type FlowEntity, type FlowSource } from './types';

export const MARKET_ID = 'SET';
const MARKET_NAME = 'SET (ทั้งตลาด)';

const keyOf = (d: Date) => d.toISOString().slice(0, 10);

export function flowEntitiesFromState(state: MarketState): FlowEntitiesResponse {
  const sectors = new Map<string, Array<{ id: string; name: string }>>();
  for (const s of state.stocks) {
    const list = sectors.get(s.sector) ?? [];
    list.push({ id: s.symbol, name: s.name });
    sectors.set(s.sector, list);
  }
  return {
    lastDate: keyOf(state.dates[state.dates.length - 1]),
    market: [{ id: MARKET_ID, name: MARKET_NAME }],
    sectors: [...sectors].map(([sector, stocks]) => ({ sector, stocks })),
  };
}

const cache = new WeakMap<MarketState, Map<string, { entity: FlowEntity; days: FlowBar[] }>>();

/** ข้อมูลเงินไหลรายวันของ SET หรือหุ้นหนึ่งตัว — null = ไม่รู้จักสัญลักษณ์ */
export function flowsFromState(state: MarketState, id: string): { entity: FlowEntity; days: FlowBar[] } | null {
  let byId = cache.get(state);
  if (!byId) {
    byId = new Map();
    cache.set(state, byId);
  }
  const key = id.toUpperCase();
  const hit = byId.get(key);
  if (hit) return hit;
  const dates = state.dates.map(keyOf);
  let res: { entity: FlowEntity; days: FlowBar[] };
  if (key === MARKET_ID) {
    res = {
      entity: { id: MARKET_ID, kind: 'market', name: MARKET_NAME, sector: null, groups: MARKET_GROUPS },
      days: generateMarketFlows(barsFromClose(dates, state.marketClose)),
    };
  } else {
    const st = state.stocks.find((s) => s.symbol === key);
    if (!st) return null;
    res = {
      entity: { id: st.symbol, kind: 'stock', name: st.name, sector: st.sector, groups: STOCK_GROUPS },
      days: generateStockFlows(
        { dates, o: st.ohlcv.open, h: st.ohlcv.high, l: st.ohlcv.low, c: st.rows.map((r) => r.close), volumeM: st.ohlcv.volume },
        st.symbol,
      ),
    };
  }
  byId.set(key, res);
  return res;
}

export function flowSource(entity: FlowEntity): FlowSource {
  return entity.kind === 'market'
    ? {
        kind: 'synthetic',
        label: 'ข้อมูลเงินไหลจำลอง',
        note: 'ยอดซื้อ/ขายตามประเภทนักลงทุนสร้างด้วย generator ที่รักษาเอกลักษณ์ของรายงาน SET (Σซื้อ = Σขาย = มูลค่าซื้อขายรวม, Σสุทธิ = 0) และผูกกับผลตอบแทนของ SET proxy ของแพลตฟอร์ม — ไม่ใช่ข้อมูลจริงจากตลาดหลักทรัพย์ฯ',
      }
    : {
        kind: 'synthetic',
        label: 'ข้อมูล NVDR / Short sale จำลอง',
        note: 'ราคาและมูลค่าซื้อขายมาจากชุดข้อมูลของแพลตฟอร์ม ส่วนยอด NVDR และ short sale สร้างด้วย generator (NVDR + ผู้ลงทุนอื่น = มูลค่าซื้อขายของหุ้นทั้งฝั่งซื้อและขาย, short sale ≤ มูลค่าขาย) — ไม่ใช่ข้อมูลจริง · ตลาดหลักทรัพย์ฯ ไม่เผยแพร่ประเภทนักลงทุนรายหุ้น จึงใช้ NVDR เป็นตัวแทนแรงซื้อขายของต่างชาติ',
      };
}

export async function getFlowEntities(): Promise<FlowEntitiesResponse> {
  return flowEntitiesFromState(await loadMarketState());
}

export async function getFlows(id: string): Promise<{ entity: FlowEntity; days: FlowBar[] } | null> {
  return flowsFromState(await loadMarketState(), id);
}
