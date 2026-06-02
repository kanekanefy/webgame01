import { readFileSync } from 'node:fs';
import type { GameState, Province, Retainer, RivalClan, ClanStats } from './state.js';

type ScenarioRetainer = Omit<Retainer, 'memory' | 'assignment' | 'alive'> &
  Partial<Pick<Retainer, 'assignment' | 'alive'>>;
type ScenarioRival = Omit<RivalClan, 'atWar' | 'allied'> & Partial<Pick<RivalClan, 'atWar' | 'allied'>>;

export interface ScenarioData {
  startYear: number;
  goalYear: number;
  seed: number;
  taxRate: number;
  clan: ClanStats;
  provinces: Array<Omit<Province, never>>;
  retainers: ScenarioRetainer[];
  rivals: ScenarioRival[];
  // —— R4 可选字段（缺省有默认）——
  daimyoAge?: number;
  courtRank?: number;
  fame?: number;
  roninPool?: ScenarioRetainer[];
}

function toRetainer(r: ScenarioRetainer): Retainer {
  return {
    ...r,
    traits: [...r.traits],
    memory: [],
    assignment: r.assignment ?? 'none',
    alive: r.alive ?? true,
  };
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
    retainers: data.retainers.map(toRetainer),
    rivals: data.rivals.map((c) => ({
      ...c,
      atWar: c.atWar ?? false,
      allied: c.allied ?? c.disposition >= 0.8,
    })),
    rngState: data.seed,
    actionLog: [],
    status: 'playing',
    daimyoAge: data.daimyoAge ?? 26,
    courtRank: data.courtRank ?? 0,
    fame: data.fame ?? 0.3,
    roninPool: (data.roninPool ?? []).map(toRetainer),
  };
}

export function loadScenarioFromFile(path: string): GameState {
  const raw = readFileSync(path, 'utf-8');
  return buildState(JSON.parse(raw) as ScenarioData);
}
