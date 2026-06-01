import { describe, it, expect } from 'vitest';
import { loadScenarioFromFile } from '../../src/core/scenario.js';
import { advanceTurn, type Decree } from '../../src/core/loop.js';

describe('playthrough integration', () => {
  it('脚本化跑 ~5 年不崩溃，且不变量始终成立', () => {
    const s = loadScenarioFromFile('content/scenario.json');
    const script: Array<Decree | null> = [
      { actionId: 'set_tax', params: { rate: 0.35 } },
      { actionId: 'hold_festival', params: {} },
      { actionId: 'build_irrigation', params: { provinceId: 'owari' } },
      null,
    ];
    let guard = 0;
    while (s.status === 'playing' && guard < 40) {
      advanceTurn(s, script[guard % script.length] ?? null);
      expect(s.clan.contentment).toBeGreaterThanOrEqual(0);
      expect(s.clan.contentment).toBeLessThanOrEqual(1);
      expect(s.clan.prestige).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(s.clan.koku)).toBe(true);
      expect(s.clan.koku).toBeGreaterThanOrEqual(0);
      guard++;
    }
    expect(['won', 'lost', 'playing']).toContain(s.status);
  });
  it('税率拉满且不安抚 → 最终判负', () => {
    const s = loadScenarioFromFile('content/scenario.json');
    let guard = 0;
    advanceTurn(s, { actionId: 'set_tax', params: { rate: 1 } });
    while (s.status === 'playing' && guard < 60) {
      advanceTurn(s, null);
      guard++;
    }
    expect(s.status).toBe('lost');
  });
});
