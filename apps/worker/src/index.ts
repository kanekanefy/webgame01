import { listActionIds, type Decree, type GameState, type TurnReport } from '@sengoku/core';
import { GameSession } from './session.js';
import { parseCommand, type ParseResult } from './ai.js';

export { GameSession };

export interface Env {
  GAME_SESSION: DurableObjectNamespace<GameSession>;
  ASSETS: Fetcher;
  // —— R2 LLM（可选，全部经 Worker，前端永不接触）——
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
}

const VALID_ACTIONS = new Set(listActionIds());

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/** 校验客户端传入的 decree。返回 {ok, decree} 或 {ok:false}。 */
function validateDecree(raw: unknown): { ok: true; decree: Decree | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, decree: null };
  if (typeof raw !== 'object') return { ok: false };
  const d = raw as Record<string, unknown>;
  if (typeof d.actionId !== 'string' || !VALID_ACTIONS.has(d.actionId)) return { ok: false };
  const params = d.params;
  if (params !== undefined && (typeof params !== 'object' || params === null)) return { ok: false };
  return { ok: true, decree: { actionId: d.actionId, params: (params as Record<string, unknown>) ?? {} } };
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const parts = url.pathname.split('/').filter(Boolean); // ['api','games', ':id', 'turn']

  // GET /api/health — 探活
  if (parts.length === 2 && parts[1] === 'health') {
    return json({ ok: true, ai: env.LLM_API_KEY ? 'live' : 'mock' });
  }

  // POST /api/games — 新建对局
  if (parts.length === 2 && parts[1] === 'games') {
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    const id = env.GAME_SESSION.newUniqueId();
    const stub = env.GAME_SESSION.get(id);
    const state = await stub.init();
    return json({ gameId: id.toString(), state }, 201);
  }

  // /api/games/:id  和  /api/games/:id/turn
  if (parts.length >= 3 && parts[1] === 'games') {
    const gameId = parts[2]!;
    let stub: DurableObjectStub<GameSession>;
    try {
      stub = env.GAME_SESSION.get(env.GAME_SESSION.idFromString(gameId));
    } catch {
      return json({ error: 'invalid game id' }, 400);
    }

    // GET /api/games/:id
    if (parts.length === 3) {
      if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
      const state = await stub.getState();
      if (!state) return json({ error: 'game not found' }, 404);
      return json({ state });
    }

    // POST /api/games/:id/turn
    if (parts.length === 4 && parts[3] === 'turn') {
      if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: 'invalid json body' }, 400);
      }

      // 自由文本下令（R2）：有 command 字段则先经意图解析 → decree。
      let parse: ParseResult | null = null;
      let decree: Decree | null;
      if (typeof body.command === 'string' && body.command.trim()) {
        parse = await parseCommand(body.command.trim(), (await stub.getState()) ?? undefined, env);
        if (parse.kind === 'rejected') {
          // 时代锁/越权/无法解析：不推进回合，回拒绝叙事。
          return json({ rejected: true, reason: parse.reason, narrative: parse.narrative }, 200);
        }
        decree = parse.decree;
      } else {
        const v = validateDecree(body.decree);
        if (!v.ok) return json({ error: 'invalid decree' }, 400);
        decree = v.decree;
      }

      const result = (await stub.turn(decree)) as { report: TurnReport; state: GameState } | null;
      if (!result) return json({ error: 'game not found' }, 404);
      return json({ report: result.report, state: result.state, intent: parse?.intent ?? null });
    }
  }

  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url);
    }
    // 非 /api：交静态资产（SPA 回退由 assets.not_found_handling 处理）。
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({ error: 'not found' }, 404);
  },
} satisfies ExportedHandler<Env>;
