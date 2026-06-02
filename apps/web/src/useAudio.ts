/**
 * useAudio.ts — 前端音频管理器（纯 TS，原生 Audio，无第三方依赖）。
 *
 * 模块级单例：负责事件音效(SFX) + 背景音乐(BGM) 的预加载、播放、静音持久化，
 * 遵守浏览器自动播放策略（首次用户手势后才能放声）。
 * 资源位于 apps/web/public/audio/*.mp3，运行时以 `/audio/<name>.mp3` 引用。
 *
 * SFX：一次性短音（事件/动作反馈），名即文件名（stem）。
 * BGM：可切换循环曲（bgm-peace 治世 / bgm-war 战时），单声道槽位，切换即换源。
 *
 * 导出：
 *   playSfx(name)        播放一次性音效
 *   setBgm(track|null)   切换/停止背景音乐（null=停）
 *   startBgm()           起默认治世 BGM（= setBgm('bgm-peace')）
 *   toggleMute()/isMuted()  静音开关（持久化）
 *   unlockAudio()        首次用户手势里调用一次以解锁
 */

export type SfxName =
  // 基础反馈
  | 'click'
  | 'advance'
  | 'coin'
  | 'reject'
  | 'victory'
  | 'defeat'
  // R4 事件音效
  | 'triumph'
  | 'defeat-low'
  | 'battle'
  | 'betrayal'
  | 'recruit'
  | 'court'
  | 'omen'
  | 'disaster'
  | 'ikki'
  | 'festival'
  | 'build';

export type BgmTrack = 'bgm-peace' | 'bgm-war';

const AUDIO_BASE = '/audio';
const STORAGE_KEY = 'sengoku.audio.muted';
const BGM_VOLUME = 0.3;
const SFX_VOLUME = 0.8;

const SFX_NAMES: SfxName[] = [
  'click',
  'advance',
  'coin',
  'reject',
  'victory',
  'defeat',
  'triumph',
  'defeat-low',
  'battle',
  'betrayal',
  'recruit',
  'court',
  'omen',
  'disaster',
  'ikki',
  'festival',
  'build',
];

class AudioManager {
  private sfx = new Map<SfxName, HTMLAudioElement>();
  private bgm: HTMLAudioElement | null = null;
  private bgmTrack: BgmTrack | null = null;
  private pendingBgm: BgmTrack | null = null;
  private muted = false;
  private unlocked = false;
  private preloaded = false;

  constructor() {
    this.muted = this.readMuted();
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof Audio !== 'undefined';
  }
  private readMuted(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }
  private writeMuted(v: boolean): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, v ? '1' : '0');
    } catch {
      /* 隐私模式忽略 */
    }
  }

  preload(): void {
    if (!this.isBrowser() || this.preloaded) return;
    this.preloaded = true;
    for (const name of SFX_NAMES) {
      const el = new Audio(`${AUDIO_BASE}/${name}.mp3`);
      el.preload = 'auto';
      el.volume = SFX_VOLUME;
      this.sfx.set(name, el);
    }
    this.bgm = new Audio();
    this.bgm.loop = true;
    this.bgm.volume = BGM_VOLUME;
  }

  /** 首个用户手势里调用一次。 */
  unlock(): void {
    if (!this.isBrowser()) return;
    this.preload();
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.pendingBgm) this.setBgm(this.pendingBgm);
  }

  playSfx(name: SfxName): void {
    if (!this.isBrowser() || this.muted || !this.unlocked) return;
    this.preload();
    const tmpl = this.sfx.get(name);
    if (!tmpl) return;
    const node = tmpl.cloneNode(true) as HTMLAudioElement; // clone 支持重叠
    node.volume = SFX_VOLUME;
    void node.play().catch(() => {});
  }

  /** 切换背景音乐；null = 停止。未解锁时记为 pending。 */
  setBgm(track: BgmTrack | null): void {
    if (!this.isBrowser()) return;
    this.preload();
    if (track === null) {
      this.bgmTrack = null;
      this.pendingBgm = null;
      if (this.bgm) this.bgm.pause();
      return;
    }
    if (!this.unlocked) {
      this.pendingBgm = track;
      return;
    }
    if (this.bgmTrack === track && this.bgm && !this.bgm.paused) return;
    this.bgmTrack = track;
    this.pendingBgm = track;
    if (!this.bgm) return;
    if (this.bgm.src.indexOf(`${track}.mp3`) === -1) {
      this.bgm.src = `${AUDIO_BASE}/${track}.mp3`;
    }
    if (this.muted) return;
    void this.bgm.play().catch(() => {});
  }

  startBgm(): void {
    this.setBgm('bgm-peace');
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.writeMuted(this.muted);
    if (this.muted) {
      if (this.bgm) this.bgm.pause();
    } else if (this.bgmTrack) {
      void this.bgm?.play().catch(() => {});
    }
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }
}

const manager = new AudioManager();

export const playSfx = (name: SfxName): void => manager.playSfx(name);
export const setBgm = (track: BgmTrack | null): void => manager.setBgm(track);
export const startBgm = (): void => manager.startBgm();
export const toggleMute = (): boolean => manager.toggleMute();
export const isMuted = (): boolean => manager.isMuted();
export const unlockAudio = (): void => manager.unlock();
