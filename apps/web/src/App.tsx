import { useEffect, useRef, useState } from 'react';
import { useGame } from './store';
import { StatPanel } from './components/StatPanel';
import { ActionBar } from './components/ActionBar';
import { CommandBox } from './components/CommandBox';
import { ReportLog } from './components/ReportLog';
import { EndingBanner } from './components/EndingBanner';
import { playSfx, startAmbient, toggleMute, isMuted, unlockAudio } from './useAudio';
import type { Decree } from './types';

export default function App() {
  const { state, gameId, loading, error, newGame, advance, command } = useGame();
  const rejection = useGame((s) => s.rejection);
  const lastReport = useGame((s) => s.lastReport);
  const playing = state?.status === 'playing';
  const busy = loading || !playing;
  const [muted, setMuted] = useState(isMuted());
  const firstTurn = useRef(true);

  // 音效桥：依状态变化播放（数值权威不变，仅副作用音效）
  useEffect(() => {
    if (rejection) playSfx('reject');
  }, [rejection]);
  useEffect(() => {
    if (state?.status === 'won') playSfx('victory');
    else if (state?.status === 'lost') playSfx('defeat');
  }, [state?.status]);

  function unlock() {
    unlockAudio();
    startAmbient();
  }

  function handleAdvance(d: Decree | null) {
    playSfx('advance');
    advance(d);
  }
  function handleCommand(t: string) {
    playSfx('advance');
    command(t);
  }
  function handleNewGame() {
    unlock();
    playSfx('click');
    firstTurn.current = true;
    newGame();
  }

  return (
    <div className="relative min-h-full w-full" onPointerDownCapture={unlock}>
      {/* 朝议厅背景 */}
      <div
        className="pointer-events-none fixed inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/assets/court-audience-bg.jpg')" }}
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-sumi/40 via-sumi/55 to-sumi/85" aria-hidden />

      <main className="relative mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
        <header className="relative flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold tracking-[0.4em] text-kin sm:text-3xl">戦国大名</h1>
          <p className="text-xs tracking-[0.3em] text-washi-dim">— 評定の間 · 数値仿真 × AIGC 叙事 —</p>
          <button
            data-testid="mute-btn"
            aria-label={muted ? '取消静音' : '静音'}
            onClick={() => setMuted(toggleMute())}
            className="absolute right-0 top-0 rounded-sm border border-kin/30 bg-sumi-soft/70 px-2 py-1 text-sm text-washi-dim transition hover:text-washi"
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </header>

        {!gameId && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16">
            <p className="max-w-sm text-center text-sm leading-relaxed text-washi-dim">
              永禄三年（1560），尔为一方大名。于评定之间运筹年贡、兵备、民心与威信，
              撑过乱世，成就霸业。
            </p>
            <button
              data-testid="new-game-btn"
              onClick={handleNewGame}
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
              <CommandBox disabled={busy} onSubmit={handleCommand} />
              <div className="flex items-center gap-3">
                <span className="text-[10px] tracking-widest text-washi-dim">或择政令</span>
                <div className="kin-rule flex-1" />
              </div>
              <ActionBar state={state} disabled={busy} onAdvance={handleAdvance} />
            </div>

            <ReportLog />
            <EndingBanner state={state} onRestart={handleNewGame} />
          </>
        )}

        <footer className="mt-auto pt-4 text-center text-[10px] tracking-widest text-washi-dim/60">
          数值权威在仿真内核 · LLM 仅司叙事，绝不改数 · {lastReport ? `第 ${lastReport.turn} 季` : 'alpha'}
        </footer>
      </main>
    </div>
  );
}
