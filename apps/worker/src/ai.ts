import type { Decree, GameState } from '@sengoku/core';
import {
  MockProvider,
  OpenAIProvider,
  parseIntent,
  type IntentRejected,
  type Provider,
} from '@sengoku/ai';
import type { Env } from './index.js';

/**
 * 据环境选择 Provider：有 LLM_API_KEY → 真 LLM（generalcompute/minimax）；否则 MockProvider。
 * 密钥只活在 Worker，前端永不接触。
 */
export function getProvider(env: Env): Provider {
  if (env.LLM_API_KEY) {
    return new OpenAIProvider({
      apiKey: env.LLM_API_KEY,
      baseUrl: env.LLM_BASE_URL ?? 'https://api.generalcompute.com/v1',
      model: env.LLM_MODEL ?? 'minimax-m2.7',
    });
  }
  return new MockProvider();
}

export type ParseResult =
  | { kind: 'accepted'; decree: Decree | null; intent: string }
  | { kind: 'rejected'; reason: string; narrative: string };

function rejectionNarrative(category: IntentRejected['category']): string {
  switch (category) {
    case 'anachronism':
      return '家臣面面相觑——主公所言，非此世之物，恕难奉行。';
    case 'impossible':
      return '奉行躬身：此事力有不逮，难以成命。';
    default:
      return '家臣垂首：主公之意，臣等未能领会，敢请明示。';
  }
}

/** 自由文本 → 候选政令（委托 packages/ai；数值权威仍在 core）。 */
export async function parseCommand(
  command: string,
  state: GameState | undefined,
  provider: Provider,
): Promise<ParseResult> {
  const r = await parseIntent(command, state, provider);
  if (r.kind === 'rejected') {
    return { kind: 'rejected', reason: r.reason, narrative: rejectionNarrative(r.category) };
  }
  return { kind: 'accepted', decree: r.decree, intent: r.intent };
}
