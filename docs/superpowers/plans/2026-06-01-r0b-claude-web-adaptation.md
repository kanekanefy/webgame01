# R0b · CCGS 工作流 web 化改造 实施计划

> **For agentic workers:** 本计划是 **配置/提示词工程**（非 TDD 代码实现），故采用清单式任务而非"写测试→实现"循环。验收靠人工 review + 配置生效验证。所有改动在 `/Users/kane/Desktop/project/webgame01`。

**Goal:** 把 webgame01 自带的 CCGS 工作流从"面向 Godot/Unity/UE 原生引擎"改造成"面向 React+Vite+TS+Cloudflare web 栈"，引擎角色/规则**休眠保留**（零删除），新增 web 角色与规则，路由转向 web，让 CCGS 能按本项目技术栈调度开发。

**Architecture:** 高杠杆点是 `.claude/docs/technical-preferences.md`（dev-story 路由读它）+ `dev-story/SKILL.md` 路由表。改这两处 + 新增 web 角色/规则 + 换 settings/hook 的 python→pnpm 内核，即完成转向。引擎资产原地不动（休眠）。

**Scope 边界:** 只改 CCGS 工作流配置层。不写游戏代码（apps/web、apps/worker、packages/ai 属 R1+）。

---

## 批次 1 · 技术基准与质量门（infra）

每项独立，改完整批 commit。

- [ ] **T1.1 改写 `.claude/docs/technical-preferences.md`** —— web 栈基准
  - `Engine:` → 标注 `Web (React + Vite + TypeScript)`；新增 `Stack:` 段（React/Vite/Tailwind/Zustand、Cloudflare Workers+DO、pnpm、vitest、Playwright）
  - 命名约定（组件 PascalCase、文件 kebab/camel、事件命名）；性能预算改 **Web Vitals**（LCP/INP/CLS）+ bundle size + Worker CPU
  - 禁止模式：core 层禁 IO/LLM/UI 依赖；数值不硬编码（走 content）；前端禁接触密钥
  - 新增 `Engine Specialists` 段标注：当前 web，引擎 specialist 休眠
- [ ] **T1.2 改 `.claude/settings.json`** —— 权限内核
  - `permissions.allow`：python/pytest → 加 `pnpm *`、`pnpm -r test*`、`npx vitest*`、`npx wrangler*`、`pnpm tsc*`、`node *`
  - `permissions.deny`：保留现有 + 增 `Read(**/.dev.vars*)`、`Bash(cat *.dev.vars*)`（密钥防护）
  - hooks/statusline 段不动
- [ ] **T1.3 改 `.claude/hooks/validate-commit.sh`** —— 质量门内核
  - JSON 校验：python json.tool → `node -e` 解析（去 python 依赖），路径 `assets/data` → `content/` + `packages/*/content`
  - 硬编码数值检查路径 `src/gameplay/` → `packages/core/src`
  - 设计文档检查 `design/gdd/` 保留；TODO 检查保留
  - 末尾追加（非阻塞提示）：暂存含 `.ts` 时提示"建议 `pnpm -r test` 与 `pnpm tsc --noEmit`"
- [ ] **T1.4 新建根 `CLAUDE.md`** —— 项目治理总纲
  - 声明栈、monorepo 目录约定（packages/apps/content）、生效的 web 角色清单、休眠的引擎角色清单、路由约定、密钥纪律。链接 spec 与 ccgs-framework-readme。
- [ ] **T1.5 commit 批次 1**：`feat(ccgs): web 栈技术基准与质量门内核`

## 批次 2 · web 角色（agents，沿用 CCGS frontmatter 格式）

新建 6 个 `.claude/agents/*.md`（frontmatter: name/description/tools/model/maxTurns + 正文: 身份/协作协议/职责/标准/禁止/Delegation Map）：

- [ ] **T2.1 `frontend-engineer.md`** — React+Vite+Tailwind+Zustand；朝议界面/数值面板/流式叙事渲染；报 lead-programmer
- [ ] **T2.2 `backend-engineer.md`** — Cloudflare Worker API 路由 + GameSession Durable Object + 存档持久化；报 lead-programmer
- [ ] **T2.3 `cloudflare-devops.md`** — wrangler 部署/secret/预览/回滚/CI；补 release-manager 在 CF 的执行；报 technical-director
- [ ] **T2.4 `narrative-systems-engineer.md`** — LLM 管线：Provider 抽象/IntentParser(function calling)/Narrator(流式)/prompt 工程/成本/时代锁；报 narrative-director + lead-programmer
- [ ] **T2.5 `game-balance-engineer.md`** — packages/core TS 数值核心实现 + 确定性回放校验 + 不变量测试；报 lead-programmer + 实现 economy/systems-designer 的设计
- [ ] **T2.6 `web-qa.md`** — Playwright E2E + Lighthouse + vitest 双池；改造 qa-tester 执行手段；报 qa-lead
- [ ] **T2.7 commit 批次 2**：`feat(ccgs): 新增 6 个 web 栈开发角色`

## 批次 3 · 规则与路由（rules + routing）

- [ ] **T3.1 新建 rules**：`.claude/rules/{react-code,worker-code,ts-core,llm-prompt}.md`（沿用现有 rule 格式：约束 + 模式 + 反模式）
- [ ] **T3.2 改 `.claude/skills/dev-story/SKILL.md` 路由表**：Phase 3 主路由按 **路径/Layer/Type** → web 角色（`packages/core`→game-balance-engineer；`apps/web`/Type:UI→frontend-engineer；`apps/worker`→backend-engineer；`packages/ai`→narrative-systems-engineer；部署→cloudflare-devops）。引擎 specialist 段标注"仅当 technical-preferences Engine=Godot/Unity/UE 时启用（当前 web，休眠）"
- [ ] **T3.3 更新 `.claude/docs/agent-coordination-map.md`**：新增"Web 栈角色映射（当前生效）"小节，引擎层标注休眠保留
- [ ] **T3.4 commit 批次 3**：`feat(ccgs): web 路由表与规则；引擎层标注休眠`

## 验收

- [ ] technical-preferences 标明 web 栈；dev-story 路由表含 web 分支且引擎段标注休眠
- [ ] 6 个 web agent 定义存在且 frontmatter 合法
- [ ] settings.json 权限为 pnpm/wrangler 导向，.dev.vars 受 deny 保护
- [ ] 引擎 agent/rule 文件**未被删除**（`git status` 确认无 delete）
- [ ] 根 CLAUDE.md 声明栈与角色映射
- [ ] push 到 webgame01 远程（需用户确认）

## 已知偏离

- 不逐字搬运 CCGS 全部 49 角色的改造；聚焦"最小可用 web 调度"所需的 6 新角色 + 关键路由/规则/门禁。其余角色（directors/leads/多数 specialists）与引擎层原样保留。
