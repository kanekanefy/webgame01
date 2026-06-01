// 复用 core 的权威类型（type-only，零运行时依赖）。
import type { GameState, TurnReport, Decree } from '@sengoku/core';

export type { GameState, TurnReport, Decree };

/** POST /api/games/:id/turn 的统一响应。 */
export interface TurnResponse {
  report?: TurnReport;
  state?: GameState;
  intent?: string | null;
  rejected?: boolean;
  reason?: string;
  narrative?: string;
}

export interface NewGameResponse {
  gameId: string;
  state: GameState;
}

export type ActionId =
  | 'set_tax'
  | 'levy_troops'
  | 'build_irrigation'
  | 'hold_festival'
  | 'reward_retainer';
