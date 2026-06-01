// @sengoku/core — 公共 API 桶文件（barrel）。
// 仅重导出 src/core 内的纯仿真引擎接口，供 apps/worker、apps/web、packages/ai 消费。
// 注意：本文件不改动 src/ 下任何现有逻辑（保持 core 游戏逻辑零修改）。

// 触发动作注册（副作用导入）——保证 listActionIds / resolveAction 在消费侧可用。
import './src/core/actions/index.js';

export type {
  Season,
  GameStatus,
  Village,
  Province,
  MemoryItem,
  Retainer,
  RivalClan,
  ClanStats,
  ActionRecord,
  GameState,
} from './src/core/state.js';

export { advanceTurn, LOSE_CONTENTMENT, LOSE_PRESTIGE } from './src/core/loop.js';
export type { Decree, TurnReport } from './src/core/loop.js';

export { serialize, deserialize, replay } from './src/core/save.js';

export { buildState } from './src/core/scenario.js';
export type { ScenarioData } from './src/core/scenario.js';

export { runUpkeep, updateContentment, targetContentment, totalPeasants } from './src/core/economy.js';
export type { UpkeepReport } from './src/core/economy.js';

export {
  registerAction,
  getAction,
  listActionIds,
  resolveAction,
} from './src/core/actions/types.js';
export type {
  ActionDef,
  ActionContext,
  ActionResult,
  OutcomeFact,
  PreconditionResult,
} from './src/core/actions/types.js';

export { RNG } from './src/core/rng.js';
