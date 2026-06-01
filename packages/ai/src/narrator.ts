import type { GameState } from '@sengoku/core';
import type { ChatMessage, Provider } from './provider.js';

export interface NarrateInput {
  state: GameState;
  intent?: string | null;
  /** 玩家原始口谕（自由文本时）；让叙事更贴合具体情境。 */
  command?: string;
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
  const cmdLine = input.command ? `主公口谕：「${input.command}」。` : '';
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `时节：${input.state.year}年${input.state.season}。${cmdLine}政令：${input.intent ?? '按兵不动'}。事实：${factText}。议题：${input.issue || '无'}。`,
    },
  ];
  try {
    // 推理模型（minimax-m2.7）token 需足够让 reasoning 完成、content 干净输出；不足会把思维链漏进 content。
    const res = await provider.complete(messages, { maxTokens: 1500, temperature: 0.85 });
    const cleaned = cleanNarrative(res.content);
    if (cleaned) return cleaned;
  } catch {
    // 真 LLM 失败 → 静默退回模板，不阻断回合
  }
  return '评定既毕，家臣依令而行，静候来季。';
}

/** 净化叙事：剔除推理模型偶发的思维链泄漏，只保留一句干净叙事；判为脏则返回 null（走模板）。 */
export function cleanNarrative(raw: string): string | null {
  let t = (raw ?? '').trim();
  if (!t) return null;
  // 明显的思维链标记 → 判脏
  if (/用户要求|我需要|考虑情境|尝试写|这个表述|或者用|让我|首先|步骤|要点[:：]|finish_reason/.test(t)) {
    // 思维链里常把最终答案放在引号中：取最后一个合规引用句
    const quoted = [...t.matchAll(/[「『“"]([^」』”"\n]{6,50})[」』”"]/g)].map((m) => m[1]!.trim());
    const good = quoted.reverse().find((q) => !/用户|需要|考虑|表述|或者|让我|步骤/.test(q));
    if (good) return good;
    return null;
  }
  // 多行 → 取最后一非空行（最终答案通常在末尾）
  if (t.includes('\n')) {
    const lines = t.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    t = lines[lines.length - 1] ?? t;
  }
  // 去掉可能的引号包裹
  t = t.replace(/^[「『“"]|[」』”"]$/g, '').trim();
  // 仍过长 → 判脏（叙事应简短）
  if (t.length > 70) return null;
  return t || null;
}
