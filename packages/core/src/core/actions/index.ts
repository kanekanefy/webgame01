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
