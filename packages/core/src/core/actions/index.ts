import { clamp01 } from '../util.js';
import { registerAction } from './types.js';

export const COST_PER_LEVY = 2; // koku/兵
export const FESTIVAL_COST = 50;
export const REWARD_COST = 40;
export const IRRIGATION_COST = 120;

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
  | 'personal' // 私事：婚姻/狩猎/休养 → 民心+威信
  | 'inspect' // 巡视领国 → 民心
  | 'diplomacy' // 遣使结交：与某邻国 → 该国好感
  | 'gesture'; // 兜底：些微之举 → 民心

interface FreeformEffect {
  koku?: number;
  contentment?: number;
  prestige?: number;
  loyalty?: number; // 作用于 params.target 指向的家臣
  disposition?: number; // 作用于 params.target 指向的邻国
  label: string;
}

const FREEFORM: Record<FreeformCategory, FreeformEffect> = {
  social: { koku: -10, loyalty: 0.06, contentment: 0.01, label: '宴饮交游' },
  cultural: { koku: -20, prestige: 0.03, contentment: 0.02, label: '风雅之事' },
  spiritual: { koku: -10, contentment: 0.04, label: '祈愿参拜' },
  personal: { koku: -10, contentment: 0.02, prestige: 0.02, label: '私事一桩' },
  inspect: { contentment: 0.02, label: '巡视领国' },
  diplomacy: { koku: -20, disposition: 0.05, prestige: 0.01, label: '遣使结交' },
  gesture: { contentment: 0.01, label: '率性之举' },
};

function asCategory(v: unknown): FreeformCategory {
  return typeof v === 'string' && v in FREEFORM ? (v as FreeformCategory) : 'gesture';
}

registerAction({
  id: 'freeform_act',
  // 软动作：几乎不拒（凡能解析到类别即可行），自由度的关键。
  preconditions: () => ({ ok: true }),
  apply: (s, p) => {
    const cat = asCategory(p.category);
    const eff = FREEFORM[cat];
    if (eff.koku) s.clan.koku = Math.max(0, s.clan.koku + eff.koku);
    if (eff.contentment) s.clan.contentment = clamp01(s.clan.contentment + eff.contentment);
    if (eff.prestige) s.clan.prestige = clamp01(s.clan.prestige + eff.prestige);

    let extra = '';
    if (eff.loyalty) {
      const r = s.retainers.find((x) => x.id === p.target);
      if (r) {
        r.loyalty = clamp01(r.loyalty + eff.loyalty);
        extra = `，${r.name}心向于主`;
      }
    }
    if (eff.disposition) {
      const c = s.rivals.find((x) => x.id === p.target);
      if (c) {
        c.disposition = clamp01(c.disposition + eff.disposition);
        extra = `，${c.name}稍睦`;
      }
    }
    return {
      facts: [{ kind: 'freeform', text: `${eff.label}${extra}`, data: { category: cat, target: p.target ?? null } }],
    };
  },
});
