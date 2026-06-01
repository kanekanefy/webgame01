# Sprint 1 — 2026-06-01 to 2026-06-14

## Sprint Goal
在浏览器中实现可玩的纯数值闭环：新建对局 → 选择动作推进回合 → 看数值/事件文本 → 到达结局；`packages/core` 一行不改，`pnpm -r test` 全绿。

## Capacity
- 总工作天: 10 天
- 缓冲 (20%): 2 天
- 可用天: 8 天

> 注：AI agent 并行执行，BE / FE 骨架搭建可同时进行，实际日历天可显著压缩。

## 架构决策前置（开工前）

`packages/core` 当前无 `index.ts` 也无 `exports` 字段。`apps/worker` 需要 import
`buildState` / `advanceTurn` / `serialize` / `deserialize`。

方案 **A（推荐，ARCH-001 实施）**：新增 `packages/core/index.ts`（重导出函数）+
在 `package.json` 加 `exports`/`main` 字段。不改动现有源文件，`git diff packages/core/src` 为空。

## Tasks

### Must Have (Critical Path)

| ID | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-------------|-----------|--------------|---------------------|
| S1-ARCH-001 | core 包导出接口——新增 `index.ts` + `package.json` exports/main | `backend-engineer` | 0.5 | — | Worker 能 `import { buildState, advanceTurn, serialize, deserialize } from '@sengoku/core'`；`packages/core/src/**/*.ts` 无修改 |
| S1-BE-001 | `apps/worker` 包骨架 + `wrangler.jsonc` 配置 | `backend-engineer` + `cloudflare-devops` | 0.5 | ARCH-001 | `pnpm -F @sengoku/worker dev` 本地启动；DO 绑定 + static assets + SPA fallback 正确 |
| S1-FE-001 | `apps/web` 包骨架（React + Vite + Tailwind + Zustand） | `frontend-engineer` | 0.5 | —（可与 BE-001 并行） | `pnpm -F @sengoku/web dev` 启动；Tailwind 加载；Vite `/api` proxy → `localhost:8787` |
| S1-BE-002 | `GameSession` Durable Object（init / get / turn） | `backend-engineer` | 1.5 | BE-001 | `ctx.storage.put('state')` 幂等 init；turn 调用 `advanceTurn` → 回写；`rngState` 随 state 持久化 |
| S1-BE-003 | Worker API 路由（`POST /api/games`, `GET /:id`, `POST /:id/turn`） | `backend-engineer` | 0.5 | BE-002 | 三端点按契约返回；错误统一 `{error}` + 状态码；`export { GameSession }` |
| S1-FE-002 | 新建对局 + 数值面板 | `frontend-engineer` | 1.0 | FE-001（mock first 可先于 BE-003） | "新建对局"→ `POST /api/games`→ Zustand 存 `gameId`+`state`；面板展示 year/season/koku/levy/contentment/prestige/status |
| S1-FE-003 | 动作区（下拉 5 动作 + 参数）+ 推进回合 + 回报区 | `frontend-engineer` | 1.0 | FE-002 | 选 `set_tax` + rate → `POST turn` → 数值更新；回报区显示 actionFacts/events/issue；所有交互元素有 `data-testid` |
| S1-QA-001 | Worker 集成测试（`@cloudflare/vitest-pool-workers`） | `web-qa` | 1.0 | BE-003 | `POST /api/games`→201+起始 koku 正确；`POST turn`(合法 decree)→season 推进+actionLog+1；连续两回合自洽 |
| S1-QA-002 | Playwright E2E（关键路径 + 移动 viewport 冒烟） | `web-qa` | 1.0 | FE-003, QA-001 | 新建→`set_tax`→推进→数值变化→多回合至结局；375px viewport 冒烟通过 |
| S1-INT-001 | `pnpm -r test` 联调 + `data-testid` 补全核查 | `web-qa` + `frontend-engineer` | 0.5 | QA-001, QA-002 | `pnpm -r test` 全绿（core 36 + worker 集成）；`git diff packages/core/src` 为空 |

### Should Have

| ID | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-------------|-----------|--------------|---------------------|
| S1-CF-001 | `wrangler deploy` 线上可访问（R1 末选做） | `cloudflare-devops` | 0.5 | INT-001 | 生产 URL 可新建对局；`.dev.vars` 不入库 |
| S1-FE-004 | Tailwind 朝议风格打磨 + 移动端响应式 | `frontend-engineer` | 0.5 | FE-003 | 移动端布局不溢出；基础色调/字体有"战国感" |

### Nice to Have

| ID | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-------------|-----------|--------------|---------------------|
| S1-CI-001 | GitHub Actions CI（`pnpm -r test` 门禁 → deploy） | `cloudflare-devops` | 0.5 | INT-001 | PR 自动跑测试；main push 自动部署 |

## Carryover from Previous Sprint
なし（首次 sprint）

## 并行执行顺序

```
Day 1:   ARCH-001  ──▶ (门) 拍板 index.ts 方案
Day 1-2: BE-001 ‖ FE-001   (可并行)
Day 2-4: BE-002             (DO 逻辑，最重)
Day 2-3: FE-002             (并行，mock API 先行)
Day 4:   BE-003  ‖ FE-003   (接口可用后前后端对接)
Day 5-6: QA-001 ‖ QA-002    (独立，可并行)
Day 7:   INT-001 → 全绿     (收尾联调)
```

## Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| wrangler + vitest-pool-workers 版本兼容问题 | 中 | 高 | BE-001 骨架阶段先验证测试框架能跑 |
| core subpath 导入在 esbuild 下行为不一致 | 中 | 高 | ARCH-001 立即验证；方案 B 备用 |
| `advanceTurn` 的 actions 副作用导入在 Worker 丢失 | 低 | 高 | BE-002 实测；必要时显式 import actions/index |
| Playwright 需同时起 wrangler dev + vite dev | 低 | 中 | QA-002 前整理 `pnpm dev` 并发脚本 |

## Dependencies on External Factors
- Cloudflare Workers 本地 `wrangler dev` 正常运行
- `@cloudflare/vitest-pool-workers` 支持 miniflare SQLite DO

## Definition of Done for this Sprint
- [ ] 所有 Must Have 任务完成
- [ ] `pnpm -r test` 全绿（core 36 + worker 集成测试）
- [ ] Playwright E2E 关键路径通过
- [ ] 浏览器可新建对局/推进回合/看数值/触发结局
- [ ] `git diff packages/core/src` 为空（core 游戏逻辑未被修改）
- [ ] 所有 Logic/Integration story 有对应通过的自动测试
- [ ] 无 S1/S2 bug 遗留
- [ ] QA 计划存在：`production/qa/qa-plan-sprint-1.md`
- [ ] QA sign-off 报告：APPROVED 或 APPROVED WITH CONDITIONS

> ⚠️ **Review Mode**: lean（`production/review-mode.txt`）。PR-SPRINT 可行性门已跳过。
> QA Plan: 生成于 2026-06-01，规范内嵌于下方 `## QA Test Cases`。

---

## QA Test Cases

> 由 `/qa-plan sprint` 生成（2026-06-01）。`/dev-story` 实现时直接参照本节。

### data-testid 规范（前端 S1-FE-002 / S1-FE-003 必须实现）

| 元素 | data-testid |
|------|-------------|
| 新建对局按钮 | `new-game-btn` |
| 年份显示 | `stat-year` |
| 季节显示 | `stat-season` |
| 石高（koku） | `stat-koku` |
| 兵力（levy） | `stat-levy` |
| 民心（contentment） | `stat-contentment` |
| 威信（prestige） | `stat-prestige` |
| 游戏状态（playing/won/lost） | `stat-status` |
| 动作下拉（actionId） | `action-select` |
| rate 参数输入（set_tax 用） | `param-rate` |
| amount 参数输入（levy_troops 用） | `param-amount` |
| 推进回合按钮 | `advance-turn-btn` |
| 回报区（整体容器） | `report-area` |
| actionFacts 文本 | `report-facts` |
| events 文本 | `report-events` |
| 期事文本（issue） | `report-issue` |

---

### S1-BE-002 + S1-BE-003 — Integration 测试（由 S1-QA-001 实现）

**文件**: `apps/worker/src/__tests__/api.test.ts`
**Runner**: `@cloudflare/vitest-pool-workers`

起始数值（来自 `packages/core/content/scenario.json`）：
- `koku = 500`, `levy = 120`, `contentment = 0.6`, `prestige = 0.5`
- `year = 1560`, `season = 'Spring'`, `turn = 0`, `status = 'playing'`

```typescript
// TC-BE-01: 新建对局返回 201 + 起始数值
// expect(res.status).toBe(201)
// expect(body.gameId).toBeTypeOf('string')
// expect(body.state.clan.koku).toBe(500)
// expect(body.state.clan.levy).toBe(120)
// expect(body.state.clan.contentment).toBeCloseTo(0.6)
// expect(body.state.year).toBe(1560)
// expect(body.state.season).toBe('Spring')
// expect(body.state.turn).toBe(0)
// expect(body.state.status).toBe('playing')

// TC-BE-02: GET 已存在对局 → 200
// TC-BE-03: GET 不存在对局 → 404 + { error: string }

// TC-BE-04: POST turn (set_tax 0.5) → 200，season 推进到 Summer，actionLog+1
// expect(r1.state.turn).toBe(1)
// expect(r1.state.season).toBe('Summer')
// expect(r1.state.actionLog.length).toBe(1)
// expect(r1.report.actionFacts).toContainEqual(expect.objectContaining({ kind: 'tax_set' }))

// TC-BE-05: 数值不变量——koku 非 NaN，contentment ∈ [0,1]
// expect(r1.state.clan.koku).not.toBeNaN()
// expect(r1.state.clan.contentment).toBeGreaterThanOrEqual(0)
// expect(r1.state.clan.contentment).toBeLessThanOrEqual(1)

// TC-BE-06: 连续两回合：turn=2, season=Autumn, actionLog.length=2
// TC-BE-07: 非法 actionId → 400
// TC-BE-08: null decree (skip turn) → 200，season 推进，actionLog 不增
// TC-BE-09: 不存在对局推进 → 404
```

估计测试数：**≥ 9 个集成测试**

边界条件：
- `rate = 0` / `rate = 1`（set_tax 极值）→ precondition 通过
- `amount` 超过可负担的 koku（levy_troops 国库不足）→ 400
- 四回合后 season 回到 Spring，year 增 1

---

### S1-FE-002 + S1-FE-003 — Playwright E2E（由 S1-QA-002 实现）

**文件**: `apps/web/e2e/game-flow.spec.ts`
**Runner**: `@playwright/test`

```typescript
// E2E-01: 新建对局显示初始数值
// page.click('[data-testid="new-game-btn"]')
// expect('[data-testid="stat-year"]').toContainText('1560')
// expect('[data-testid="stat-season"]').toContainText('Spring')
// expect('[data-testid="stat-koku"]').toContainText('500')

// E2E-02: set_tax 推进一回合 → season 变 Summer，回报区显示"税率"
// page.selectOption('[data-testid="action-select"]', 'set_tax')
// page.fill('[data-testid="param-rate"]', '0.5')
// page.click('[data-testid="advance-turn-btn"]')
// expect('[data-testid="stat-season"]').toContainText('Summer')
// expect('[data-testid="report-facts"]').toContainText('税率')

// E2E-03: 多回合（最多 30 次保护）至 status ≠ 'playing'（测试结局触发）
// const status = await page.locator('[data-testid="stat-status"]').textContent()
// expect(['won', 'lost']).toContain(status)

// E2E-04: 移动端 375px viewport — 关键元素可见，无水平溢出
// page.setViewportSize({ width: 375, height: 812 })
// expect('[data-testid="stat-koku"]').toBeVisible()
// expect('[data-testid="advance-turn-btn"]').toBeVisible()
```

---

### Manual Checklist — S1-FE-004（Visual/Feel）

**证据**: `production/qa/evidence/fe004-mobile-screenshot.png`

- [ ] 375px：所有数值面板可见，无水平溢出
- [ ] 768px：布局合理，面板不拥挤
- [ ] 色调有"战国感"（深色/纸张色，非纯白 Bootstrap 风格）
- [ ] 数字字体可读（≥ 14px）
- [ ] "推进回合"按钮点触区域 ≥ 44×44px

---

### Smoke Test 路径（实现完成后 `/smoke-check` 用）

1. `pnpm -F @sengoku/worker dev` 无报错启动
2. `pnpm -F @sengoku/web dev` 无报错启动，`/api` proxy 转发正常
3. 浏览器 `http://localhost:5173`，无 JS 控制台错误
4. 点"新建对局"→ 面板显示 year=1560, koku=500
5. 选 set_tax + rate=0.5 + 点"推进回合"→ season=Summer，回报区显示"税率"
6. `pnpm -r test` 全绿（core 36 + worker ≥9 集成测试）
7. `git diff packages/core/src` 为空
