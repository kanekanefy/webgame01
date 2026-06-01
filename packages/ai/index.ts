// @sengoku/ai — LLM 叙事管线：Provider 抽象 + 意图解析 + 叙事 + 时代锁。
// 铁律：本包绝不修改游戏数值，只产出「候选 Decree」与叙事文本；执行/校验在 @sengoku/core。

export type {
  Provider,
  ChatMessage,
  ToolDef,
  ToolFunctionDef,
  ToolCall,
  CompleteOptions,
  CompletionResult,
} from './src/provider.js';

export { MockProvider } from './src/mock-provider.js';
export { OpenAIProvider, type OpenAIProviderConfig } from './src/openai-provider.js';

export { parseIntent } from './src/intent-parser.js';
export type { IntentResult, IntentAccepted, IntentRejected } from './src/intent-parser.js';

export { narrate, type NarrateInput } from './src/narrator.js';

export { checkPeriod, ANACHRONISMS, type PeriodCheck } from './src/period-lock.js';
export { buildToolDefs, ACTION_NAMES, type CoreActionName } from './src/action-schemas.js';
