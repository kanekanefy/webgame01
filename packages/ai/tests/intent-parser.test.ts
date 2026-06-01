import { describe, it, expect } from 'vitest';
import { buildState } from '@sengoku/core';
import scenario from '@sengoku/core/content/scenario.json';
import { MockProvider, parseIntent, narrate } from '../index.js';

const state = buildState(scenario as never);
const mock = new MockProvider();

describe('IntentParser × MockProvider — 已知短语 → 已知动作', () => {
  it('税率四成 → set_tax 0.4', async () => {
    const r = await parseIntent('把年贡定到四成', state, mock);
    expect(r.kind).toBe('accepted');
    if (r.kind === 'accepted') {
      expect(r.decree?.actionId).toBe('set_tax');
      expect(r.decree?.params.rate).toBeCloseTo(0.4);
    }
  });

  it('税率 50% → set_tax 0.5', async () => {
    const r = await parseIntent('税率调到 50%', state, mock);
    expect(r.kind === 'accepted' && r.decree?.params.rate).toBeCloseTo(0.5);
  });

  it('征兵 50 → levy_troops 50', async () => {
    const r = await parseIntent('征兵 50', state, mock);
    expect(r.kind).toBe('accepted');
    if (r.kind === 'accepted') {
      expect(r.decree?.actionId).toBe('levy_troops');
      expect(r.decree?.params.amount).toBe(50);
    }
  });

  it('修水利 → build_irrigation 合法 provinceId', async () => {
    const r = await parseIntent('在尾張修筑水利', state, mock);
    expect(r.kind).toBe('accepted');
    if (r.kind === 'accepted') {
      expect(r.decree?.actionId).toBe('build_irrigation');
      expect(state.provinces.some((p) => p.id === r.decree?.params.provinceId)).toBe(true);
      expect(r.decree?.params.provinceId).toBe('owari');
    }
  });

  it('举办祭典 → hold_festival', async () => {
    const r = await parseIntent('办一场祭典', state, mock);
    expect(r.kind === 'accepted' && r.decree?.actionId).toBe('hold_festival');
  });

  it('赏赐藤吉郎 → reward_retainer hideyoshi（按名册匹配）', async () => {
    const r = await parseIntent('重赏木下藤吉郎', state, mock);
    expect(r.kind).toBe('accepted');
    if (r.kind === 'accepted') {
      expect(r.decree?.actionId).toBe('reward_retainer');
      expect(r.decree?.params.retainerId).toBe('hideyoshi');
    }
  });

  it('按兵不动 → accepted decree=null（不调用 LLM）', async () => {
    const r = await parseIntent('这一季按兵不动', state, mock);
    expect(r.kind).toBe('accepted');
    expect(r.kind === 'accepted' && r.decree).toBeNull();
  });
});

describe('时代锁 & 无法解析 → rejected', () => {
  it('电报 → rejected anachronism（时代锁，零 LLM 调用）', async () => {
    const r = await parseIntent('给所有家臣发电报', state, mock);
    expect(r.kind).toBe('rejected');
    if (r.kind === 'rejected') expect(r.category).toBe('anachronism');
  });

  it('坦克 → rejected anachronism', async () => {
    const r = await parseIntent('造一辆坦克', state, mock);
    expect(r.kind === 'rejected' && r.category).toBe('anachronism');
  });

  it('无意义口令 → rejected unclear', async () => {
    const r = await parseIntent('呜啦啦啦啦', state, mock);
    expect(r.kind).toBe('rejected');
    if (r.kind === 'rejected') expect(r.category).toBe('unclear');
  });
});

describe('Narrator × MockProvider', () => {
  it('返回非空叙事文本，且确定（同输入同输出）', async () => {
    const input = { state, intent: '定年贡为 40%', facts: ['税率定为 40%'], events: [], issue: '年贡' };
    const a = await narrate(mock, input);
    const b = await narrate(mock, input);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toBe(b);
  });
});
