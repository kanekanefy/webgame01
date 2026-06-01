import { useState } from 'react';

const SUGGESTIONS = ['把年贡定到四成', '征兵 50', '修筑水利', '举办祭典', '赏赐藤吉郎', '按兵不动'];

export function CommandBox({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');

  function submit() {
    const t = text.trim();
    if (!t || disabled) return;
    onSubmit(t);
    setText('');
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] tracking-widest text-washi-dim">
            口述政令（自然语言下令，由家臣解读）
          </span>
          <input
            data-testid="command-input"
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="例：把年贡减到三成，再征募些兵卒…"
            className="rounded-sm border border-ai/50 bg-sumi-soft px-3 py-2 text-washi outline-none focus:border-kin disabled:opacity-40"
          />
        </label>
        <button
          data-testid="command-submit"
          disabled={disabled}
          onClick={submit}
          className="min-h-[44px] rounded-sm border border-ai bg-ai/30 px-4 py-2 font-semibold text-washi transition active:scale-[0.98] hover:bg-ai/50 disabled:opacity-40"
        >
          传令
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            disabled={disabled}
            onClick={() => setText(s)}
            className="rounded-full border border-kin/20 px-2.5 py-0.5 text-xs text-washi-dim transition hover:border-kin/50 hover:text-washi disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
