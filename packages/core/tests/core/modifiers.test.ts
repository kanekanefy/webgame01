import { describe, it, expect } from 'vitest';
import { applyModifiers, type Modifier } from '../../src/core/modifiers.js';

describe('applyModifiers', () => {
  it('无修正返回 base', () => {
    expect(applyModifiers(100, [])).toBe(100);
  });
  it('叠加 additive 求和、multiplicative 连乘 (1+v)', () => {
    const mods: Modifier[] = [
      { source: 'a', type: 'add', value: 0.2 },
      { source: 'b', type: 'add', value: 0.1 },
      { source: 'c', type: 'mult', value: 0.5 },
    ];
    // 100 * (1 + 0.3) * (1 + 0.5) = 195
    expect(applyModifiers(100, mods)).toBeCloseTo(195, 6);
  });
});
