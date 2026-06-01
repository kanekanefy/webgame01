import { describe, it, expect } from 'vitest';
import { buildState } from '@sengoku/core';
import scenario from '@sengoku/core/content/scenario.json';
import { OpenAIProvider, parseIntent } from '../index.js';

const state = buildState(scenario as never);

function fakeFetch(toolName: string, args: unknown): typeof fetch {
  return (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: '',
              tool_calls: [{ id: 'c1', function: { name: toolName, arguments: JSON.stringify(args) } }],
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as unknown as typeof fetch;
}

describe('OpenAIProvider（注入 fetch，零真实网络）', () => {
  it('解析 tool_calls → parseIntent accepted set_tax', async () => {
    const provider = new OpenAIProvider({
      apiKey: 'test',
      baseUrl: 'https://example.com/v1',
      model: 'minimax-m2.7',
      fetchImpl: fakeFetch('set_tax', { rate: 0.45 }),
    });
    const r = await parseIntent('把税率提到四成半', state, provider);
    expect(r.kind).toBe('accepted');
    if (r.kind === 'accepted') {
      expect(r.decree?.actionId).toBe('set_tax');
      expect(r.decree?.params.rate).toBeCloseTo(0.45);
    }
  });

  it('真 provider 返回 reject_intent → parseIntent rejected', async () => {
    const provider = new OpenAIProvider({
      apiKey: 'test',
      baseUrl: 'https://example.com/v1',
      model: 'minimax-m2.7',
      fetchImpl: fakeFetch('reject_intent', { reason: '无法奉行', category: 'unclear' }),
    });
    const r = await parseIntent('做点什么吧', state, provider);
    expect(r.kind).toBe('rejected');
  });

  it('非法 provinceId 被拒（本地白名单校验）→ 最终 rejected', async () => {
    const provider = new OpenAIProvider({
      apiKey: 'test',
      baseUrl: 'https://example.com/v1',
      model: 'minimax-m2.7',
      fetchImpl: fakeFetch('build_irrigation', { provinceId: 'atlantis' }),
    });
    const r = await parseIntent('修水利', state, provider);
    expect(r.kind).toBe('rejected'); // 重试仍非法 → 兜底拒绝
  });

  it('HTTP 500 → 重试后兜底 rejected，不抛出', async () => {
    const failing = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const provider = new OpenAIProvider({
      apiKey: 'test',
      baseUrl: 'https://example.com/v1',
      model: 'minimax-m2.7',
      fetchImpl: failing,
    });
    const r = await parseIntent('征兵 20', state, provider);
    expect(r.kind).toBe('rejected');
  });
});
