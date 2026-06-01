# 戦国大名 · 评定 — 战国大名 AI 模拟器

> 数值内核 + AIGC 叙事的日本战国历史模拟游戏。
> **数值是唯一真相，LLM 只做翻译 / 叙事，绝不碰数值。**
> web 起步，核心引擎无关；Godot / 手游为按需启用的未来选项。

永禄三年（1560），你是一方大名。于「评定之间」运筹年贡、兵备、民心与威信，
撑过乱世、成就霸业。下令既可**点选政令**，也可**自然语言口述**（由家臣 AI 解读为政令）。

**当前状态：alpha（本地可玩，全测试绿）。** 无需任何密钥即可完整游玩（内置 Mock 叙事）；
配置 LLM 密钥后自动升级为真实 AIGC 叙事。

---

## 快速开始

```bash
pnpm install          # 安装（首次会构建 workerd / esbuild）
pnpm dev              # 同时起 Worker(:8787) + Web(:5173)，浏览器开 http://localhost:5173
```

`pnpm dev` 并行启动 Cloudflare Worker（API + Durable Object）与 Vite 前端（代理 `/api`）。
打开页面 → 「开启新局」→ 点选政令或在输入框口述 → 「颁布政令 · 推进一季」。

### 测试

```bash
pnpm -r test          # 全部包：core(36) + ai(15) + worker(13) 集成
pnpm -F @sengoku/web e2e   # Playwright E2E（自动起服务，desktop + mobile）
pnpm -r typecheck     # 全包类型检查
pnpm core:headless    # 命令行跑一局（冒烟）
```

---

## 架构（四层，单向依赖）

```
玩家自由文本/点选 ─POST /api/games/:id/turn─▶ apps/worker
                          ├─ packages/ai：意图解析(function calling) + 时代锁 → {动作|拒绝}
                          ├─ packages/core：advanceTurn(确定性) → facts + 新状态
                          ├─ packages/ai：Narrator 渲染叙事（永不碰数值）
                          └─ GameSession DO：serialize 持久化（rngState 随状态，可回放）
                      ◀── { report(叙事+facts), state(数值) } ── apps/web 渲染
```

| 包 | 职责 | 铁律 |
|---|---|---|
| `packages/core` | 纯仿真引擎（经济/民心/回合/动作/存档） | 零 IO/网络/LLM/UI；确定性可回放；`Date.now`/`Math.random` 禁用 |
| `packages/ai` | Provider 抽象 + Mock/真 LLM + IntentParser + Narrator + 时代锁 | 只产「候选动作」与叙事，**绝不改数值** |
| `apps/worker` | CF Worker：API 路由 + GameSession DO + LLM 代理 | 密钥只在此层；前端永不接触 |
| `apps/web` | React + Vite + Tailwind + Zustand 朝议风 UI | 只渲染状态，不复算数值 |

> **隔离铁律**：`packages/core` 是纯函数确定性引擎，其余皆为消费者——这就是未来转 Godot 的物理保证。

---

## 启用真实 LLM（可选）

不配置则用 MockProvider（零网络、确定、零成本），游戏完整可玩。
要接真实 AIGC 叙事：

```bash
cp .dev.vars.example .dev.vars   # 已 gitignore，绝不入库
# 编辑 .dev.vars 填入 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL
```

Worker 据 `LLM_API_KEY` 是否存在自动切换 Mock / 真 LLM（generalcompute / minimax-m2.7，function calling）。
**密钥只活在 Worker，前端永不接触。**

---

## 部署（Cloudflare）

```bash
pnpm build                       # 构建前端到 apps/web/dist
wrangler secret put LLM_API_KEY  # 生产密钥（可选）
pnpm deploy                      # = pnpm build && wrangler deploy
```

单 Worker 托管：`/api/*` 走 Worker，其余走静态资产（SPA 回退）。同域免 CORS。
生产建议 Workers **Paid($5/月)** 消除 Free 档限制。

---

## 目录

- `packages/core` · `packages/ai` · `apps/web` · `apps/worker`
- `content` — 数据驱动场景（当前随 `packages/core/content/scenario.json`）
- `design/art` — 美术管线 SOP + 定调锚点（[art-pipeline.md](design/art/art-pipeline.md)）
- `docs/superpowers` — 设计 spec / 预研 / 实施纪要
- `.claude` — CCGS 开发工作流治理层（[框架说明](docs/ccgs-framework-readme.md)）
- `production` — sprint 计划 / 状态 / QA 证据

## 设计文档

- [重做总设计](docs/superpowers/specs/2026-06-01-sengoku-redo-monorepo-design.md)
- [R1 web 壳设计](docs/superpowers/specs/2026-06-01-r1-web-shell-design.md)
- [R2 AIGC 叙事实现纪要](docs/superpowers/specs/2026-06-02-r2-ai-narrative-impl.md)
- [外部 API 预研结论](docs/superpowers/research/2026-06-01-redo-preresearch-findings.md)
