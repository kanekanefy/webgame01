import type { ChatMessage, CompleteOptions, CompletionResult, Provider, ToolCall } from './provider.js';

/**
 * MockProvider — 零网络、确定性。供测试与「无密钥」默认运行。
 * - 意图解析模式（opts.tools 存在）：关键词 → 单个 toolCall。
 * - 叙事模式（无 tools）：按内容散列从模板池取一句（确定）。
 */
export class MockProvider implements Provider {
  readonly name = 'mock';

  async complete(messages: ChatMessage[], opts?: CompleteOptions): Promise<CompletionResult> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const systemText = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');

    if (opts?.tools && opts.tools.length) {
      const call = parseToToolCall(lastUser, systemText);
      return { content: '', toolCalls: [call] };
    }
    return { content: narrateTemplate(lastUser), toolCalls: [] };
  }
}

function num(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function pct(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (m) return Number(m[1]) / 100;
  // 中文「成」：三成=0.3
  const cn = text.match(/([一二两三四五六七八九十两])\s*成/);
  if (cn) {
    const map: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    const v = map[cn[1]!];
    if (v) return v / 10;
  }
  const n = num(text);
  if (n === null) return null;
  return n > 1 ? n / 100 : n;
}

interface Roster {
  provinces: Array<{ id: string; name: string }>;
  retainers: Array<{ id: string; name: string }>;
}

function parseRoster(systemText: string): Roster {
  const out: Roster = { provinces: [], retainers: [] };
  const provLine = systemText.match(/provinces:([^\n|]*)/);
  const retLine = systemText.match(/retainers:([^\n|]*)/);
  const parse = (s: string) =>
    s
      .split(',')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const [id, name] = pair.split('=');
        return { id: (id ?? '').trim(), name: (name ?? '').trim() };
      })
      .filter((x) => x.id);
  if (provLine) out.provinces = parse(provLine[1]!);
  if (retLine) out.retainers = parse(retLine[1]!);
  return out;
}

function reject(reason: string, category = 'unclear'): ToolCall {
  return { name: 'reject_intent', arguments: { reason, category } };
}

function parseToToolCall(command: string, systemText: string): ToolCall {
  const roster = parseRoster(systemText);

  if (/(税|年贡|赋税|赋)/.test(command)) {
    const rate = pct(command);
    if (rate !== null && rate >= 0 && rate <= 1) return { name: 'set_tax', arguments: { rate } };
    return reject('税率不明，请给出 0~100% 的数值');
  }

  if (/(征兵|募兵|征募|招兵|扩军|徵兵|招募)/.test(command)) {
    const amount = num(command);
    if (amount !== null && amount > 0) return { name: 'levy_troops', arguments: { amount } };
    return reject('征兵数不明');
  }

  if (/(水利|灌溉|治水|沟渠)/.test(command)) {
    const matched = roster.provinces.find((p) => command.includes(p.name));
    const provinceId = matched?.id ?? roster.provinces[0]?.id;
    if (provinceId) return { name: 'build_irrigation', arguments: { provinceId } };
    return reject('无可修水利之领国');
  }

  if (/(祭典|祭祀|庆典|祭礼|赛神|庙会)/.test(command)) {
    return { name: 'hold_festival', arguments: {} };
  }

  if (/(赏|封赏|犒赏|赐|嘉奖|奖赏)/.test(command)) {
    const matched = roster.retainers.find(
      (r) => command.includes(r.name) || (r.name.length >= 2 && command.includes(r.name.slice(-2))),
    );
    const retainerId = matched?.id ?? roster.retainers[0]?.id;
    if (retainerId) return { name: 'reward_retainer', arguments: { retainerId } };
    return reject('无可赏之家臣');
  }

  return reject('未能领会主公之意');
}

const NARRATIVE_POOL = [
  '殿中烛火摇曳，家臣依令而行，静候来季消息。',
  '评定既毕，诸将躬身退下，领国上下各司其职。',
  '奉行将主公之命传谕四方，城下渐有动静。',
  '风过庭院，家臣低声议论，皆道此令深合时宜。',
  '主公之意已决，家中无人再有异议，唯待天时。',
];

function narrateTemplate(content: string): string {
  let h = 0;
  for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) >>> 0;
  return NARRATIVE_POOL[h % NARRATIVE_POOL.length]!;
}
