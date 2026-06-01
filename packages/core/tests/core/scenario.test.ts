import { describe, it, expect } from 'vitest';
import { buildState, type ScenarioData } from '../../src/core/scenario.js';

const minimal: ScenarioData = {
  startYear: 1560,
  goalYear: 1565,
  seed: 99,
  taxRate: 0.3,
  clan: { koku: 100, levy: 50, contentment: 0.6, prestige: 0.5 },
  provinces: [
    { id: 'p1', name: 'Owari', villages: [{ peasants: 1000 }], baseRiceOutput: 0.02, fortification: 2, garrison: 30, productionMethod: 'basic' },
  ],
  retainers: [
    { id: 'r1', name: 'Toshiie', loyalty: 0.7, ambition: 0.4, skillAdmin: 0.5, skillWar: 0.8, traits: ['brave'], role: 'general' },
  ],
  rivals: [{ id: 'c1', name: 'Imagawa', strength: 200, disposition: 0.2 }],
};

describe('buildState', () => {
  it('把场景数据映射为初始 GameState', () => {
    const s = buildState(minimal);
    expect(s.year).toBe(1560);
    expect(s.season).toBe('Spring');
    expect(s.turn).toBe(0);
    expect(s.goalYear).toBe(1565);
    expect(s.rngState).toBe(99);
    expect(s.status).toBe('playing');
    expect(s.clan.koku).toBe(100);
    expect(s.provinces[0]!.productionMethod).toBe('basic');
    expect(s.retainers[0]!.memory).toEqual([]);
    expect(s.actionLog).toEqual([]);
  });
  it('深拷贝场景，不共享引用', () => {
    const s = buildState(minimal);
    s.provinces[0]!.villages[0]!.peasants = 0;
    expect(minimal.provinces[0]!.villages[0]!.peasants).toBe(1000);
  });
});
