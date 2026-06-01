# R0a · Monorepo 搭建 + sengoku-sim 核心迁入 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前 pgame 的 sengoku-sim TS 数值核心，整体下沉为以 webgame01 为根的 pnpm monorepo 的 `packages/core` 包，保留两边 git 历史，`pnpm --filter @sengoku/core test` 全绿。

**Architecture:** 新建工作目录 clone webgame01（保留其 `.claude` 治理层与历史）→ 把本地 pgame 作为 git remote 用 `--allow-unrelated-histories` 合并进来（双历史保留）→ 把 pgame 全部工程内容整体 `git mv` 下沉为 `packages/core/`（src/tests/content/配置一起搬，相对路径零改动）→ 配 pnpm workspace → 装依赖跑测试验证回归全绿。

**Tech Stack:** git, pnpm, TypeScript 5.6, vitest 2.1

**Scope 边界:** 本计划只做"monorepo 物理搭建 + 核心包迁入"。`.claude` 的 web 化改造（裁剪/新建角色、换 rules/hooks）属 R0b，单独成 plan。`apps/web`、`apps/worker`、`packages/ai` 属 R1+。

**回归门约定:** 这是迁移类计划，不写新测试。验收标准 = 现有 36 个 vitest 用例在新布局下**继续全绿**（回归保护）。任何一个挂掉都说明迁移破坏了行为，必须修复路径而非改测试。

**前置确认（hard-to-reverse，执行 Task 1 前需用户点头）:**
- 最终 monorepo 以 **webgame01 远程仓库**为主干，合并进 pgame 全部历史；Task 5 的 push 会更新你的 `github.com/kanekanefy/webgame01`。push 那步执行时会再次确认。
- 操作在**新目录** `/Users/kane/Desktop/project/webgame01` 进行，当前 `pgame` 目录保持不动（安全回退点）。

---

## Task 1: 创建 monorepo 工作副本并合并两仓库历史

**Files:**
- 新建工作目录：`/Users/kane/Desktop/project/webgame01/`（git clone 产物）

- [ ] **Step 1: clone webgame01 到新目录**

Run:
```bash
cd /Users/kane/Desktop/project
git clone https://github.com/kanekanefy/webgame01.git webgame01
cd /Users/kane/Desktop/project/webgame01
git log --oneline -3 && ls -la
```
Expected: clone 成功；`git log` 显示 webgame01 的初始 commit；`ls` 看到 `.claude/`、`docs/`、`CLAUDE.md` 等（无 `package.json`）。

- [ ] **Step 2: 把本地 pgame 作为 remote 加入并 fetch**

Run:
```bash
cd /Users/kane/Desktop/project/webgame01
git remote add pgame /Users/kane/Desktop/project/pgame
git fetch pgame
git branch -r | grep pgame
```
Expected: 看到 `pgame/cf-thin-slice`、`pgame/master` 等远程分支。

- [ ] **Step 3: 合并 pgame 历史（允许无关历史）**

Run:
```bash
cd /Users/kane/Desktop/project/webgame01
git merge --allow-unrelated-histories pgame/cf-thin-slice -m "merge: 并入 sengoku-sim 核心与设计/预研历史"
```
Expected: 合并成功。可能在 `.gitignore` 上冲突（两边都有）。若冲突，执行 Step 4；若无冲突，跳到 Step 5。

- [ ] **Step 4: （仅冲突时）解决 .gitignore 冲突**

查看冲突：`git status`。手动编辑 `.gitignore`，合并两边条目（保留 `node_modules`、新增 `dist/`、`.dev.vars`、`pnpm-lock.yaml` 不忽略），然后：
```bash
git add .gitignore
git commit --no-edit
```
Expected: 合并 commit 完成。

- [ ] **Step 5: 验证合并后根目录同时含两边内容**

Run:
```bash
cd /Users/kane/Desktop/project/webgame01
ls -la && echo "---" && ls src tests content 2>/dev/null && echo "---" && ls .claude >/dev/null && echo ".claude OK"
git log --oneline | head -5
```
Expected: 根目录同时有 `.claude/`（webgame01）和 `src/`、`tests/`、`content/`、`package.json`、`vitest.config.ts`、`tsconfig.json`（pgame）；`git log` 同时含两边 commit。

---

## Task 2: 把 pgame 工程内容整体下沉为 packages/core

**Files:**
- Move: `src/` → `packages/core/src/`
- Move: `tests/` → `packages/core/tests/`
- Move: `content/` → `packages/core/content/`
- Move: `vitest.config.ts`、`tsconfig.json`、`package.json` → `packages/core/`
- Remove: webgame01 的空占位 `src/.gitkeep`、`src/CLAUDE.md`（若存在）；pgame 的 `package-lock.json`（改用 pnpm）

- [ ] **Step 1: 清掉 webgame01 的空 src 占位（若存在）**

Run:
```bash
cd /Users/kane/Desktop/project/webgame01
git rm --ignore-unmatch src/.gitkeep src/CLAUDE.md
ls src
```
Expected: `src/` 下只剩 pgame 来的 `core/`、`headless.ts`。

- [ ] **Step 2: 删除 npm lockfile（monorepo 统一用 pnpm）**

Run:
```bash
cd /Users/kane/Desktop/project/webgame01
git rm --ignore-unmatch package-lock.json
```
Expected: `package-lock.json` 已从索引移除。

- [ ] **Step 3: git mv 整体下沉到 packages/core**

Run:
```bash
cd /Users/kane/Desktop/project/webgame01
mkdir -p packages/core
git mv src packages/core/src
git mv tests packages/core/tests
git mv content packages/core/content
git mv vitest.config.ts packages/core/vitest.config.ts
git mv tsconfig.json packages/core/tsconfig.json
git mv package.json packages/core/package.json
ls -R packages/core | head -30
```
Expected: `packages/core/` 下有 `src/core/*`、`src/headless.ts`、`tests/`、`content/scenario.json`、`vitest.config.ts`、`tsconfig.json`、`package.json`。相对路径结构与原 pgame 根一致（这是零改动的关键）。

- [ ] **Step 4: commit 下沉**

Run:
```bash
cd /Users/kane/Desktop/project/webgame01
git add -A
git commit -m "refactor: 将 sengoku-sim 核心整体下沉为 packages/core"
```
Expected: commit 成功。

---

## Task 3: 配置 pnpm workspace

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`（根，编排脚本）
- Modify: `packages/core/package.json`（改 name 为 `@sengoku/core`）

- [ ] **Step 1: 创建 pnpm-workspace.yaml**

Create `/Users/kane/Desktop/project/webgame01/pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

- [ ] **Step 2: 修改 packages/core/package.json 的 name**

把 `packages/core/package.json` 第一个字段从 `"name": "sengoku-sim"` 改为：
```json
  "name": "@sengoku/core",
```
（其余字段保持不变：`type/private/scripts/devDependencies` 原样。确认 `scripts.test` 为 `"vitest run"`、`scripts.headless` 为 `"tsx src/headless.ts"`。）

- [ ] **Step 3: 创建根 package.json**

Create `/Users/kane/Desktop/project/webgame01/package.json`:
```json
{
  "name": "webgame01",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "pnpm -r test",
    "core:test": "pnpm --filter @sengoku/core test",
    "core:headless": "pnpm --filter @sengoku/core headless"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 4: commit workspace 配置**

Run:
```bash
cd /Users/kane/Desktop/project/webgame01
git add pnpm-workspace.yaml package.json packages/core/package.json
git commit -m "feat: 配置 pnpm workspace 与 @sengoku/core 包"
```
Expected: commit 成功。

---

## Task 4: 安装依赖并验证测试回归全绿

**Files:** 无（生成 `pnpm-lock.yaml`、`node_modules/`）

- [ ] **Step 1: 确认 pnpm 可用**

Run: `pnpm --version`
Expected: 输出版本号（如 9.x）。若未安装：`npm i -g pnpm`。

- [ ] **Step 2: 安装依赖**

Run:
```bash
cd /Users/kane/Desktop/project/webgame01
pnpm install
```
Expected: 安装成功，生成 `pnpm-lock.yaml`；`packages/core` 的 vitest/typescript/tsx/@types/node 就位。

- [ ] **Step 3: 跑核心测试（回归门）**

Run:
```bash
cd /Users/kane/Desktop/project/webgame01
pnpm --filter @sengoku/core test
```
Expected: **36 个测试全部 PASS**（rng/modifiers/economy/contentment/actions/loop/save/scenario + integration/playthrough）。若 `content/scenario.json` 找不到，说明 CWD 不是 `packages/core`——确认 pnpm filter 在包目录执行；不要改测试，修配置。

- [ ] **Step 4: 跑 headless 冒烟验证**

Run:
```bash
cd /Users/kane/Desktop/project/webgame01
pnpm --filter @sengoku/core headless
```
Expected: 打印若干 `[年/季] koku=... 兵=... 民心=...` 回合行，最后 `结局：won|lost|playing`，不报错。

- [ ] **Step 5: commit lockfile**

Run:
```bash
cd /Users/kane/Desktop/project/webgame01
git add pnpm-lock.yaml
git commit -m "chore: pnpm 安装核心包依赖"
```
Expected: commit 成功。

---

## Task 5: 收尾（gitignore / 根说明）并准备推送

**Files:**
- Modify: `.gitignore`
- Create: `README.md`（根，monorepo 导览）

- [ ] **Step 1: 完善根 .gitignore**

确保 `/Users/kane/Desktop/project/webgame01/.gitignore` 含以下条目（不重复已有的）：
```
node_modules/
dist/
.dev.vars
.wrangler/
production/session-state/
production/session-logs/
```
（`.dev.vars` 是本地密钥文件，绝不入库——安全纪律。）

- [ ] **Step 2: 创建根 README 导览**

Create `/Users/kane/Desktop/project/webgame01/README.md`:
```markdown
# 战国大名 AI 模拟器（monorepo）

数值内核 + AIGC 叙事的日本战国历史模拟游戏。web 起步，核心引擎无关。

## 结构
- `packages/core` — 纯仿真引擎（确定性、可回放，零 UI/IO/LLM 依赖）
- `apps/web` — React+Vite+Tailwind 前端（R1）
- `apps/worker` — Cloudflare Worker：API + DO 会话 + LLM 流式代理（R1）
- `packages/ai` — LLM Provider + IntentParser + Narrator + 时代锁（R2）
- `content` — 数据驱动内容（暂随 core 包，R1 提取到根）
- `.claude` — CCGS 开发工作流治理层
- `docs/superpowers` — 设计 spec / 预研 / 实施计划

## 常用命令
- `pnpm install` — 安装
- `pnpm -r test` — 跑全部包测试
- `pnpm core:headless` — 命令行跑一局
```

- [ ] **Step 3: commit 收尾**

Run:
```bash
cd /Users/kane/Desktop/project/webgame01
git add .gitignore README.md
git commit -m "chore: monorepo 根 gitignore 与 README 导览"
```
Expected: commit 成功。

- [ ] **Step 4: 最终结构核验**

Run:
```bash
cd /Users/kane/Desktop/project/webgame01
find . -maxdepth 3 -not -path '*/node_modules/*' -not -path '*/.git/*' -type d | sort
pnpm -r test
```
Expected: 目录树显示 `.claude/`、`packages/core/{src,tests,content}`、`docs/`；`pnpm -r test` 36 个全绿。

- [ ] **Step 5: 推送到 webgame01 远程（需用户确认）**

> ⚠️ 此步更新远程 `github.com/kanekanefy/webgame01`。因本地已包含 webgame01 全部历史 + pgame 历史，是远程的后代，正常 push 无需 force。执行前向用户确认。

Run（确认后）:
```bash
cd /Users/kane/Desktop/project/webgame01
git push origin HEAD
```
Expected: push 成功，远程更新。

---

## Self-Review

**Spec coverage（对照 spec §3/§10 的 R0 "monorepo 骨架 + core/content/docs 迁入"部分）:**
- monorepo 根 + pnpm workspace ✓ Task 3
- packages/core 迁入（保留历史）✓ Task 1（双历史 merge）+ Task 2（下沉）
- content/docs 迁入 ✓ Task 2（content 随 core；docs 经 merge 自动进根）
- 测试全绿验收 ✓ Task 4
- `.claude` 保留 ✓ Task 1（clone 自带）；其 web 化改造 = R0b（明确不在本计划）

**已知偏离 spec（已在计划头记录，合理）:**
- content 暂在 `packages/core/content` 而非根 `content/` —— 零改动迁移优先，R1 提取。
- `apps/`、`packages/ai` 暂不建 —— R1+。

**Placeholder scan:** 无 TBD/TODO；所有命令与文件内容均为可直接执行的具体内容。

**Type/命名一致性:** 包名 `@sengoku/core` 在 Task 3 定义后，根 package.json 的 `--filter @sengoku/core`（Task 3/4）一致引用；`scripts.test`/`headless` 沿用 packages/core 原有定义。
