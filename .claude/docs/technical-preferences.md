# Technical Preferences

<!-- web 栈配置（取代 /setup-engine 的引擎填充）。所有 agent 引用此文件作为项目标准。 -->
<!-- dev-story / ux-design / test-setup / team-ui / code-review 读此文件决定路由与约束。 -->

## Engine & Language

- **Engine**: Web (React + Vite) — 非游戏引擎，渲染走 DOM/CSS。Godot/手游(Capacitor) 为按需启用的未来选项（休眠）。
- **Language**: TypeScript (strict, ESM)
- **Rendering**: React 18 + Tailwind CSS（面板/文本 UI；无 2D/3D 实时渲染）
- **Physics**: 无（数值模拟，确定性 TS 引擎）

## Input & Platform

- **Target Platforms**: Web（桌面 + 移动浏览器）；手游 via Capacitor/PWA（web MVP 之后）
- **Input Methods**: Keyboard/Mouse + Touch
- **Primary Input**: 鼠标/触摸点击 + 自由文本输入框（玩家自然语言下令）
- **Gamepad Support**: None
- **Touch Support**: Full（面板交互）
- **Platform Notes**: 移动浏览器优先；本项目无 3D，天然规避重渲染/风扇问题

## Naming Conventions

- **Classes/Components**: PascalCase（React 组件、TS class/interface/type）
- **Variables**: camelCase
- **Signals/Events**: camelCase 动词短语；自定义事件 `on<Event>`；store action 用动词
- **Files**: 组件 `PascalCase.tsx`；其余 `kebab-case.ts` 或既有 `camelCase.ts`；测试 `*.test.ts`
- **Scenes/Prefabs**: N/A（无引擎场景）
- **Constants**: UPPER_SNAKE_CASE

## Performance Budgets

- **Target**: 交互 INP < 200ms；LCP < 2.5s；CLS < 0.1（Web Vitals）
- **Bundle**: 初始 JS gzip < 200KB（按需分包/懒加载）
- **Worker**: 单请求 CPU < 30ms（Paid 档）；等待 LLM 的网络时间不计入 CPU；流式透传不缓冲
- **Memory**: 长列表虚拟化，避免全量渲染

## Testing

- **Framework**: vitest（node 池跑 `packages/core` + `@cloudflare/vitest-pool-workers` 跑 `apps/worker`）；E2E 用 Playwright；Web Vitals 用 Lighthouse
- **Minimum Coverage**: 核心引擎逻辑 + 不变量属性 + 确定性回放必测
- **Required Tests**: 数值公式、回合循环、经济/民心、存档回放、Worker API/DO、IntentParser 对 MockProvider 的契约

## Forbidden Patterns

- `packages/core` 内禁止任何 IO / 网络 / LLM / UI 依赖（保持引擎无关、可确定性回放）
- 数值不得硬编码于代码——走 `content/` 数据
- 前端禁止接触任何 API 密钥（密钥只在 Worker，走 CF Secret / 本地 `.dev.vars`）
- LLM 输出禁止直接写入游戏状态——必须经 `packages/core` 已注册动作校验
- core 内禁用 `Date.now()` / `Math.random()`（破坏确定性，用种子化 RNG）

## Allowed Libraries / Addons

- 前端：react, react-dom, vite, tailwindcss, zustand
- 后端：@cloudflare/workers-types, wrangler
- LLM：openai（兼容 SDK，baseURL 指向 generalcompute）
- 测试：vitest, @cloudflare/vitest-pool-workers, @playwright/test
- （新增依赖需 technical-director / lead-programmer 批准）

## Architecture Decisions Log

- 重做总设计：`docs/superpowers/specs/2026-06-01-sengoku-redo-monorepo-design.md`
- 预研结论：`docs/superpowers/research/2026-06-01-redo-preresearch-findings.md`
- 用 `/architecture-decision` 创建正式 ADR

## Engine Specialists

- **当前栈 = Web，引擎 specialist 全部休眠**（Godot/Unity/UE 角色保留待用，路由不触达）。
- web 开发路由到下列角色（见 `/dev-story` Phase 3 与 `agent-coordination-map.md`）。

### File Extension Routing

| File Extension / Type | Specialist to Spawn |
|-----------------------|---------------------|
| `packages/core/**/*.ts`（数值核心） | `game-balance-engineer` |
| `apps/web/**/*.tsx`（React UI） | `frontend-engineer` |
| `apps/worker/**/*.ts`（CF Worker/DO） | `backend-engineer` |
| `packages/ai/**/*.ts`（LLM 管线） | `narrative-systems-engineer` |
| wrangler / 部署 / CI | `cloudflare-devops` |
| `content/**/*.json`（数据） | 无需 agent（Config/Data，直接编辑） |
| 引擎文件 (.gd/.cs/.cpp/shader) | [休眠] 启用引擎栈时走对应 specialist |
| General architecture review | `technical-director` / `lead-programmer` |
