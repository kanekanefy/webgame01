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
  '【铁则】你没有「拒绝」这个选项。无论主公的口谕多么笼统、私人、随意，你都必须把它映射到下列某一个动作——这是一个高自由度的角色扮演，万事皆可为，由你择最贴切者落地，再由叙事润色。',
  '',
  '【精确政令——仅在口谕明确指向时使用，不可臆测】',
  '· set_tax：仅当主公明确给出年贡/税率的数值或成数（如「年贡三成」「税率提到五成」）。**未提及税率绝不可用 set_tax，更不可臆造税率数字。**',
  '· levy_troops：明确要征兵/募兵并给出兵数。',
  '· build_irrigation：明确要修水利/治水/开渠。',
  '· hold_festival：明确要办祭典/庙会。',
  '· reward_retainer：明确要赏赐/封赏某家臣。',
  '· attack_rival：明确要进攻/讨伐/出阵某邻国（填 rivalId）。',
  '· negotiate：明确要与某邻国通好/议和/结盟（填 rivalId）。',
  '· assign_retainer：明确要任命某家臣领军/理政/卸任（retainerId+role）。',
  '· recruit_retainer：明确要招揽/招募浪人贤才入仕（备礼招贤）。',
  '· develop_land：明确要开垦/兴田于某领国（填 provinceId）。',
  '· petition_court：明确要献金朝廷/求官位/叙任。',
  '',
  '【freeform_act——以上不精确匹配时一律用它，按 category 归类】',
  '· 宴饮/喝酒/吃饭/交谈/叙旧/联络 → social（target 填相关家臣 id）',
  '· 结婚/找老婆/嫁娶/纳妃/选妃/联姻/狩猎/休养/读书/习武 → personal',
  '· 茶会/品茗/连歌/俳句/能乐/赏花 → cultural',
  '· 参拜/祈愿/拜神/斋戒 → spiritual',
  '· 巡视/视察/巡查/体察民情 → inspect',
  '· 结盟/遣使/通好/讲和/结交邻国 → diplomacy（target 填相关邻国 id）',
  '· 招募人才/招揽浪人/求贤/纳士、以及其它一切难以归类的合理之举 → gesture',
  '',
  '【示例】',
  '「我要结婚」「找个老婆」「全天下选秀女」→ freeform_act{category:"personal"}',
  '「招募人才」「广纳贤才」→ freeform_act{category:"gesture"}',
  '「巡视尾张领国」→ freeform_act{category:"inspect"}',
  '「和木下喝酒」→ freeform_act{category:"social", target:"<木下的id>"}',
  '「把年贡定到三成」→ set_tax{rate:0.3}',
  '「去神社祈愿」→ freeform_act{category:"spiritual"}',
  '',
  'provinceId/retainerId/target 必须取自名册中的 id。',
].join('\n');

const FREEFORM_CATS = new Set([
  'social',
  'cultural',
  'spiritual',
  'personal',
  'inspect',
  'diplomacy',
  'recruit',
  'gesture',
]);

const R4_ACTIONS = new Set([
  'attack_rival',
  'negotiate',
  'assign_retainer',
  'recruit_retainer',
  'develop_land',
  'petition_court',
]);

/** 校验并构造 R4 新动作的 Decree（含 UI 标签）；非法返回 'invalid'。 */
function toR4Decree(
  call: ToolCall,
  state?: GameState,
): { decree: Decree; intent: string } | 'invalid' {
  const a = call.arguments ?? {};
  const rivalName = (id: unknown) => state?.rivals.find((r) => r.id === id)?.name ?? String(id ?? '');
  const provName = (id: unknown) => state?.provinces.find((p) => p.id === id)?.name ?? String(id ?? '');
  const retName = (id: unknown) => state?.retainers.find((r) => r.id === id)?.name ?? String(id ?? '');
  switch (call.name) {
    case 'attack_rival': {
      const rivalId = String(a.rivalId ?? '');
      if (state && !state.rivals.some((r) => r.id === rivalId)) return 'invalid';
      if (!rivalId) return 'invalid';
      return { decree: { actionId: 'attack_rival', params: { rivalId } }, intent: `出阵进攻 ${rivalName(rivalId)}` };
    }
    case 'negotiate': {
      const rivalId = String(a.rivalId ?? '');
      if (state && !state.rivals.some((r) => r.id === rivalId)) return 'invalid';
      if (!rivalId) return 'invalid';
      return { decree: { actionId: 'negotiate', params: { rivalId } }, intent: `遣使通好 ${rivalName(rivalId)}` };
    }
    case 'assign_retainer': {
      const retainerId = String(a.retainerId ?? '');
      const role = String(a.role ?? '');
      if (state && !state.retainers.some((r) => r.id === retainerId && r.alive !== false)) return 'invalid';
      if (!['war', 'admin', 'none'].includes(role)) return 'invalid';
      const rl = role === 'war' ? '领军' : role === 'admin' ? '理政' : '闲置';
      return { decree: { actionId: 'assign_retainer', params: { retainerId, role } }, intent: `命 ${retName(retainerId)} ${rl}` };
    }
    case 'recruit_retainer':
      return { decree: { actionId: 'recruit_retainer', params: {} }, intent: '备礼招揽贤才' };
    case 'develop_land': {
      const provinceId = String(a.provinceId ?? '');
      if (state && !state.provinces.some((p) => p.id === provinceId)) return 'invalid';
      if (!provinceId) return 'invalid';
      return { decree: { actionId: 'develop_land', params: { provinceId } }, intent: `开垦 ${provName(provinceId)}` };
    }
    case 'petition_court':
      return { decree: { actionId: 'petition_court', params: {} }, intent: '献金朝廷求叙任' };
    default:
      return 'invalid';
  }
}
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

  // 不给 LLM reject_intent：逼它「无论多笼统都映射到一个动作」；拒绝只走上面的时代锁。
  const tools = buildToolDefs(state, { allowReject: false });
  const baseMessages: ChatMessage[] = [
    { role: 'system', content: SYSTEM + (rosterLine(state) ? `\n${rosterLine(state)}` : '') },
    { role: 'user', content: command },
  ];

  let sawResponse = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    let call: ToolCall | undefined;
    try {
      const res = await provider.complete(baseMessages, {
        tools,
        toolChoice: 'required',
        maxTokens: 1500,
        temperature: 0,
      });
      sawResponse = true;
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

    if (R4_ACTIONS.has(call.name)) {
      const r4 = toR4Decree(call, state);
      if (r4 !== 'invalid') return { kind: 'accepted', decree: r4.decree, intent: r4.intent };
      baseMessages.push({ role: 'system', content: '上次工具调用无效，请只用名册中的 id 重新选择。' });
      continue;
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

  // 兜底：模型有响应但没给出可用动作 → 当作一桩率性之举（freeform gesture），绝不空拒。
  if (sawResponse) {
    return { kind: 'accepted', decree: { actionId: 'freeform_act', params: { category: 'gesture' } }, intent: '率性之举' };
  }
  // 纯网络/服务失败（无任何响应）→ 才回拒绝。
  return { kind: 'rejected', reason: '一时难以决断，容后再议', category: 'unclear' };
}
