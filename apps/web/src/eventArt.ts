/**
 * eventArt.ts — 事件插画映射（display-only，无游戏逻辑、无密钥）
 *
 * 把 packages/core 的 `OutcomeFact.kind` 与回合「议题」字符串映射到
 * 公共静态资源 `/assets/events/<name>.png`（由 tools/gen-art.mjs 批量生成落库）。
 *
 * 资源是运行时静态文件，前端只读引用，不在此处做任何数值计算。
 * 无对应插画时返回 null（调用方据此决定不渲染图块）。
 *
 * 已知 fact kind（见 packages/core/src/core/actions/index.ts + loop.ts）：
 *   tax_set → tax · levy → levy · irrigation → irrigation · festival → festival
 *   ikki → ikki · reward → (无图，null) · error/rejected → (无图，null)
 * 已知议题（见 packages/core/src/core/loop.ts ISSUES）：
 *   年贡 → tax · 边境 → border · 家臣不和 → retainer-strife · 天候 → weather
 *   商贾 → (无图，null)
 */

const BASE = '/assets/events';

/** fact kind → 资源文件名（不含扩展名）。缺省即无图。 */
const KIND_TO_ART: Readonly<Record<string, string>> = {
  tax_set: 'tax',
  levy: 'levy',
  irrigation: 'irrigation',
  festival: 'festival',
  ikki: 'ikki',
  // reward / error / rejected：无对应插画

  // R4 扩展：新增事件/战斗 fact kind → 插画（部分 kind 复用同一张图）
  battle_win: 'battle_win',
  battle_lose: 'battle_lose',
  conquer: 'conquer',
  defend_win: 'defend_win',
  defend_lose: 'defend_lose',
  betrayal: 'betrayal',
  recruit: 'recruit',
  recruit_fail: 'recruit',
  ronin_offer: 'recruit',
  court: 'court',
  court_favor: 'court',
  merchant_gift: 'merchant_gift',
  plague: 'plague',
  flood: 'flood',
  drought: 'flood',
  bumper: 'bumper',
  famine: 'plague',
  negotiate: 'negotiate',
  develop: 'develop',
  omen: 'omen',
  freeform: 'freeform',
};

/** 议题字符串 → 资源文件名（不含扩展名）。缺省即无图。 */
const ISSUE_TO_ART: Readonly<Record<string, string>> = {
  年贡: 'tax',
  边境: 'border',
  家臣不和: 'retainer-strife',
  天候: 'weather',
  // 商贾：暂无对应插画
};

/**
 * 由 OutcomeFact.kind 取插画 URL。
 * @returns `/assets/events/<name>.png`，无映射时 null。
 */
export function eventArtForKind(kind: string): string | null {
  const name = KIND_TO_ART[kind];
  return name ? `${BASE}/${name}.jpg` : null;
}

/**
 * 由议题字符串取插画 URL。
 * @returns `/assets/events/<name>.png`，无映射时 null。
 */
export function eventArtForIssue(issue: string): string | null {
  const name = ISSUE_TO_ART[issue];
  return name ? `${BASE}/${name}.jpg` : null;
}
