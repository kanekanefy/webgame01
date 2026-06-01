import { describe, it, expect } from 'vitest';
import {
  provinceRiceOutput, totalPeasants, clearMarket, runUpkeep,
  BASE_RICE_PRICE,
} from '../../src/core/economy.js';
import { buildState, type ScenarioData } from '../../src/core/scenario.js';

const scen: ScenarioData = {
  startYear: 1560, goalYear: 1565, seed: 1, taxRate: 0.3,
  clan: { koku: 100, levy: 100, contentment: 0.6, prestige: 0.5 },
  provinces: [
    { id: 'p1', name: 'A', villages: [{ peasants: 1000 }], baseRiceOutput: 0.03, fortification: 1, garrison: 10, productionMethod: 'basic' },
  ],
  retainers: [], rivals: [],
};

describe('economy', () => {
  it('provinceRiceOutput = 人口*baseRiceOutput*method倍率', () => {
    const s = buildState(scen);
    expect(provinceRiceOutput(s.provinces[0]!)).toBeCloseTo(1000 * 0.03 * 1.0, 6);
  });
  it('irrigated 提升产出 1.5x', () => {
    const s = buildState(scen);
    s.provinces[0]!.productionMethod = 'irrigated';
    expect(provinceRiceOutput(s.provinces[0]!)).toBeCloseTo(1000 * 0.03 * 1.5, 6);
  });
  it('totalPeasants 求和所有村落', () => {
    const s = buildState(scen);
    expect(totalPeasants(s)).toBe(1000);
  });
  it('clearMarket 价格被钳制在 [0.25,1.75]×base', () => {
    expect(clearMarket(1, 100)).toBeCloseTo(1.75 * BASE_RICE_PRICE, 6);
    expect(clearMarket(100, 1)).toBeCloseTo(0.25 * BASE_RICE_PRICE, 6);
    expect(clearMarket(0, 5)).toBeCloseTo(1.75 * BASE_RICE_PRICE, 6);
  });
  it('runUpkeep 盈余时增加 koku', () => {
    const s = buildState(scen);
    const before = s.clan.koku;
    const r = runUpkeep(s);
    expect(r.produced).toBeGreaterThan(0);
    expect(typeof r.price).toBe('number');
    expect(s.clan.koku).toBeCloseTo(before + r.net * r.price + r.taxRevenue, 6);
  });
});
