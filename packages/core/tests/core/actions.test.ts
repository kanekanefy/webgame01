import { describe, it, expect, beforeAll } from 'vitest';
import { resolveAction, listActionIds, type ActionContext } from '../../src/core/actions/types.js';
import { RNG } from '../../src/core/rng.js';
import { buildState, type ScenarioData } from '../../src/core/scenario.js';

const scen: ScenarioData = {
  startYear: 1560,
  goalYear: 1565,
  seed: 1,
  taxRate: 0.3,
  clan: { koku: 500, levy: 100, contentment: 0.6, prestige: 0.5 },
  provinces: [
    {
      id: 'p1',
      name: 'A',
      villages: [{ peasants: 1000 }],
      baseRiceOutput: 0.03,
      fortification: 1,
      garrison: 10,
      productionMethod: 'basic',
    },
  ],
  retainers: [
    {
      id: 'r1',
      name: 'X',
      loyalty: 0.5,
      ambition: 0.5,
      skillAdmin: 0.5,
      skillWar: 0.5,
      traits: [],
      role: 'g',
    },
  ],
  rivals: [],
};

const ctx = (): ActionContext => ({ rng: new RNG(1) });

beforeAll(async () => {
  await import('../../src/core/actions/index.js');
});

describe('action catalog', () => {
  it('注册了全部 MVP 动作', () => {
    expect(listActionIds().sort()).toEqual(
      ['build_irrigation', 'freeform_act', 'hold_festival', 'levy_troops', 'reward_retainer', 'set_tax'].sort(),
    );
  });

  it('set_tax 改变税率', () => {
    const s = buildState(scen);
    resolveAction(s, 'set_tax', { rate: 0.55 }, ctx());
    expect(s.taxRate).toBeCloseTo(0.55, 6);
  });

  it('levy_troops 扣 koku 加 levy', () => {
    const s = buildState(scen);
    const r = resolveAction(s, 'levy_troops', { amount: 30 }, ctx());
    expect(r.facts[0]!.kind).toBe('levy');
    expect(s.clan.levy).toBe(130);
    expect(s.clan.koku).toBe(500 - 30 * 2);
  });

  it('koku 不足时 levy_troops 被拒、状态不变', () => {
    const s = buildState(scen);
    s.clan.koku = 10;
    const r = resolveAction(s, 'levy_troops', { amount: 30 }, ctx());
    expect(r.facts[0]!.kind).toBe('rejected');
    expect(s.clan.levy).toBe(100);
    expect(s.clan.koku).toBe(10);
  });

  it('build_irrigation 切换 productionMethod', () => {
    const s = buildState(scen);
    resolveAction(s, 'build_irrigation', { provinceId: 'p1' }, ctx());
    expect(s.provinces[0]!.productionMethod).toBe('irrigated');
  });

  it('hold_festival 提升民心、reward_retainer 提升忠诚', () => {
    const s = buildState(scen);
    resolveAction(s, 'hold_festival', {}, ctx());
    expect(s.clan.contentment).toBeGreaterThan(0.6);
    resolveAction(s, 'reward_retainer', { retainerId: 'r1' }, ctx());
    expect(s.retainers[0]!.loyalty).toBeGreaterThan(0.5);
  });

  it('未知动作返回 error', () => {
    const s = buildState(scen);
    const r = resolveAction(s, 'cast_nuke', {}, ctx());
    expect(r.facts[0]!.kind).toBe('error');
  });
});
