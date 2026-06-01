import type {
  ChatMessage,
  CompleteOptions,
  CompletionResult,
  Provider,
  ToolCall,
} from './provider.js';

export interface OpenAIProviderConfig {
  apiKey: string;
  /** OpenAI 兼容 baseURL，如 generalcompute。末尾不带 /。 */
  baseUrl: string;
  model: string;
  /** 可注入 fetch（测试用）；默认全局 fetch。 */
  fetchImpl?: typeof fetch;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
    };
  }>;
}

/**
 * OpenAIProvider — OpenAI 兼容 REST（fetch，无 SDK，workerd 友好）。
 * 适配推理模型：只读 content + tool_calls，忽略 reasoning。
 */
export class OpenAIProvider implements Provider {
  readonly name = 'openai-compat';
  private readonly cfg: OpenAIProviderConfig;

  constructor(cfg: OpenAIProviderConfig) {
    this.cfg = cfg;
  }

  async complete(messages: ChatMessage[], opts: CompleteOptions = {}): Promise<CompletionResult> {
    const f = this.cfg.fetchImpl ?? fetch;
    const body: Record<string, unknown> = {
      model: this.cfg.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      })),
      max_tokens: opts.maxTokens ?? 1500, // ≥1500 防 reasoning 截断
      temperature: opts.temperature ?? 0.7,
    };
    if (opts.tools?.length) {
      body.tools = opts.tools;
      body.tool_choice = opts.toolChoice ?? 'auto';
    }

    const res = await f(`${this.cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LLM ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const msg = data.choices?.[0]?.message;
    const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc) => {
      let args: Record<string, unknown> = {};
      try {
        args = tc.function?.arguments ? (JSON.parse(tc.function.arguments) as Record<string, unknown>) : {};
      } catch {
        args = {};
      }
      return { id: tc.id, name: tc.function?.name ?? '', arguments: args };
    });

    return { content: msg?.content?.trim() ?? '', toolCalls };
  }
}
