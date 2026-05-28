import type { GameState } from '../state.js';
import type { RNG } from '../rng.js';

export interface OutcomeFact {
  kind: string;
  text: string;
  data?: Record<string, unknown>;
}

export interface ActionResult {
  facts: OutcomeFact[];
}

export interface ActionContext {
  rng: RNG;
}

export interface PreconditionResult {
  ok: boolean;
  reason?: string;
}

export interface ActionDef {
  id: string;
  preconditions(state: GameState, params: Record<string, unknown>): PreconditionResult;
  apply(state: GameState, params: Record<string, unknown>, ctx: ActionContext): ActionResult;
}

const registry = new Map<string, ActionDef>();

export function registerAction(def: ActionDef): void {
  registry.set(def.id, def);
}

export function getAction(id: string): ActionDef | undefined {
  return registry.get(id);
}

export function listActionIds(): string[] {
  return [...registry.keys()];
}

export function resolveAction(
  state: GameState,
  id: string,
  params: Record<string, unknown>,
  ctx: ActionContext,
): ActionResult {
  const def = getAction(id);
  if (!def) return { facts: [{ kind: 'error', text: `unknown action ${id}` }] };
  const pre = def.preconditions(state, params);
  if (!pre.ok) return { facts: [{ kind: 'rejected', text: pre.reason ?? 'precondition failed' }] };
  return def.apply(state, params, ctx);
}
