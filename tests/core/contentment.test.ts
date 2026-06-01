import { describe, it, expect } from 'vitest';
import { updateContentment, targetContentment } from '../../src/core/economy.js';
import { buildState, type ScenarioData } from '../../src/core/scenario.js';

const scen: ScenarioData = {
  startYear: 1560, goalYear: 1565, seed: 1, taxRate: 0.3,
  clan: { koku: 100, levy: 100, contentment: 0.6, prestige: 0.5 },
  provinces: [{ id: 'p1', name: 'A', villages: [{ peasants: 1000 }], baseRiceOutput: 0.03, fortification: 1, garrison: 10, productionMethod: 'basic' }],
  retainers: [], rivals: [],
};

describe('contentment', () => {
  it('高税降低目标民心', () => {
    const s = buildState(scen);
    s.taxRate = 0.8;
    const hi = targetContentment(s, false);
    s.taxRate = 0.1;
    const lo = targetContentment(s, false);
    expect(lo).toBeGreaterThan(hi);
  });
  it('饥荒进一步降低目标民心', () => {
    const s = buildState(scen);
    expect(targetContentment(s, true)).toBeLessThan(targetContentment(s, false));
  });
  it('民心朝目标缓慢漂移而非瞬变', () => {
    const s = buildState(scen);
    s.clan.contentment = 0.6;
    s.taxRate = 0.9; // 目标会明显低于 0.6
    const target = targetContentment(s, false);
    updateContentment(s, false);
    expect(s.clan.contentment).toBeLessThan(0.6);
    expect(s.clan.contentment).toBeGreaterThan(target); // 一步没到位
  });
  it('民心始终在 [0,1]', () => {
    const s = buildState(scen);
    s.clan.contentment = 0.05;
    s.taxRate = 1;
    for (let i = 0; i < 50; i++) updateContentment(s, true);
    expect(s.clan.contentment).toBeGreaterThanOrEqual(0);
    expect(s.clan.contentment).toBeLessThanOrEqual(1);
  });
});
