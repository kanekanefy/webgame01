# 战国大名 AI 模拟器 · 重做总设计（Monorepo + Web + AIGC）

- **日期**：2026-06-01
- **状态**：设计待用户复核 → 通过后进入 writing-plans
- **取代/整合**：本文件是重做的"总 spec"，整合并更新 [`2026-05-29-sengoku-ai-sim-design.md`](2026-05-29-sengoku-ai-sim-design.md)（游戏四层架构，仍有效）与 [`2026-05-29-cloudflare-thin-slice-design.md`](2026-05-29-cloudflare-thin-slice-design.md)（部署，升级版见下）。预研依据见 [`../research/2026-06-01-redo-preresearch-findings.md`](../research/2026-06-01-redo-preresearch-findings.md)。

---

## 1. 定位

一句话：**把已完成的 sengoku-sim TS 数值核心，迁入以 webgame01 为根的 pnpm monorepo，配上 React Web 前端、Cloudflare 全栈后端、真实 LLM 的 AIGC 叙事层，并按 CCGS 工作流调度开发。**

- 玩法：数值内核（确定性仿真）+ AIGC 叙事表层。**数值是唯一真相，LLM 只做翻译/叙事，绝不碰数值。**
- 题材：日本战国（现有 core + content 全部复用）。
- 路线：web 起步，核心引擎无关解耦，Godot 作为按需启用的未来选项（不现在引入）；手游用 Capacitor/PWA，web MVP 之后启动。

## 2. 已锁定决策（brainstorming + 预研）

| 维度 | 决策 |
|---|---|
| 地基 | 以 **webgame01** 仓库为根（不改名）改造成 pnpm workspace monorepo，保留 `.claude` 为治理层 |
| 玩法 | 数值内核 + AIGC 叙事；题材日本战国 |
| 前端 | **React + Vite + Tailwind**，轻量 Zustand（游戏态在 core，UI 态薄） |
| 后端/部署 | **Cloudflare 单 Worker + Static Assets**，DO 承载对局会话，Worker 代理 LLM；前后端都上 CF，不用 VPS |
| LLM | generalcompute / **minimax-m2.7**（OpenAI 兼容），IntentParser 用 **function calling**，Narrator 流式 |
| 美术 | **轻量**：agnes-ai 预生成概念图/事件插画/UI背景占位 |
| 音频 | **轻量**：ElevenLabs 预生成 UI音效 + 环境音 + 少量精品事件旁白（账号 Creator 档，规模化前升 Pro） |
| 工作流 | CCGS 治理层复用，执行层换 6 个 web 角色 |
| 手游 | Capacitor/PWA，web MVP 之后 |
| 迁移 | 保留 pgame git 历史（subtree/filter 并入 `packages/core/`） |

## 3. Monorepo 结构

```
webgame01/  (monorepo 根, pnpm workspace)
├── .claude/              # 治理层(改造后): 裁剪引擎角色 + 新建 web 角色 + 换 rules/hooks 内核
├── packages/
│   ├── core/             # A层 纯仿真引擎(pgame 迁入)·引擎无关·零IO零LLM·确定性可回放
│   │                     #   rng/modifiers/economy/contentment/actions/loop/save/scenario
│   └── ai/               # B+C层 LLM Provider抽象 + IntentParser + Narrator + 时代锁/护栏
├── apps/
│   ├── web/              # D层 React+Vite+Tailwind 前端(朝议界面/数值面板/自由文本输入)
│   └── worker/           # Cloudflare Worker: /api 路由 + GameSession DO + /api/llm 流式代理
├── content/              # 数据驱动: scenario/actions/events/period-bible (战国语境)
├── docs/                 # 合并 pgame specs/plans/research + webgame01 文档
├── production/           # CCGS sprint 追踪(首次 /sprint-plan 生成; session-state 入 gitignore)
├── pnpm-workspace.yaml
├── wrangler.jsonc        # 单 Worker 配置(见 §7)
└── package.json          # 根脚本编排(test/dev/build/deploy)
```

**隔离铁律**：`packages/core` 零 UI、零引擎、零 IO 依赖，纯函数式确定性。`apps/web`、`apps/worker`、未来的 `godot-bridge` 都只是它的消费者——这就是 Godot 退路的物理保证。

## 4. 运行时分层与数据流

沿用四层架构（**只有 core 能改状态，且只能经已注册的合时代动作；LLM 全在边缘**）：

```
玩家自由文本(web) ──POST /api/games/:id/turn──▶ Worker
                              ├─ ai: 意图评审(时代闸) → IntentParser(function calling) → {动作|拒绝}
                              ├─ core: advanceTurn(确定性) → outcomeFacts + 新状态
                              ├─ ai: Narrator 流式叙事(家臣台词/事件文本, 永不碰数值)
                              └─ GameSession DO: serialize 持久化(rngState 随状态, 可回放)
                          ◀── { report(叙事+facts), state(数值) } ── web 渲染
```

## 5. 技术栈锁定

| 层 | 选型 |
|---|---|
| 语言 | TypeScript（全栈统一） |
| 包管理 | pnpm workspaces（初期不上 turborepo，包多再加） |
| 核心引擎 | 纯 TS，vitest 测试（现有 36 个用例迁入） |
| 前端 | React + Vite + Tailwind + Zustand |
| 后端 | Cloudflare Workers + Durable Objects(SQLite-backed) |
| LLM SDK | OpenAI 兼容 SDK 指向 generalcompute baseURL |
| 测试 | vitest 双池：node 池(core) + `@cloudflare/vitest-pool-workers`(worker)；E2E 用 Playwright |
| 部署 | wrangler；CI 用 GitHub Actions（测试门禁 → build → deploy） |

## 6. LLM 集成方案（预研定型）

- **Provider 接口**：`complete(messages, {tools?, tool_choice?, max_tokens, stream?})`，适配器含 `MockProvider`（测试用，零网络）+ generalcompute 真实适配器。
- **IntentParser**：每个合法动作注册为一个 tool（参数 = 该动作 paramsSchema），`tool_choice:"required"` 强制选一；"拒绝" = `reject_intent(reason, category)` 工具。**`max_tokens ≥ 1500`** 防 reasoning 截断；只读 `tool_calls` 忽略 `reasoning`；本地白名单校验 + 失败重试 1 次 + 兜底 `{rejected}`。**不使用 json_schema**（实测 400）。
- **Narrator**：流式；前端区分 `delta.reasoning`（丢弃）vs `delta.content`（展示）。
- **成本控制**：minimax 为推理模型按 output 计费（reasoning 计入）；一局 ~$0.2–0.3。优化：缓存常见意图；必要时 IntentParser 改用同站更便宜的 deepseek-v3.x，叙事保留 minimax。

## 7. 部署架构（thin-slice 升级版）

`wrangler.jsonc` 要点：
```jsonc
{
  "name": "sengoku-sim",
  "main": "apps/worker/src/index.ts",
  "compatibility_date": "2025-05-01",
  "assets": {
    "directory": "./apps/web/dist",
    "binding": "ASSETS",
    "run_worker_first": ["/api/*"],
    "not_found_handling": "single-page-application"
  },
  "durable_objects": { "bindings": [{ "name": "GAME_SESSION", "class_name": "GameSession" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["GameSession"] }]
}
```
- 路由：`/api/*` → Worker；其余 → 静态资产；前端 client-route 回退 `index.html`。
- **LLM 代理 `/api/llm`**：`return new Response(upstream.body, {headers:{'Content-Type':'text/event-stream'}})` 透传 SSE。等待 LLM 不计入 CPU time，wall-clock 无上限。
- **DO**：SQLite-backed，"一局=一个 DO"，串行化保证 `advanceTurn` 无竞争、`rngState` 随状态持久化可重放。
- **Secret**：`wrangler secret put`（生产）+ `.dev.vars`（本地，进 .gitignore）。密钥只活在 Worker，**前端永不接触**。
- **同域免 CORS**。生产建议 Workers **Paid($5/月)** 消除 Free 的 subrequest(50)/CPU(10ms) 限制。

## 8. 美术 / 音频管线（轻量）

> **管线 SOP 见 [`design/art/art-pipeline.md`](../../../design/art/art-pipeline.md)**（两段式：上游用 `imgen` 定调出高质量视觉锚点，提炼色温/媒介/构图三件套；下游 agnes-ai 按锚点批量铺量）。下文 agnes 批量即该 SOP 的「铺量」环节。

- **美术（上游定调 imgen + 下游批量 agnes-ai image-2.1-flash, ~$0.003/张）**：开发期预生成。先 `imgen` 定调锚点（`design/art/concept/`）→ agnes `prompts.jsonl` 复述锚点风格参数 → 并发 3–5 调用(自建限流+退避) → **立即下载落库**(返回 URL 是 test bucket，不可直链) → 多抽人工筛 → 精修 → `apps/web/public/assets`。优先级：事件插画/UI背景/概念图 > 立绘(图生图+精修) > 图标。游戏内文字**一律前端渲染**，不让图像模型写字。`prompts.jsonl` → 并发 3–5 调用(自建限流+退避) → **立即下载落库**(返回 URL 是 test bucket，不可直链) → 多抽人工筛 → 精修 → `apps/web/public/assets`。优先级：事件插画/UI背景/概念图 > 立绘(图生图+精修) > 图标。游戏内文字**一律前端渲染**，不让图像模型写字。
- **音频（ElevenLabs Creator 档 131k/月，含商用授权）**：预生成 UI音效 + 1–2 条循环环境音(`loop:true`) + 少量精品事件旁白(`eleven_v3`)。全量家臣配音 + 母语声音克隆放文案定稿后。运行时零调用，全静态资源。

## 9. CCGS 工作流落地（.claude 改造）

- **复用（治理层）**：Directors(creative/technical/producer) + `production/sprint-status.yaml` 追踪 + 命令链(`/brainstorm /create-epics /create-stories /sprint-plan /story-readiness /story-done /code-review /gate-check /qa-plan /smoke-check /release-checklist`) + hooks(validate-commit/push, session/compact) + leads(game-designer/narrative-director/qa-lead) + specialists(systems/economy-designer, ux, writer, world-builder, qa-tester, analytics)。
- **改造**：ui-programmer→React 工程师；gameplay-programmer→TS 数值核心；devops→补 Cloudflare；security→Worker 鉴权/prompt 注入；performance→Web Vitals；rules/hooks 换内核（`validate-commit` 接 `pnpm tsc --noEmit && pnpm test`）。
- **休眠保留（不删除）**：所有 godot/unity/ue 特化 + engine/network programmer 等 ~20 个角色**保留待用**——它们是将来转 Godot/手游时的现成角色库（呼应"Godot 作为按需启用的未来选项"，未来选项与其配套角色资产成对保留）。现阶段仅在 `/dev-story` 路由表中不参与 web 路由，不激活、不消耗；引擎阶段直接启用。重写 `/dev-story` 路由表时按 `packages/` 路由到 web 角色。
- **新建 web 角色**：`frontend-engineer`、`cloudflare-devops`、`backend-engineer`、`narrative-systems-engineer`、`web-qa`、`game-balance-engineer`。

## 10. 迁移路线图与里程碑

**迁移步骤**：① clone webgame01 加 monorepo 骨架；② pgame `src/core`+`tests`+`content` 经 git subtree/filter 迁入 `packages/core`+`content`（保留历史，一行不改，测试全绿）；③ docs 合并；④ `.claude` 收编改造（§9）；⑤ 搭 web 壳；⑥ 搭 worker(复用 thin-slice)；⑦ 接 ai 层；⑧ 真接 LLM + CF 部署。

| 阶段 | 内容 | 验收 |
|---|---|---|
| **R0** | monorepo 骨架 + core/content/docs 迁入 + `.claude` web 化改造 | `pnpm test` 全绿；`.claude` 角色名册已 web 化 |
| **R1** | web 前端壳 + worker(mock provider) + DO 会话 | 浏览器新建对局/推进回合/看数值变化(纯数值闭环) |
| **R2** | ai 层(IntentParser function calling + Narrator + 时代锁) 接 mock | 自由文本→动作/拒绝→叙事，全程零真实 LLM 可测 |
| **R3** | 真接 minimax-m2.7 + CF 部署 + CI + 轻量美术音频占位 | 线上可玩、真 AIGC 叙事的战国大名 MVP |

## 11. 安全与密钥纪律

- 4 个外部密钥（generalcompute/agnes/elevenlabs/CF）**绝不进 git**：生产走 `wrangler secret put`，本地走 `.dev.vars`（.gitignore），文档/代码只用占位符。
- 密钥已在对话明文出现，**建议定型后轮换**（至少 generalcompute）。
- Worker 端校验/限流，防 prompt 注入与存档篡改（security 角色职责）。

## 12. 测试策略

- **core**：种子化单测 + 不变量属性测试(contentment∈[0,1]、koku 非 NaN) + 回放测试(log+seed 复现)。
- **ai 层**：对 MockProvider 契约测试(已知短语→已知动作；时代错误→拒绝)。
- **worker**：`@cloudflare/vitest-pool-workers` 跑 API+DO happy-path。
- **集成/E2E**：MockProvider 脚本化 playthrough 跑 N 回合断言不变量；Playwright 关键路径。
- 现有 headless runner + 确定性回放喂给 `/smoke-check` 与 web-qa 当冒烟/回归证据。

## 13. 待定 / 风险

- IntentParser 模型选择（minimax vs deepseek）按实现期成本实测定。
- LLM TPM 限流具体配额未公开，高并发需实测。
- agnes 无 rate limit 文档 → 预生成自建限流。
- ElevenLabs 口音 → 规模化前换母语声音；账号需升 Pro。
- 美术风格(B)/文风(E) 晚定。
