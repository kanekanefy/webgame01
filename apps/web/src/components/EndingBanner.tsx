import type { GameState } from '../types';

export function EndingBanner({ state, onRestart }: { state: GameState; onRestart: () => void }) {
  if (state.status === 'playing') return null;
  const won = state.status === 'won';
  const art = won ? '/assets/ending-win.jpg' : '/assets/ending-lose.jpg';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-sumi/85 p-4 backdrop-blur-sm">
      <div className="scroll-fade flex w-full max-w-lg flex-col overflow-hidden rounded border border-kin/40 bg-sumi-soft shadow-2xl">
        {/* 结局立绘 */}
        <div className="relative h-44 w-full sm:h-56">
          <img src={art} alt={won ? '霸业已成' : '家国倾覆'} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-sumi-soft via-transparent to-transparent" />
          <div
            className={`seal-in absolute bottom-3 right-3 flex h-16 w-16 items-center justify-center rounded-full border-4 text-2xl font-bold backdrop-blur-sm ${
              won ? 'border-kin bg-sumi/40 text-kin' : 'border-shu bg-sumi/40 text-shu-bright'
            }`}
          >
            {won ? '勝' : '敗'}
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 px-8 py-6 text-center">
          <h2 className="text-2xl font-bold tracking-widest text-washi" data-testid="ending-title">
            {won ? '霸业已成' : '家国倾覆'}
          </h2>
          <p className="text-sm leading-relaxed text-washi-dim">
            {won
              ? `撑至 ${state.year} 年，乱世之中守土安民，威名远播——天下布武之路，由此开端。`
              : `${state.year} 年，民心离散，基业崩颓，一代家名湮没于战国烽烟。`}
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
    </div>
  );
}
