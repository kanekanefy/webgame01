import type { GameState } from '../types';

function Bar({ v, className = '' }: { v: number; className?: string }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-sumi">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} />
    </div>
  );
}

const ROLE_CN: Record<string, string> = { war: '领军', admin: '理政', none: '闲置' };

export function RetainersPanel({ state }: { state: GameState }) {
  const alive = state.retainers.filter((r) => r.alive !== false);
  return (
    <section data-testid="retainers-panel" className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <h2 className="text-xs tracking-[0.3em] text-kin">家 臣</h2>
        <div className="kin-rule flex-1" />
        <span className="text-[10px] text-washi-dim">口述「任命○○领军/理政」「赏赐○○」</span>
      </div>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {alive.map((r) => (
          <li
            key={r.id}
            data-testid={`retainer-${r.id}`}
            className="flex flex-col gap-1 rounded-sm border border-kin/15 bg-sumi-soft/60 px-2.5 py-1.5"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-washi">{r.name}</span>
              <span
                className={`rounded-sm px-1.5 text-[10px] ${
                  r.assignment === 'war'
                    ? 'bg-shu/30 text-shu-bright'
                    : r.assignment === 'admin'
                      ? 'bg-ai/30 text-washi'
                      : 'text-washi-dim'
                }`}
              >
                {ROLE_CN[r.assignment ?? 'none']}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-washi-dim">
              <span className="w-6">忠</span>
              <Bar v={r.loyalty} className="bg-gradient-to-r from-shu to-kin" />
            </div>
            <div className="flex gap-2 text-[10px] text-washi-dim/80">
              <span>政 {r.skillAdmin.toFixed(2)}</span>
              <span>武 {r.skillWar.toFixed(2)}</span>
              {r.traits[0] && <span className="text-kin/60">· {r.traits.join('·')}</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RivalsPanel({ state }: { state: GameState }) {
  return (
    <section data-testid="rivals-panel" className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <h2 className="text-xs tracking-[0.3em] text-kin">邻 国</h2>
        <div className="kin-rule flex-1" />
        <span className="text-[10px] text-washi-dim">口述「进攻○○」「和○○结盟」</span>
      </div>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {state.rivals.map((c) => {
          const relation = c.allied ? '盟' : c.atWar ? '战' : '—';
          const fallen = c.strength <= 0;
          return (
            <li
              key={c.id}
              data-testid={`rival-${c.id}`}
              className={`flex flex-col gap-1 rounded-sm border px-2.5 py-1.5 ${
                fallen ? 'border-washi-dim/10 bg-sumi/40 opacity-50' : 'border-kin/15 bg-sumi-soft/60'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-washi">
                  {c.name}家{fallen && '（已亡）'}
                </span>
                <span
                  className={`rounded-sm px-1.5 text-[10px] ${
                    c.allied ? 'bg-matcha/40 text-washi' : c.atWar ? 'bg-shu/40 text-shu-bright' : 'text-washi-dim'
                  }`}
                >
                  {relation}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-washi-dim">
                <span className="w-6">兵</span>
                <span className="tabular-nums text-washi">{c.strength}</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-washi-dim">
                <span className="w-6">好感</span>
                <Bar v={c.disposition} className="bg-gradient-to-r from-shu to-matcha" />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
