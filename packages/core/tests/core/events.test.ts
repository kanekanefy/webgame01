import { describe, it, expect } from 'vitest';
import { buildState } from '../../src/core/scenario.js';
import { runWorldEvents, recruitFromPool, updatePopulation } from '../../src/core/events.js';
import { totalPeasants } from '../../src/core/economy.js';
import { RNG } from '../../src/core/rng.js';
import scenario from '../../content/scenario.json';

function fresh() {
  return buildState(scenario as never);
}

describe('events — 招揽 / 谋反 / 人口 / 世界事件', () => {
  it('recruitFromPool：fame 高时多次尝试能招得，浪人池缩、家臣增', () => {
    const s = fresh();
    s.fame = 1;
    const pool0 = s.roninPool.length;
    const ret0 = s.retainers.length;
    const rng = new RNG(1);
    let got: string | null = null;
    for (let i = 0; i < 20 && !got; i++) got = recruitFromPool(s, rng);
    expect(got).not.toBeNull();
    expect(s.roninPool.length).toBe(pool0 - 1);
    expect(s.retainers.length).toBe(ret0 + 1);
    expect(s.retainers.some((r) => r.name === got)).toBe(true);
  });

  it('人口：高民心繁衍、低民心流散', () => {
    const grow = fresh();
    grow.clan.contentment = 1;
    const p0 = totalPeasants(grow);
    updatePopulation(grow);
    expect(totalPeasants(grow)).toBeGreaterThan(p0);

    const shrink = fresh();
    shrink.clan.contentment = 0;
    const q0 = totalPeasants(shrink);
    updatePopulation(shrink);
    expect(totalPeasants(shrink)).toBeLessThan(q0);
  });

  it('谋反：低忠诚高野心家臣会出奔（多回合内必现），离场并损兵', () => {
    const s = fresh();
    const m = s.retainers.find((r) => r.id === 'mitsuhide')!;
    m.loyalty = 0.05;
    m.ambition = 0.95;
    s.clan.levy = 200;
    let betrayed = false;
    const rng = new RNG(5);
    for (let i = 0; i < 40 && !betrayed; i++) {
      const facts = runWorldEvents(s, rng);
      if (facts.some((f) => f.kind === 'betrayal')) betrayed = true;
    }
    expect(betrayed).toBe(true);
    expect(m.alive).toBe(false);
  });

  it('世界事件确定性：同 state + 同种子 → 同结果', () => {
    const a = fresh();
    const b = fresh();
    const fa = runWorldEvents(a, new RNG(42));
    const fb = runWorldEvents(b, new RNG(42));
    expect(JSON.stringify({ s: a, fa })).toBe(JSON.stringify({ s: b, fa: fb }));
  });

  it('不变量：连续世界事件不破坏 [0,1] / koku≥0 / peasants≥0', () => {
    const s = fresh();
    const rng = new RNG(123);
    for (let i = 0; i < 60; i++) {
      runWorldEvents(s, rng);
      expect(s.clan.contentment).toBeGreaterThanOrEqual(0);
      expect(s.clan.contentment).toBeLessThanOrEqual(1);
      expect(s.clan.prestige).toBeGreaterThanOrEqual(0);
      expect(s.clan.koku).toBeGreaterThanOrEqual(0);
      expect(s.fame).toBeGreaterThanOrEqual(0);
      expect(s.fame).toBeLessThanOrEqual(1);
    }
  });
});
