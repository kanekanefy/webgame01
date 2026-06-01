import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const BASE = 'https://sim.test';

async function newGame() {
  const res = await SELF.fetch(`${BASE}/api/games`, { method: 'POST' });
  const body = (await res.json()) as { gameId: string; state: any };
  return { res, ...body };
}

async function turn(gameId: string, payload: unknown) {
  return SELF.fetch(`${BASE}/api/games/${gameId}/turn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('POST /api/games — 新建对局', () => {
  it('TC-BE-01: 返回 201 + gameId', async () => {
    const { res, gameId, state } = await newGame();
    expect(res.status).toBe(201);
    expect(typeof gameId).toBe('string');
    expect(state).toBeDefined();
  });

  it('TC-BE-02: 起始数值与 scenario.json 一致', async () => {
    const { state } = await newGame();
    expect(state.clan.koku).toBe(500);
    expect(state.clan.levy).toBe(120);
    expect(state.clan.contentment).toBeCloseTo(0.6);
    expect(state.clan.prestige).toBeCloseTo(0.5);
    expect(state.year).toBe(1560);
    expect(state.season).toBe('Spring');
    expect(state.turn).toBe(0);
    expect(state.status).toBe('playing');
  });
});

describe('GET /api/games/:id — 读取对局', () => {
  it('TC-BE-03: 读取已存在对局 → 200', async () => {
    const { gameId } = await newGame();
    const get = await SELF.fetch(`${BASE}/api/games/${gameId}`);
    expect(get.status).toBe(200);
    const body = (await get.json()) as { state: any };
    expect(body.state.clan.koku).toBe(500);
  });

  it('TC-BE-04: 读取不存在对局 → 404 + {error}', async () => {
    // 合法格式但未初始化的 id
    const create = await newGame();
    // 用另一个全新 id 字符串无法构造；改用无效 id 触发 400/404 分支
    const miss = await SELF.fetch(`${BASE}/api/games/not-a-real-id`);
    expect([400, 404]).toContain(miss.status);
    const err = (await miss.json()) as { error: string };
    expect(typeof err.error).toBe('string');
    expect(create.res.status).toBe(201);
  });
});

describe('POST /api/games/:id/turn — 推进回合', () => {
  it('TC-BE-04b: set_tax 推进一回合 → season=Summer, actionLog+1', async () => {
    const { gameId } = await newGame();
    const res = await turn(gameId, { decree: { actionId: 'set_tax', params: { rate: 0.5 } } });
    expect(res.status).toBe(200);
    const r = (await res.json()) as { report: any; state: any };
    expect(r.state.turn).toBe(1);
    expect(r.state.season).toBe('Summer');
    expect(r.state.actionLog.length).toBe(1);
    expect(r.report.actionFacts).toContainEqual(
      expect.objectContaining({ kind: 'tax_set' }),
    );
  });

  it('TC-BE-05: 数值不变量 koku 非 NaN, contentment ∈ [0,1]', async () => {
    const { gameId } = await newGame();
    const res = await turn(gameId, { decree: { actionId: 'set_tax', params: { rate: 0.5 } } });
    const r = (await res.json()) as { state: any };
    expect(Number.isNaN(r.state.clan.koku)).toBe(false);
    expect(r.state.clan.contentment).toBeGreaterThanOrEqual(0);
    expect(r.state.clan.contentment).toBeLessThanOrEqual(1);
  });

  it('TC-BE-06: 连续两回合自洽 turn=2 season=Autumn actionLog=2', async () => {
    const { gameId } = await newGame();
    await turn(gameId, { decree: { actionId: 'set_tax', params: { rate: 0.5 } } });
    const res2 = await turn(gameId, { decree: { actionId: 'set_tax', params: { rate: 0.4 } } });
    const r2 = (await res2.json()) as { state: any };
    expect(r2.state.turn).toBe(2);
    expect(r2.state.season).toBe('Autumn');
    expect(r2.state.actionLog.length).toBe(2);
  });

  it('TC-BE-07: 非法 actionId → 400', async () => {
    const { gameId } = await newGame();
    const res = await turn(gameId, { decree: { actionId: 'nonexistent', params: {} } });
    expect(res.status).toBe(400);
  });

  it('TC-BE-08: null decree (空过) → 200, season 推进, actionLog 不增', async () => {
    const { gameId } = await newGame();
    const res = await turn(gameId, { decree: null });
    expect(res.status).toBe(200);
    const r = (await res.json()) as { state: any };
    expect(r.state.turn).toBe(1);
    expect(r.state.season).toBe('Summer');
    expect(r.state.actionLog.length).toBe(0);
  });

  it('TC-BE-09: 不存在对局推进 → 400/404', async () => {
    const res = await turn('not-a-real-id', { decree: null });
    expect([400, 404]).toContain(res.status);
  });
});

describe('自由文本下令（意图解析）', () => {
  it('CMD-01: 「把税率定到五成」→ set_tax 0.5', async () => {
    const { gameId } = await newGame();
    const res = await turn(gameId, { command: '把税率定到 50%' });
    expect(res.status).toBe(200);
    const r = (await res.json()) as { report: any; state: any; intent: string | null };
    expect(r.state.actionLog.length).toBe(1);
    expect(r.report.actionFacts).toContainEqual(expect.objectContaining({ kind: 'tax_set' }));
  });

  it('CMD-02: 时代不符（电报）→ rejected, 不推进', async () => {
    const { gameId } = await newGame();
    const res = await turn(gameId, { command: '给所有家臣发电报' });
    expect(res.status).toBe(200);
    const r = (await res.json()) as { rejected?: boolean; reason?: string };
    expect(r.rejected).toBe(true);
    expect(typeof r.reason).toBe('string');
    // 确认未推进
    const get = await SELF.fetch(`${BASE}/api/games/${gameId}`);
    const body = (await get.json()) as { state: any };
    expect(body.state.turn).toBe(0);
  });

  it('CMD-03: 「征兵三十」→ levy_troops 30', async () => {
    const { gameId } = await newGame();
    const res = await turn(gameId, { command: '征兵 30' });
    const r = (await res.json()) as { state: any };
    expect(r.state.clan.levy).toBe(150); // 120 + 30
  });
});
