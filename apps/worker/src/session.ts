import { DurableObject } from 'cloudflare:workers';
import {
  buildState,
  advanceTurn,
  serialize,
  deserialize,
  type GameState,
  type TurnReport,
  type Decree,
  type ScenarioData,
} from '@sengoku/core';
import scenario from '@sengoku/core/content/scenario.json';

const STATE_KEY = 'state';

/**
 * GameSession — 一局 = 一个 Durable Object（SQLite-backed）。
 * 同一 id 的请求天然串行，advanceTurn 无竞争；rngState 随状态持久化 → 可确定性回放。
 * 数值权威完全在 core；本 DO 只做「反序列化 → advanceTurn → 回写」。
 */
export class GameSession extends DurableObject {
  /** 幂等初始化：已存在则原样返回，否则用 scenario 建初始局。 */
  async init(): Promise<GameState> {
    const existing = await this.ctx.storage.get<string>(STATE_KEY);
    if (existing) return deserialize(existing);
    const state = buildState(scenario as unknown as ScenarioData);
    await this.ctx.storage.put(STATE_KEY, serialize(state));
    return state;
  }

  /** 读取当前状态；未初始化返回 null。 */
  async getState(): Promise<GameState | null> {
    const json = await this.ctx.storage.get<string>(STATE_KEY);
    return json ? deserialize(json) : null;
  }

  /** 推进一回合。未初始化返回 null（由路由层转 404）。 */
  async turn(decree: Decree | null): Promise<{ report: TurnReport; state: GameState } | null> {
    const json = await this.ctx.storage.get<string>(STATE_KEY);
    if (!json) return null;
    const state = deserialize(json);
    const report = advanceTurn(state, decree);
    await this.ctx.storage.put(STATE_KEY, serialize(state));
    return { report, state };
  }
}
