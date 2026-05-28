import { describe, it, expect } from 'vitest';
import { clamp01, clamp } from '../../src/core/util.js';

describe('clamp helpers', () => {
  it('clamp01 限制在 [0,1]', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(1.7)).toBe(1);
  });
  it('clamp 限制在任意区间', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});
