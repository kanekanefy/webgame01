# R2 实现纪要 · AIGC 叙事层 packages/ai

- **日期**：2026-06-02
- **状态**：已实现并全测试绿（packages/ai 15 测试 · worker 13 · E2E 12）
- **上游**：总设计 §4/§6（四层架构 + LLM 集成方案）

## 目标达成

自由文本下令 → 意图解析（function calling）→ 合法动作/拒绝 → core 推进 → 叙事渲染，
全程**默认零真实 LLM**（MockProvider），有 `.dev.vars` 密钥即自动切真 LLM。

## 组件（`packages/ai`，纯 TS，workerd 友好）

| 文件 | 职责 |
|---|---|
| `src/provider.ts` | Provider 抽象：`complete(messages, {tools, toolChoice, maxTokens})` |
| `src/mock-provider.ts` | 确定性关键词→toolCall + 名册解析 + 模板叙事（测试/无密钥默认） |
| `src/openai-provider.ts` | OpenAI 兼容 REST（fetch，无 SDK）；适配推理模型（只读 content+tool_calls，maxTokens≥1500） |
| `src/action-schemas.ts` | 5 动作 + `reject_intent` 的 function 工具定义；provinceId/retainerId enum 依 state 注入 |
| `src/period-lock.ts` | 时代锁：拦近现代/异世界词（铁炮不拦） |
| `src/intent-parser.ts` | 跳过词→空过 · 时代锁→拒 · LLM required→校验→重试1次→兜底拒；本地白名单校验 id |
| `src/narrator.ts` | 依 core facts 渲染≤40字气氛文本；失败静默退模板，永不阻断回合 |

## 架构铁律（已守住）

- **数值唯一真相在 core**：ai 只产出「候选 Decree」，执行/校验仍走 core 动作 precondition。
- **LLM 全在边缘**：provider 只在 Worker 实例化；前端永不接触密钥。
- **零真实网络可测**：MockProvider + 注入式 fetch（OpenAIProvider 测试用 fakeFetch）。

## Worker 接线（`apps/worker/src`）

- `ai.ts`：`getProvider(env)` 据 `LLM_API_KEY` 选 Mock/真；`parseCommand` 委托 `parseIntent`。
- `index.ts` turn：command→解析（拒绝则不推进，回拒绝叙事 200）；accepted→core 推进→`narrate` 渲染→`{report,state,intent,narrative}`。

## 成本控制（真 LLM 时）

- 时代锁/跳过词在本地拦截，**不调用 LLM**。
- 意图解析 `temperature:0`，叙事 `temperature:0.85 maxTokens:200`。
- 叙事失败退模板，不重试不阻断。

## 验收

- [x] `pnpm -r test` 全绿（core 36 + ai 15 + worker 13）
- [x] Playwright E2E 12 绿（含自由文本下令 + 时代锁驳回）
- [x] 无密钥可玩（mock）；有密钥自动升级真 LLM
- [x] `packages/core/src` 仍零修改
