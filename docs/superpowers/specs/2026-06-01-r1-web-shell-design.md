# R1 设计 · web 壳 + Worker + DO 数值闭环

- **日期**：2026-06-01
- **状态**：设计就绪，待 R1 实现（CCGS 调度）
- **上游**：总设计 `2026-06-01-sengoku-redo-monorepo-design.md` 的 R1 阶段；复用 `2026-05-29-cloudflare-thin-slice-design.md` 的 Worker+DO 方案（前端从裸 HTML 升级为 React）。

## 目标

浏览器可玩的**纯数值闭环**：新建对局 → 选动作推进回合 → 看数值/事件文本 → 结局。**R1 不接真 LLM**（叙事/意图解析是 R2）；动作通过 UI 下拉选择，不走自由文本。

## 范围

**纳入**：`apps/web` React 壳 + `apps/worker`(API + GameSession DO) + 本地可跑 + 测试。
**不纳入**：LLM 代理 `/api/llm`、IntentParser、Narrator、自由文本下令、真实美术/音频（R2/R3）。

## 组件

### apps/worker（Cloudflare Worker）

复用 thin-slice 设计，路径调整到 monorepo：

- `src/index.ts` — 路由入口：
  - `POST /api/games` → `env.GAME_SESSION.newUniqueId()` 取 DO，init，返回 `{ gameId, state }`（201）
  - `GET /api/games/:id` → 转发 DO get，返回 `{ state }`（无则 404）
  - `POST /api/games/:id/turn` → body `{ decree }`，转发 DO turn，返回 `{ report, state }`
  - 错误约定：404/400/405，统一 `Response.json({ error }, { status })`
  - `export { GameSession } from './session.js'`
- `src/session.ts` — `GameSession` Durable Object（SQLite-backed）：
  - init：`buildState(scenarioData)` → `serialize` → `ctx.storage.put('state')`（幂等）
  - get：读 state，缺失 404
  - turn：`deserialize` → `advanceTurn(state, decree)` → 回写 → 返回 `{ report, state }`
  - 同一 id 请求天然串行，`rngState` 随状态持久化 → 可回放
- **core 一行不改**：`import scenarioData from '@sengoku/core/content/scenario.json'`（或相对路径）+ `buildState`，绕开 `loadScenarioFromFile` 的 Node `fs`
- `wrangler.jsonc`：`assets.directory: ./apps/web/dist`、`run_worker_first: ["/api/*"]`、`not_found_handling: single-page-application`、DO 绑定 `GAME_SESSION`、`migrations.new_sqlite_classes: ["GameSession"]`
- 依赖：`@sengoku/core`（workspace 包）、`@cloudflare/workers-types`、`wrangler`、`@cloudflare/vitest-pool-workers`

### apps/web（React + Vite + Tailwind）

- **新建对局**按钮 → `POST /api/games`，gameId + state 存 Zustand
- **数值面板**：`year/season`、koku、levy(兵)、contentment(民心)、prestige(威信)、status(结局)
- **动作区**：下拉选 5 个动作（`set_tax`/`levy_troops`/`build_irrigation`/`hold_festival`/`reward_retainer`）+ 对应参数输入；**推进回合**按钮 → `POST /api/games/:id/turn`
- **回报区**：渲染 `TurnReport` 的 `actionFacts`/`events` 文本 + `issue`
- 状态：Zustand 仅存 `gameId` + 当前 `state`/`report`（游戏态权威在 core/DO，前端不复算）
- 所有交互元素加 `data-testid`（E2E 用）
- Tailwind 朝议风格基础样式；移动端响应式
- dev 代理：`vite.config` 把 `/api` 代理到本地 `wrangler dev`

### content

R1 阶段 worker 直接 `import` `@sengoku/core` 包内的 `content/scenario.json`（`resolveJsonModule` 已开）。content 提取到根目录推迟（YAGNI，待多消费者时）。

## API 契约

```
POST /api/games            → 201 { gameId: string, state: GameState }
GET  /api/games/:id        → 200 { state } | 404
POST /api/games/:id/turn   → 200 { report: TurnReport, state } | 404 | 400
   body: { decree: { actionId: string, params: object } | null }
```

## 测试

- **core**：现有 36 不变
- **worker**（`@cloudflare/vitest-pool-workers`）：`POST /api/games`→201 且起始 koku 正确；`POST turn`(合法 decree)→season 推进、actionLog+1；连续两回合自洽
- **web E2E**（Playwright）：新建对局 → 选 `set_tax` 推进 → 数值变化 → 多回合至结局；移动 viewport 冒烟
- `pnpm -r test` 一条命令跑 core + worker 双池

## 验收

- [ ] `pnpm dev` 本地起 React + `wrangler dev`，浏览器新建对局/推进回合/看数值变化/结局
- [ ] `pnpm -r test` 全绿（core 36 + worker 集成）
- [ ] Playwright 关键路径 E2E 通过
- [ ] `packages/core` 未被修改（`git diff` 确认）
- [ ] （可选，R1 末）`wrangler deploy` 线上可访问

## CCGS 角色映射

| 工作 | 角色 |
|---|---|
| `apps/worker` API + DO | `backend-engineer` |
| `apps/web` React UI | `frontend-engineer` |
| wrangler 配置/本地 dev/部署 | `cloudflare-devops` |
| core 动作目录/数据契约 | `game-balance-engineer`（顾问，core 不改） |
| worker 集成测试 + E2E | `web-qa` |
| 架构/接口仲裁 | `lead-programmer` / `technical-director` |
