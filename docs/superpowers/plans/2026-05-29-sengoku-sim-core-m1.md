# 战国仿真核心 (M1) 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建纯确定性的战国大名仿真核心（无 LLM、无 UI），可在命令行跑完整局、可输赢、可复现。

**Architecture:** 纯函数式 TypeScript 核心，唯一真相来源。种子化 RNG 保证确定性；状态只能通过已注册动作（action catalog）修改；季节制回合循环；轻量稻米经济（供需市场结算）。对应设计文档 §4、§9、§10、里程碑 M1。

**Tech Stack:** TypeScript (ESM, strict) · Vitest (测试) · tsx (运行) · npm

参考 spec：`docs/superpowers/specs/2026-05-29-sengoku-ai-sim-design.md`

---

## 文件结构

```
package.json, tsconfig.json, vitest.config.ts   项目脚手架
src/core/util.ts          clamp01 等纯工具
src/core/rng.ts           确定性 RNG (mulberry32)
src/core/modifiers.ts     修正栈 base×(1+Σadd)×Π(1+mult)
src/core/state.ts         GameState 及所有实体类型
src/core/scenario.ts      ScenarioData → GameState (buildState / loadScenarioFromFile)
src/core/economy.ts       产出/消耗/市场结算/民心
src/core/actions/types.ts ActionDef 接口 + registry + resolveAction
src/core/actions/index.ts 注册全部 MVP 动作
src/core/loop.ts          advanceTurn 回合循环 + 胜负判定
src/core/save.ts          serialize/deserialize/replay
src/headless.ts           命令行运行器（脚本化跑一局）
content/scenario.json     初始局面数据
tests/...                 与被测文件对应
```

每个文件单一职责，可独立持有于上下文中、独立测试。

---

## Task 1: 项目脚手架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/core/util.ts`
- Test: `tests/core/util.test.ts`

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "sengoku-sim",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "headless": "tsx src/headless.ts"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noUncheckedIndexedAccess": true,
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: 写 vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: 安装依赖**

Run: `npm install`
Expected: 依赖装好，生成 `node_modules` 与 `package-lock.json`，无报错。

- [ ] **Step 5: 写 util 的失败测试**

`tests/core/util.test.ts`:
```ts
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
```

- [ ] **Step 6: 运行，确认失败**

Run: `npx vitest run tests/core/util.test.ts`
Expected: FAIL（`src/core/util.ts` 不存在 / 导出未定义）。

- [ ] **Step 7: 写实现**

`src/core/util.ts`:
```ts
export function clamp(x: number, min: number, max: number): number {
  return Math.min(Math.max(x, min), max);
}

export function clamp01(x: number): number {
  return clamp(x, 0, 1);
}
```

- [ ] **Step 8: 运行，确认通过**

Run: `npx vitest run tests/core/util.test.ts`
Expected: PASS（2 passed）。

- [ ] **Step 9: 提交**

```bash
git add package.json tsconfig.json vitest.config.ts src/core/util.ts tests/core/util.test.ts package-lock.json
git commit -m "chore: scaffold sengoku-sim project with vitest + clamp utils"
```

---

## Task 2: 确定性 RNG

**Files:**
- Create: `src/core/rng.ts`
- Test: `tests/core/rng.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/core/rng.test.ts`:
```ts
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
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run tests/core/rng.test.ts`
Expected: FAIL（`RNG` 未定义）。

- [ ] **Step 3: 写实现**

`src/core/rng.ts`:
```ts
// mulberry32：单 32-bit 状态，确定性、可序列化。
export class RNG {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  getState(): number {
    return this.state >>> 0;
  }
  setState(s: number): void {
    this.state = s >>> 0;
  }
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npx vitest run tests/core/rng.test.ts`
Expected: PASS（4 passed）。

- [ ] **Step 5: 提交**

```bash
git add src/core/rng.ts tests/core/rng.test.ts
git commit -m "feat: deterministic mulberry32 RNG with serializable state"
```

---

## Task 3: 修正栈 (Modifier Stack)

**Files:**
- Create: `src/core/modifiers.ts`
- Test: `tests/core/modifiers.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/core/modifiers.test.ts`:
```ts
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
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run tests/core/modifiers.test.ts`
Expected: FAIL（`applyModifiers` 未定义）。

- [ ] **Step 3: 写实现**

`src/core/modifiers.ts`:
```ts
export interface Modifier {
  source: string;
  type: 'add' | 'mult';
  value: number;
}

export function applyModifiers(base: number, mods: Modifier[]): number {
  const add = mods.filter((m) => m.type === 'add').reduce((s, m) => s + m.value, 0);
  const mult = mods
    .filter((m) => m.type === 'mult')
    .reduce((p, m) => p * (1 + m.value), 1);
  return base * (1 + add) * mult;
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npx vitest run tests/core/modifiers.test.ts`
Expected: PASS（2 passed）。

- [ ] **Step 5: 提交**

```bash
git add src/core/modifiers.ts tests/core/modifiers.test.ts
git commit -m "feat: modifier stack base*(1+sum add)*(prod 1+mult)"
```

---

## Task 4: 状态类型与场景加载

**Files:**
- Create: `src/core/state.ts`
- Create: `src/core/scenario.ts`
- Create: `content/scenario.json`
- Test: `tests/core/scenario.test.ts`

- [ ] **Step 1: 写状态类型**

`src/core/state.ts`:
```ts
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
}
export interface RivalClan {
  id: string;
  name: string;
  strength: number;
  disposition: number; // [0,1], 越高越友好
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
}
```

- [ ] **Step 2: 写场景加载的失败测试**

`tests/core/scenario.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildState, type ScenarioData } from '../../src/core/scenario.js';

const minimal: ScenarioData = {
  startYear: 1560,
  goalYear: 1565,
  seed: 99,
  taxRate: 0.3,
  clan: { koku: 100, levy: 50, contentment: 0.6, prestige: 0.5 },
  provinces: [
    { id: 'p1', name: 'Owari', villages: [{ peasants: 1000 }], baseRiceOutput: 0.02, fortification: 2, garrison: 30, productionMethod: 'basic' },
  ],
  retainers: [
    { id: 'r1', name: 'Toshiie', loyalty: 0.7, ambition: 0.4, skillAdmin: 0.5, skillWar: 0.8, traits: ['brave'], role: 'general' },
  ],
  rivals: [{ id: 'c1', name: 'Imagawa', strength: 200, disposition: 0.2 }],
};

describe('buildState', () => {
  it('把场景数据映射为初始 GameState', () => {
    const s = buildState(minimal);
    expect(s.year).toBe(1560);
    expect(s.season).toBe('Spring');
    expect(s.turn).toBe(0);
    expect(s.goalYear).toBe(1565);
    expect(s.rngState).toBe(99);
    expect(s.status).toBe('playing');
    expect(s.clan.koku).toBe(100);
    expect(s.provinces[0]!.productionMethod).toBe('basic');
    expect(s.retainers[0]!.memory).toEqual([]);
    expect(s.actionLog).toEqual([]);
  });
  it('深拷贝场景，不共享引用', () => {
    const s = buildState(minimal);
    s.provinces[0]!.villages[0]!.peasants = 0;
    expect(minimal.provinces[0]!.villages[0]!.peasants).toBe(1000);
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `npx vitest run tests/core/scenario.test.ts`
Expected: FAIL（`buildState` 未定义）。

- [ ] **Step 4: 写场景加载实现**

`src/core/scenario.ts`:
```ts
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
```

- [ ] **Step 5: 写 content/scenario.json**

`content/scenario.json`:
```json
{
  "startYear": 1560,
  "goalYear": 1565,
  "seed": 20260529,
  "taxRate": 0.3,
  "clan": { "koku": 500, "levy": 120, "contentment": 0.6, "prestige": 0.5 },
  "provinces": [
    { "id": "owari", "name": "尾張", "villages": [{ "peasants": 4000 }, { "peasants": 3000 }], "baseRiceOutput": 0.03, "fortification": 2, "garrison": 60, "productionMethod": "basic" },
    { "id": "mino", "name": "美濃", "villages": [{ "peasants": 3500 }], "baseRiceOutput": 0.03, "fortification": 1, "garrison": 40, "productionMethod": "basic" },
    { "id": "ise", "name": "伊勢", "villages": [{ "peasants": 2500 }], "baseRiceOutput": 0.028, "fortification": 1, "garrison": 30, "productionMethod": "basic" }
  ],
  "retainers": [
    { "id": "katsuie", "name": "柴田勝家", "loyalty": 0.75, "ambition": 0.4, "skillAdmin": 0.4, "skillWar": 0.85, "traits": ["勇猛", "刚直"], "role": "侍大将" },
    { "id": "hideyoshi", "name": "木下藤吉郎", "loyalty": 0.6, "ambition": 0.9, "skillAdmin": 0.85, "skillWar": 0.6, "traits": ["机敏", "野心"], "role": "奉行" },
    { "id": "toshiie", "name": "前田利家", "loyalty": 0.8, "ambition": 0.5, "skillAdmin": 0.5, "skillWar": 0.75, "traits": ["忠义"], "role": "侍大将" },
    { "id": "nobumori", "name": "佐久間信盛", "loyalty": 0.65, "ambition": 0.5, "skillAdmin": 0.6, "skillWar": 0.6, "traits": ["谨慎"], "role": "宿老" },
    { "id": "mitsuhide", "name": "明智光秀", "loyalty": 0.55, "ambition": 0.7, "skillAdmin": 0.8, "skillWar": 0.7, "traits": ["博学", "孤高"], "role": "右筆" }
  ],
  "rivals": [
    { "id": "imagawa", "name": "今川", "strength": 450, "disposition": 0.15 },
    { "id": "saito", "name": "斎藤", "strength": 220, "disposition": 0.3 },
    { "id": "asai", "name": "浅井", "strength": 180, "disposition": 0.45 }
  ]
}
```

- [ ] **Step 6: 运行，确认通过**

Run: `npx vitest run tests/core/scenario.test.ts`
Expected: PASS（2 passed）。

- [ ] **Step 7: 提交**

```bash
git add src/core/state.ts src/core/scenario.ts content/scenario.json tests/core/scenario.test.ts
git commit -m "feat: game state types + scenario loader + Sengoku starting scenario"
```

---

## Task 5: 轻量经济（产出/消耗/市场/民心）

**Files:**
- Create: `src/core/economy.ts`
- Test: `tests/core/economy.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/core/economy.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  provinceRiceOutput, totalPeasants, clearMarket, runUpkeep,
  BASE_RICE_PRICE,
} from '../../src/core/economy.js';
import { buildState, type ScenarioData } from '../../src/core/scenario.js';

const scen: ScenarioData = {
  startYear: 1560, goalYear: 1565, seed: 1, taxRate: 0.3,
  clan: { koku: 100, levy: 100, contentment: 0.6, prestige: 0.5 },
  provinces: [
    { id: 'p1', name: 'A', villages: [{ peasants: 1000 }], baseRiceOutput: 0.03, fortification: 1, garrison: 10, productionMethod: 'basic' },
  ],
  retainers: [], rivals: [],
};

describe('economy', () => {
  it('provinceRiceOutput = 人口*baseRiceOutput*method倍率', () => {
    const s = buildState(scen);
    expect(provinceRiceOutput(s.provinces[0]!)).toBeCloseTo(1000 * 0.03 * 1.0, 6);
  });
  it('irrigated 提升产出 1.5x', () => {
    const s = buildState(scen);
    s.provinces[0]!.productionMethod = 'irrigated';
    expect(provinceRiceOutput(s.provinces[0]!)).toBeCloseTo(1000 * 0.03 * 1.5, 6);
  });
  it('totalPeasants 求和所有村落', () => {
    const s = buildState(scen);
    expect(totalPeasants(s)).toBe(1000);
  });
  it('clearMarket 价格被钳制在 [0.25,1.75]×base', () => {
    expect(clearMarket(1, 100)).toBeCloseTo(1.75 * BASE_RICE_PRICE, 6); // 需求远超供给→封顶
    expect(clearMarket(100, 1)).toBeCloseTo(0.25 * BASE_RICE_PRICE, 6); // 供给远超需求→封底
    expect(clearMarket(0, 5)).toBeCloseTo(1.75 * BASE_RICE_PRICE, 6); // 供给为0
  });
  it('runUpkeep 盈余时增加 koku', () => {
    const s = buildState(scen);
    const before = s.clan.koku;
    const r = runUpkeep(s);
    expect(r.produced).toBeGreaterThan(0);
    expect(typeof r.price).toBe('number');
    // Autumn 之外 seasonFactor=0.25；net 可能为负，这里只断言 koku 因 net*price 改变
    expect(s.clan.koku).toBeCloseTo(before + r.net * r.price, 6);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run tests/core/economy.test.ts`
Expected: FAIL（economy 导出未定义）。

- [ ] **Step 3: 写实现**

`src/core/economy.ts`:
```ts
import type { GameState, Province, Season } from './state.js';

export const FOOD_PER_PEASANT = 0.008; // 每农民每季消耗（koku-rice）
export const FOOD_PER_SOLDIER = 0.04; // 每兵每季消耗
export const BASE_RICE_PRICE = 1; // 每单位稻米基准价（koku）
export const TAX_PER_PEASANT = 0.004; // 满税时每农民贡献的 koku

export function methodMultiplier(method: Province['productionMethod']): number {
  return method === 'irrigated' ? 1.5 : 1.0;
}

export function provinceRiceOutput(p: Province): number {
  const peasants = p.villages.reduce((s, v) => s + v.peasants, 0);
  return peasants * p.baseRiceOutput * methodMultiplier(p.productionMethod);
}

export function totalPeasants(state: GameState): number {
  return state.provinces.reduce(
    (s, p) => s + p.villages.reduce((a, v) => a + v.peasants, 0),
    0,
  );
}

export function seasonFactor(season: Season): number {
  return season === 'Autumn' ? 1.0 : 0.25;
}

// 供需比决定价格：需求/供给越高价越贵，钳制在 [0.25,1.75]×base
export function clearMarket(supply: number, demand: number, basePrice = BASE_RICE_PRICE): number {
  const ratio = supply <= 0 ? 1.75 : demand / supply;
  return Math.min(Math.max(basePrice * ratio, 0.25 * basePrice), 1.75 * basePrice);
}

export interface UpkeepReport {
  produced: number;
  consumed: number;
  price: number;
  net: number;
  taxRevenue: number;
  famine: boolean;
}

// UPKEEP 阶段：产出-消耗按市场价折算进 koku，并收税。
export function runUpkeep(state: GameState): UpkeepReport {
  const factor = seasonFactor(state.season);
  const produced = state.provinces.reduce((s, p) => s + provinceRiceOutput(p), 0) * factor;
  const peasants = totalPeasants(state);
  const consumed = peasants * FOOD_PER_PEASANT + state.clan.levy * FOOD_PER_SOLDIER;
  const price = clearMarket(produced, consumed);
  const net = produced - consumed;
  const taxRevenue = peasants * TAX_PER_PEASANT * state.taxRate * factor;
  state.clan.koku += net * price + taxRevenue;
  const famine = state.clan.koku < 0;
  if (famine) state.clan.koku = 0;
  return { produced, consumed, price, net, taxRevenue, famine };
}
```

注意：上面 Step 1 的最后一个断言只比较 `net * r.price`，而实现里 koku 还加了 `taxRevenue`。**修正测试**——把该断言改为：
```ts
    expect(s.clan.koku).toBeCloseTo(before + r.net * r.price + r.taxRevenue, 6);
```
（在 Step 1 写测试时直接按这一行写；此处显式说明以免类型/数值不一致。）

- [ ] **Step 4: 运行，确认通过**

Run: `npx vitest run tests/core/economy.test.ts`
Expected: PASS（5 passed）。

- [ ] **Step 5: 提交**

```bash
git add src/core/economy.ts tests/core/economy.test.ts
git commit -m "feat: light koku economy with supply/demand market clearing"
```

---

## Task 6: 民心更新

**Files:**
- Modify: `src/core/economy.ts`（追加 `updateContentment`）
- Test: `tests/core/contentment.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/core/contentment.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { updateContentment, targetContentment } from '../../src/core/economy.js';
import { buildState, type ScenarioData } from '../../src/core/scenario.js';

const scen: ScenarioData = {
  startYear: 1560, goalYear: 1565, seed: 1, taxRate: 0.3,
  clan: { koku: 100, levy: 100, contentment: 0.6, prestige: 0.5 },
  provinces: [{ id: 'p1', name: 'A', villages: [{ peasants: 1000 }], baseRiceOutput: 0.03, fortification: 1, garrison: 10, productionMethod: 'basic' }],
  retainers: [], rivals: [],
};

describe('contentment', () => {
  it('高税降低目标民心', () => {
    const s = buildState(scen);
    s.taxRate = 0.8;
    const hi = targetContentment(s, false);
    s.taxRate = 0.1;
    const lo = targetContentment(s, false);
    expect(lo).toBeGreaterThan(hi);
  });
  it('饥荒进一步降低目标民心', () => {
    const s = buildState(scen);
    expect(targetContentment(s, true)).toBeLessThan(targetContentment(s, false));
  });
  it('民心朝目标缓慢漂移而非瞬变', () => {
    const s = buildState(scen);
    s.clan.contentment = 0.6;
    s.taxRate = 0.9; // 目标会明显低于 0.6
    const target = targetContentment(s, false);
    updateContentment(s, false);
    expect(s.clan.contentment).toBeLessThan(0.6);
    expect(s.clan.contentment).toBeGreaterThan(target); // 一步没到位
  });
  it('民心始终在 [0,1]', () => {
    const s = buildState(scen);
    s.clan.contentment = 0.05;
    s.taxRate = 1;
    for (let i = 0; i < 50; i++) updateContentment(s, true);
    expect(s.clan.contentment).toBeGreaterThanOrEqual(0);
    expect(s.clan.contentment).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run tests/core/contentment.test.ts`
Expected: FAIL（`updateContentment`/`targetContentment` 未定义）。

- [ ] **Step 3: 追加实现到 `src/core/economy.ts` 末尾**

```ts
import { clamp01 } from './util.js';

export const TAX_DISCONTENT = 0.5; // 税率对民心的压制系数
export const FAMINE_PENALTY = 0.2;
export const CONTENTMENT_DRIFT = 0.34; // 每季向目标漂移的比例

export function targetContentment(state: GameState, famine: boolean): number {
  let t = 0.65 - state.taxRate * TAX_DISCONTENT;
  if (famine) t -= FAMINE_PENALTY;
  return clamp01(t);
}

export function updateContentment(state: GameState, famine: boolean): void {
  const target = targetContentment(state, famine);
  const next = state.clan.contentment + (target - state.clan.contentment) * CONTENTMENT_DRIFT;
  state.clan.contentment = clamp01(next);
}
```
（`import { clamp01 }` 若与文件已有 import 重复，合并到顶部既有 import 区；保持单次导入。）

- [ ] **Step 4: 运行，确认通过**

Run: `npx vitest run tests/core/contentment.test.ts`
Expected: PASS（4 passed）。

- [ ] **Step 5: 提交**

```bash
git add src/core/economy.ts tests/core/contentment.test.ts
git commit -m "feat: contentment drift driven by tax burden and famine"
```

---

## Task 7: 动作目录 (Action Catalog)

**Files:**
- Create: `src/core/actions/types.ts`
- Create: `src/core/actions/index.ts`
- Test: `tests/core/actions.test.ts`

- [ ] **Step 1: 写动作接口与注册表**

`src/core/actions/types.ts`:
```ts
import type { GameState } from '../state.js';
import type { RNG } from '../rng.js';

export interface OutcomeFact {
  kind: string;
  text: string;
  data?: Record<string, unknown>;
}
export interface ActionResult {
  facts: OutcomeFact[];
}
export interface ActionContext {
  rng: RNG;
}
export interface PreconditionResult {
  ok: boolean;
  reason?: string;
}
export interface ActionDef {
  id: string;
  preconditions(state: GameState, params: Record<string, unknown>): PreconditionResult;
  apply(state: GameState, params: Record<string, unknown>, ctx: ActionContext): ActionResult;
}

const registry = new Map<string, ActionDef>();
export function registerAction(def: ActionDef): void {
  registry.set(def.id, def);
}
export function getAction(id: string): ActionDef | undefined {
  return registry.get(id);
}
export function listActionIds(): string[] {
  return [...registry.keys()];
}
export function resolveAction(
  state: GameState,
  id: string,
  params: Record<string, unknown>,
  ctx: ActionContext,
): ActionResult {
  const def = getAction(id);
  if (!def) return { facts: [{ kind: 'error', text: `unknown action ${id}` }] };
  const pre = def.preconditions(state, params);
  if (!pre.ok) return { facts: [{ kind: 'rejected', text: pre.reason ?? 'precondition failed' }] };
  return def.apply(state, params, ctx);
}
```

- [ ] **Step 2: 写动作集的失败测试**

`tests/core/actions.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { resolveAction, listActionIds, type ActionContext } from '../../src/core/actions/types.js';
import { RNG } from '../../src/core/rng.js';
import { buildState, type ScenarioData } from '../../src/core/scenario.js';

const scen: ScenarioData = {
  startYear: 1560, goalYear: 1565, seed: 1, taxRate: 0.3,
  clan: { koku: 500, levy: 100, contentment: 0.6, prestige: 0.5 },
  provinces: [{ id: 'p1', name: 'A', villages: [{ peasants: 1000 }], baseRiceOutput: 0.03, fortification: 1, garrison: 10, productionMethod: 'basic' }],
  retainers: [{ id: 'r1', name: 'X', loyalty: 0.5, ambition: 0.5, skillAdmin: 0.5, skillWar: 0.5, traits: [], role: 'g' }],
  rivals: [],
};
const ctx = (): ActionContext => ({ rng: new RNG(1) });

beforeAll(async () => { await import('../../src/core/actions/index.js'); });

describe('action catalog', () => {
  it('注册了全部 MVP 动作', () => {
    expect(listActionIds().sort()).toEqual(
      ['build_irrigation', 'hold_festival', 'levy_troops', 'reward_retainer', 'set_tax'].sort(),
    );
  });
  it('set_tax 改变税率', () => {
    const s = buildState(scen);
    resolveAction(s, 'set_tax', { rate: 0.55 }, ctx());
    expect(s.taxRate).toBeCloseTo(0.55, 6);
  });
  it('levy_troops 扣 koku 加 levy', () => {
    const s = buildState(scen);
    const r = resolveAction(s, 'levy_troops', { amount: 30 }, ctx());
    expect(r.facts[0]!.kind).toBe('levy');
    expect(s.clan.levy).toBe(130);
    expect(s.clan.koku).toBe(500 - 30 * 2);
  });
  it('koku 不足时 levy_troops 被拒、状态不变', () => {
    const s = buildState(scen);
    s.clan.koku = 10;
    const r = resolveAction(s, 'levy_troops', { amount: 30 }, ctx());
    expect(r.facts[0]!.kind).toBe('rejected');
    expect(s.clan.levy).toBe(100);
    expect(s.clan.koku).toBe(10);
  });
  it('build_irrigation 切换 productionMethod', () => {
    const s = buildState(scen);
    resolveAction(s, 'build_irrigation', { provinceId: 'p1' }, ctx());
    expect(s.provinces[0]!.productionMethod).toBe('irrigated');
  });
  it('hold_festival 提升民心、reward_retainer 提升忠诚', () => {
    const s = buildState(scen);
    resolveAction(s, 'hold_festival', {}, ctx());
    expect(s.clan.contentment).toBeGreaterThan(0.6);
    resolveAction(s, 'reward_retainer', { retainerId: 'r1' }, ctx());
    expect(s.retainers[0]!.loyalty).toBeGreaterThan(0.5);
  });
  it('未知动作返回 error', () => {
    const s = buildState(scen);
    const r = resolveAction(s, 'cast_nuke', {}, ctx());
    expect(r.facts[0]!.kind).toBe('error');
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `npx vitest run tests/core/actions.test.ts`
Expected: FAIL（`src/core/actions/index.js` 未注册任何动作 / 文件不存在）。

- [ ] **Step 4: 写动作实现**

`src/core/actions/index.ts`:
```ts
import { clamp01 } from '../util.js';
import { registerAction } from './types.js';

export const COST_PER_LEVY = 2; // koku/兵
export const FESTIVAL_COST = 50;
export const REWARD_COST = 40;
export const IRRIGATION_COST = 120;

registerAction({
  id: 'set_tax',
  preconditions: (_s, p) =>
    typeof p.rate === 'number' && p.rate >= 0 && p.rate <= 1
      ? { ok: true }
      : { ok: false, reason: 'rate must be 0..1' },
  apply: (s, p) => {
    s.taxRate = clamp01(p.rate as number);
    return { facts: [{ kind: 'tax_set', text: `税率定为 ${(s.taxRate * 100).toFixed(0)}%` }] };
  },
});

registerAction({
  id: 'levy_troops',
  preconditions: (s, p) => {
    const n = p.amount;
    if (typeof n !== 'number' || n <= 0) return { ok: false, reason: 'amount must be > 0' };
    if (s.clan.koku < n * COST_PER_LEVY) return { ok: false, reason: '国库不足以征兵' };
    return { ok: true };
  },
  apply: (s, p) => {
    const n = p.amount as number;
    s.clan.koku -= n * COST_PER_LEVY;
    s.clan.levy += n;
    s.clan.contentment = clamp01(s.clan.contentment - 0.03);
    return { facts: [{ kind: 'levy', text: `征募 ${n} 兵`, data: { amount: n } }] };
  },
});

registerAction({
  id: 'build_irrigation',
  preconditions: (s, p) => {
    const prov = s.provinces.find((x) => x.id === p.provinceId);
    if (!prov) return { ok: false, reason: '无此领国' };
    if (prov.productionMethod === 'irrigated') return { ok: false, reason: '已修水利' };
    if (s.clan.koku < IRRIGATION_COST) return { ok: false, reason: '国库不足' };
    return { ok: true };
  },
  apply: (s, p) => {
    const prov = s.provinces.find((x) => x.id === p.provinceId)!;
    s.clan.koku -= IRRIGATION_COST;
    prov.productionMethod = 'irrigated';
    return { facts: [{ kind: 'irrigation', text: `${prov.name} 修筑水利`, data: { provinceId: prov.id } }] };
  },
});

registerAction({
  id: 'hold_festival',
  preconditions: (s) =>
    s.clan.koku >= FESTIVAL_COST ? { ok: true } : { ok: false, reason: '国库不足' },
  apply: (s) => {
    s.clan.koku -= FESTIVAL_COST;
    s.clan.contentment = clamp01(s.clan.contentment + 0.08);
    s.clan.prestige = clamp01(s.clan.prestige + 0.02);
    return { facts: [{ kind: 'festival', text: '举办祭典，民心稍安' }] };
  },
});

registerAction({
  id: 'reward_retainer',
  preconditions: (s, p) => {
    const r = s.retainers.find((x) => x.id === p.retainerId);
    if (!r) return { ok: false, reason: '无此家臣' };
    if (s.clan.koku < REWARD_COST) return { ok: false, reason: '国库不足' };
    return { ok: true };
  },
  apply: (s, p) => {
    const r = s.retainers.find((x) => x.id === p.retainerId)!;
    s.clan.koku -= REWARD_COST;
    r.loyalty = clamp01(r.loyalty + 0.1);
    s.clan.prestige = clamp01(s.clan.prestige + 0.03);
    return { facts: [{ kind: 'reward', text: `赏赐 ${r.name}，忠诚提升`, data: { retainerId: r.id } }] };
  },
});
```

- [ ] **Step 5: 运行，确认通过**

Run: `npx vitest run tests/core/actions.test.ts`
Expected: PASS（7 passed）。

- [ ] **Step 6: 提交**

```bash
git add src/core/actions/types.ts src/core/actions/index.ts tests/core/actions.test.ts
git commit -m "feat: action catalog + 5 period-valid daimyo actions"
```

---

## Task 8: 回合循环

**Files:**
- Create: `src/core/loop.ts`
- Test: `tests/core/loop.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/core/loop.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { advanceTurn, LOSE_CONTENTMENT, type Decree } from '../../src/core/loop.js';
import { buildState, type ScenarioData } from '../../src/core/scenario.js';

const scen: ScenarioData = {
  startYear: 1560, goalYear: 1561, seed: 5, taxRate: 0.3,
  clan: { koku: 500, levy: 100, contentment: 0.6, prestige: 0.5 },
  provinces: [{ id: 'p1', name: 'A', villages: [{ peasants: 5000 }], baseRiceOutput: 0.03, fortification: 1, garrison: 10, productionMethod: 'basic' }],
  retainers: [], rivals: [],
};

describe('advanceTurn', () => {
  it('推进日历：四季轮转、跨年、turn 递增', () => {
    const s = buildState(scen);
    advanceTurn(s, null); // Spring -> Summer
    expect(s.season).toBe('Summer');
    expect(s.turn).toBe(1);
    advanceTurn(s, null); advanceTurn(s, null); // -> Autumn -> Winter
    advanceTurn(s, null); // Winter -> Spring，跨年
    expect(s.season).toBe('Spring');
    expect(s.year).toBe(1561);
  });
  it('decree 被记入 actionLog 且生效', () => {
    const s = buildState(scen);
    const d: Decree = { actionId: 'set_tax', params: { rate: 0.5 } };
    advanceTurn(s, d);
    expect(s.taxRate).toBeCloseTo(0.5, 6);
    expect(s.actionLog).toHaveLength(1);
    expect(s.actionLog[0]!.actionId).toBe('set_tax');
  });
  it('确定性：同初始 + 同决策序列 → 同终态', () => {
    const a = buildState(scen), b = buildState(scen);
    const seq: Array<Decree | null> = [{ actionId: 'hold_festival', params: {} }, null, { actionId: 'levy_troops', params: { amount: 20 } }];
    for (const d of seq) advanceTurn(a, d);
    for (const d of seq) advanceTurn(b, d);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('民心崩盘 → 判负', () => {
    const s = buildState(scen);
    s.clan.contentment = LOSE_CONTENTMENT; // 已在阈值
    advanceTurn(s, null);
    expect(s.status).toBe('lost');
  });
  it('撑到 goalYear → 判胜', () => {
    const s = buildState({ ...scen, goalYear: 1560 });
    // 跑满一年回到 Spring 时 year 已 >= goalYear
    for (let i = 0; i < 4; i++) advanceTurn(s, { actionId: 'hold_festival', params: {} });
    expect(s.status).toBe('won');
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run tests/core/loop.test.ts`
Expected: FAIL（`advanceTurn` 未定义）。

- [ ] **Step 3: 写实现**

`src/core/loop.ts`:
```ts
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
```

- [ ] **Step 4: 运行，确认通过**

Run: `npx vitest run tests/core/loop.test.ts`
Expected: PASS（5 passed）。

- [ ] **Step 5: 提交**

```bash
git add src/core/loop.ts tests/core/loop.test.ts
git commit -m "feat: seasonal turn loop with upkeep, events, win/lose"
```

---
## Task 9: 存档 / 复现

**Files:**
- Create: `src/core/save.ts`
- Test: `tests/core/save.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/core/save.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { serialize, deserialize, replay } from '../../src/core/save.js';
import { advanceTurn, type Decree } from '../../src/core/loop.js';
import { buildState, type ScenarioData } from '../../src/core/scenario.js';

const scen: ScenarioData = {
  startYear: 1560, goalYear: 1565, seed: 5, taxRate: 0.3,
  clan: { koku: 500, levy: 100, contentment: 0.6, prestige: 0.5 },
  provinces: [{ id: 'p1', name: 'A', villages: [{ peasants: 5000 }], baseRiceOutput: 0.03, fortification: 1, garrison: 10, productionMethod: 'basic' }],
  retainers: [], rivals: [],
};
const seq: Array<Decree | null> = [
  { actionId: 'set_tax', params: { rate: 0.4 } },
  { actionId: 'hold_festival', params: {} },
  null,
  { actionId: 'levy_troops', params: { amount: 20 } },
];

describe('save & replay', () => {
  it('serialize→deserialize 往返相等', () => {
    const s = buildState(scen);
    advanceTurn(s, seq[0]!);
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it('replay 从初始 + 决策序列复现直接推进的终态', () => {
    const direct = buildState(scen);
    for (const d of seq) advanceTurn(direct, d);
    const replayed = replay(buildState(scen), seq);
    expect(serialize(replayed)).toBe(serialize(direct));
  });
  it('replay 不修改传入的初始状态', () => {
    const initial = buildState(scen);
    const snapshot = serialize(initial);
    replay(initial, seq);
    expect(serialize(initial)).toBe(snapshot);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run tests/core/save.test.ts`
Expected: FAIL（save 导出未定义）。

- [ ] **Step 3: 写实现**

`src/core/save.ts`:
```ts
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
```

- [ ] **Step 4: 运行，确认通过**

Run: `npx vitest run tests/core/save.test.ts`
Expected: PASS（3 passed）。

- [ ] **Step 5: 提交**

```bash
git add src/core/save.ts tests/core/save.test.ts
git commit -m "feat: save serialization + deterministic replay"
```

---

## Task 10: 命令行 playthrough + 集成测试

**Files:**
- Create: `src/headless.ts`
- Test: `tests/integration/playthrough.test.ts`

- [ ] **Step 1: 写集成测试（不变量 + 终局可达）**

`tests/integration/playthrough.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { loadScenarioFromFile } from '../../src/core/scenario.js';
import { advanceTurn, type Decree } from '../../src/core/loop.js';

describe('playthrough integration', () => {
  it('脚本化跑 ~5 年不崩溃，且不变量始终成立', () => {
    const s = loadScenarioFromFile('content/scenario.json');
    const script: Array<Decree | null> = [
      { actionId: 'set_tax', params: { rate: 0.35 } },
      { actionId: 'hold_festival', params: {} },
      { actionId: 'build_irrigation', params: { provinceId: 'owari' } },
      null,
    ];
    let guard = 0;
    while (s.status === 'playing' && guard < 40) {
      advanceTurn(s, script[guard % script.length] ?? null);
      expect(s.clan.contentment).toBeGreaterThanOrEqual(0);
      expect(s.clan.contentment).toBeLessThanOrEqual(1);
      expect(s.clan.prestige).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(s.clan.koku)).toBe(true);
      expect(s.clan.koku).toBeGreaterThanOrEqual(0);
      guard++;
    }
    expect(['won', 'lost', 'playing']).toContain(s.status);
  });
  it('税率拉满且不安抚 → 最终判负', () => {
    const s = loadScenarioFromFile('content/scenario.json');
    let guard = 0;
    advanceTurn(s, { actionId: 'set_tax', params: { rate: 1 } });
    while (s.status === 'playing' && guard < 60) {
      advanceTurn(s, null);
      guard++;
    }
    expect(s.status).toBe('lost');
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run tests/integration/playthrough.test.ts`
Expected: FAIL（`content/scenario.json` 已存在，但若 `owari` 不在场景或路径问题会失败；主要因 headless 尚未建、且需确认胜负逻辑。先确认失败原因为断言或文件，再进入实现/调参）。

- [ ] **Step 3: 写命令行运行器**

`src/headless.ts`:
```ts
import { loadScenarioFromFile } from './core/scenario.js';
import { advanceTurn, type Decree } from './core/loop.js';

const state = loadScenarioFromFile('content/scenario.json');
const script: Array<Decree | null> = [
  { actionId: 'set_tax', params: { rate: 0.35 } },
  { actionId: 'hold_festival', params: {} },
  { actionId: 'build_irrigation', params: { provinceId: 'owari' } },
  null,
  { actionId: 'levy_troops', params: { amount: 30 } },
];

let i = 0;
let guard = 0;
while (state.status === 'playing' && guard < 60) {
  const r = advanceTurn(state, script[i] ?? null);
  i = (i + 1) % script.length;
  guard++;
  const facts = [...r.actionFacts, ...r.events].map((f) => f.text).join('；');
  console.log(
    `[${r.year}/${r.season}] koku=${state.clan.koku.toFixed(0)} ` +
      `兵=${state.clan.levy} 民心=${state.clan.contentment.toFixed(2)} ` +
      `威信=${state.clan.prestige.toFixed(2)} 议题=${r.issue} ${facts}`,
  );
}
console.log(`结局：${state.status}`);
```

- [ ] **Step 4: 跑通命令行运行器（手测）**

Run: `npm run headless`
Expected: 打印逐季日志，最后输出 `结局：won` 或 `结局：lost`，进程退出码 0、无异常。

- [ ] **Step 5: 运行集成测试，确认通过**

Run: `npx vitest run tests/integration/playthrough.test.ts`
Expected: PASS（2 passed）。
若第二条「税率拉满判负」未在 60 回合内达成，**调参**：把 `economy.ts` 的 `TAX_DISCONTENT` 提到 0.6 或 `CONTENTMENT_DRIFT` 提到 0.4，使高税更快压垮民心；改完重跑本测试与 `tests/core/contentment.test.ts`，两者都需绿。

- [ ] **Step 6: 全量回归 + 提交**

Run: `npm test`
Expected: 全部测试 PASS。
```bash
git add src/headless.ts tests/integration/playthrough.test.ts
git commit -m "feat: headless runner + playthrough integration tests"
```

---

## 自检（Self-Review）

**Spec 覆盖：**
- §4.1 GameState / §4.2 实体 → Task 4
- §4.3 轻量经济（产出/消耗/市场结算/税率）→ Task 5、Task 6
- §4.4 修正栈 → Task 3（M1 提供工具；具体接入修正源在 M2+ 动作/事件中扩展）
- §4.5 回合循环（6 阶段）→ Task 8（COUNCIL 在 M1 仅产出议题占位，台词留给 M2 Narrator）
- §4.6 动作目录（时代锁地基）→ Task 7
- §9 确定性与存档 → Task 2（RNG）、Task 9（replay）
- §10 测试（种子化单测 / 不变量 / 回放 / 集成）→ 贯穿 Task 2–10
- **不在 M1 范围**：Layer B/C（LLM、时代评审）、Layer D（UI）—— 留给 M2–M5 的独立计划。

**占位符扫描：** 无 TBD/TODO；每个代码步骤都给出完整代码与精确命令。Task 5 Step 3 显式纠正了 Step 1 的断言行，避免数值不一致。Task 10 Step 5 给出明确调参路径而非「酌情处理」。

**类型一致性核对：** `GameState`/`Province`/`Retainer`/`ClanStats`/`Decree`/`OutcomeFact`/`ActionContext`/`UpkeepReport` 在各 Task 间签名一致；`resolveAction`、`advanceTurn`、`buildState`、`runUpkeep`、`updateContentment`、`serialize/deserialize/replay`、`clamp01` 调用处与定义处一致；`content/scenario.json` 的 `owari` 领国 id 与 Task 10 引用一致。

**已知小风险（实现期留意）：** 经济常数（`baseRiceOutput`、`FOOD_PER_*`、`TAX_*`）是初值，需在 Task 10 跑通后按"难度感"微调；调任何常数后重跑 economy/contentment/playthrough 三处测试。


