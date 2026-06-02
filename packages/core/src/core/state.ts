export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';
export type GameStatus = 'playing' | 'won' | 'lost';

export interface Village {
  peasants: number;
}
export interface Province {
  id: string;
  name: string;
  villages: Village[];
  baseRiceOutput: number; // koku per peasant per year-equivalent
  fortification: number;
  garrison: number;
  productionMethod: 'basic' | 'irrigated';
}
export interface MemoryItem {
  turn: number;
  note: string;
}
export type Assignment = 'none' | 'war' | 'admin';

export interface Retainer {
  id: string;
  name: string;
  loyalty: number; // [0,1]
  ambition: number; // [0,1]
  skillAdmin: number; // [0,1]
  skillWar: number; // [0,1]
  traits: string[];
  role: string;
  memory: MemoryItem[];
  assignment: Assignment; // 领军/理政/闲置
  alive: boolean; // 谋反/战死后离场
}
export interface RivalClan {
  id: string;
  name: string;
  strength: number;
  disposition: number; // [0,1], 越高越友好
  atWar: boolean;
  allied: boolean; // disposition≥0.8 自动结盟
}
export interface ClanStats {
  koku: number;
  levy: number;
  contentment: number; // 民心 [0,1]
  prestige: number; // 威信 [0,1]
}
export interface ActionRecord {
  turn: number;
  actionId: string;
  params: Record<string, unknown>;
}
export interface GameState {
  turn: number;
  year: number;
  season: Season;
  goalYear: number; // 撑到该年开春即胜利
  taxRate: number; // [0,1]
  clan: ClanStats;
  provinces: Province[];
  retainers: Retainer[];
  rivals: RivalClan[];
  rngState: number;
  actionLog: ActionRecord[];
  status: GameStatus;
  // —— R4 世界丰富化 ——
  daimyoAge: number; // 家督年龄
  courtRank: number; // 官位 0..5
  fame: number; // 名声 [0,1]
  roninPool: Retainer[]; // 可招揽的浪人
}
