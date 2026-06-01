/**
 * useAudio.ts — 「战国大名 AI 模拟器」前端音频管理器（纯 TS，原生 Audio，无第三方依赖）。
 *
 * 提供一个模块级单例，负责 UI 音效与环境音的预加载、播放、静音持久化，
 * 并遵守浏览器自动播放策略（音频必须在首次用户手势后才能播）。
 *
 * 音频资源位于 apps/web/public/audio/*.mp3，运行时以 `/audio/<name>.mp3` 引用。
 *
 * ── 导出 API ──────────────────────────────────────────────
 *   playSfx(name: SfxName): void      播放一次性 UI 音效
 *   startAmbient(): void              开始/恢复循环环境音（需先 unlock）
 *   stopAmbient(): void               停止环境音
 *   toggleMute(): boolean             切换静音，返回切换后的 isMuted
 *   isMuted(): boolean                当前是否静音
 *   unlockAudio(): void               在首次用户手势里调用一次，解锁自动播放
 *   preloadAudio(): void              预加载所有音频（可选，构造时已自动预加载）
 *
 * ── 用法示例 ──────────────────────────────────────────────
 *   import { playSfx, startAmbient, toggleMute, isMuted, unlockAudio } from "./useAudio";
 *
 *   // 1) 在最外层容器的首次点击里解锁 + 起环境音（只需一次）
 *   <div onPointerDownCapture={() => { unlockAudio(); startAmbient(); }}>
 *
 *   // 2) 各动作触发音效
 *   <button onClick={() => { playSfx("click"); doSomething(); }}>下令</button>
 *   onAdvanceTurn  -> playSfx("advance")
 *   onResourceChange -> playSfx("coin")
 *   onEdictRejected  -> playSfx("reject")
 *
 *   // 3) 结局
 *   if (result === "win")  playSfx("victory");
 *   if (result === "lose") playSfx("defeat");
 *
 *   // 4) 静音按钮
 *   <button onClick={() => setMuted(toggleMute())}>{isMuted() ? "🔇" : "🔊"}</button>
 */

export type SfxName =
  | "click"
  | "advance"
  | "coin"
  | "reject"
  | "victory"
  | "defeat";

const AMBIENT_NAME = "ambient" as const;
const AUDIO_BASE = "/audio";
const STORAGE_KEY = "sengoku.audio.muted";
const AMBIENT_VOLUME = 0.35;
const SFX_VOLUME = 0.8;

const SFX_NAMES: SfxName[] = [
  "click",
  "advance",
  "coin",
  "reject",
  "victory",
  "defeat",
];

class AudioManager {
  /** 每个 SFX 的模板元素，play 时 clone 以支持重叠播放 */
  private sfx = new Map<SfxName, HTMLAudioElement>();
  private ambient: HTMLAudioElement | null = null;
  private muted = false;
  /** 用户手势解锁前禁止 play()，避免浏览器报错 */
  private unlocked = false;
  /** 解锁时若曾请求过环境音，则补播 */
  private ambientRequested = false;
  private preloaded = false;

  constructor() {
    this.muted = this.readMutedFromStorage();
  }

  private isBrowser(): boolean {
    return typeof window !== "undefined" && typeof Audio !== "undefined";
  }

  private readMutedFromStorage(): boolean {
    if (typeof localStorage === "undefined") return false;
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  private writeMutedToStorage(value: boolean): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      /* 隐私模式等：忽略 */
    }
  }

  preload(): void {
    if (!this.isBrowser() || this.preloaded) return;
    this.preloaded = true;

    for (const name of SFX_NAMES) {
      const el = new Audio(`${AUDIO_BASE}/${name}.mp3`);
      el.preload = "auto";
      el.volume = SFX_VOLUME;
      this.sfx.set(name, el);
    }

    const amb = new Audio(`${AUDIO_BASE}/${AMBIENT_NAME}.mp3`);
    amb.preload = "auto";
    amb.loop = true;
    amb.volume = AMBIENT_VOLUME;
    this.ambient = amb;
  }

  /** 必须在首个用户手势（点击/触摸）回调里调用一次 */
  unlock(): void {
    if (!this.isBrowser()) return;
    this.preload();
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.ambientRequested) this.startAmbient();
  }

  playSfx(name: SfxName): void {
    if (!this.isBrowser() || this.muted || !this.unlocked) return;
    this.preload();
    const template = this.sfx.get(name);
    if (!template) return;
    // clone 以支持快速连续/重叠播放，互不打断
    const node = template.cloneNode(true) as HTMLAudioElement;
    node.volume = SFX_VOLUME;
    void node.play().catch(() => {
      /* 自动播放被拒等：静默忽略 */
    });
  }

  startAmbient(): void {
    if (!this.isBrowser()) return;
    this.ambientRequested = true;
    this.preload();
    if (!this.unlocked || this.muted || !this.ambient) return;
    void this.ambient.play().catch(() => {
      /* 等待下一次手势 */
    });
  }

  stopAmbient(): void {
    this.ambientRequested = false;
    if (!this.ambient) return;
    this.ambient.pause();
    this.ambient.currentTime = 0;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.writeMutedToStorage(this.muted);
    if (this.muted) {
      if (this.ambient) this.ambient.pause();
    } else if (this.ambientRequested) {
      this.startAmbient();
    }
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }
}

const manager = new AudioManager();

export const playSfx = (name: SfxName): void => manager.playSfx(name);
export const startAmbient = (): void => manager.startAmbient();
export const stopAmbient = (): void => manager.stopAmbient();
export const toggleMute = (): boolean => manager.toggleMute();
export const isMuted = (): boolean => manager.isMuted();
export const unlockAudio = (): void => manager.unlock();
export const preloadAudio = (): void => manager.preload();
