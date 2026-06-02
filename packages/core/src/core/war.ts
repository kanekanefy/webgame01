import type { GameState, RivalClan } from './state.js';
import type { OutcomeFact } from './actions/types.js';
import type { RNG } from './rng.js';
import { clamp, clamp01 } from './util.js';

// —— Tuning knobs ——
export const ATTACK_MIN_LEVY = 20; // 出阵最低兵力
export const LOOT_FACTOR = 0.35; // 掠夺系数（按削敌兵势折算 koku）
export const BASE_WAR_SKILL = 0.3; // 无领军家臣时的基准战技
export const ANNEX_PEASANTS = 1500; // 吞并所得领民

/** 领军家臣中最高战技（无则基准）。 */
export function bestWarSkill(state: GameState): number {
  const leaders = state.retainers.filter((r) => r.alive && r.assignment === 'war');
  if (!leaders.length) return BASE_WAR_SKILL;
  return Math.max(...leaders.map((r) => r.skillWar));
}

/** 理政家臣的治理加成（0..~0.5）。 */
export function adminBonus(state: GameState): number {
  const govs = state.retainers.filter((r) => r.alive && r.assignment === 'admin');
  if (!govs.length) return 0;
  const avg = govs.reduce((s, r) => s + r.skillAdmin, 0) / govs.length;
  return avg * 0.5;
}

function firstProvinceWithPeasants(state: GameState) {
  return state.provinces.find((p) => p.villages.some((v) => v.peasants > 0));
}

/** 主动进攻邻国。胜：削敌兵势/掠粮/威信名声+；敌兵势归零则吞并。败：损兵/威信民心-。 */
export function resolveAttack(state: GameState, rival: RivalClan, rng: RNG): OutcomeFact[] {
  const skill = bestWarSkill(state);
  const A = state.clan.levy * (1 + 0.5 * skill) * (0.8 + rng.next() * 0.4);
  const D = rival.strength * 1.05 * (0.9 + rng.next() * 0.2);
  const total = A + D || 1;
  rival.atWar = true;
  rival.disposition = clamp01(rival.disposition - 0.1);
  rival.allied = false;

  if (A > D) {
    const casualty = Math.round(state.clan.levy * clamp(D / total, 0.1, 0.6));
    state.clan.levy = Math.max(0, state.clan.levy - casualty);
    const dmg = Math.min(rival.strength, rival.strength * (A / total));
    rival.strength = Math.max(0, Math.round(rival.strength - dmg));
    const loot = Math.round(dmg * LOOT_FACTOR);
    state.clan.koku += loot;
    state.clan.prestige = clamp01(state.clan.prestige + 0.05);
    state.fame = clamp01(state.fame + 0.05);

    if (rival.strength <= 0) {
      rival.atWar = false;
      const prov = state.provinces[0];
      if (prov && prov.villages[0]) prov.villages[0].peasants += ANNEX_PEASANTS;
      state.clan.prestige = clamp01(state.clan.prestige + 0.1);
      state.fame = clamp01(state.fame + 0.1);
      return [{ kind: 'conquer', text: `大破并吞 ${rival.name}！领民归附`, data: { rivalId: rival.id } }];
    }
    return [
      {
        kind: 'battle_win',
        text: `野战大捷，破 ${rival.name} 兵 ${Math.round(dmg)}，掠粮 ${loot} 石，损兵 ${casualty}`,
        data: { rivalId: rival.id },
      },
    ];
  }

  const casualty = Math.round(state.clan.levy * clamp(D / total, 0.2, 0.7));
  state.clan.levy = Math.max(0, state.clan.levy - casualty);
  state.clan.prestige = clamp01(state.clan.prestige - 0.06);
  state.clan.contentment = clamp01(state.clan.contentment - 0.04);
  return [{ kind: 'battle_lose', text: `兵败于 ${rival.name}，损兵 ${casualty}，威信受挫`, data: { rivalId: rival.id } }];
}

/** 防御邻国来攻。胜：威信+/略削敌；败：失兵/失民/民心威信-。 */
export function resolveDefense(state: GameState, rival: RivalClan, rng: RNG): OutcomeFact[] {
  const garrison = state.provinces.reduce((s, p) => s + p.garrison, 0);
  const fort = state.provinces.reduce((s, p) => s + p.fortification, 0);
  const Def =
    (garrison + state.clan.levy * 0.5 + fort * 30) * (0.9 + rng.next() * 0.2) * (1 + 0.3 * bestWarSkill(state));
  const Atk = rival.strength * (0.7 + rng.next() * 0.5);
  rival.atWar = true;

  if (Def >= Atk) {
    state.clan.prestige = clamp01(state.clan.prestige + 0.04);
    state.fame = clamp01(state.fame + 0.03);
    rival.strength = Math.max(0, Math.round(rival.strength * 0.92));
    return [{ kind: 'defend_win', text: `${rival.name} 来犯，据城死守，击退之！`, data: { rivalId: rival.id } }];
  }

  const lostLevy = Math.round(state.clan.levy * 0.25);
  state.clan.levy = Math.max(0, state.clan.levy - lostLevy);
  const prov = firstProvinceWithPeasants(state);
  if (prov && prov.villages[0]) prov.villages[0].peasants = Math.max(0, Math.round(prov.villages[0].peasants * 0.9));
  state.clan.contentment = clamp01(state.clan.contentment - 0.06);
  state.clan.prestige = clamp01(state.clan.prestige - 0.05);
  // 战争消耗：攻方亦有折损，强邻反复来犯会逐渐衰减（避免无限重复）。
  rival.strength = Math.max(0, Math.round(rival.strength * 0.95));
  return [{ kind: 'defend_lose', text: `${rival.name} 破境而入，领国残破，民心动摇`, data: { rivalId: rival.id } }];
}
