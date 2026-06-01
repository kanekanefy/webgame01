# 战国大名 AI 模拟器 · 重做预研结论

- **日期**：2026-06-01
- **状态**：预研完成（5 个工作包全部实测验证），待据此 finalize spec
- **方法**：5 个 agent 并行预研，全部基于 curl 实测 + 官方文档，密钥已脱敏不入库。

---

## WP1 · LLM（generalcompute / minimax-m2.7）— ✅ 可支撑

**结论：能支撑 IntentParser + Narrator，但它是 reasoning 模型，成本与截断是主风险。**

| 能力 | 结论 |
|---|---|
| 连通 / chat / `/v1/models` | ✅（同 endpoint 还有 deepseek-v3.1/v3.2） |
| `response_format: json_object` | ✅ 可出合法 JSON（备选） |
| `response_format: json_schema` (strict) | ❌ HTTP 400，不可用 |
| **function calling / tools / tool_choice** | ✅ **最佳**，标准 OpenAI 格式，意图解析准确 |
| `stream: true` SSE | ✅，但 reasoning 先于 content 流出 |
| OpenAI SDK 兼容 | ✅ 改 baseURL 即可 |

**关键特性**：每次调用带大量 `reasoning_tokens`（简单意图解析也 ~357 reasoning tokens），全按 output 计费。

**实现要点**：
- IntentParser 用 **function calling**（每个动作 = 一个 tool，`tool_choice:"required"` 强制选一，拒绝做成 `reject_intent` 工具）。
- **必须给足 `max_tokens`（≥1500）**，否则 reasoning 吃光预算导致 JSON 截断（最隐蔽的坑）。
- 解析只读 `tool_calls`，**忽略 `reasoning`**；本地白名单校验 + 解析失败重试 1 次 + 兜底 `{rejected}`。
- json_schema 这条路**放弃**。
- Narrator 走流式，前端区分 `delta.reasoning`（丢弃）vs `delta.content`（展示）。古风中文叙事质量**优秀**。

**参数**：$0.40/1M input，$2.34/1M output（reasoning 算 output）；160k 上下文；有 TPM 限流；注册送 $100。
**粗算成本**：一局 ~30 回合（每回合 IntentParser+Narrator）约 $0.2–0.3/局，注册额度够跑数百局测试。
**优化方向**：IntentParser 高频且对叙事质量无要求，可考虑同 endpoint 更便宜的 deepseek 做意图解析、minimax 专做叙事；并对常见意图做缓存。

---

## WP2 · 生图（agnes-ai image-2.1-flash）— ✅ 便宜，定位"概念图+精修"

- Endpoint `POST https://apihub.agnes-ai.com/v1/images/generations`，模型名 `agnes-image-2.1-flash`，OpenAI Images 兼容。
- 实测：HTTP 200，~3.8s，返回 **GCS 上的 PNG URL**（非 base64），**约 $0.003/张**（按张计费）。
- **缺 seed / negative / style 参数** → 同角色多图一致性差，**不适合量产成品**，适合概念草图 + 人工精修。
- "high information density" = 画面复杂度，**不是文字渲染**；游戏内文字一律走前端文本层，不让图像模型写字。
- 返回 URL 在 test bucket，可能临时 → **预生成后必须立即下载落库**，绝不直链。
- 适配：事件插画/UI背景/概念图（最佳）> 家臣立绘（需图生图+精修）> 图标（弱）。
- 管线：建 `prompts.jsonl` → 并发 3–5 调用（自建限流+退避，文档无 rate limit 说明）→ 立即下载 → 多抽人工筛 → 设计师精修 → `public/assets`。

---

## WP3 · 音频（ElevenLabs）— ✅ 可用，但账号是 Creator 非 Pro

- ⚠️ **实测账号是 Creator 档（131k 字符/月），不是 Pro。** 规模化配音前需升级（Pro $99/600k）。
- 中/日文 TTS 可用，文言句无碍；推荐 `eleven_v3`（精品台词/旁白）、`eleven_multilingual_v2`（批量预生成主力）。
- **口音短板**：内置 21 个 voice 全英美口音，念中文有口音 → 上线前用 Voice Library 母语声音或专业声音克隆（账号有 1 槽）。
- Sound Effects API 可用（UI音效/环境音，支持 `loop`，≤30s）。
- **所有付费档含商用授权** ✅。
- MVP 建议：做 **UI 音效 + 1–2 条循环环境音 + 少量精品事件旁白**；全量家臣配音放文案定稿后的后期。全预生成为静态资源，运行时零调用。

---

## WP4 · Cloudflare 全栈部署 — ✅ 独立扛住，不需要 VPS

- **推荐：单 Worker + Static Assets**（官方已建议新项目用 Workers 而非 Pages；DO 是 Workers-only）。
- 路由：`assets.run_worker_first: ["/api/*"]` + `not_found_handling: "single-page-application"`（React SPA + 同域 API）。
- **LLM 代理限制澄清**：
  - subrequest：Free 50/请求，Paid 1000 —— 单次转发仅 1，够用。
  - **CPU time：Free 10ms / Paid 30s，但等待 LLM 的网络时间不计入 CPU！**
  - **wall-clock 无上限** —— LLM 跑 60s 也不会被杀。
  - SSE 流式：`return new Response(upstream.body, {headers:{'Content-Type':'text/event-stream'}})` 直接透传。
- SQLite-backed DO **免费可用**，"一局=一个 DO"是教科书用法（串行化保证确定性重放）。
- Secret：`wrangler secret put` + 本地 `.dev.vars`（进 .gitignore）；密钥只活在 Worker，前端永不接触。
- 同域 → 免 CORS。CI：测试门禁 → build 前端 → `wrangler deploy`。
- **建议生产直接上 Workers Paid（$5/月）** 消除 Free 的 subrequest/CPU 限制；开发用 Free。

---

## WP5 · CCGS 工作流框架（webgame01/.claude）— 治理层复用，执行层换 web

CCGS 是三层科层制：**Director（Opus 决策/守门）→ Lead（派活）→ Specialist（执行）**，含 49 agents / 73 skills / 12 hooks。

- **直接复用（与引擎无关的治理层）**：全部 Directors（creative/technical/producer）+ `production/sprint-status.yaml` 追踪 + 命令链（`/brainstorm /map-systems /create-epics /create-stories /sprint-plan /story-readiness /story-done /code-review /gate-check /qa-plan /smoke-check /release-checklist`）+ hooks（validate-commit/push、session/compact）+ leads（game-designer/narrative-director/qa-lead）+ specialists（systems-designer/economy-designer/ux-designer/writer/world-builder/qa-tester/analytics）。
- **需改造**：`ui-programmer`→React 工程师；`gameplay-programmer`→TS 数值核心工程师；`devops-engineer`→补 Cloudflare/wrangler；`security-engineer`→Worker 鉴权/prompt 注入防护；`performance-analyst`→Web Vitals；rules/hooks 换内核（`validate-commit` 接 `pnpm tsc --noEmit && pnpm test`）。
- **弃用**：所有 godot/unity/ue 特化 + engine/network programmer 等 ~20 个。
- **需新建 web 角色**：`frontend-engineer`、`cloudflare-devops`、`backend-engineer`(Worker)、`narrative-systems-engineer`(LLM 管线)、`web-qa`(Playwright/Lighthouse)、`game-balance-engineer`(TS 数值表+回放校验)。
- **落地**：monorepo 收编 `.claude` 为治理层 → 裁剪/改造/新建 agent 名册 + 重写 `/dev-story` 路由表 → 换 rules/hooks 内核保留触发框架 → 照搬七阶段+gate 流程按 web 节奏跑。
- 注意：`production/` 目录在首次跑 `/sprint-plan` 时按模板生成。
- 现有 headless runner + 确定性回放 + 集成测试，正好喂给 `/smoke-check` 和 web-qa 当关键路径冒烟/回归证据。

---

## 对设计的影响（汇总）

1. **LLM 层**：IntentParser 锁定 function calling 方案（非 json_schema）；架构图里 Provider 接口要支持 `tool_choice` 与足量 max_tokens；考虑 IntentParser/Narrator 用不同模型分摊成本。
2. **部署层**：thin-slice 的 `wrangler.jsonc` 升级——`assets.directory`→`apps/web/dist`、加 `run_worker_first`/`not_found_handling`、新增 `/api/llm` 流式代理路由；生产规划 Paid。
3. **美术/音频**：定位为 MVP **轻量纳入**——预生成概念图/事件插画 + UI音效/环境音/少量旁白；不追求量产一致立绘与全量配音。
4. **工作流**：先做 `.claude` 收编与 web 化改造（裁剪+新建 6 个 web 角色 + 换 rules/hooks 内核），再按 CCGS 流程开工。

## 更新后的待决策清单

| # | 决策点 | 建议默认 | 状态 |
|---|---|---|---|
| A | monorepo 仓库命名 | 继续 webgame01 或改游戏名 | **待用户** |
| C | 美术&音频 MVP 深度 | 轻量纳入（概念图+少量音效旁白） | **待用户** |
| D | IntentParser 用 minimax 还是更便宜模型 | 先 minimax+缓存，量大再分模型 | 可由实现定 |
| — | CF 生产是否上 Paid($5/月) | 是（消除 Free 限制） | 建议默认 |
| — | ElevenLabs 是否升级 Pro | MVP 不急，规模化配音前再升 | 建议默认 |
| B/E | 美术风格 / 文风 | 晚定 | 可晚定 |
| F | 手游(Capacitor)时机 | web MVP 之后 | 确认即可 |
| G | 迁移保留 git 历史 | 保留 | 建议默认 |
