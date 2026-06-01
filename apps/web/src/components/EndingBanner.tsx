import type { GameState } from '../types';

export function EndingBanner({ state, onRestart }: { state: GameState; onRestart: () => void }) {
  if (state.status === 'playing') return null;
  const won = state.status === 'won';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-sumi/85 backdrop-blur-sm">
      <div className="scroll-fade flex max-w-md flex-col items-center gap-5 rounded border border-kin/40 bg-sumi-soft px-8 py-10 text-center shadow-2xl">
        <div
          className={`seal-in flex h-24 w-24 items-center justify-center rounded-full border-4 text-3xl font-bold ${
            won ? 'border-kin text-kin' : 'border-shu text-shu-bright'
          }`}
        >
          {won ? '勝' : '敗'}
        </div>
        <h2 className="text-2xl font-bold tracking-widest text-washi" data-testid="ending-title">
          {won ? '霸业已成' : '家国倾覆'}
        </h2>
        <p className="text-sm leading-relaxed text-washi-dim">
          {won
            ? `撑至 ${state.year} 年，乱世之中守土安民，威名远播——天下布武之路，由此开端。`
            : `${state.year} 年，${state.season}。民心离散，基业崩颓，一代家名就此湮没于战国烽烟。`}
        </p>
        <button
          data-testid="restart-btn"
          onClick={onRestart}
          className="min-h-[44px] rounded-sm border border-kin bg-gradient-to-b from-shu to-shu-bright px-6 py-2 font-semibold tracking-wider text-washi transition active:scale-[0.98]"
        >
          再起一局
        </button>
      </div>
    </div>
  );
}
