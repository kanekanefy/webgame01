import { describe, it, expect } from 'vitest';
import { RNG } from '../../src/core/rng.js';

describe('RNG', () => {
  it('相同种子产生相同序列', () => {
    const a = new RNG(123), b = new RNG(123);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });
  it('next 返回 [0,1)', () => {
    const r = new RNG(1);
    for (let i = 0; i < 100; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('int 返回闭区间内整数', () => {
    const r = new RNG(7);
    for (let i = 0; i < 100; i++) {
      const v = r.int(2, 5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
  it('getState/setState 可恢复序列', () => {
    const r = new RNG(42);
    r.next(); r.next();
    const s = r.getState();
    const after = [r.next(), r.next()];
    const r2 = new RNG(0);
    r2.setState(s);
    expect([r2.next(), r2.next()]).toEqual(after);
  });
});
