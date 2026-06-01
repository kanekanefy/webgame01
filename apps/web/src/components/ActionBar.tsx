import { useMemo, useState } from 'react';
import type { ActionId, Decree, GameState } from '../types';

const ACTION_LABELS: Record<ActionId, string> = {
  set_tax: '定年贡（税率）',
  levy_troops: '征募兵卒',
  build_irrigation: '修筑水利',
  hold_festival: '举办祭典',
  reward_retainer: '赏赐家臣',
};

const ACTION_ORDER: ActionId[] = [
  'set_tax',
  'levy_troops',
  'build_irrigation',
  'hold_festival',
  'reward_retainer',
];

export function ActionBar({
  state,
  disabled,
  onAdvance,
}: {
  state: GameState;
  disabled: boolean;
  onAdvance: (decree: Decree | null) => void;
}) {
  const [action, setAction] = useState<ActionId>('set_tax');
  const [rate, setRate] = useState(30);
  const [amount, setAmount] = useState(20);

  const basicProvinces = useMemo(
    () => state.provinces.filter((p) => p.productionMethod === 'basic'),
    [state.provinces],
  );
  const [provinceId, setProvinceId] = useState(basicProvinces[0]?.id ?? '');
  const [retainerId, setRetainerId] = useState(state.retainers[0]?.id ?? '');

  function buildDecree(): Decree | null {
    switch (action) {
      case 'set_tax':
        return { actionId: 'set_tax', params: { rate: rate / 100 } };
      case 'levy_troops':
        return { actionId: 'levy_troops', params: { amount } };
      case 'build_irrigation':
        return provinceId ? { actionId: 'build_irrigation', params: { provinceId } } : null;
      case 'hold_festival':
        return { actionId: 'hold_festival', params: {} };
      case 'reward_retainer':
        return retainerId ? { actionId: 'reward_retainer', params: { retainerId } } : null;
      default:
        return null;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] tracking-widest text-washi-dim">政令</span>
          <select
            data-testid="action-select"
            className="rounded-sm border border-kin/30 bg-sumi-soft px-3 py-2 text-washi outline-none focus:border-kin"
            value={action}
            onChange={(e) => setAction(e.target.value as ActionId)}
          >
            {ACTION_ORDER.map((id) => (
              <option key={id} value={id}>
                {ACTION_LABELS[id]}
              </option>
            ))}
          </select>
        </label>

        {/* 参数区随动作切换 */}
        {action === 'set_tax' && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] tracking-widest text-washi-dim">税率 {rate}%</span>
            <input
              data-testid="param-rate"
              type="range"
              min={0}
              max={100}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="w-full accent-kin sm:w-44"
            />
          </label>
        )}

        {action === 'levy_troops' && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] tracking-widest text-washi-dim">兵数（耗 2 石/兵）</span>
            <input
              data-testid="param-amount"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full rounded-sm border border-kin/30 bg-sumi-soft px-3 py-2 text-washi outline-none focus:border-kin sm:w-32"
            />
          </label>
        )}

        {action === 'build_irrigation' && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] tracking-widest text-washi-dim">领国</span>
            <select
              data-testid="param-province"
              className="rounded-sm border border-kin/30 bg-sumi-soft px-3 py-2 text-washi outline-none focus:border-kin"
              value={provinceId}
              onChange={(e) => setProvinceId(e.target.value)}
            >
              {basicProvinces.length === 0 && <option value="">（皆已修）</option>}
              {basicProvinces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {action === 'reward_retainer' && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] tracking-widest text-washi-dim">家臣</span>
            <select
              data-testid="param-retainer"
              className="rounded-sm border border-kin/30 bg-sumi-soft px-3 py-2 text-washi outline-none focus:border-kin"
              value={retainerId}
              onChange={(e) => setRetainerId(e.target.value)}
            >
              {state.retainers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}（忠 {r.loyalty.toFixed(2)}）
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex gap-2">
        <button
          data-testid="advance-turn-btn"
          disabled={disabled}
          onClick={() => onAdvance(buildDecree())}
          className="min-h-[44px] flex-1 rounded-sm border border-kin bg-gradient-to-b from-shu to-shu-bright px-4 py-2 font-semibold tracking-wider text-washi shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          颁布政令 · 推进一季
        </button>
        <button
          data-testid="skip-turn-btn"
          disabled={disabled}
          onClick={() => onAdvance(null)}
          className="min-h-[44px] rounded-sm border border-kin/40 bg-sumi-soft px-4 py-2 text-washi-dim transition active:scale-[0.98] hover:text-washi disabled:opacity-40"
        >
          按兵不动
        </button>
      </div>
    </div>
  );
}
