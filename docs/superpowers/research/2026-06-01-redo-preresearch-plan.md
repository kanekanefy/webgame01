# 战国大名 AI 模拟器 · 重做预研计划

- **日期**：2026-06-01
- **状态**：预研进行中（开工前 de-risk，尚未进入实现）
- **目的**：在把已有资产迁入 webgame01 monorepo、正式开工之前，把所有"未知/有风险"的技术点先验证清楚，产出足够高、足够好的预研结论，再 finalize spec → writing-plans。

## 0. 已锁定的前置决策（来自 brainstorming）

- **玩法形态**：数值内核 + AIGC 叙事表层（数值是唯一真相，LLM 只做翻译/叙事，绝不碰数值）。
- **题材**：继续日本战国（pgame 现有 core + content 全部复用）。
- **技术路线**：web 起步——`packages/core`（引擎无关 TS 数值核心，一行不改迁入）+ `apps/web`（React+Vite+Tailwind）+ `apps/worker`（Cloudflare Worker + Durable Object 会话 + LLM 代理）。核心保持引擎无关，Godot 作为按需启用的未来选项，不现在引入。手游用 Capacitor/PWA，web MVP 之后启动。
- **地基**：以 webgame01 仓库为根改造成 pnpm workspace monorepo；保留其 `.claude` 多 agent 开发工作流作为流程层。
- **部署**：前后端都上 Cloudflare（本地 wrangler 已鉴权）；VPS/Docker 作备选。
- **外部能力（密钥仅存 CF Secret / .dev.vars，永不进 git）**：
  - LLM：generalcompute（OpenAI 兼容，模型 minimax-m2.7）
  - 生图：agnes-ai image-21-flash
  - 配音/音效：ElevenLabs Pro

## 1. 预研目标

开工前必须回答清楚的高风险问题：

1. minimax-m2.7 **支不支持结构化输出**（JSON mode / function calling）？——决定 IntentParser 的实现方式与可靠性。
2. Cloudflare 单部署单元能否同时托管 **前端静态资产 + API + DO + 对外部 LLM 的流式代理**？有哪些限制（CPU time、subrequest、SSE）？
3. agnes-ai 生图、ElevenLabs 配音的**真实能力、返回格式、成本、限流**，以及它们在游戏里的合理定位（预生成 vs 运行时）。
4. webgame01 的 `.claude` 工作流框架**到底定义了哪些角色/skill/流程**，如何落地到这个 web monorepo（它原本面向 Godot/Unity）。
5. monorepo 工具链（pnpm + Vite + React + Tailwind + wrangler + vitest 双池）的**版本兼容与最佳配置**。

## 2. 工作包（multi-agent 并行）

> 按 CCGS「工作室」风格临时分工；正式开工后改用 WP5 摸清的真实角色体系。

### WP1 · LLM 集成（generalcompute / minimax-m2.7）— 最高优先
- 验证 key 有效性、模型可用性、OpenAI 兼容程度（能否直接用 openai sdk / vercel ai sdk）。
- **关键**：结构化输出能力——`response_format: json_object`、JSON schema、function/tool calling 支持到什么程度。
- 流式 SSE 支持、上下文长度、延迟、定价、限流。
- 中文/古文/角色扮演能力小测（家臣台词、意图解析样例）。
- **产出**：能力矩阵 + 对 IntentParser/Narrator 设计的影响 + 推荐调用方式 + 若不支持结构化输出的降级方案。

### WP2 · 美术生图管线（agnes-ai image-21-flash）
- 读官方文档；最小一次生图验证连通性（返回 URL 还是 base64、耗时、分辨率）。
- 风格控制、是否适合战国/水墨/UI 素材、文字渲染能力、成本、限流。
- **产出**：能力报告 + MVP 美术管线建议（倾向预生成静态素材，而非运行时生成）。

### WP3 · 音频管线（ElevenLabs Pro）
- 账号/API 能力、中文/日文 TTS 质量、音效（sound effects）生成、API 用法、成本。
- **产出**：能力报告 + 音频管线建议（家臣配音预生成 vs 运行时）。

### WP4 · Cloudflare 全栈部署
- React(Vite) 静态资产 + Worker + DO 在单部署单元的最佳实践（Workers Static Assets vs Pages+Functions）。
- Worker 当 LLM 代理：对外部 API 的**流式 SSE 转发**、CPU time / wall-clock / subrequest 限制。
- Secret 管理（wrangler secret put / .dev.vars）、前后端同域免 CORS、CI 自动部署（沿用 thin-slice 设计）。
- **产出**：可行性确认 + 架构细节 + 风险点清单 + 是否需要 VPS 备选的结论。

### WP5 · CCGS 工作流框架深挖（webgame01/.claude）
- 深读 webgame01 的 `.claude`：有哪些 agent 角色、skill 命令、hook、规则、开发流程（sprint/PR/QA）。
- 它面向 Godot/Unity，如何适配到 web monorepo 的开发调度。
- **产出**：工作流角色地图 + 「如何按 CCGS 调动队伍」的落地方案。

### WP6 · monorepo 工具链（并入 WP4 或主理人整理）
- pnpm workspace + Vite + React + Tailwind + wrangler + vitest 双池（node + workers）的版本兼容与配置坑。
- **产出**：技术栈版本锁定建议。

## 3. 待用户决策清单（多数可等预研结果）

| # | 决策点 | 何时定 |
|---|---|---|
| A | monorepo 仓库命名（webgame01 / 改名） | 用户随时 |
| B | 美术风格（水墨/浮世绘/像素/写实） | 可晚定 |
| C | 美术&配音在 MVP 的深度 | 等 WP2/WP3 |
| D | LLM 锁定 minimax-m2.7 或备选 | 等 WP1 |
| E | 文风（中文/中日混古风/文言浓度） | 可晚定 |
| F | 手游(Capacitor) 启动时机 | 确认即可 |
| G | 迁移是否保留 pgame git 历史 | 建议保留 |

## 4. 预研产出如何汇入

各 WP 报告汇总 → 更新 `2026-05-29-sengoku-ai-sim-design.md` 与 monorepo 蓝图中的不确定点 → finalize 一份重做 spec → 用户复核 → writing-plans 出实施计划 → 才开工写代码。

**纪律**：预研只读 + 最小连通性验证，不写生产代码、不 scaffold，不违背"别着急开工"。
