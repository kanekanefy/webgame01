# R4 设计 · 战国世界丰富化（数值大扩展）

- **日期**：2026-06-02
- **状态**：设计 + 实现中
- **目标**：让体系更接近 1560 年真实战国——加入战争、家臣政治、事件牌库、人口、外交、朝廷、经济纵深；并让自由行动（freeform）具策略后果。
- **铁律不变**：数值唯一真相在 `packages/core`；LLM 只解析意图 + 叙事；确定性可回放（种子化 RNG，禁 Date/Math.random）。

## 1. Overview
现有内核：koku/兵/民心/威信 + 领国(农民/产米/水利/城防/守军) + 家臣(忠诚/野心/能力) + 邻国(兵势/好感)。回合=季，撑到目标年胜、民心威信崩则败。R4 把"邻国/家臣/天下"从静态背景变成活的博弈对象。

## 2. 新增/扩展状态（state.ts）
- `Retainer.assignment: 'none'|'war'|'admin'`：领军→战力加成；理政→领国治理加成。
- `Retainer.alive: boolean`（谋反/战死后可离场）。
- `RivalClan`：`atWar: boolean`、`allied: boolean`（disposition≥0.8 自动结盟）。
- `GameState.daimyoAge: number`（家督年龄，叙事 + 后续继承）。
- `GameState.courtRank: number`（官位 0..5，影响威信上限/事件）。
- `GameState.roninPool: Retainer[]`（可招揽的浪人，来自 content）。
- `GameState.fame: number`（名声，[0,1]，影响招揽/外交/事件触发）。
- 新字段在 `buildState` 补默认值；旧存档/scenario 兼容。

## 3. 新动作（actions）
| 动作 | 参数 | 效果（核心定，有界） |
|---|---|---|
| `attack_rival` | rivalId | 战斗结算（§4）。胜→掠 koku/削敌兵势/威信+，败→损兵/威信- |
| `assign_retainer` | retainerId, role | 设领军/理政/闲置 |
| `recruit_retainer` | (可空) | 按 fame 概率从 roninPool 招得一名家臣 |
| `develop_land` | provinceId | 开垦：cost koku → 该国农民+ / 产出+ |
| `petition_court` | — | 献金朝廷 → courtRank+ / 威信+ |
| `negotiate` | rivalId | 遣使 → 该国好感+（外交，可达成结盟） |
| `freeform_act` | category,target | 策略化（§6） |

## 4. 战争系统（war.ts，纯函数）
- 我军战力 `A = levy × (1 + 0.5·bestWarSkill) × roll(0.8,1.2)`，bestWarSkill=领军家臣中最高 skillWar（无则 0.3 基准）。
- 敌军守备 `D = rival.strength × (1 + 0.1·城防修正) × roll(0.9,1.1)`（进攻取野战，城防修正小）。
- 胜负：A>D 胜。伤亡 `casualty = levy × clamp(D/(A+D),0.1,0.6)`；敌兵势削减 `min(strength, strength×A/(A+D))`。
- 胜：koku += 掠夺(敌兵势×0.3)、prestige += 0.05、fame += 0.05；敌 strength 大减；若敌 strength→0 则吞并（其名存、strength=0、好感重置、我方 peasants 增）。
- 败：levy 损 casualty 加重、prestige -= 0.06、contentment -= 0.04。
- 防御（邻国来攻，事件触发）：守备力 `Def = garrison总 + levy×0.5 + fortification×30`，攻方 = rival.strength×roll。败→失农民/守军/民心，胜→prestige+。

## 5. 事件牌库（events.ts）
每回合按条件 + 权重抽 0–2 张，应用有界效果并产出 `OutcomeFact{kind}`（供叙事+插画）：
`bumper`(丰年) `famine`(饥荒) `plague`(疫病) `flood`(水患) `drought`(旱魃) `ikki`(一揆) `court_favor`(朝廷叙任) `merchant_gift`(豪商献金) `ronin_offer`(浪人来仕) `border_friction`(邻国摩擦) `retainer_dispute`(家臣不和) `omen`(祥瑞)。
- 条件示例：famine 仅在 `net<0` 或低产；plague 低概率且民心-；court_favor 需 fame 较高。
- 谋反（betrayal）：领军/在席家臣中 `loyalty<0.3 且 ambition>0.6`，roll 命中→离场、夺走部分兵、prestige-。
- 邻国 AI：`disposition<0.35 且 strength>我军防御×k` 且 roll→ 来攻（触发 §4 防御战）。

## 6. 自由行动策略化（freeform 升级）
- `social`→ 该家臣忠诚+（已）；`diplomacy`→ 该邻国好感+（已，达 0.8 结盟）。
- `recruit`（新增类别 / 招贤口谕）→ 触发招揽判定（同 recruit_retainer）。
- `personal`（联姻）→ 若 target 为邻国则好感大增（政治联姻），否则民心/威信+。
- 各 freeform 类别配 agnes 插画（item ①）。

## 7. 人口动态（population）
每年（开春结算）按上年均民心：`Δpeasants = peasants × 0.02 ×(contentment-0.5)`，famine/战败额外减；钳制下限。高民心+和平→繁衍，苛政/天灾/战乱→流散。

## 8. 经济与节奏调平衡（item ③）
- 目标：一局（1560→1565，20 季）有起伏、非速胜/速崩。
- 调 `TAX_PER_PEASANT / FOOD_* / CONTENTMENT_DRIFT / 战争掠夺系数`，使税率/战争/治理形成权衡。
- 胜负条件扩展：除撑到目标年，新增"威信≥0.9 且 fame≥0.8 提前称霸"软目标（叙事提示，不强制）。

## 9. Formulas / Tuning Knobs
所有系数集中为模块常量（与现有 COST_* 风格一致），列为 tuning knobs：见各 .ts 顶部常量。

## 10. AI / UI 集成
- AI：新动作注册为 function tools；意图解析支持"进攻今川/招揽贤才/联姻浅井/巡视/献金朝廷"等；叙事带战果/事件上下文。
- UI：邻国面板（兵势/好感/战和）、家臣面板（忠诚/职务/可任命）、事件插画、新动作入口；自由文本仍为主。

## 11. 测试（Acceptance）
- 每系统纯函数单测 + 不变量（[0,1] 钳制、koku≥0、levy≥0、确定性回放）。
- 战斗：同种子同输入同结果；胜/败/吞并三路径覆盖。
- 事件：加权抽取确定性（种子化）；谋反/招揽/邻国来攻路径覆盖。
- `pnpm -r test` 全绿；E2E 关键路径不破；线上可玩。
