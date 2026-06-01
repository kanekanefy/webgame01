import { describe, it, expect } from 'vitest';
import { buildState } from '@sengoku/core';
import scenario from '@sengoku/core/content/scenario.json';
import { MockProvider, parseIntent, narrate } from '../index.js';
import { cleanNarrative } from '../src/narrator.js';

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

describe('自由度：随心而为 → freeform_act（不再轻易驳回）', () => {
  it('和木下喝酒 → freeform social，target=hideyoshi', async () => {
    const r = await parseIntent('和木下喝酒', state, mock);
    expect(r.kind).toBe('accepted');
    if (r.kind === 'accepted') {
      expect(r.decree?.actionId).toBe('freeform_act');
      expect(r.decree?.params.category).toBe('social');
      expect(r.decree?.params.target).toBe('hideyoshi');
    }
  });

  it('结婚 → freeform personal', async () => {
    const r = await parseIntent('我要结婚', state, mock);
    expect(r.kind === 'accepted' && r.decree?.params.category).toBe('personal');
  });

  it('去神社参拜祈愿 → freeform spiritual', async () => {
    const r = await parseIntent('去神社参拜祈愿', state, mock);
    expect(r.kind === 'accepted' && r.decree?.params.category).toBe('spiritual');
  });

  it('和今川结盟 → freeform diplomacy，target=imagawa', async () => {
    const r = await parseIntent('派人和今川结盟通好', state, mock);
    expect(r.kind).toBe('accepted');
    if (r.kind === 'accepted') {
      expect(r.decree?.params.category).toBe('diplomacy');
      expect(r.decree?.params.target).toBe('imagawa');
    }
  });

  it('开个茶会 → freeform cultural', async () => {
    const r = await parseIntent('开个茶会请家臣品茗', state, mock);
    expect(r.kind === 'accepted' && r.decree?.params.category).toBe('cultural');
  });

  it('模糊口令也兜底为 gesture（不驳回）', async () => {
    const r = await parseIntent('随便走走看看', state, mock);
    expect(r.kind).toBe('accepted');
    if (r.kind === 'accepted') expect(r.decree?.actionId).toBe('freeform_act');
  });
});

describe('时代锁 → rejected（仅拦真正越界）', () => {
  it('电报 → rejected anachronism（时代锁，零 LLM 调用）', async () => {
    const r = await parseIntent('给所有家臣发电报', state, mock);
    expect(r.kind).toBe('rejected');
    if (r.kind === 'rejected') expect(r.category).toBe('anachronism');
  });

  it('坦克 → rejected anachronism', async () => {
    const r = await parseIntent('造一辆坦克', state, mock);
    expect(r.kind === 'rejected' && r.category).toBe('anachronism');
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

describe('cleanNarrative — 防推理模型思维链泄漏', () => {
  it('干净单句 → 原样保留', () => {
    expect(cleanNarrative('炎夏议堂，众臣默然，暗流涌动。')).toBe('炎夏议堂，众臣默然，暗流涌动。');
  });
  it('思维链泄漏 → 抽取引号内最终句', () => {
    const leak = '用户要求我扮演家臣。考虑情境：盛夏。尝试写：「盛夏议堂，主公定音，众臣默然，暗流涌动。」';
    expect(cleanNarrative(leak)).toBe('盛夏议堂，主公定音，众臣默然，暗流涌动。');
  });
  it('纯思维链无可用引用 → null（调用方走模板）', () => {
    expect(cleanNarrative('用户要求我考虑这个表述，我需要再想想或者用别的词')).toBeNull();
  });
  it('多行 → 取末行', () => {
    expect(cleanNarrative('思考...\n\n秋风萧瑟，堂上肃然。')).toBe('秋风萧瑟，堂上肃然。');
  });
  it('去引号包裹', () => {
    expect(cleanNarrative('「冬炉围坐，主公叙旧。」')).toBe('冬炉围坐，主公叙旧。');
  });
  it('超长 → null', () => {
    expect(cleanNarrative('啊'.repeat(80))).toBeNull();
  });
});
