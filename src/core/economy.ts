import type { GameState, Province, Season } from './state.js';

export const FOOD_PER_PEASANT = 0.008; // 每农民每季消耗（koku-rice）
export const FOOD_PER_SOLDIER = 0.04; // 每兵每季消耗
export const BASE_RICE_PRICE = 1; // 每单位稻米基准价（koku）
export const TAX_PER_PEASANT = 0.004; // 满税时每农民贡献的 koku

export function methodMultiplier(method: Province['productionMethod']): number {
  return method === 'irrigated' ? 1.5 : 1.0;
}

export function provinceRiceOutput(p: Province): number {
  const peasants = p.villages.reduce((s, v) => s + v.peasants, 0);
  return peasants * p.baseRiceOutput * methodMultiplier(p.productionMethod);
}

export function totalPeasants(state: GameState): number {
  return state.provinces.reduce(
    (s, p) => s + p.villages.reduce((a, v) => a + v.peasants, 0),
    0,
  );
}

export function seasonFactor(season: Season): number {
  return season === 'Autumn' ? 1.0 : 0.25;
}

// 供需比决定价格：需求/供给越高价越贵，钳制在 [0.25,1.75]×base
export function clearMarket(supply: number, demand: number, basePrice = BASE_RICE_PRICE): number {
  const ratio = supply <= 0 ? 1.75 : demand / supply;
  return Math.min(Math.max(basePrice * ratio, 0.25 * basePrice), 1.75 * basePrice);
}

export interface UpkeepReport {
  produced: number;
  consumed: number;
  price: number;
  net: number;
  taxRevenue: number;
  famine: boolean;
}

// UPKEEP 阶段：产出-消耗按市场价折算进 koku，并收税。
export function runUpkeep(state: GameState): UpkeepReport {
  const factor = seasonFactor(state.season);
  const produced = state.provinces.reduce((s, p) => s + provinceRiceOutput(p), 0) * factor;
  const peasants = totalPeasants(state);
  const consumed = peasants * FOOD_PER_PEASANT + state.clan.levy * FOOD_PER_SOLDIER;
  const price = clearMarket(produced, consumed);
  const net = produced - consumed;
  const taxRevenue = peasants * TAX_PER_PEASANT * state.taxRate * factor;
  state.clan.koku += net * price + taxRevenue;
  const famine = state.clan.koku < 0;
  if (famine) state.clan.koku = 0;
  return { produced, consumed, price, net, taxRevenue, famine };
}
