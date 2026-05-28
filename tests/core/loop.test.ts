import { describe, it, expect } from 'vitest';
import { advanceTurn, LOSE_CONTENTMENT, type Decree } from '../../src/core/loop.js';
import { buildState, type ScenarioData } from '../../src/core/scenario.js';

const scen: ScenarioData = {
  startYear: 1560, goalYear: 1561, seed: 5, taxRate: 0.3,
  clan: { koku: 500, levy: 100, contentment: 0.6, prestige: 0.5 },
  provinces: [{ id: 'p1', name: 'A', villages: [{ peasants: 5000 }], baseRiceOutput: 0.03, fortification: 1, garrison: 10, productionMethod: 'basic' }],
  retainers: [], rivals: [],
};

describe('advanceTurn', () => {
  it('推进日历：四季轮转、跨年、turn 递增', () => {
    const s = buildState(scen);
    advanceTurn(s, null); // Spring -> Summer
    expect(s.season).toBe('Summer');
    expect(s.turn).toBe(1);
    advanceTurn(s, null); advanceTurn(s, null); // -> Autumn -> Winter
    advanceTurn(s, null); // Winter -> Spring，跨年
    expect(s.season).toBe('Spring');
    expect(s.year).toBe(1561);
  });
  it('decree 被记入 actionLog 且生效', () => {
    const s = buildState(scen);
    const d: Decree = { actionId: 'set_tax', params: { rate: 0.5 } };
    advanceTurn(s, d);
    expect(s.taxRate).toBeCloseTo(0.5, 6);
    expect(s.actionLog).toHaveLength(1);
    expect(s.actionLog[0]!.actionId).toBe('set_tax');
  });
  it('确定性：同初始 + 同决策序列 → 同终态', () => {
    const a = buildState(scen), b = buildState(scen);
    const seq: Array<Decree | null> = [{ actionId: 'hold_festival', params: {} }, null, { actionId: 'levy_troops', params: { amount: 20 } }];
    for (const d of seq) advanceTurn(a, d);
    for (const d of seq) advanceTurn(b, d);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('民心崩盘 → 判负', () => {
    const s = buildState(scen);
    s.clan.contentment = LOSE_CONTENTMENT; // 已在阈值
    advanceTurn(s, null);
    expect(s.status).toBe('lost');
  });
  it('撑到 goalYear → 判胜', () => {
    const s = buildState({ ...scen, goalYear: 1560 });
    // 跑满一年回到 Spring 时 year 已 >= goalYear
    for (let i = 0; i < 4; i++) advanceTurn(s, { actionId: 'hold_festival', params: {} });
    expect(s.status).toBe('won');
  });
});
