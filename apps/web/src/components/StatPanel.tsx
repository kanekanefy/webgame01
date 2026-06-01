import { useEffect, useRef } from 'react';
import type { GameState } from '../types';

const SEASON_CN: Record<string, string> = {
  Spring: '春',
  Summer: '夏',
  Autumn: '秋',
  Winter: '冬',
};

const STATUS_CN: Record<string, string> = {
  playing: '治世',
  won: '霸业已成',
  lost: '家国倾覆',
};

function Stat({
  label,
  value,
  testid,
  suffix,
  bar,
}: {
  label: string;
  value: string | number;
  testid: string;
  suffix?: string;
  bar?: number; // 0..1 → 进度条
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value && ref.current) {
      ref.current.classList.remove('stat-pulse');
      void ref.current.offsetWidth; // 重触发动画
      ref.current.classList.add('stat-pulse');
      prev.current = value;
    }
  }, [value]);

  return (
    <div className="flex flex-col gap-1 rounded-sm border border-kin/20 bg-sumi-soft/70 px-3 py-2 backdrop-blur-sm">
      <span className="text-[11px] tracking-widest text-washi-dim">{label}</span>
      <span className="text-xl font-semibold tabular-nums text-washi" data-testid={testid} ref={ref}>
        {value}
        {suffix && <span className="ml-0.5 text-xs text-washi-dim">{suffix}</span>}
      </span>
      {bar !== undefined && (
        <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-sumi">
          <div
            className="h-full rounded-full bg-gradient-to-r from-shu to-kin transition-all duration-500"
            style={{ width: `${Math.max(0, Math.min(1, bar)) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function StatPanel({ state }: { state: GameState }) {
  const { clan } = state;
  return (
    <section aria-label="国势" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      <Stat label="纪年" value={state.year} suffix="年" testid="stat-year" />
      <Stat label="时令" value={SEASON_CN[state.season] ?? state.season} testid="stat-season" />
      <Stat label="石高" value={Math.round(clan.koku)} suffix="石" testid="stat-koku" />
      <Stat label="兵力" value={clan.levy} suffix="众" testid="stat-levy" />
      <Stat label="民心" value={clan.contentment.toFixed(2)} testid="stat-contentment" bar={clan.contentment} />
      <Stat label="威信" value={clan.prestige.toFixed(2)} testid="stat-prestige" bar={clan.prestige} />
      <Stat label="目标" value={`撑至 ${state.goalYear} 年`} testid="stat-goal" />
      <Stat label="局势" value={STATUS_CN[state.status] ?? state.status} testid="stat-status" />
    </section>
  );
}
