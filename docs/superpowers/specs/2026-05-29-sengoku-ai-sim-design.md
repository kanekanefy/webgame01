# 战国大名 AI 模拟器 — 设计文档（MVP）

- 日期：2026-05-29
- 状态：已通过设计评审（待用户复核 spec 文件）
- 定位：参考《历史模拟器：崇祯》《Victoria 3》的方法论，做一个 **AIGC 驱动、数值引擎当家** 的历史模拟器 MVP。

---

## 1. 目标与核心理念

一句话：**确定性仿真是唯一真相来源（source of truth），LLM 只在边缘做"翻译"与"叙事"，绝不触碰任何数值。**

- 玩家扮演 ~1560 年的中层 **大名（daimyo）**，治理领地、驾驭家臣、应对邻国。
- 玩家用 **自然语言** 下令；LLM 把自然语言解析成一个 **预定义、合时代** 的结构化动作，或直接拒绝。
- 所有结果由 **确定性 TypeScript 引擎** 计算；LLM 只把结果**叙事化**为家臣台词 / 事件文本。
- **硬时代锁（hard period-lock）**：违背时代的意图直接被拒（不是"攒够数值就能造")，时代上限为铁炮（tanegashima 火绳枪）。

设计原则：核心/内容分离（Paradox 经验）、LLM 职责最小化（越少越好约束、越便宜）、确定性可复现、数据驱动。

---

## 2. 范围（YAGNI）

**纳入（In）：**
- 1 名可玩大名、3 个领国（province）、~5 名具名家臣（retainer）、2–3 个邻国（简单 AI）。
- 轻量经济：稻米（koku）产出 → 单一市场结算 → 税率杠杆。
- 季节制回合循环，可玩到约 5 个游戏年。
- 硬时代锁、存档/读档。
- LLM Provider 抽象层 + `MockProvider` + 1 个真实 provider 接入。

**排除（Out，明确不做）：**
- 省份地图绘制 / 寻路；多商品产业链；深度外交；多人；模型微调；向量数据库 RAG；美术/音频打磨；移动端。

---

## 3. 架构总览：四层 + Provider 接缝

```
 ┌─────────────────────────────────────────────────┐
 │  D. Web UI（朝议界面 / 数值 / 自由文本输入）        │
 └───────────────┬──────────────────┬───────────────┘
                 │ 玩家自由文本        │ 叙事 + 数值
 ┌───────────────▼──────────────────┴───────────────┐
 │  C. 时代锁与护栏                                    │
 │   意图评审 → (RAG-lite 时代圣经) → 叙事评审          │
 └───────────────┬──────────────────┬───────────────┘
                 │ 已筛选意图          │ 原始结果事实
 ┌───────────────▼──────────┐  ┌────▼──────────────┐
 │ B. IntentParser           │  │ B. Narrator        │
 │  自由文本 → Action | 拒绝   │  │  事实 → 文本（无数值）│
 └───────────────┬──────────┘  └────▲──────────────┘
                 │ 结构化 Action      │ 结果事实
 ┌───────────────▼──────────────────┴───────────────┐
 │  A. 仿真核心（权威、确定性）                         │
 │   GameState · 动作目录 · 经济 · 修正栈 · 事件 · 回合 │
 └───────────────────────────────────────────────────┘
        ▲ 所有 LLM 调用都经过 Provider 接口
        └── OpenAI | Anthropic | DeepSeek | Local | Mock
```

铁律：**只有 Layer A 能修改状态，且只能通过已注册的动作。** 所有 LLM 相关逻辑都在边缘。

---

## 4. Layer A — 仿真核心（数值引擎）

纯 TypeScript，无 IO、无 LLM 依赖，可独立运行与单测。

### 4.1 GameState
```ts
interface GameState {
  turn: number;            // 回合序号
  year: number; season: Season;  // Season = Spring|Summer|Autumn|Winter
  clan: {
    koku: number;          // 国库/粮（稻米）
    levy: number;          // 兵力
    contentment: number;   // 民心 ∈ [0,1]
    prestige: number;      // 威信 ∈ [0,1]（对家臣的权威）
  };
  provinces: Province[];
  retainers: Retainer[];
  rivals: RivalClan[];
  rngSeed: number;         // 确定性随机种子
  actionLog: ActionRecord[]; // 用于复现/回放
}
```

### 4.2 实体
- `Province { id, name, villages: { peasants, contentment }, riceOutput, fortification, garrison, productionMethod }`
- `Retainer { id, name, loyalty, ambition, skillAdmin, skillWar, traits: string[], role, memory: MemoryItem[] }`（memory 为轻量：近期值得记住的事件，供叙事上下文）
- `RivalClan { id, name, strength, disposition, ai: SimpleAIState }`

### 4.3 轻量经济（Victoria 3 精简版）
- 季节 **收获** → 稻米供给；人口 + 军队 **消耗**。
- **单一市场** 结算稻米 ↔ koku：价格 = `clamp(base × f(buy/sell ratio), 0.25×, 1.75×)`（非线性、按流量而非库存）。
- **税率杠杆**：提高税收 koku，但降低 contentment（核心权衡）。
- 村落改良（如灌溉）= 可切换的 **production method**（input/output 配方变化）。

### 4.4 修正栈（Modifier Stack）
所有玩法数值 = `base × (1 + Σ additive) × Π (1 + multiplicative)`，来源：政策、家臣技能、季节、事件。统一管线，便于叠加与调试。

### 4.5 回合循环（确定性，种子化 RNG）
`UPKEEP（收获/消耗/俸禄）→ COUNCIL（采集家臣建议）→ DECREE（玩家输入）→ RESOLUTION（应用动作效果）→ EVENTS（触发事件）→ ADVANCE`

### 4.6 动作目录（Action Catalog）— **时代锁的地基**
固定注册表；任何不在目录里的东西都无法改变状态。
```ts
interface ActionDef<P> {
  id: string;
  paramsSchema: JSONSchema;            // 供 LLM 结构化输出约束
  preconditions(state, params): Result; // 时代 + 状态前置校验
  apply(state, params): { state, outcomeFacts }; // 纯函数
  generative?: boolean;                // B-ready：将来可走 LLM 提议路径
}
```
MVP 动作示例：`levy_troops, set_tax, attack_clan, reward_retainer, build_irrigation, hold_festival, negotiate_alliance, suppress_uprising`。

---

## 5. Layer B — LLM 网关（Provider 无关）

### 5.1 Provider 接口
```ts
interface LLMProvider {
  complete(messages: Msg[], schema?: JSONSchema): Promise<Structured | string>;
}
// 适配器：MockProvider（无网络，测试用）+ 1 个真实（OpenAI/Anthropic/DeepSeek/Local），配置选择
```

### 5.2 IntentParser
- 输入：玩家自由文本 + **当前合法动作列表** + 状态摘要。
- 输出（JSON-schema 约束解码）：`{ action_id, params }`（必须取自目录）**或** `{ rejected, reason, category }`。
- 结构化输出保证它**无法凭空造出**目录外的动作。

### 5.3 Narrator
- 输入：`outcomeFacts` + 家臣人设 + 时代文风指南。
- 输出：合人设的文本（家臣台词、事件描述）。**永不输出数值、不拥有数值权威。**

### 5.4 B-ready 接缝（现在埋点，MVP 不启用）
某动作将来可标 `generative`，走 **"LLM 提议 deltas → validator 校验 → 应用/钳制/拒绝"** 路径，复用同一 `Action` 接口。Validator 现在就为护栏而建，提议路径在 MVP 中休眠。

---

## 6. Layer C — 时代锁与护栏（硬时代锁）

三道闸（拒绝，而非"攒够就给"）：
1. **动作目录地基**（结构性）：状态只能经合时代的已注册动作改变。
2. **意图评审（解析前）**：对自由文本做时代/越界筛查 = (a) 人工维护的 denylist 关键词 + (b) 带时代准则的 LLM critic → `allow | reject(reason)`。被拒时以世界内口吻叙事化：「主公，国中无匠人通晓此术。」
3. **叙事评审（生成后）**：扫描 Narrator 输出的时代错误/前后矛盾；失败则重写（reask）或回退到模板台词。

**时代圣经（period bible）**：精选 JSON（时代技术上限 = 铁炮、术语表、社会结构、命名、势力关系），注入提示词并作为 critic 的准则。MVP **不上** 向量 RAG，结构化圣经 + 可选 embedding 查询即可。

---

## 7. 数据流（单回合）

`下令文本 → 意图评审（时代闸）→ IntentParser（→ 动作 | 拒绝）→ Core.resolve(动作)[确定性] → outcomeFacts + 新状态 → Narrator → 叙事评审 → UI 渲染文本 + 更新数值`。

COUNCIL 阶段：Core 选定一个议题 → Narrator 基于每位家臣的 traits + 当前状态发表立场 → 展示。

---

## 8. 项目结构（数据驱动 = Paradox 的核心教训）

```
/core      纯仿真：state, entities, actions, economy, modifiers, events, loop（确定性、可单测）
/llm       provider 接口 + 适配器 + IntentParser + Narrator + schemas
/period    时代圣经、时代错误 critic、denylist、RAG-lite
/app       Web UI（Vite + React/Svelte）、状态绑定、存读档
/content   JSON 数据：scenario、动作定义、事件定义、时代圣经
```

---

## 9. 确定性与存档

- 种子化 RNG 只在 `/core`；LLM 输出非权威，其随机性**不会污染存档**。
- 存档 = 完整 `GameState` + seed + actionLog → **完全可回放复现**。

---

## 10. 测试策略

因为仿真权威且确定，**整局游戏可在零 LLM 调用下测试**：
- **Core**：种子化单测；不变量属性测试（contentment ∈ [0,1]、koku 非 NaN、市场价值守恒）；回放测试（log + seed 复现状态）。
- **LLM 层**：对 `MockProvider` 的契约测试——已知短语→已知动作；已知时代错误→拒绝。Critic 黄金集（合法 vs 时代错误意图）。
- **集成**：脚本化 playthrough 用 `MockProvider` 跑 N 回合，断言不变量成立、不崩溃。

---

## 11. 构建顺序（里程碑）

1. **M1 — 纯仿真核心，无 AI**：GameState + 经济 + 回合循环 + 动作目录，命令行/脚本可玩、可输赢、确定性。（约占总工作量 60%，决定游戏是否好玩。）
2. **M2 — Provider 接口 + Mock**：接上 IntentParser（结构化输出）+ Narrator，验证 LLM 无法破坏状态。
3. **M3 — 自由文本 + 意图评审**：玩家任意输入 → critic 路由（动作 / 拒绝）。
4. **M4 — 时代锁 critic + 时代圣经**：硬时代锁落地。
5. **M5 — Web UI + 存读档**：朝议界面、数值面板、自由输入、回放。
6. **M6 — 接入 1 个真实 provider + 打磨**。

---

## 12. 待决问题 / 风险

- **真实 LLM provider 选型**：留到 M6，先用接口抽象（已定）。China-facing 倾向 DeepSeek/Qwen（便宜、中文/古文强）；约束可靠性倾向 Claude/OpenAI（结构化输出与工具调用最稳）。
- **UI 框架**：React vs Svelte 未定，M5 再定，不影响 core。
- **战国史实颗粒度**：时代圣经做多细需在 M4 权衡（够用即可，避免过度考据拖慢 MVP）。
- **延迟/成本**：MVP 阶段 LLM 仅用于解析 + 叙事，调用量小；后续可加缓存与小模型路由。
