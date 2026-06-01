import { create } from 'zustand';
import type { Decree, GameState, TurnReport } from './types';
import { apiNewGame, apiTurn } from './api';

interface LogEntry {
  id: number;
  turn: number;
  year: number;
  season: string;
  issue: string;
  intent?: string | null;
  facts: string[];
  events: string[];
  rejected?: boolean;
  reason?: string;
  narrative?: string;
}

interface GameStore {
  gameId: string | null;
  state: GameState | null;
  lastReport: TurnReport | null;
  log: LogEntry[];
  loading: boolean;
  error: string | null;
  /** 最近一次被拒绝的提示（自由文本不合时代/无法解析）。 */
  rejection: { reason: string; narrative?: string } | null;

  newGame: () => Promise<void>;
  advance: (decree: Decree | null) => Promise<void>;
  command: (text: string) => Promise<void>;
}

let logSeq = 1;

export const useGame = create<GameStore>((set, get) => ({
  gameId: null,
  state: null,
  lastReport: null,
  log: [],
  loading: false,
  error: null,
  rejection: null,

  async newGame() {
    set({ loading: true, error: null, rejection: null });
    try {
      const { gameId, state } = await apiNewGame();
      set({ gameId, state, lastReport: null, log: [], loading: false });
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
    }
  },

  async advance(decree) {
    const { gameId } = get();
    if (!gameId) return;
    set({ loading: true, error: null, rejection: null });
    try {
      const resp = await apiTurn(gameId, { decree });
      applyTurn(set, resp);
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
    }
  },

  async command(text) {
    const { gameId } = get();
    if (!gameId) return;
    set({ loading: true, error: null, rejection: null });
    try {
      const resp = await apiTurn(gameId, { command: text });
      applyTurn(set, resp, text);
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
    }
  },
}));

type SetFn = (partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)) => void;

function applyTurn(set: SetFn, resp: import('./types').TurnResponse, command?: string): void {
  if (resp.rejected) {
    set((s) => ({
      loading: false,
      rejection: { reason: resp.reason ?? '无法奉行', narrative: resp.narrative },
      log: [
        {
          id: logSeq++,
          turn: s.state?.turn ?? 0,
          year: s.state?.year ?? 0,
          season: s.state?.season ?? '',
          issue: '',
          intent: command ? `（驳回）${command}` : '（驳回）',
          facts: [],
          events: [],
          rejected: true,
          reason: resp.reason,
          narrative: resp.narrative,
        },
        ...s.log,
      ],
    }));
    return;
  }
  const report = resp.report!;
  const state = resp.state!;
  set((s) => ({
    loading: false,
    state,
    lastReport: report,
    log: [
      {
        id: logSeq++,
        turn: report.turn,
        year: report.year,
        season: report.season,
        issue: report.issue,
        intent: resp.intent,
        facts: report.actionFacts.map((f) => f.text),
        events: report.events.map((f) => f.text),
      },
      ...s.log,
    ],
  }));
}
