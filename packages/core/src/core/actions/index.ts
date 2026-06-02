import { clamp01 } from '../util.js';
import { registerAction } from './types.js';
import { resolveAttack, ATTACK_MIN_LEVY } from '../war.js';
import { recruitFromPool } from '../events.js';

export const COST_PER_LEVY = 2; // koku/兵
export const FESTIVAL_COST = 50;
export const REWARD_COST = 40;
export const IRRIGATION_COST = 120;
export const RECRUIT_COST = 30; // 招揽费
export const DEVELOP_COST = 80; // 开垦费
export const PETITION_COST = 60; // 献金朝廷费

registerAction({
  id: 'set_tax',
  preconditions: (_s, p) =>
    typeof p.rate === 'number' && p.rate >= 0 && p.rate <= 1
      ? { ok: true }
      : { ok: false, reason: 'rate must be 0..1' },
  apply: (s, p) => {
    s.taxRate = clamp01(p.rate as number);
    return { facts: [{ kind: 'tax_set', text: `税率定为 ${(s.taxRate * 100).toFixed(0)}%` }] };
  },
});

registerAction({
  id: 'levy_troops',
  preconditions: (s, p) => {
    const n = p.amount;
    if (typeof n !== 'number' || n <= 0) return { ok: false, reason: 'amount must be > 0' };
    if (s.clan.koku < n * COST_PER_LEVY) return { ok: false, reason: '国库不足以征兵' };
    return { ok: true };
  },
  apply: (s, p) => {
    const n = p.amount as number;
    s.clan.koku -= n * COST_PER_LEVY;
    s.clan.levy += n;
    s.clan.contentment = clamp01(s.clan.contentment - 0.03);
    return { facts: [{ kind: 'levy', text: `征募 ${n} 兵`, data: { amount: n } }] };
  },
});

registerAction({
  id: 'build_irrigation',
  preconditions: (s, p) => {
    const prov = s.provinces.find((x) => x.id === p.provinceId);
    if (!prov) return { ok: false, reason: '无此领国' };
    if (prov.productionMethod === 'irrigated') return { ok: false, reason: '已修水利' };
    if (s.clan.koku < IRRIGATION_COST) return { ok: false, reason: '国库不足' };
    return { ok: true };
  },
  apply: (s, p) => {
    const prov = s.provinces.find((x) => x.id === p.provinceId)!;
    s.clan.koku -= IRRIGATION_COST;
    prov.productionMethod = 'irrigated';
    return { facts: [{ kind: 'irrigation', text: `${prov.name} 修筑水利`, data: { provinceId: prov.id } }] };
  },
});

registerAction({
  id: 'hold_festival',
  preconditions: (s) =>
    s.clan.koku >= FESTIVAL_COST ? { ok: true } : { ok: false, reason: '国库不足' },
  apply: (s) => {
    s.clan.koku -= FESTIVAL_COST;
    s.clan.contentment = clamp01(s.clan.contentment + 0.08);
    s.clan.prestige = clamp01(s.clan.prestige + 0.02);
    return { facts: [{ kind: 'festival', text: '举办祭典，民心稍安' }] };
  },
});

registerAction({
  id: 'reward_retainer',
  preconditions: (s, p) => {
    const r = s.retainers.find((x) => x.id === p.retainerId);
    if (!r) return { ok: false, reason: '无此家臣' };
    if (s.clan.koku < REWARD_COST) return { ok: false, reason: '国库不足' };
    return { ok: true };
  },
  apply: (s, p) => {
    const r = s.retainers.find((x) => x.id === p.retainerId)!;
    s.clan.koku -= REWARD_COST;
    r.loyalty = clamp01(r.loyalty + 0.1);
    s.clan.prestige = clamp01(s.clan.prestige + 0.03);
    return { facts: [{ kind: 'reward', text: `赏赐 ${r.name}，忠诚提升`, data: { retainerId: r.id } }] };
  },
});

// —— freeform_act：通用「随心而为」动作 ——
// AIGC 自由度的承载：玩家任意合时代之举（宴饮/风雅/参拜/联姻/巡视/外交…）
// 都落到此动作，由核心按「类别」给小幅有界增益。LLM 只选类别（不写数字），
// 数值权威仍在核心、可确定性回放。爽点在 AIGC 叙事，数值只做轻微点染。
export type FreeformCategory =
  | 'social' // 宴饮交游：与某家臣同乐 → 该家臣忠诚
  | 'cultural' // 风雅之事：茶会/连歌/能乐 → 威信
  | 'spiritual' // 祈愿参拜：神社寺庙 → 民心
  | 'personal' // 私事：婚姻/狩猎/休养 → 民心+威信（target 为邻国则联姻结盟）
  | 'inspect' // 巡视领国 → 民心
  | 'diplomacy' // 遣使结交：与某邻国 → 该国好感
  | 'recruit' // 招贤纳士 → 按 fame 招揽浪人
  | 'gesture'; // 兜底：些微之举 → 民心

interface FreeformEffect {
  koku?: number;
  contentment?: number;
  prestige?: number;
  loyalty?: number; // 作用于 params.target 指向的家臣
  disposition?: number; // 作用于 params.target 指向的邻国
  fame?: number;
  label: string;
}

const FREEFORM: Record<FreeformCategory, FreeformEffect> = {
  social: { koku: -10, loyalty: 0.06, contentment: 0.01, label: '宴饮交游' },
  cultural: { koku: -20, prestige: 0.03, contentment: 0.02, label: '风雅之事' },
  spiritual: { koku: -10, contentment: 0.04, label: '祈愿参拜' },
  personal: { koku: -10, contentment: 0.02, prestige: 0.02, label: '私事一桩' },
  inspect: { contentment: 0.02, label: '巡视领国' },
  diplomacy: { koku: -20, disposition: 0.06, prestige: 0.01, label: '遣使结交' },
  recruit: { koku: -20, fame: 0.02, label: '招贤纳士' },
  gesture: { contentment: 0.01, label: '率性之举' },
};

function asCategory(v: unknown): FreeformCategory {
  return typeof v === 'string' && v in FREEFORM ? (v as FreeformCategory) : 'gesture';
}

function syncAlliance(c: { disposition: number; allied: boolean; atWar: boolean }): void {
  if (c.disposition >= 0.8) {
    c.allied = true;
    c.atWar = false;
  }
}

registerAction({
  id: 'freeform_act',
  // 软动作：几乎不拒（凡能解析到类别即可行），自由度的关键。
  preconditions: () => ({ ok: true }),
  apply: (s, p, ctx) => {
    const cat = asCategory(p.category);
    const eff = FREEFORM[cat];
    if (eff.koku) s.clan.koku = Math.max(0, s.clan.koku + eff.koku);
    if (eff.contentment) s.clan.contentment = clamp01(s.clan.contentment + eff.contentment);
    if (eff.prestige) s.clan.prestige = clamp01(s.clan.prestige + eff.prestige);
    if (eff.fame) s.fame = clamp01(s.fame + eff.fame);

    let extra = '';

    // social：对家臣 → 忠诚
    if (eff.loyalty) {
      const r = s.retainers.find((x) => x.id === p.target && x.alive);
      if (r) {
        r.loyalty = clamp01(r.loyalty + eff.loyalty);
        extra = `，${r.name}心向于主`;
      }
    }
    // diplomacy：对邻国 → 好感（可达成结盟）
    if (eff.disposition) {
      const c = s.rivals.find((x) => x.id === p.target);
      if (c) {
        c.disposition = clamp01(c.disposition + eff.disposition);
        syncAlliance(c);
        extra = c.allied ? `，与${c.name}缔盟` : `，${c.name}稍睦`;
      }
    }
    // personal：若指向邻国 → 政治联姻，好感大增
    if (cat === 'personal' && p.target) {
      const c = s.rivals.find((x) => x.id === p.target);
      if (c) {
        c.disposition = clamp01(c.disposition + 0.15);
        syncAlliance(c);
        extra = c.allied ? `，联姻结盟 ${c.name}` : `，与${c.name}联姻修好`;
      }
    }
    // recruit：按 fame 招揽浪人
    if (cat === 'recruit' && ctx) {
      const name = recruitFromPool(s, ctx.rng);
      extra = name ? `，得 ${name} 来仕` : '，惜无贤才应募';
    }

    return {
      facts: [{ kind: 'freeform', text: `${eff.label}${extra}`, data: { category: cat, target: p.target ?? null } }],
    };
  },
});

// —— attack_rival：主动进攻邻国 ——
registerAction({
  id: 'attack_rival',
  preconditions: (s, p) => {
    const c = s.rivals.find((x) => x.id === p.rivalId);
    if (!c) return { ok: false, reason: '无此邻国' };
    if (c.strength <= 0) return { ok: false, reason: '该家已亡' };
    if (c.allied) return { ok: false, reason: '盟友不可攻' };
    if (s.clan.levy < ATTACK_MIN_LEVY) return { ok: false, reason: `兵不足 ${ATTACK_MIN_LEVY}，难以出阵` };
    return { ok: true };
  },
  apply: (s, p, ctx) => {
    const c = s.rivals.find((x) => x.id === p.rivalId)!;
    return { facts: resolveAttack(s, c, ctx.rng) };
  },
});

// —— assign_retainer：任命职务（领军/理政/闲置）——
registerAction({
  id: 'assign_retainer',
  preconditions: (s, p) => {
    const r = s.retainers.find((x) => x.id === p.retainerId && x.alive);
    if (!r) return { ok: false, reason: '无此家臣' };
    const role = p.role;
    if (role !== 'war' && role !== 'admin' && role !== 'none') return { ok: false, reason: '职务不明' };
    return { ok: true };
  },
  apply: (s, p) => {
    const r = s.retainers.find((x) => x.id === p.retainerId)!;
    r.assignment = p.role as 'war' | 'admin' | 'none';
    const label = r.assignment === 'war' ? '领军' : r.assignment === 'admin' ? '理政' : '闲置';
    return { facts: [{ kind: 'assign', text: `命 ${r.name} ${label}`, data: { retainerId: r.id, role: r.assignment } }] };
  },
});

// —— recruit_retainer：招揽浪人 ——
registerAction({
  id: 'recruit_retainer',
  preconditions: (s) => {
    if (!s.roninPool.length) return { ok: false, reason: '无浪人可招' };
    if (s.clan.koku < RECRUIT_COST) return { ok: false, reason: '国库不足以备礼招贤' };
    return { ok: true };
  },
  apply: (s, _p, ctx) => {
    s.clan.koku -= RECRUIT_COST;
    const name = recruitFromPool(s, ctx.rng);
    return {
      facts: [{ kind: name ? 'recruit' : 'recruit_fail', text: name ? `招得 ${name} 来仕` : '遍寻贤才，惜未谈拢' }],
    };
  },
});

// —— develop_land：开垦 ——
registerAction({
  id: 'develop_land',
  preconditions: (s, p) => {
    const prov = s.provinces.find((x) => x.id === p.provinceId);
    if (!prov) return { ok: false, reason: '无此领国' };
    if (s.clan.koku < DEVELOP_COST) return { ok: false, reason: '国库不足' };
    return { ok: true };
  },
  apply: (s, p) => {
    const prov = s.provinces.find((x) => x.id === p.provinceId)!;
    s.clan.koku -= DEVELOP_COST;
    const v = prov.villages[0];
    const before = v ? v.peasants : 0;
    if (v) v.peasants = Math.round(v.peasants * 1.12);
    const gain = v ? v.peasants - before : 0;
    return { facts: [{ kind: 'develop', text: `${prov.name} 开垦新田，招徕农户 ${gain}`, data: { provinceId: prov.id } }] };
  },
});

// —— petition_court：献金朝廷求叙任 ——
registerAction({
  id: 'petition_court',
  preconditions: (s) => {
    if (s.clan.koku < PETITION_COST) return { ok: false, reason: '献金不足' };
    if (s.courtRank >= 5) return { ok: false, reason: '位极人臣，无可再叙' };
    return { ok: true };
  },
  apply: (s) => {
    s.clan.koku -= PETITION_COST;
    s.courtRank += 1;
    s.clan.prestige = clamp01(s.clan.prestige + 0.05);
    s.fame = clamp01(s.fame + 0.03);
    return { facts: [{ kind: 'court', text: `献金朝廷，叙任官位 ${s.courtRank}，威名愈隆` }] };
  },
});

// —— negotiate：遣使外交 ——
registerAction({
  id: 'negotiate',
  preconditions: (s, p) => {
    const c = s.rivals.find((x) => x.id === p.rivalId);
    if (!c) return { ok: false, reason: '无此邻国' };
    if (c.allied) return { ok: false, reason: '已是盟友' };
    return { ok: true };
  },
  apply: (s, p) => {
    const c = s.rivals.find((x) => x.id === p.rivalId)!;
    c.disposition = clamp01(c.disposition + 0.12);
    syncAlliance(c);
    return {
      facts: [
        {
          kind: 'negotiate',
          text: c.allied ? `遣使斡旋，与 ${c.name} 缔结盟约` : `遣使通好，${c.name} 好感渐增`,
          data: { rivalId: c.id },
        },
      ],
    };
  },
});
