import { readFileSync } from 'node:fs';
import type { GameState, Province, Retainer, RivalClan, ClanStats } from './state.js';

export interface ScenarioData {
  startYear: number;
  goalYear: number;
  seed: number;
  taxRate: number;
  clan: ClanStats;
  provinces: Array<Omit<Province, never>>;
  retainers: Array<Omit<Retainer, 'memory'>>;
  rivals: RivalClan[];
}

export function buildState(data: ScenarioData): GameState {
  return {
    turn: 0,
    year: data.startYear,
    season: 'Spring',
    goalYear: data.goalYear,
    taxRate: data.taxRate,
    clan: { ...data.clan },
    provinces: data.provinces.map((p) => ({
      ...p,
      villages: p.villages.map((v) => ({ ...v })),
    })),
    retainers: data.retainers.map((r) => ({ ...r, traits: [...r.traits], memory: [] })),
    rivals: data.rivals.map((c) => ({ ...c })),
    rngState: data.seed,
    actionLog: [],
    status: 'playing',
  };
}

export function loadScenarioFromFile(path: string): GameState {
  const raw = readFileSync(path, 'utf-8');
  return buildState(JSON.parse(raw) as ScenarioData);
}
