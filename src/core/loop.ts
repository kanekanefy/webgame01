import type { GameState, Season } from './state.js';
import { RNG } from './rng.js';
import { runUpkeep, updateContentment, type UpkeepReport } from './economy.js';
import { resolveAction, type OutcomeFact, type ActionContext } from './actions/types.js';
import './actions/index.js'; // 触发动作注册（副作用导入）

export interface Decree {
  actionId: string;
  params: Record<string, unknown>;
}

export interface TurnReport {
  turn: number;
  year: number;
  season: Season;
  upkeep: UpkeepReport;
  issue: string;
  actionFacts: OutcomeFact[];
  events: OutcomeFact[];
  status: GameState['status'];
}

const SEASONS: Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const LOSE_CONTENTMENT = 0.1;
export const LOSE_PRESTIGE = 0.05;
const ISSUES = ['年贡', '边境', '家臣不和', '天候', '商贾'];

function pickIssue(rng: RNG): string {
  return ISSUES[rng.int(0, ISSUES.length - 1)]!;
}

function runEvents(state: GameState, rng: RNG): OutcomeFact[] {
  const facts: OutcomeFact[] = [];
  if (state.clan.contentment < 0.25 && rng.next() < 0.5) {
    state.clan.levy = Math.max(0, state.clan.levy - 10);
    facts.push({ kind: 'ikki', text: '一揆四起，损兵十' });
  }
  return facts;
}

function advanceCalendar(state: GameState): void {
  const idx = SEASONS.indexOf(state.season);
  if (idx === SEASONS.length - 1) {
    state.season = 'Spring';
    state.year += 1;
  } else {
    state.season = SEASONS[idx + 1]!;
  }
  state.turn += 1;
}

function checkWinLose(state: GameState): void {
  if (state.clan.contentment <= LOSE_CONTENTMENT || state.clan.prestige <= LOSE_PRESTIGE) {
    state.status = 'lost';
  } else if (state.year >= state.goalYear) {
    state.status = 'won';
  }
}

export function advanceTurn(state: GameState, decree: Decree | null): TurnReport {
  const rng = new RNG(state.rngState);
  const ctx: ActionContext = { rng };

  // 先检查初始状态是否已经失败（崩盘边界）
  checkWinLose(state);
  if (state.status !== 'playing') {
    return {
      turn: state.turn,
      year: state.year,
      season: state.season,
      upkeep: { produced: 0, consumed: 0, price: 0, net: 0, taxRevenue: 0, famine: false },
      issue: '',
      actionFacts: [],
      events: [],
      status: state.status,
    };
  }

  const upkeep = runUpkeep(state);
  updateContentment(state, upkeep.famine);
  const issue = pickIssue(rng);
  let actionFacts: OutcomeFact[] = [];
  if (decree) {
    const res = resolveAction(state, decree.actionId, decree.params, ctx);
    state.actionLog.push({ turn: state.turn, actionId: decree.actionId, params: decree.params });
    actionFacts = res.facts;
  }
  const events = runEvents(state, rng);
  advanceCalendar(state);
  checkWinLose(state);
  state.rngState = rng.getState();
  return {
    turn: state.turn,
    year: state.year,
    season: state.season,
    upkeep,
    issue,
    actionFacts,
    events,
    status: state.status,
  };
}
