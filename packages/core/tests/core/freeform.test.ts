import { describe, it, expect } from 'vitest';
import { buildState } from '../../src/core/scenario.js';
import { advanceTurn } from '../../src/core/loop.js';
import { resolveAction } from '../../src/core/actions/types.js';
import { RNG } from '../../src/core/rng.js';
import '../../src/core/actions/index.js';
import scenario from '../../content/scenario.json';

function fresh() {
  return buildState(scenario as never);
}
const ctx = () => ({ rng: new RNG(1) });

describe('freeform_act — 通用随心而为动作', () => {
  it('social 对家臣 → 该家臣忠诚提升，扣少量国库', () => {
    const s = fresh();
    const r = s.retainers.find((x) => x.id === 'hideyoshi')!;
    const before = r.loyalty;
    const koku0 = s.clan.koku;
    const res = resolveAction(s, 'freeform_act', { category: 'social', target: 'hideyoshi' }, ctx());
    expect(res.facts[0]!.kind).toBe('freeform');
    expect(r.loyalty).toBeGreaterThan(before);
    expect(s.clan.koku).toBe(koku0 - 10);
  });

  it('cultural → 威信提升', () => {
    const s = fresh();
    const p0 = s.clan.prestige;
    resolveAction(s, 'freeform_act', { category: 'cultural' }, ctx());
    expect(s.clan.prestige).toBeGreaterThan(p0);
  });

  it('diplomacy 对邻国 → 该国好感提升', () => {
    const s = fresh();
    const c = s.rivals.find((x) => x.id === 'imagawa')!;
    const d0 = c.disposition;
    resolveAction(s, 'freeform_act', { category: 'diplomacy', target: 'imagawa' }, ctx());
    expect(c.disposition).toBeGreaterThan(d0);
  });

  it('未知类别 → 兜底 gesture，仍可行不报错', () => {
    const s = fresh();
    const res = resolveAction(s, 'freeform_act', { category: '乱七八糟' }, ctx());
    expect(res.facts[0]!.kind).toBe('freeform');
    expect(s.clan.contentment).toBeGreaterThanOrEqual(0);
    expect(s.clan.contentment).toBeLessThanOrEqual(1);
  });

  it('不变量：连续 freeform 不破坏 [0,1] 与 koku≥0', () => {
    const s = fresh();
    for (let i = 0; i < 50; i++) {
      advanceTurn(s, { actionId: 'freeform_act', params: { category: 'social', target: 'katsuie' } });
      expect(s.clan.contentment).toBeGreaterThanOrEqual(0);
      expect(s.clan.contentment).toBeLessThanOrEqual(1);
      expect(s.clan.koku).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(s.clan.koku)).toBe(false);
    }
  });

  it('确定性回放：同 decree 序列 → 同结果', () => {
    const decrees = [
      { actionId: 'freeform_act', params: { category: 'social', target: 'hideyoshi' } },
      { actionId: 'freeform_act', params: { category: 'cultural' } },
      { actionId: 'freeform_act', params: { category: 'spiritual' } },
    ];
    const a = fresh();
    decrees.forEach((d) => advanceTurn(a, d));
    const b = fresh();
    decrees.forEach((d) => advanceTurn(b, d));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
