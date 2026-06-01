# 战国大名 AI 模拟器（monorepo）

数值内核 + AIGC 叙事的日本战国历史模拟游戏。web 起步，核心引擎无关；Godot/手游作为按需启用的未来选项。

## 结构

- `packages/core` — 纯仿真引擎（确定性、可回放，零 UI/IO/LLM 依赖）
- `packages/ai` — LLM Provider + IntentParser + Narrator + 时代锁（R2）
- `apps/web` — React + Vite + Tailwind 前端（R1）
- `apps/worker` — Cloudflare Worker：API + Durable Object 会话 + LLM 流式代理（R1）
- `content` — 数据驱动内容（当前暂随 `packages/core/content`，R1 提取到根）
- `.claude` — CCGS 开发工作流治理层（详见 [docs/ccgs-framework-readme.md](docs/ccgs-framework-readme.md)）
- `docs/superpowers` — 设计 spec / 预研 / 实施计划

## 常用命令

```bash
pnpm install          # 安装
pnpm -r test          # 跑全部包测试
pnpm core:test        # 仅核心包测试
pnpm core:headless    # 命令行跑一局（冒烟）
```

## 设计文档

- [重做总设计](docs/superpowers/specs/2026-06-01-sengoku-redo-monorepo-design.md)
- [外部 API 预研结论](docs/superpowers/research/2026-06-01-redo-preresearch-findings.md)
- 开发流程治理层基于 **Claude Code Game Studios (CCGS)**，见 [CCGS 框架说明](docs/ccgs-framework-readme.md)。
