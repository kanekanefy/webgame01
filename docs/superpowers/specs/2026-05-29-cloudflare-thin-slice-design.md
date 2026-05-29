# Cloudflare 薄切片部署设计

**日期:** 2026-05-29
**状态:** 已批准,待 writing-plans

## 目标

把已完成的 M1 确定性模拟核心包成一个 Cloudflare 部署单元:单 Worker 同时托管极简 demo 页(Static Assets)、回合制 API、以及以 Durable Object 承载的对局会话状态;并接上测试门禁的 GitHub Actions 自动部署。这是通往"全部流程上 Cloudflare"目标的第一个薄切片(thin slice),提前验证"DO = 一局游戏会话"这一核心架构假设。

**不在本切片范围内(YAGNI):** LLM 网关/意图解析/叙事(M2)、跨会话存档槽(M5 用 D1/KV)、鉴权、剧本覆盖、完整前端 UI。

## 架构总览

```
浏览器 demo 页 (public/index.html, 静态资产)
        │  fetch /api/*
        ▼
  Worker fetch 路由 (src/worker/index.ts)
        │  idFromString(gameId)
        ▼
  GameSession Durable Object (src/worker/session.ts)
        │  调用
        ▼
  src/core/* (运行时无关,一行不改)
```

**单部署单元原则:** demo 页、API、会话状态收敛进一个 Worker。请求若命中 `public/` 静态资产(如 `/` → `index.html`)直接返回;否则进入 Worker `fetch`(`/api/*`)。

**核心隔离:** `src/core/` 保持运行时无关、**一行不改**。Worker 通过 `import scenarioData from '../../content/scenario.json'`(`resolveJsonModule` 已开)再 `buildState(scenarioData as ScenarioData)` 获取初始状态,完全绕开 `loadScenarioFromFile` 的 Node `fs` 依赖。`loadScenarioFromFile` 与 `headless.ts` 原样保留,服务本地与 CI。

## 组件设计

### 1. Worker 路由入口 — `src/worker/index.ts`

导出 `default { fetch(request, env, ctx) }`。职责:

- 解析路径与方法,把 `/api/games*` 路由到对应逻辑。
- `POST /api/games`:`const id = env.GAME_SESSION.newUniqueId();` 取 DO stub,向其发内部 init 请求,返回 `{ gameId: id.toString(), state }`,HTTP 201。
- `GET /api/games/:id`:`idFromString(:id)` 取 stub,转发,返回 `{ state }`;DO 无状态时 404。
- `POST /api/games/:id/turn`:解析 body `{ decree }`,转发到 stub,返回 `{ report, state }`。
- 错误约定:未知路由/对局 404、body 非法 400、方法不匹配 405,统一 `Response.json({ error }, { status })`。
- 导出 `GameSession` 类(供 wrangler DO 绑定):`export { GameSession } from './session.js';`

**gameId 说明:** `newUniqueId()` 是非确定性的,但它只是**会话标识、不属于模拟状态**。模拟的确定性种子来自剧本 `seed`。这层会话级非确定性是正确且有意的。

### 2. GameSession Durable Object — `src/worker/session.ts`

`export class GameSession`,持有 `ctx: DurableObjectState`、`env`。内部用一个 `fetch(request)` 分发内部动作(由 Worker 调用):

- **init**:若已存在状态则保持幂等(返回现状);否则 `buildState(scenarioData)`,`serialize` 后 `ctx.storage.put('state', json)`,`ctx.storage.put('log', [])`,返回 `{ state }`。
- **get**:`ctx.storage.get('state')`;缺失 → 404;否则 `{ state }`。
- **turn**:加载并 `deserialize` 状态;若缺失 → 404;调用 `advanceTurn(state, decree)` 取 `report`;把 `decree` 追加进 `log`;`serialize` 回写 `state` 与 `log`;返回 `{ report, state }`。

**并发与确定性:** DO 对同一 id 的请求天然串行,`advanceTurn` 无并发 race。`rngState` 随 `GameState` 持久化 → 重放可复现。使用 **SQLite-backed Durable Object**(新建 DO 类默认即为 SQLite 后端,通过 `migrations.new_sqlite_classes` 声明),在 **Workers 免费版**上可用。

### 3. 极简 demo 页 — `public/index.html`

纯 HTML + 原生 JS,零依赖、零构建步骤:

- "新对局"按钮 → `POST /api/games`,记住返回的 `gameId`。
- 状态面板:`year/season`、koku、兵(levy)、民心(contentment)、威信(prestige)、结局(status)。
- 决策区:下拉选 5 个 action(`set_tax`/`levy_troops`/`build_irrigation`/`hold_festival`/`reward_retainer`)+ 对应参数输入;"推进回合"按钮 → `POST /api/games/:id/turn`。
- 渲染 TurnReport 的 `actionFacts`/`events` 文本与 `issue`。

### 4. wrangler 配置 — `wrangler.jsonc`

```jsonc
{
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

`account_id` 为个人账号 `kanekane@gmail.com`。不需要 `nodejs_compat`(Worker 路径不用任何 Node 内建)。

## 数据流(典型一局)

1. 浏览器点"新对局" → `POST /api/games` → Worker `newUniqueId` → DO init → 返回 `{ gameId, state }`(turn 0、Spring、起始 koku/兵/民心/威信)。
2. 选 `set_tax rate=0.35` 点"推进回合" → `POST /api/games/:id/turn` → DO `advanceTurn` → 返回 `{ report, state }`(季节推进、经济结算、facts)。
3. 反复推进直到 `status` 变为 `won`/`lost`,面板显示结局。
4. 刷新页面后 `GET /api/games/:id` 可恢复(DO 存储持久化)。

## 部署与 CI

### 本地首次部署
`npx wrangler deploy`(用已登录的 OAuth),拿到 `https://sengoku-sim.<subdomain>.workers.dev`。无需 API token。

### GitHub Actions 自动部署 — `.github/workflows/deploy.yml`
- 触发:push 到 `master`。
- 步骤:checkout → setup-node(20)→ `npm ci` → `npm test`(**测试门禁,全绿才继续**)→ `npx wrangler deploy`。
- 鉴权:`env.CLOUDFLARE_API_TOKEN`、`env.CLOUDFLARE_ACCOUNT_ID` 来自仓库 secret。

### 手动前置(一次性)
用户在 CF 面板用 "Edit Cloudflare Workers" 模板创建 scoped API token;随后用 `gh secret set CLOUDFLARE_API_TOKEN` 与 `gh secret set CLOUDFLARE_ACCOUNT_ID`(值 `90ed39031227fe2597f40a77782f44d0`)写入仓库。本地首次部署不依赖此 token。

## 测试策略

- **core 套件不变:** 现有 36 个测试为纯 TS,继续在 node 池运行。
- **Worker 层集成测试:** 引入 `@cloudflare/vitest-pool-workers`,在真实 workerd 运行时加一条 happy-path:
  1. `POST /api/games` → 返回 201 且 `state.clan.koku` 等于剧本起始值。
  2. `POST /api/games/:id/turn`(带一个合法 decree)→ 返回 `report`,且 `state` 季节推进、`actionLog` 长度 +1。
  3. 同一对局连续两次推进结果自洽(状态单调推进、无报错)。
- **并池运行:** 用 vitest projects(workspace)把 node 池(core/tests)与 workers 池(tests/worker)并入同一 `npm test`,CI 一条命令跑全部。

## 文件结构

**新增:**
- `src/worker/index.ts` — 路由入口 + 导出 GameSession
- `src/worker/session.ts` — GameSession Durable Object
- `public/index.html` — demo 页
- `wrangler.jsonc` — Worker/DO/Assets 配置
- `.github/workflows/deploy.yml` — CI 自动部署
- `tests/worker/session.test.ts` — workers 池集成测试
- `vitest.workspace.ts` — node + workers 双池配置

**修改:**
- `package.json` — devDeps 加 `wrangler`、`@cloudflare/workers-types`、`@cloudflare/vitest-pool-workers`;scripts 加 `deploy`、`dev`、`cf-typegen`;`test` 改为跑 workspace(双池)
- `tsconfig.json` — `types` 增加 `@cloudflare/workers-types`(与 node 共存,已开 `skipLibCheck`)

**不改:** `src/core/*`(含 `scenario.ts`)、`content/scenario.json`、`src/headless.ts`。

## 验收标准

- [ ] 本地 `wrangler deploy` 得到可访问的 `*.workers.dev` URL。
- [ ] demo 页能新建对局、推进回合、看到状态变化与结局。
- [ ] `npm test` 一条命令跑通 core(36)+ worker 集成测试,全绿。
- [ ] push 到 master 触发 GitHub Actions,测试门禁通过后自动部署成功。
- [ ] `src/core/*` 未被修改(`git diff` 确认)。
