import type { Decree, GameState } from '@sengoku/core';
import type { ChatMessage, Provider, ToolCall } from './provider.js';
import { buildToolDefs, ACTION_NAMES, type CoreActionName } from './action-schemas.js';
import { checkPeriod } from './period-lock.js';

export interface IntentAccepted {
  kind: 'accepted';
  decree: Decree | null;
  intent: string;
}
export interface IntentRejected {
  kind: 'rejected';
  reason: string;
  category: 'anachronism' | 'unclear' | 'impossible';
}
export type IntentResult = IntentAccepted | IntentRejected;

const SKIP_RE = /(按兵不动|静观|观望|不动|休养|跳过|什么都不做|空过|歇一?季)/;

function rosterLine(state?: GameState): string {
  if (!state) return '';
  const prov = state.provinces.map((p) => `${p.id}=${p.name}`).join(',');
  const ret = state.retainers.map((r) => `${r.id}=${r.name}`).join(',');
  return `名册|provinces:${prov}|retainers:${ret}`;
}

const SYSTEM = [
  '你是战国大名麾下的家老，职责是把主公的口谕解析为「恰好一个」政令工具调用。',
  '时代设定：1560 年（永禄三年）日本战国。凡不属于该时代之物（近现代器物、异世界概念等），调用 reject_intent 且 category=anachronism。',
  '若口谕含糊无法确定政令，调用 reject_intent 且 category=unclear。',
  '只能调用所提供的工具，不要臆造参数；provinceId/retainerId 必须取自名册中的 id。',
].join('\n');

/** 把工具调用映射并校验为 core 可执行 Decree。 */
function toDecree(call: ToolCall, state?: GameState): Decree | null | 'invalid' {
  const name = call.name as CoreActionName;
  const a = call.arguments ?? {};
  switch (name) {
    case 'set_tax': {
      const rate = Number(a.rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 1) return 'invalid';
      return { actionId: 'set_tax', params: { rate } };
    }
    case 'levy_troops': {
      const amount = Math.floor(Number(a.amount));
      if (!Number.isFinite(amount) || amount <= 0) return 'invalid';
      return { actionId: 'levy_troops', params: { amount } };
    }
    case 'build_irrigation': {
      const provinceId = String(a.provinceId ?? '');
      if (state && !state.provinces.some((p) => p.id === provinceId)) return 'invalid';
      if (!provinceId) return 'invalid';
      return { actionId: 'build_irrigation', params: { provinceId } };
    }
    case 'hold_festival':
      return { actionId: 'hold_festival', params: {} };
    case 'reward_retainer': {
      const retainerId = String(a.retainerId ?? '');
      if (state && !state.retainers.some((r) => r.id === retainerId)) return 'invalid';
      if (!retainerId) return 'invalid';
      return { actionId: 'reward_retainer', params: { retainerId } };
    }
    default:
      return 'invalid';
  }
}

const INTENT_LABEL: Record<CoreActionName, (d: Decree, state?: GameState) => string> = {
  set_tax: (d) => `定年贡为 ${((d.params.rate as number) * 100).toFixed(0)}%`,
  levy_troops: (d) => `征募 ${d.params.amount} 兵`,
  build_irrigation: (d, s) =>
    `于 ${s?.provinces.find((p) => p.id === d.params.provinceId)?.name ?? d.params.provinceId} 修筑水利`,
  hold_festival: () => '举办祭典',
  reward_retainer: (d, s) =>
    `赏赐 ${s?.retainers.find((r) => r.id === d.params.retainerId)?.name ?? d.params.retainerId}`,
};

/**
 * 解析自由文本为意图。流程：跳过关键词 → 时代锁 → LLM function calling（失败重试 1 次）→ 兜底拒绝。
 * 数值权威仍在 core：此处只产出「候选 Decree」，真正执行/校验由 core 动作 precondition 完成。
 */
export async function parseIntent(
  command: string,
  state: GameState | undefined,
  provider: Provider,
): Promise<IntentResult> {
  if (SKIP_RE.test(command)) {
    return { kind: 'accepted', decree: null, intent: '按兵不动，静观其变' };
  }

  const period = checkPeriod(command);
  if (!period.ok) {
    return { kind: 'rejected', reason: `时代不符：「${period.term}」非战国之物`, category: 'anachronism' };
  }

  const tools = buildToolDefs(state);
  const baseMessages: ChatMessage[] = [
    { role: 'system', content: SYSTEM + (rosterLine(state) ? `\n${rosterLine(state)}` : '') },
    { role: 'user', content: command },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    let call: ToolCall | undefined;
    try {
      const res = await provider.complete(baseMessages, {
        tools,
        toolChoice: 'required',
        maxTokens: 1500,
        temperature: 0,
      });
      call = res.toolCalls[0];
    } catch {
      // 网络/解析异常 → 重试一次
      continue;
    }
    if (!call) continue;

    if (call.name === 'reject_intent') {
      const cat = (call.arguments.category as IntentRejected['category']) ?? 'unclear';
      return {
        kind: 'rejected',
        reason: String(call.arguments.reason ?? '无法奉行'),
        category: cat === 'anachronism' || cat === 'impossible' ? cat : 'unclear',
      };
    }

    if (ACTION_NAMES.includes(call.name as CoreActionName)) {
      const decree = toDecree(call, state);
      if (decree !== 'invalid') {
        const name = call.name as CoreActionName;
        return { kind: 'accepted', decree, intent: decree ? INTENT_LABEL[name](decree, state) : '按兵不动' };
      }
    }
    // 非法工具/参数 → 下一轮重试
    baseMessages.push({ role: 'system', content: '上次工具调用无效，请只用名册中的 id 重新选择一个合法工具。' });
  }

  return { kind: 'rejected', reason: '未能将口谕解析为可执行政令', category: 'unclear' };
}
