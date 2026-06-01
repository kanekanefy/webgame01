import type { GameState } from '@sengoku/core';
import type { ToolDef } from './provider.js';

/**
 * 5 个合法动作的 function-calling 工具定义（参数 schema 与 core 动作 paramsSchema 对齐）。
 * 加一个 reject_intent 工具表达「无法奉行/不合时代」。
 * provinceId / retainerId 的 enum 依赋当前 state 注入。
 */
export function buildToolDefs(state?: GameState, opts: { allowReject?: boolean } = {}): ToolDef[] {
  const provinceIds = state?.provinces.map((p) => p.id) ?? [];
  const retainerIds = state?.retainers.map((r) => r.id) ?? [];
  const allowReject = opts.allowReject ?? true;

  const tools: ToolDef[] = [
    {
      type: 'function',
      function: {
        name: 'set_tax',
        description: '设定年贡税率（0~1，例如 0.4 表示四成）。',
        parameters: {
          type: 'object',
          properties: { rate: { type: 'number', minimum: 0, maximum: 1, description: '税率，0~1' } },
          required: ['rate'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'levy_troops',
        description: '征募兵卒，消耗国库（每兵 2 石）。',
        parameters: {
          type: 'object',
          properties: { amount: { type: 'number', minimum: 1, description: '征募兵数（正整数）' } },
          required: ['amount'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'build_irrigation',
        description: '于某领国修筑水利，提升稻米产出。',
        parameters: {
          type: 'object',
          properties: {
            provinceId: {
              type: 'string',
              description: '领国 id',
              ...(provinceIds.length ? { enum: provinceIds } : {}),
            },
          },
          required: ['provinceId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'hold_festival',
        description: '举办祭典，提振民心与威信，消耗国库。',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'reward_retainer',
        description: '赏赐某家臣，提升其忠诚与家名威信。',
        parameters: {
          type: 'object',
          properties: {
            retainerId: {
              type: 'string',
              description: '家臣 id',
              ...(retainerIds.length ? { enum: retainerIds } : {}),
            },
          },
          required: ['retainerId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'freeform_act',
        description:
          '通用「随心而为」。凡符合 1560 年战国、玩家可亲为之事（宴饮/交谈/狩猎/婚姻/茶会/连歌/能乐/参拜/祈愿/巡视领国/遣使邻国 等），当无更精确政令可选时，一律用此工具并选最贴切的 category。target 可选：social 填家臣 id、diplomacy 填邻国 id。',
        parameters: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: ['social', 'cultural', 'spiritual', 'personal', 'inspect', 'diplomacy', 'gesture'],
              description:
                'social=宴饮交游(配家臣) · cultural=茶会/连歌/能乐 · spiritual=参拜祈愿 · personal=婚姻/狩猎/休养 · inspect=巡视领国 · diplomacy=遣使邻国(配邻国) · gesture=其他率性之举',
            },
            target: {
              type: 'string',
              description: '可选。social→家臣 id；diplomacy→邻国 id',
              ...(provinceIds.length || retainerIds.length
                ? { examples: [...retainerIds] }
                : {}),
            },
          },
          required: ['category'],
        },
      },
    },
  ];

  // reject_intent 默认不暴露给 LLM——拒绝只走确定性时代锁（period-lock），
  // 逼模型「无论多笼统都映射到一个动作」，最大化自由度。仅 opts.allowReject 时加入。
  if (allowReject) {
    tools.push({
      type: 'function',
      function: {
        name: 'reject_intent',
        description: '当主公的口谕无法解析为上述政令，或不合 1560 年战国时代时，调用此工具。',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: '简短拒绝理由' },
            category: {
              type: 'string',
              enum: ['anachronism', 'unclear', 'impossible'],
              description: '拒绝类别',
            },
          },
          required: ['reason'],
        },
      },
    });
  }

  return tools;
}

export const ACTION_NAMES = [
  'set_tax',
  'levy_troops',
  'build_irrigation',
  'hold_festival',
  'reward_retainer',
] as const;

export type CoreActionName = (typeof ACTION_NAMES)[number];
