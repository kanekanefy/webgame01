import { useGame } from './store';
import { StatPanel } from './components/StatPanel';
import { ActionBar } from './components/ActionBar';
import { CommandBox } from './components/CommandBox';
import { ReportLog } from './components/ReportLog';
import { EndingBanner } from './components/EndingBanner';

export default function App() {
  const { state, gameId, loading, error, newGame, advance, command } = useGame();
  const playing = state?.status === 'playing';
  const busy = loading || !playing;

  return (
    <div className="relative min-h-full w-full">
      {/* 朝议厅背景 */}
      <div
        className="pointer-events-none fixed inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/assets/court-audience-bg.png')" }}
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-sumi/40 via-sumi/55 to-sumi/85" aria-hidden />

      <main className="relative mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
        <header className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold tracking-[0.4em] text-kin sm:text-3xl">戦国大名</h1>
          <p className="text-xs tracking-[0.3em] text-washi-dim">— 評定の間 · 数値仿真 × AIGC 叙事 —</p>
        </header>

        {!gameId && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16">
            <p className="max-w-sm text-center text-sm leading-relaxed text-washi-dim">
              永禄三年（1560），尔为一方大名。于评定之间运筹年贡、兵备、民心与威信，
              撑过乱世，成就霸业。
            </p>
            <button
              data-testid="new-game-btn"
              onClick={newGame}
              disabled={loading}
              className="min-h-[44px] rounded-sm border border-kin bg-gradient-to-b from-shu to-shu-bright px-8 py-3 text-lg font-semibold tracking-widest text-washi shadow-xl transition active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? '布阵中…' : '开 启 新 局'}
            </button>
          </div>
        )}

        {error && (
          <p className="rounded-sm border border-shu/50 bg-shu/10 px-3 py-2 text-sm text-shu-bright">
            ⚠ {error}
          </p>
        )}

        {state && (
          <>
            <StatPanel state={state} />

            <div className="flex flex-col gap-4 rounded border border-kin/15 bg-sumi/40 p-4 backdrop-blur-sm">
              <CommandBox disabled={busy} onSubmit={command} />
              <div className="flex items-center gap-3">
                <span className="text-[10px] tracking-widest text-washi-dim">或择政令</span>
                <div className="kin-rule flex-1" />
              </div>
              <ActionBar state={state} disabled={busy} onAdvance={advance} />
            </div>

            <ReportLog />
            <EndingBanner state={state} onRestart={newGame} />
          </>
        )}

        <footer className="mt-auto pt-4 text-center text-[10px] tracking-widest text-washi-dim/60">
          数值权威在仿真内核 · LLM 仅司叙事，绝不改数 · alpha
        </footer>
      </main>
    </div>
  );
}
