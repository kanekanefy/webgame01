import { describe, it, expect } from 'vitest';
import { buildState } from '../../src/core/scenario.js';
import { resolveAttack, resolveDefense, bestWarSkill } from '../../src/core/war.js';
import { RNG } from '../../src/core/rng.js';
import scenario from '../../content/scenario.json';

function fresh() {
  return buildState(scenario as never);
}

describe('war — 战力与战斗结算', () => {
  it('bestWarSkill：无领军→基准 0.3；任命后取最高战技', () => {
    const s = fresh();
    expect(bestWarSkill(s)).toBe(0.3);
    const katsuie = s.retainers.find((r) => r.id === 'katsuie')!;
    katsuie.assignment = 'war';
    expect(bestWarSkill(s)).toBeCloseTo(katsuie.skillWar);
  });

  it('压倒性进攻 → 胜或吞并，敌兵势下降、威信上升', () => {
    const s = fresh();
    s.clan.levy = 2000;
    const imagawa = s.rivals.find((r) => r.id === 'imagawa')!;
    const before = imagawa.strength;
    const p0 = s.clan.prestige;
    const facts = resolveAttack(s, imagawa, new RNG(7));
    expect(['battle_win', 'conquer']).toContain(facts[0]!.kind);
    expect(imagawa.strength).toBeLessThan(before);
    expect(s.clan.prestige).toBeGreaterThan(p0);
    expect(s.clan.prestige).toBeLessThanOrEqual(1);
  });

  it('兵势归零 → conquer 吞并，领民增加', () => {
    const s = fresh();
    s.clan.levy = 5000;
    const asai = s.rivals.find((r) => r.id === 'asai')!;
    asai.strength = 5;
    const peasants0 = s.provinces[0]!.villages[0]!.peasants;
    const facts = resolveAttack(s, asai, new RNG(3));
    expect(facts[0]!.kind).toBe('conquer');
    expect(asai.strength).toBe(0);
    expect(s.provinces[0]!.villages[0]!.peasants).toBeGreaterThan(peasants0);
  });

  it('以卵击石 → 败，损兵、威信下降', () => {
    const s = fresh();
    s.clan.levy = 30;
    const imagawa = s.rivals.find((r) => r.id === 'imagawa')!;
    imagawa.strength = 5000;
    const p0 = s.clan.prestige;
    const facts = resolveAttack(s, imagawa, new RNG(11));
    expect(facts[0]!.kind).toBe('battle_lose');
    expect(s.clan.levy).toBeLessThan(30);
    expect(s.clan.prestige).toBeLessThan(p0);
    expect(s.clan.levy).toBeGreaterThanOrEqual(0);
  });

  it('防御战：强守备击退；弱守备失地', () => {
    const win = fresh();
    win.clan.levy = 3000;
    const r1 = win.rivals.find((r) => r.id === 'saito')!;
    r1.strength = 50;
    expect(resolveDefense(win, r1, new RNG(2))[0]!.kind).toBe('defend_win');

    const lose = fresh();
    lose.clan.levy = 0;
    lose.provinces.forEach((p) => (p.garrison = 0));
    const r2 = lose.rivals.find((r) => r.id === 'saito')!;
    r2.strength = 5000;
    expect(resolveDefense(lose, r2, new RNG(2))[0]!.kind).toBe('defend_lose');
  });

  it('确定性：同种子同输入 → 同结果', () => {
    const a = fresh();
    a.clan.levy = 500;
    const b = fresh();
    b.clan.levy = 500;
    resolveAttack(a, a.rivals[0]!, new RNG(99));
    resolveAttack(b, b.rivals[0]!, new RNG(99));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
