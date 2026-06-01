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
  const riv = state.rivals.map((c) => `${c.id}=${c.name}`).join(',');
  return `名册|provinces:${prov}|retainers:${ret}|rivals:${riv}`;
}

const SYSTEM = [
  '你是战国大名麾下的家老，把主公的口谕解析为「恰好一个」工具调用。时代：1560 年日本战国。',
  '',
  '【精确政令——仅在口谕明确指向时使用，不可臆测】',
  '· set_tax：仅当主公明确给出年贡/税率的数值或成数时（如「年贡三成」「税率提到五成」）。**严禁在未提及税率时使用 set_tax，也不要臆造税率数字。**',
  '· levy_troops：明确要征兵/募兵并给出兵数。',
  '· build_irrigation：明确要修水利/治水/开渠。',
  '· hold_festival：明确要办祭典/庙会。',
  '· reward_retainer：明确要赏赐/封赏某家臣。',
  '',
  '【freeform_act——以上都不精确匹配时的默认选择，绝不要轻易拒绝】',
  '只要是战国时代主公可亲为之事，一律 freeform_act 并选 category：',
  '· 宴饮/喝酒/吃饭/饮宴/交谈/叙旧 → social（target 填相关家臣 id）',
  '· 结婚/嫁娶/纳妃/联姻/狩猎/休养/读书/习武 → personal',
  '· 茶会/品茗/连歌/俳句/能乐/赏花 → cultural',
  '· 参拜/祈愿/拜神/斋戒 → spiritual',
  '· 巡视/视察/巡查/体察民情 → inspect',
  '· 结盟/遣使/通好/讲和/结交邻国 → diplomacy（target 填相关邻国 id）',
  '· 其余难以归类的合理之举 → gesture',
  '',
  '【拒绝——仅两种情形】',
  '· 涉及非此时代之物（近现代器物/异世界概念）→ reject_intent(category=anachronism)',
  '· 纯粹无意义、无法理解 → reject_intent(category=unclear)',
  '',
  '【示例】',
  '「我要结婚」→ freeform_act{category:"personal"}',
  '「巡视尾张领国」→ freeform_act{category:"inspect"}',
  '「和木下喝酒」→ freeform_act{category:"social", target:"<木下的id>"}',
  '「把年贡定到三成」→ set_tax{rate:0.3}',
  '「去神社祈愿」→ freeform_act{category:"spiritual"}',
  '',
  'provinceId/retainerId/target 必须取自名册中的 id。',
].join('\n');

const FREEFORM_CATS = new Set(['social', 'cultural', 'spiritual', 'personal', 'inspect', 'diplomacy', 'gesture']);
const FREEFORM_LABEL: Record<string, string> = {
  social: '宴饮交游',
  cultural: '风雅之事',
  spiritual: '祈愿参拜',
  personal: '私事一桩',
  inspect: '巡视领国',
  diplomacy: '遣使结交',
  gesture: '率性之举',
};

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

    if (call.name === 'freeform_act') {
      const category = FREEFORM_CATS.has(String(call.arguments.category))
        ? String(call.arguments.category)
        : 'gesture';
      const target = call.arguments.target ? String(call.arguments.target) : undefined;
      const tName =
        state?.retainers.find((r) => r.id === target)?.name ??
        state?.rivals.find((c) => c.id === target)?.name;
      const params: Record<string, unknown> = { category };
      if (target) params.target = target;
      return {
        kind: 'accepted',
        decree: { actionId: 'freeform_act', params },
        intent: `${FREEFORM_LABEL[category]}${tName ? `·${tName}` : ''}`,
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
