# Claude Code Game Studios -- Game Studio Agent Architecture

Indie game development managed through 49 coordinated Claude Code subagents.
Each agent owns a specific domain, enforcing separation of concerns and quality.

## Technology Stack

战国大名 AI 模拟器 — 数值内核 + AIGC 叙事的 web 游戏（pnpm monorepo）。

- **Stack**: TypeScript（全栈）· React + Vite + Tailwind（前端）· Cloudflare Workers + Durable Objects（后端 API / 会话 / LLM 代理）
- **Engine**: Web（非游戏引擎）。Godot 4 / 手游(Capacitor) 为按需启用的未来选项——相关引擎角色/规则/参考**休眠保留**，不删除。
- **Language**: TypeScript (strict, ESM)
- **LLM**: generalcompute（OpenAI 兼容）模型 minimax-m2.7，function calling 做意图解析
- **Version Control**: Git，主干开发
- **Build/Pkg**: pnpm workspace；测试 vitest（双池：node + workers）+ Playwright

### Monorepo 目录
- `packages/core` 纯仿真引擎 · `packages/ai` LLM 管线 · `apps/web` React 前端 · `apps/worker` CF Worker · `content` 数据

### 生效的 web 开发角色（其余引擎角色休眠保留）
`frontend-engineer` · `backend-engineer` · `cloudflare-devops` · `narrative-systems-engineer` · `game-balance-engineer` · `web-qa`
（详见 `.claude/docs/agent-coordination-map.md` 的「Web 栈角色映射」）

### 密钥纪律
4 个外部 API key 绝不入库——走 CF Secret + 本地 `.dev.vars`(gitignored)。前端永不接触密钥。

> CCGS 框架原始说明见 `docs/ccgs-framework-readme.md`。

## Project Structure

@.claude/docs/directory-structure.md

## Engine Version Reference

<!-- 当前 web 栈，无引擎版本依赖。引擎参考 docs/engine-reference/{godot,unity,unreal} 休眠保留；
     将来启用 Godot/手游栈时再 @import 对应 VERSION.md。 -->

## Technical Preferences

@.claude/docs/technical-preferences.md

## Coordination Rules

@.claude/docs/coordination-rules.md

## Collaboration Protocol

**User-driven collaboration, not autonomous execution.**
Every task follows: **Question -> Options -> Decision -> Draft -> Approval**

- Agents MUST ask "May I write this to [filepath]?" before using Write/Edit tools
- Agents MUST show drafts or summaries before requesting approval
- Multi-file changes require explicit approval for the full changeset
- No commits without user instruction

See `docs/COLLABORATIVE-DESIGN-PRINCIPLE.md` for full protocol and examples.

> **First session?** If the project has no engine configured and no game concept,
> run `/start` to begin the guided onboarding flow.

## Coding Standards

@.claude/docs/coding-standards.md

## Context Management

@.claude/docs/context-management.md
