import { useGame } from '../store';

const SEASON_CN: Record<string, string> = {
  Spring: '春',
  Summer: '夏',
  Autumn: '秋',
  Winter: '冬',
};

export function ReportLog() {
  const log = useGame((s) => s.log);
  const rejection = useGame((s) => s.rejection);

  return (
    <section data-testid="report-area" aria-label="评定记录" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-sm tracking-[0.3em] text-kin">评 定 录</h2>
        <div className="kin-rule flex-1" />
      </div>

      {rejection && (
        <div className="scroll-fade rounded-sm border border-shu/50 bg-shu/10 px-3 py-2">
          <p className="text-sm text-shu-bright" data-testid="report-rejection">
            ✕ {rejection.reason}
          </p>
          {rejection.narrative && <p className="mt-1 text-sm text-washi-dim">{rejection.narrative}</p>}
        </div>
      )}

      {log.length === 0 && !rejection && (
        <p className="text-sm text-washi-dim">尚无政令。请于下方颁布或口述。</p>
      )}

      <ol className="flex flex-col gap-3">
        {log.map((e) => (
          <li
            key={e.id}
            className={`scroll-fade rounded-sm border px-3 py-2 ${
              e.rejected ? 'border-shu/30 bg-shu/5' : 'border-kin/15 bg-sumi-soft/50'
            }`}
          >
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-xs tracking-widest text-washi-dim">
                {e.year} 年 · {SEASON_CN[e.season] ?? e.season}
              </span>
              {e.issue && (
                <span data-testid="report-issue" className="text-xs text-kin/80">
                  议题：{e.issue}
                </span>
              )}
            </div>
            {e.intent && <p className="mb-1 text-sm text-ai/90">「{e.intent}」</p>}
            {e.facts.length > 0 && (
              <p data-testid="report-facts" className="text-sm text-washi">
                {e.facts.join('；')}
              </p>
            )}
            {e.events.length > 0 && (
              <p data-testid="report-events" className="mt-1 text-sm text-shu-bright">
                {e.events.join('；')}
              </p>
            )}
            {e.narrative && <p className="mt-1 text-sm text-washi-dim">{e.narrative}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
