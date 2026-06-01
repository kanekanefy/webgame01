import type { GameState } from './state.js';
import { advanceTurn, type Decree } from './loop.js';

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  return JSON.parse(json) as GameState;
}

// 从初始状态重放一串决策；RNG 确定性保证复现。返回新状态，不改入参。
export function replay(initial: GameState, decrees: Array<Decree | null>): GameState {
  const s = deserialize(serialize(initial));
  for (const d of decrees) {
    if (s.status !== 'playing') break;
    advanceTurn(s, d);
  }
  return s;
}
