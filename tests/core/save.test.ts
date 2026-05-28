import { describe, it, expect } from 'vitest';
import { serialize, deserialize, replay } from '../../src/core/save.js';
import { advanceTurn, type Decree } from '../../src/core/loop.js';
import { buildState, type ScenarioData } from '../../src/core/scenario.js';

const scen: ScenarioData = {
  startYear: 1560, goalYear: 1565, seed: 5, taxRate: 0.3,
  clan: { koku: 500, levy: 100, contentment: 0.6, prestige: 0.5 },
  provinces: [{ id: 'p1', name: 'A', villages: [{ peasants: 5000 }], baseRiceOutput: 0.03, fortification: 1, garrison: 10, productionMethod: 'basic' }],
  retainers: [], rivals: [],
};
const seq: Array<Decree | null> = [
  { actionId: 'set_tax', params: { rate: 0.4 } },
  { actionId: 'hold_festival', params: {} },
  null,
  { actionId: 'levy_troops', params: { amount: 20 } },
];

describe('save & replay', () => {
  it('serialize→deserialize 往返相等', () => {
    const s = buildState(scen);
    advanceTurn(s, seq[0]!);
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it('replay 从初始 + 决策序列复现直接推进的终态', () => {
    const direct = buildState(scen);
    for (const d of seq) advanceTurn(direct, d);
    const replayed = replay(buildState(scen), seq);
    expect(serialize(replayed)).toBe(serialize(direct));
  });
  it('replay 不修改传入的初始状态', () => {
    const initial = buildState(scen);
    const snapshot = serialize(initial);
    replay(initial, seq);
    expect(serialize(initial)).toBe(snapshot);
  });
});
