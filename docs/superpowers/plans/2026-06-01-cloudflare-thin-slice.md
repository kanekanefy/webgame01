# Cloudflare 薄切片部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已完成的 M1 确定性模拟核心包成单个 Cloudflare Worker（Static Assets + 回合 API + Durable Object 会话状态），并接上测试门禁的 GitHub Actions 自动部署。

**Architecture:** 一个 Worker 同时托管极简 demo 页（`public/`，Static Assets）与 `/api/*` 路由；每个 `gameId` 对应一个 `GameSession` Durable Object（SQLite 后端，免费版可跑），通过 **DO RPC** 暴露 `init`/`getState`/`turn`，内部直接调用一行未改的 `src/core/*`。Worker 用 `import scenario.json` 绕开 Node `fs`。测试分两个 vitest 配置：node 池跑现有 36 个 core 测试，workers 池（`@cloudflare/vitest-pool-workers`，真实 workerd）跑 Worker+DO 集成测试，`npm test` 一条命令跑全部。

**Tech Stack:** TypeScript ESM、Cloudflare Workers + Durable Objects (SQLite) + Static Assets、wrangler 4、vitest 4 + @cloudflare/vitest-pool-workers 0.16、GitHub Actions。

**关键设计决定（相对 spec 的精化）：**
- **DO 用 RPC 而非内部 fetch 协议**：`GameSession extends DurableObject` 暴露公共方法 `init()`/`getState()`/`turn(decree)`，Worker 通过 `stub.init()` 直接调用。这是现代 DO 惯用法，比手搓内部 HTTP 协议更干净；返回值都是纯 JSON 可序列化数据（`GameState`/`TurnReport`），满足 RPC 结构化克隆约束。`compatibility_date` ≥ 2024-04-03 即支持，本计划用 2025-05-01。
- **工具链统一升级到 vitest 4**：pool-workers 0.16（配 wrangler 4 + miniflare 4）要求 vitest ^4。现在只有 36 个测试、且只用稳定断言 API，是升级最便宜的时机。Task 1 先升级并验证 36 个测试仍全绿（安全网）。
- **`src/core/*` 一行不改**（含 `scenario.ts`、`headless.ts`）。`git diff src/core` 必须为空。

---

### Task 1: 工具链升级 + 验证 M1 仍全绿

**Files:**
- Modify: `package.json`（devDependencies、scripts）
- Modify: `vitest.config.ts`（缩小 include 到 core/integration）

- [ ] **Step 1: 升级 vitest 并安装 Cloudflare 测试/部署依赖**

```bash
npm install -D vitest@^4.1 @vitest/runner@^4.1 @vitest/snapshot@^4.1 \
  wrangler@^4.95 @cloudflare/workers-types@latest \
  @cloudflare/vitest-pool-workers@^0.16
```

- [ ] **Step 2: 缩小现有 node 池配置的 include（把 worker 测试目录排除在 node 池外）**

把 `vitest.config.ts` 改为：

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/core/**/*.test.ts', 'tests/integration/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: 更新 package.json scripts**

把 `scripts` 改为（新增 `dev`/`deploy`/`cf-typegen`/`test:core`/`test:worker`，并让 `test` 串跑两池）：

```json
{
  "scripts": {
    "test": "vitest run && vitest run --config vitest.workers.config.ts",
    "test:core": "vitest run",
    "test:worker": "vitest run --config vitest.workers.config.ts",
    "test:watch": "vitest",
    "headless": "tsx src/headless.ts",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "cf-typegen": "wrangler types"
  }
}
```

注意：此时 `vitest.workers.config.ts` 尚不存在，`npm run test:core`（仅 node 池）应可独立运行。

- [ ] **Step 4: 验证 M1 的 36 个测试在 vitest 4 下仍全绿**

Run: `npm run test:core`
Expected: `Test Files  10 passed (10)` / `Tests  36 passed (36)`。
若有因 vitest 4 破坏性变更导致的失败：先记录失败信息，**不要改业务代码**，优先在本任务内用最小改动修复测试运行（断言 API 未变，预期无需改动）；若无法在不改 `src/core` 的前提下修复，标记 BLOCKED 上报。

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: upgrade vitest to v4 and add Cloudflare deps"
```

---

### Task 2: Worker 脚手架 + GameSession Durable Object（RPC）

**Files:**
- Create: `wrangler.jsonc`
- Create: `src/worker/index.ts`（路由骨架 + 导出 GameSession + Env）
- Create: `src/worker/session.ts`（GameSession DO）
- Create: `vitest.workers.config.ts`
- Create: `tests/worker/tsconfig.json`
- Create: `tests/worker/env.d.ts`
- Test: `tests/worker/session.test.ts`

- [ ] **Step 1: 创建 wrangler.jsonc**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "sengoku-sim",
  "main": "src/worker/index.ts",
  "compatibility_date": "2025-05-01",
  "account_id": "90ed39031227fe2597f40a77782f44d0",
  "assets": { "directory": "./public" },
  "durable_objects": {
    "bindings": [{ "name": "GAME_SESSION", "class_name": "GameSession" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["GameSession"] }]
}
```

- [ ] **Step 2: 创建 GameSession Durable Object — `src/worker/session.ts`**

```typescript
import { DurableObject } from 'cloudflare:workers';
import scenarioData from '../../content/scenario.json';
import { buildState, type ScenarioData } from '../core/scenario.js';
import { advanceTurn, type Decree, type TurnReport } from '../core/loop.js';
import { serialize, deserialize } from '../core/save.js';
import type { GameState } from '../core/state.js';

export class GameSession extends DurableObject {
  // 幂等初始化：已存在则返回现状，否则从默认剧本建局。
  async init(): Promise<GameState> {
    const existing = await this.ctx.storage.get<string>('state');
    if (existing) return deserialize(existing);
    const state = buildState(scenarioData as ScenarioData);
    await this.ctx.storage.put('state', serialize(state));
    await this.ctx.storage.put('log', JSON.stringify([]));
    return state;
  }

  async getState(): Promise<GameState | null> {
    const json = await this.ctx.storage.get<string>('state');
    return json ? deserialize(json) : null;
  }

  // 推进一回合；对未初始化的会话返回 null（由 Worker 转 404）。
  async turn(decree: Decree | null): Promise<{ report: TurnReport; state: GameState } | null> {
    const json = await this.ctx.storage.get<string>('state');
    if (!json) return null;
    const state = deserialize(json);
    const report = advanceTurn(state, decree);
    const logJson = (await this.ctx.storage.get<string>('log')) ?? '[]';
    const log = JSON.parse(logJson) as Array<Decree | null>;
    log.push(decree);
    await this.ctx.storage.put('state', serialize(state));
    await this.ctx.storage.put('log', JSON.stringify(log));
    return { report, state };
  }
}
```

- [ ] **Step 3: 创建 Worker 路由骨架 — `src/worker/index.ts`**

本步先实现“未知路由 → 404”骨架与类型/导出；具体 API 在 Task 3-5 补全。

```typescript
import { GameSession } from './session.js';

export interface Env {
  GAME_SESSION: DurableObjectNamespace<GameSession>;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts[0] !== 'api' || parts[1] !== 'games') {
      return json({ error: 'not found' }, 404);
    }
    return json({ error: 'not found' }, 404);
  },
};

export { GameSession };
```

- [ ] **Step 4: 创建 workers 池测试配置 — `vitest.workers.config.ts`**

```typescript
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    include: ['tests/worker/**/*.test.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
      },
    },
  },
});
```

> 兼容性说明：`defineWorkersConfig`（来自 `@cloudflare/vitest-pool-workers/config`）是长期稳定的导出。若安装版本中该导出不存在，改用插件式写法：`import { cloudflareTest } from '@cloudflare/vitest-pool-workers'` + `import { defineConfig } from 'vitest/config'`，配置为 `defineConfig({ test: { include: ['tests/worker/**/*.test.ts'] }, plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })] })`。以 `npm run test:worker` 能加载配置为准。

- [ ] **Step 5: 创建测试用 tsconfig 与 env 类型增强**

`tests/worker/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "moduleResolution": "bundler",
    "types": ["@cloudflare/vitest-pool-workers/types"]
  },
  "include": ["./**/*.ts", "../../src/worker/**/*.ts"]
}
```

`tests/worker/env.d.ts`（让测试里的 `env.GAME_SESSION` 有类型）：

```typescript
declare module 'cloudflare:test' {
  interface ProvidedEnv {
    GAME_SESSION: DurableObjectNamespace<import('../../src/worker/session.js').GameSession>;
  }
}
```

- [ ] **Step 6: 写失败测试 — `tests/worker/session.test.ts`**

```typescript
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('GameSession DO', () => {
  it('init 从默认剧本建局：起始 koku=500、turn=0、Spring', async () => {
    const id = env.GAME_SESSION.newUniqueId();
    const stub = env.GAME_SESSION.get(id);
    const state = await stub.init();
    expect(state.clan.koku).toBe(500);
    expect(state.turn).toBe(0);
    expect(state.season).toBe('Spring');
    expect(state.status).toBe('playing');
  });

  it('init 幂等：二次调用不重置已存状态', async () => {
    const id = env.GAME_SESSION.newUniqueId();
    const stub = env.GAME_SESSION.get(id);
    await stub.init();
    await stub.turn({ actionId: 'set_tax', params: { rate: 0.5 } });
    const again = await stub.init();
    expect(again.taxRate).toBeCloseTo(0.5, 6);
  });

  it('turn 推进季节并持久化（Spring→Summer，actionLog +1）', async () => {
    const id = env.GAME_SESSION.newUniqueId();
    const stub = env.GAME_SESSION.get(id);
    await stub.init();
    const res = await stub.turn({ actionId: 'set_tax', params: { rate: 0.4 } });
    expect(res).not.toBeNull();
    expect(res!.report.season).toBe('Summer');
    expect(res!.state.actionLog).toHaveLength(1);
    // 状态确实写进了 DO 存储
    await runInDurableObject(stub, async (_inst, state) => {
      const stored = await state.storage.get<string>('state');
      expect(stored).toBeTruthy();
    });
  });
});
```

- [ ] **Step 7: 运行测试，确认通过**

Run: `npm run test:worker`
Expected: 3 个测试通过（首次运行会自动下载 workerd，稍慢）。
若 `defineWorkersConfig` 导入报错，按 Step 4 的兼容性说明切换插件式配置后重跑。

- [ ] **Step 8: Commit**

```bash
git add wrangler.jsonc vitest.workers.config.ts src/worker tests/worker
git commit -m "feat: GameSession Durable Object with RPC init/getState/turn"
```

---

### Task 3: POST /api/games（创建对局）

**Files:**
- Modify: `src/worker/index.ts`
- Test: `tests/worker/api.test.ts`

- [ ] **Step 1: 写失败测试 — `tests/worker/api.test.ts`**

```typescript
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

interface CreateResp { gameId: string; state: { clan: { koku: number }; turn: number; season: string } }

describe('POST /api/games', () => {
  it('创建对局返回 201、gameId 与起始状态', async () => {
    const res = await SELF.fetch('https://example.com/api/games', { method: 'POST' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as CreateResp;
    expect(typeof body.gameId).toBe('string');
    expect(body.gameId.length).toBeGreaterThan(0);
    expect(body.state.clan.koku).toBe(500);
    expect(body.state.turn).toBe(0);
    expect(body.state.season).toBe('Spring');
  });

  it('用 GET 访问 /api/games 返回 405', async () => {
    const res = await SELF.fetch('https://example.com/api/games', { method: 'GET' });
    expect(res.status).toBe(405);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run test:worker`
Expected: 新增的 `POST /api/games` 测试失败（当前返回 404，而非 201/405）。

- [ ] **Step 3: 在 `src/worker/index.ts` 的 fetch 中实现 create 分支**

把 `fetch` 体替换为（在“前缀校验”之后、最终 404 之前插入 create 处理）：

```typescript
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts[0] !== 'api' || parts[1] !== 'games') {
      return json({ error: 'not found' }, 404);
    }

    // POST /api/games —— 新建对局
    if (parts.length === 2) {
      if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
      const id = env.GAME_SESSION.newUniqueId();
      const stub = env.GAME_SESSION.get(id);
      const state = await stub.init();
      return json({ gameId: id.toString(), state }, 201);
    }

    return json({ error: 'not found' }, 404);
  },
```

- [ ] **Step 4: 运行确认通过**

Run: `npm run test:worker`
Expected: Task 2 的 3 个 + Task 3 的 2 个测试全部通过。

- [ ] **Step 5: Commit**

```bash
git add src/worker/index.ts tests/worker/api.test.ts
git commit -m "feat: POST /api/games creates a new game session"
```

---

### Task 4: GET /api/games/:id（读取状态）

**Files:**
- Modify: `src/worker/index.ts`
- Modify: `tests/worker/api.test.ts`

- [ ] **Step 1: 追加失败测试到 `tests/worker/api.test.ts`**

先把文件顶部 import 改为同时引入 `SELF` 与 `env`：

```typescript
import { SELF, env } from 'cloudflare:test';
```

再追加：

```typescript
describe('GET /api/games/:id', () => {
  it('返回已创建对局的当前状态', async () => {
    const created = await SELF.fetch('https://example.com/api/games', { method: 'POST' });
    const { gameId } = (await created.json()) as { gameId: string };
    const res = await SELF.fetch(`https://example.com/api/games/${gameId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: { clan: { koku: number } } };
    expect(body.state.clan.koku).toBe(500);
  });

  it('合法但未初始化的 id 返回 404', async () => {
    // newUniqueId 产生的 id 字符串格式合法，但该 DO 从未 init → 无状态
    const freshId = env.GAME_SESSION.newUniqueId().toString();
    const res = await SELF.fetch(`https://example.com/api/games/${freshId}`);
    expect(res.status).toBe(404);
  });

  it('格式非法的 id 返回 400', async () => {
    const res = await SELF.fetch('https://example.com/api/games/not-a-real-id');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run test:worker`
Expected: 新增 GET 测试失败（当前 `/api/games/:id` 落到最终 404，且非法 id 未返回 400）。

- [ ] **Step 3: 在 create 分支之后插入 id 解析 + GET 分支**

在 `if (parts.length === 2) {...}` 之后插入：

```typescript
    // 解析 :id（后续 GET / turn 共用）
    const gameId = parts[2]!;
    let doId: DurableObjectId;
    try {
      doId = env.GAME_SESSION.idFromString(gameId);
    } catch {
      return json({ error: 'invalid game id' }, 400);
    }
    const stub = env.GAME_SESSION.get(doId);

    // GET /api/games/:id —— 读取状态
    if (parts.length === 3) {
      if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
      const state = await stub.getState();
      if (!state) return json({ error: 'game not found' }, 404);
      return json({ state });
    }
```

- [ ] **Step 4: 运行确认通过**

Run: `npm run test:worker`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add src/worker/index.ts tests/worker/api.test.ts
git commit -m "feat: GET /api/games/:id returns current state"
```

---

### Task 5: POST /api/games/:id/turn（推进回合）

**Files:**
- Modify: `src/worker/index.ts`
- Modify: `tests/worker/api.test.ts`

- [ ] **Step 1: 追加失败测试到 `tests/worker/api.test.ts`**

```typescript
describe('POST /api/games/:id/turn', () => {
  it('推进一回合：季节 Spring→Summer、actionLog +1、税率生效', async () => {
    const created = await SELF.fetch('https://example.com/api/games', { method: 'POST' });
    const { gameId } = (await created.json()) as { gameId: string };
    const res = await SELF.fetch(`https://example.com/api/games/${gameId}/turn`, {
      method: 'POST',
      body: JSON.stringify({ decree: { actionId: 'set_tax', params: { rate: 0.5 } } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report: { season: string };
      state: { taxRate: number; actionLog: unknown[]; season: string };
    };
    expect(body.report.season).toBe('Summer');
    expect(body.state.season).toBe('Summer');
    expect(body.state.taxRate).toBeCloseTo(0.5, 6);
    expect(body.state.actionLog).toHaveLength(1);
  });

  it('空 body（无决策）也能推进一回合', async () => {
    const created = await SELF.fetch('https://example.com/api/games', { method: 'POST' });
    const { gameId } = (await created.json()) as { gameId: string };
    const res = await SELF.fetch(`https://example.com/api/games/${gameId}/turn`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: { season: string } };
    expect(body.state.season).toBe('Summer');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run test:worker`
Expected: 新增 turn 测试失败（当前落到最终 404）。

- [ ] **Step 3: 在 GET 分支之后插入 turn 分支**

在 `if (parts.length === 3) {...}` 之后、最终 `return json({ error: 'not found' }, 404);` 之前插入：

```typescript
    // POST /api/games/:id/turn —— 推进回合
    if (parts.length === 4 && parts[3] === 'turn') {
      if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
      let decree: Decree | null = null;
      try {
        const text = await request.text();
        if (text) {
          const parsed = JSON.parse(text) as { decree?: Decree | null };
          decree = parsed.decree ?? null;
        }
      } catch {
        return json({ error: 'invalid body' }, 400);
      }
      const result = await stub.turn(decree);
      if (!result) return json({ error: 'game not found' }, 404);
      return json(result);
    }
```

并在文件顶部 import 补上 `Decree` 类型：

```typescript
import type { Decree } from '../core/loop.js';
```

- [ ] **Step 4: 运行确认通过**

Run: `npm run test:worker`
Expected: 全部通过。

- [ ] **Step 5: 跑完整测试套件（node 池 + workers 池）**

Run: `npm test`
Expected: core 36 个全绿；worker 测试全绿。

- [ ] **Step 6: Commit**

```bash
git add src/worker/index.ts tests/worker/api.test.ts
git commit -m "feat: POST /api/games/:id/turn advances the simulation"
```

---

### Task 6: 极简 demo 页

**Files:**
- Create: `public/index.html`

- [ ] **Step 1: 创建 `public/index.html`**

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>战国大名模拟器 · 薄切片</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
    .panel { display: grid; grid-template-columns: repeat(3, 1fr); gap: .5rem; margin: 1rem 0; }
    .panel div { background: #f4f4f4; border-radius: 6px; padding: .5rem .75rem; }
    .panel b { display: block; font-size: .75rem; color: #666; }
    button { padding: .5rem 1rem; margin-right: .5rem; cursor: pointer; }
    select, input { padding: .4rem; }
    #log { white-space: pre-wrap; background: #111; color: #ddd; padding: 1rem; border-radius: 6px; min-height: 4rem; font-size: .85rem; }
    .row { margin: .75rem 0; }
  </style>
</head>
<body>
  <h1>战国大名模拟器 · 薄切片</h1>
  <div class="row">
    <button id="new">新对局</button>
    <span id="gid" style="color:#888"></span>
  </div>
  <div class="panel" id="panel" hidden>
    <div><b>年/季</b><span id="when">—</span></div>
    <div><b>koku</b><span id="koku">—</span></div>
    <div><b>兵</b><span id="levy">—</span></div>
    <div><b>民心</b><span id="cont">—</span></div>
    <div><b>威信</b><span id="prest">—</span></div>
    <div><b>结局</b><span id="status">—</span></div>
  </div>
  <div class="row" id="controls" hidden>
    <select id="action">
      <option value="">（不行动）</option>
      <option value="set_tax">set_tax（税率 rate）</option>
      <option value="levy_troops">levy_troops（征兵 amount）</option>
      <option value="build_irrigation">build_irrigation（兴修水利 provinceId）</option>
      <option value="hold_festival">hold_festival（举办祭典）</option>
      <option value="reward_retainer">reward_retainer（赏赐 retainerId）</option>
    </select>
    <input id="param" placeholder="参数值（如 0.4 / 30 / owari）" />
    <button id="turn">推进回合</button>
  </div>
  <div class="row"><div id="log">点击「新对局」开始。</div></div>

  <script>
    let gameId = null;
    const $ = (id) => document.getElementById(id);

    function render(state) {
      $('panel').hidden = false;
      $('controls').hidden = false;
      $('when').textContent = `${state.year}/${state.season}`;
      $('koku').textContent = Math.round(state.clan.koku);
      $('levy').textContent = state.clan.levy;
      $('cont').textContent = state.clan.contentment.toFixed(2);
      $('prest').textContent = state.clan.prestige.toFixed(2);
      $('status').textContent = state.status;
    }

    // 把下拉框 + 参数框拼成 decree（参数名因 action 而异）
    function buildDecree() {
      const actionId = $('action').value;
      if (!actionId) return null;
      const raw = $('param').value.trim();
      const params = {};
      if (actionId === 'set_tax') params.rate = Number(raw);
      else if (actionId === 'levy_troops') params.amount = Number(raw);
      else if (actionId === 'build_irrigation') params.provinceId = raw;
      else if (actionId === 'reward_retainer') params.retainerId = raw;
      return { actionId, params };
    }

    $('new').onclick = async () => {
      const res = await fetch('/api/games', { method: 'POST' });
      const body = await res.json();
      gameId = body.gameId;
      $('gid').textContent = `对局 ${gameId.slice(0, 8)}…`;
      $('log').textContent = '对局已开始。';
      render(body.state);
    };

    $('turn').onclick = async () => {
      if (!gameId) return;
      const res = await fetch(`/api/games/${gameId}/turn`, {
        method: 'POST',
        body: JSON.stringify({ decree: buildDecree() }),
      });
      const body = await res.json();
      render(body.state);
      const facts = [...body.report.actionFacts, ...body.report.events].map((f) => f.text).join('；');
      $('log').textContent = `[${body.report.year}/${body.report.season}] 议题：${body.report.issue}${facts ? '\n' + facts : ''}`;
    };
  </script>
</body>
</html>
```

- [ ] **Step 2: 本地起服务手动验证（冒烟）**

Run: `npm run dev`（启动 `wrangler dev`，默认 http://localhost:8787）
手动验证：浏览器打开 → 点「新对局」看到面板出现、起始 koku=500 → 选 `set_tax` 填 `0.4` 点「推进回合」→ 季节变 Summer、日志显示议题。Ctrl-C 结束。
（此为手动冒烟，无自动化断言。）

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: minimal browser demo page for the game API"
```

---

### Task 7: GitHub Actions 自动部署工作流

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: 创建 `.github/workflows/deploy.yml`**

```yaml
name: deploy
on:
  push:
    branches: [master]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

说明：`account_id` 已写在 `wrangler.jsonc`，故无需额外 account 环境变量；`npm test` 为门禁，全绿才会执行 `wrangler deploy`。

- [ ] **Step 2: 校验 YAML 可解析**

Run: `npx --yes js-yaml .github/workflows/deploy.yml >/dev/null && echo OK`
Expected: `OK`（若环境无 js-yaml，可跳过，本步仅为语法自检）。

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: test-gated wrangler deploy on push to master"
```

---

### Task 8: 首次本地部署 + CI secret + 线上冒烟（主会话执行，非子代理）

> 本任务涉及用户真实 Cloudflare 账号的 OAuth 与一次性手动建 token，**不在隔离子代理中执行**，由主会话与用户协作完成。

- [ ] **Step 1: 本地部署**

Run: `npx wrangler deploy`
Expected: 输出已发布的 `https://sengoku-sim.<subdomain>.workers.dev` URL。

- [ ] **Step 2: 线上冒烟**

```bash
BASE=https://sengoku-sim.<subdomain>.workers.dev
GID=$(curl -s -X POST $BASE/api/games | python3 -c "import sys,json;print(json.load(sys.stdin)['gameId'])")
curl -s -X POST $BASE/api/games/$GID/turn -d '{"decree":{"actionId":"set_tax","params":{"rate":0.4}}}'
```
Expected: 第二条返回 `report`/`state`，`state.season` 为 `Summer`。
并用浏览器打开 `$BASE` 验证 demo 页可玩。

- [ ] **Step 3: 配置 CI secret（用户先在 CF 面板用 "Edit Cloudflare Workers" 模板建 scoped API token）**

```bash
gh secret set CLOUDFLARE_API_TOKEN   # 粘贴用户创建的 token
```
（`account_id` 已在 wrangler.jsonc，无需设 `CLOUDFLARE_ACCOUNT_ID` secret。）

- [ ] **Step 4: 触发并验证 CI 自动部署**

```bash
git push origin master   # 合并后推送 master 触发 deploy.yml
gh run watch
```
Expected: workflow 跑通（test 门禁通过 → wrangler deploy 成功）。

---

## 验收标准（对应 spec）

- [ ] 本地 `wrangler deploy` 得到可访问的 `*.workers.dev` URL（Task 8）。
- [ ] demo 页能新建对局、推进回合、看到状态变化与结局（Task 6/8）。
- [ ] `npm test` 一条命令跑通 core(36) + worker 集成测试，全绿（Task 5 Step 5）。
- [ ] push 到 master 触发 GitHub Actions，测试门禁通过后自动部署成功（Task 7/8）。
- [ ] `git diff` 确认 `src/core/*`（含 `scenario.ts`）与 `content/scenario.json`、`src/headless.ts` 未被修改。
