import type { GameState, Retainer } from './state.js';
import type { OutcomeFact } from './actions/types.js';
import type { RNG } from './rng.js';
import { clamp01 } from './util.js';
import { totalPeasants } from './economy.js';
import { resolveDefense } from './war.js';

// —— Tuning knobs ——
export const EVENT_DRAW_PROB = 0.6; // 每季抽到事件的概率
export const BETRAYAL_PROB = 0.4; // 满足条件的家臣谋反概率
export const INVASION_PROB = 0.2; // 满足条件的邻国来攻概率
export const POP_GROWTH = 0.02; // 人口年增长系数（按 民心-0.5）
export const RECRUIT_BASE = 0.5; // 招揽基准概率（× fame 调制）

/** 从浪人池招得一名（成功返回家臣名，失败 null）。概率随 fame 提升。 */
export function recruitFromPool(state: GameState, rng: RNG): string | null {
  if (!state.roninPool.length) return null;
  const chance = clamp01(RECRUIT_BASE * (0.5 + state.fame));
  if (rng.next() > chance) return null;
  const idx = rng.int(0, state.roninPool.length - 1);
  const ronin = state.roninPool.splice(idx, 1)[0]!;
  ronin.alive = true;
  ronin.assignment = 'none';
  ronin.loyalty = clamp01(ronin.loyalty);
  state.retainers.push(ronin);
  state.fame = clamp01(state.fame + 0.03);
  return ronin.name;
}

interface DeckEvent {
  kind: string;
  weight: number;
  when: (s: GameState) => boolean;
  apply: (s: GameState, rng: RNG) => string;
}

const DECK: DeckEvent[] = [
  {
    kind: 'bumper',
    weight: 10,
    when: (s) => s.clan.contentment > 0.4,
    apply: (s) => {
      const gain = Math.round(totalPeasants(s) * 0.002);
      s.clan.koku += gain;
      s.clan.contentment = clamp01(s.clan.contentment + 0.02);
      return `丰年大稔，仓廪渐实（+${gain} 石）`;
    },
  },
  {
    kind: 'famine',
    weight: 7,
    when: (s) => s.clan.contentment < 0.55,
    apply: (s) => {
      s.clan.contentment = clamp01(s.clan.contentment - 0.06);
      const prov = s.provinces.find((p) => p.villages.some((v) => v.peasants > 0));
      if (prov && prov.villages[0]) prov.villages[0].peasants = Math.max(0, Math.round(prov.villages[0].peasants * 0.97));
      return '歉收成灾，饿殍载道，民心浮动';
    },
  },
  {
    kind: 'plague',
    weight: 5,
    when: () => true,
    apply: (s) => {
      for (const p of s.provinces) for (const v of p.villages) v.peasants = Math.max(0, Math.round(v.peasants * 0.97));
      s.clan.contentment = clamp01(s.clan.contentment - 0.03);
      return '疫病流行，村落凋敝';
    },
  },
  {
    kind: 'flood',
    weight: 6,
    when: () => true,
    apply: (s) => {
      s.clan.koku = Math.max(0, s.clan.koku - 20);
      s.clan.contentment = clamp01(s.clan.contentment - 0.02);
      return '大水冲毁田垄，修堤耗费 20 石';
    },
  },
  {
    kind: 'court_favor',
    weight: 6,
    when: (s) => s.fame > 0.5 && s.courtRank < 5,
    apply: (s) => {
      s.courtRank += 1;
      s.clan.prestige = clamp01(s.clan.prestige + 0.05);
      return `朝廷叙任，加官进位（官位 ${s.courtRank}），威名远播`;
    },
  },
  {
    kind: 'merchant_gift',
    weight: 8,
    when: () => true,
    apply: (s, rng) => {
      const gift = 30 + rng.int(0, 40);
      s.clan.koku += gift;
      return `堺の豪商献金 ${gift} 石，以结善缘`;
    },
  },
  {
    kind: 'ronin_offer',
    weight: 7,
    when: (s) => s.roninPool.length > 0 && s.fame > 0.35,
    apply: (s, rng) => {
      const name = recruitFromPool(s, rng);
      return name ? `浪人 ${name} 慕名来仕，愿效犬马之劳` : '有浪人来访，惜未谈拢';
    },
  },
  {
    kind: 'border_friction',
    weight: 7,
    when: (s) => s.rivals.some((r) => !r.allied),
    apply: (s, rng) => {
      const targets = s.rivals.filter((r) => !r.allied);
      const r = targets[rng.int(0, targets.length - 1)]!;
      r.disposition = clamp01(r.disposition - 0.05);
      return `${r.name} 于边境屡有挑衅，关系趋冷`;
    },
  },
  {
    kind: 'retainer_dispute',
    weight: 6,
    when: (s) => s.retainers.filter((r) => r.alive).length > 1,
    apply: (s, rng) => {
      const alive = s.retainers.filter((r) => r.alive);
      const r = alive[rng.int(0, alive.length - 1)]!;
      r.loyalty = clamp01(r.loyalty - 0.05);
      return `家中议论纷起，${r.name} 心生芥蒂`;
    },
  },
  {
    kind: 'ikki',
    weight: 9,
    when: (s) => s.clan.contentment < 0.3,
    apply: (s) => {
      s.clan.levy = Math.max(0, s.clan.levy - 10);
      s.clan.contentment = clamp01(s.clan.contentment - 0.02);
      return '一揆四起，乱民冲击代官所，损兵十';
    },
  },
  {
    kind: 'omen',
    weight: 4,
    when: () => true,
    apply: (s) => {
      s.clan.contentment = clamp01(s.clan.contentment + 0.02);
      s.fame = clamp01(s.fame + 0.02);
      return '天现祥瑞，众皆称主公得天命';
    },
  },
];

/** 谋反：低忠诚高野心的家臣可能反叛离场，并带走部分兵力。 */
function checkBetrayal(state: GameState, rng: RNG): OutcomeFact[] {
  const traitors = state.retainers.filter((r) => r.alive && r.loyalty < 0.3 && r.ambition > 0.6);
  if (!traitors.length || rng.next() > BETRAYAL_PROB) return [];
  const t = traitors[rng.int(0, traitors.length - 1)]!;
  t.alive = false;
  t.assignment = 'none';
  const taken = Math.round(state.clan.levy * 0.15);
  state.clan.levy = Math.max(0, state.clan.levy - taken);
  state.clan.prestige = clamp01(state.clan.prestige - 0.08);
  state.clan.contentment = clamp01(state.clan.contentment - 0.03);
  return [{ kind: 'betrayal', text: `${t.name} 谋反出奔，裹挟兵卒 ${taken}！`, data: { retainerId: t.id } }];
}

/** 邻国 AI：敌意深、兵势盛者可能来攻（触发防御战）。 */
function checkInvasion(state: GameState, rng: RNG): OutcomeFact[] {
  const garrison = state.provinces.reduce((s, p) => s + p.garrison, 0);
  const defense = garrison + state.clan.levy * 0.5;
  const aggressors = state.rivals.filter(
    (r) => !r.allied && r.strength > 0 && r.disposition < 0.35 && r.strength > defense * 0.8,
  );
  if (!aggressors.length || rng.next() > INVASION_PROB) return [];
  const r = aggressors[rng.int(0, aggressors.length - 1)]!;
  return resolveDefense(state, r, rng);
}

/** 世界事件总入口（替代旧 runEvents）：谋反 → 邻国来攻 → 抽牌库。 */
export function runWorldEvents(state: GameState, rng: RNG): OutcomeFact[] {
  const facts: OutcomeFact[] = [];
  facts.push(...checkBetrayal(state, rng));
  facts.push(...checkInvasion(state, rng));

  if (rng.next() < EVENT_DRAW_PROB) {
    const eligible = DECK.filter((e) => e.when(state));
    const totalW = eligible.reduce((s, e) => s + e.weight, 0);
    if (totalW > 0) {
      let r = rng.next() * totalW;
      const picked = eligible.find((e) => (r -= e.weight) < 0);
      if (picked) facts.push({ kind: picked.kind, text: picked.apply(state, rng) });
    }
  }
  return facts;
}

/** 人口动态：开春按上年民心繁衍/流散（高民心增、低民心减）。 */
export function updatePopulation(state: GameState): void {
  const rate = POP_GROWTH * (state.clan.contentment - 0.5);
  for (const p of state.provinces) {
    for (const v of p.villages) {
      v.peasants = Math.max(100, Math.round(v.peasants * (1 + rate)));
    }
  }
}
