/**
 * eventSfx.ts — 把 core 的 OutcomeFact.kind 映射到事件音效（SfxName）。
 * 回合结算后取最贴切的一个音效播放；无映射则由调用方退回默认「推进鼓」。
 */
import type { SfxName } from './useAudio';

const KIND_TO_SFX: Readonly<Record<string, SfxName>> = {
  // 战斗
  battle_win: 'triumph',
  conquer: 'triumph',
  defend_win: 'triumph',
  battle_lose: 'defeat-low',
  defend_lose: 'defeat-low',
  // 家臣政治
  betrayal: 'betrayal',
  recruit: 'recruit',
  recruit_fail: 'recruit',
  ronin_offer: 'recruit',
  // 外交 / 朝廷
  court: 'court',
  court_favor: 'court',
  negotiate: 'court',
  // 经济 / 天灾
  merchant_gift: 'coin',
  bumper: 'coin',
  reward: 'coin',
  plague: 'disaster',
  famine: 'disaster',
  flood: 'disaster',
  drought: 'disaster',
  // 民变 / 庆典 / 建设
  ikki: 'ikki',
  festival: 'festival',
  develop: 'build',
  irrigation: 'build',
};

/** 按 fact kind 顺序取第一个有音效的 kind；无则 null。 */
export function eventSfxForKinds(kinds: string[]): SfxName | null {
  for (const k of kinds) {
    const s = KIND_TO_SFX[k];
    if (s) return s;
  }
  return null;
}
