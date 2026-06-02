import { describe, it, expect } from 'vitest';
import { buildState } from '../../src/core/scenario.js';
import { resolveAction } from '../../src/core/actions/types.js';
import { RNG } from '../../src/core/rng.js';
import '../../src/core/actions/index.js';
import scenario from '../../content/scenario.json';

function fresh() {
  return buildState(scenario as never);
}
const ctx = () => ({ rng: new RNG(7) });

describe('R4 新动作', () => {
  it('assign_retainer：任命领军', () => {
    const s = fresh();
    const res = resolveAction(s, 'assign_retainer', { retainerId: 'katsuie', role: 'war' }, ctx());
    expect(res.facts[0]!.kind).toBe('assign');
    expect(s.retainers.find((r) => r.id === 'katsuie')!.assignment).toBe('war');
  });

  it('attack_rival：兵不足被 precondition 拒', () => {
    const s = fresh();
    s.clan.levy = 5;
    const res = resolveAction(s, 'attack_rival', { rivalId: 'imagawa' }, ctx());
    expect(res.facts[0]!.kind).toBe('rejected');
  });

  it('attack_rival：盟友不可攻', () => {
    const s = fresh();
    const c = s.rivals.find((r) => r.id === 'asai')!;
    c.allied = true;
    const res = resolveAction(s, 'attack_rival', { rivalId: 'asai' }, ctx());
    expect(res.facts[0]!.kind).toBe('rejected');
  });

  it('attack_rival：足兵则开战并产出战果', () => {
    const s = fresh();
    s.clan.levy = 1500;
    const res = resolveAction(s, 'attack_rival', { rivalId: 'saito' }, ctx());
    expect(['battle_win', 'battle_lose', 'conquer']).toContain(res.facts[0]!.kind);
  });

  it('recruit_retainer：扣费并尝试招揽（成功则家臣+1）', () => {
    const s = fresh();
    s.fame = 1;
    const koku0 = s.clan.koku;
    const ret0 = s.retainers.length;
    const res = resolveAction(s, 'recruit_retainer', {}, ctx());
    expect(s.clan.koku).toBe(koku0 - 30);
    expect(['recruit', 'recruit_fail']).toContain(res.facts[0]!.kind);
    if (res.facts[0]!.kind === 'recruit') expect(s.retainers.length).toBe(ret0 + 1);
  });

  it('develop_land：开垦增农户、扣费', () => {
    const s = fresh();
    const koku0 = s.clan.koku;
    const before = s.provinces[0]!.villages[0]!.peasants;
    const res = resolveAction(s, 'develop_land', { provinceId: 'owari' }, ctx());
    expect(res.facts[0]!.kind).toBe('develop');
    expect(s.clan.koku).toBe(koku0 - 80);
    expect(s.provinces[0]!.villages[0]!.peasants).toBeGreaterThan(before);
  });

  it('petition_court：献金升官、威信+', () => {
    const s = fresh();
    const p0 = s.clan.prestige;
    const res = resolveAction(s, 'petition_court', {}, ctx());
    expect(res.facts[0]!.kind).toBe('court');
    expect(s.courtRank).toBe(1);
    expect(s.clan.prestige).toBeGreaterThan(p0);
  });

  it('negotiate：遣使升好感，达阈值结盟', () => {
    const s = fresh();
    const c = s.rivals.find((r) => r.id === 'asai')!;
    c.disposition = 0.75;
    resolveAction(s, 'negotiate', { rivalId: 'asai' }, ctx());
    expect(c.disposition).toBeGreaterThan(0.75);
    expect(c.allied).toBe(true);
  });

  it('freeform recruit：招贤纳士尝试招揽', () => {
    const s = fresh();
    s.fame = 1;
    const res = resolveAction(s, 'freeform_act', { category: 'recruit' }, ctx());
    expect(res.facts[0]!.kind).toBe('freeform');
    expect(res.facts[0]!.text).toContain('招贤纳士');
  });

  it('freeform personal 指向邻国 → 联姻大涨好感', () => {
    const s = fresh();
    const c = s.rivals.find((r) => r.id === 'imagawa')!;
    const d0 = c.disposition;
    resolveAction(s, 'freeform_act', { category: 'personal', target: 'imagawa' }, ctx());
    expect(c.disposition).toBeGreaterThan(d0 + 0.1);
  });
});
