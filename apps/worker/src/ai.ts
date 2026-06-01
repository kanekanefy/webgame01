import { listActionIds, type Decree, type GameState } from '@sengoku/core';
import type { Env } from './index.js';

/**
 * 意图解析结果。
 * - accepted：解析出合法动作（或明确的「空过一回合」decree=null）。
 * - rejected：时代锁/越权/无法解析——不推进回合，回拒绝叙事。
 */
export type ParseResult =
  | { kind: 'accepted'; decree: Decree | null; intent: string; narrative?: string }
  | { kind: 'rejected'; reason: string; narrative: string };

const VALID = new Set(listActionIds());

// 时代锁：明显不属于 16 世纪日本战国的词 → 直接拒绝。
const ANACHRONISMS = [
  '飞机', '坦克', '导弹', '核', '电', '互联网', '网络', '电话', '手机', '汽车', '火车',
  '电脑', '机枪', '原子', '卫星', '雷达', '无人机', 'gun', 'tank', 'internet', 'nuke',
];

function firstNumber(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function pct(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (m) return Number(m[1]) / 100;
  const n = firstNumber(text);
  if (n === null) return null;
  return n > 1 ? n / 100 : n; // "40" → 0.4；"0.4" → 0.4
}

/**
 * R1/默认意图解析：纯关键词规则（零网络、确定）。
 * R2 升级：若 env.LLM_API_KEY 存在则改走 packages/ai 的 function-calling 解析。
 */
export async function parseCommand(
  command: string,
  state: GameState | undefined,
  _env: Env,
): Promise<ParseResult> {
  const text = command.toLowerCase();

  for (const bad of ANACHRONISMS) {
    if (text.includes(bad)) {
      return {
        kind: 'rejected',
        reason: `时代不符：「${bad}」非战国之物`,
        narrative: '家臣面面相觑——主公所言，非此世之物，恕难奉行。',
      };
    }
  }

  // set_tax
  if (/(税|年贡|赋)/.test(command)) {
    const rate = pct(command);
    if (rate !== null && rate >= 0 && rate <= 1) {
      return { kind: 'accepted', decree: { actionId: 'set_tax', params: { rate } }, intent: `设税率为 ${(rate * 100).toFixed(0)}%` };
    }
    return { kind: 'rejected', reason: '税率不明（请给出 0-100% 的数值）', narrative: '奉行躬身：敢问主公，年贡几成？' };
  }

  // levy_troops
  if (/(征兵|募兵|征募|招兵|扩军|徵兵)/.test(command)) {
    const amount = firstNumber(command);
    if (amount !== null && amount > 0) {
      return { kind: 'accepted', decree: { actionId: 'levy_troops', params: { amount } }, intent: `征募 ${amount} 兵` };
    }
    return { kind: 'rejected', reason: '征兵数不明', narrative: '侍大将抱拳：主公欲募兵几何？' };
  }

  // build_irrigation
  if (/(水利|灌溉|治水|沟渠)/.test(command)) {
    const prov = state?.provinces.find((p) => p.productionMethod === 'basic');
    if (prov) {
      return { kind: 'accepted', decree: { actionId: 'build_irrigation', params: { provinceId: prov.id } }, intent: `于 ${prov.name} 修筑水利` };
    }
    return { kind: 'rejected', reason: '各国皆已修水利', narrative: '奉行禀报：诸国沟渠已成，无需再修。' };
  }

  // hold_festival
  if (/(祭典|祭祀|庆典|祭礼|赛神)/.test(command)) {
    return { kind: 'accepted', decree: { actionId: 'hold_festival', params: {} }, intent: '举办祭典' };
  }

  // reward_retainer
  if (/(赏|封赏|犒赏|赐|嘉奖)/.test(command)) {
    let retainerId = state?.retainers[0]?.id;
    if (state) {
      const named = state.retainers.find((r) => command.includes(r.name) || command.includes(r.name.slice(-2)));
      if (named) retainerId = named.id;
    }
    if (retainerId) {
      const name = state?.retainers.find((r) => r.id === retainerId)?.name ?? '';
      return { kind: 'accepted', decree: { actionId: 'reward_retainer', params: { retainerId } }, intent: `赏赐 ${name}` };
    }
    return { kind: 'rejected', reason: '无可赏之人', narrative: '殿中并无家臣可受此赏。' };
  }

  // 明确空过
  if (/(按兵不动|静观|观望|不动|休养|跳过|什么都不做|空过)/.test(command)) {
    return { kind: 'accepted', decree: null, intent: '按兵不动，静观其变' };
  }

  return {
    kind: 'rejected',
    reason: '无法解析为可执行的政令',
    narrative: '家臣垂首：主公之意，臣等未能领会，敢请明示。',
  };
}

export { VALID as _validActions };
