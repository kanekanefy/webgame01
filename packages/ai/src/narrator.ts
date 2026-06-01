import type { GameState } from '@sengoku/core';
import type { ChatMessage, Provider } from './provider.js';

export interface NarrateInput {
  state: GameState;
  intent?: string | null;
  facts: string[];
  events: string[];
  issue: string;
}

const SYSTEM = [
  '你是战国大名身边的家臣。用一句简短、含蓄、带文言色彩的话，叙述本季评定的氛围与结果。',
  '不超过 40 字。只渲染气氛与人物反应，绝不杜撰具体数字或事实——数字由系统另行呈现。',
].join('\n');

/**
 * 叙事生成。永不改动数值：仅依据 core 给出的 facts/events 渲染气氛文本。
 * Mock provider 走模板（确定、零成本）；真 LLM 走 minimax 等。
 */
export async function narrate(provider: Provider, input: NarrateInput): Promise<string> {
  const factText = [...input.facts, ...input.events].join('；') || '本季无大事';
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `时节：${input.state.year}年${input.state.season}。政令：${input.intent ?? '按兵不动'}。事实：${factText}。议题：${input.issue || '无'}。`,
    },
  ];
  try {
    // 推理模型（minimax-m2.7）的 reasoning 与 content 分字段；token 需足够让 reasoning+content 都完成。
    const res = await provider.complete(messages, { maxTokens: 800, temperature: 0.85 });
    const text = res.content.trim();
    if (text) return text;
  } catch {
    // 真 LLM 失败 → 静默退回模板，不阻断回合
  }
  return '评定既毕，家臣依令而行，静候来季。';
}
