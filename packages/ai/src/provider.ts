// Provider 抽象：意图解析与叙事都只依赖此接口，便于 Mock/真 LLM 互换。

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** tool 消息回传时关联的调用 id（仅真 LLM 多轮用）。 */
  tool_call_id?: string;
}

export interface ToolFunctionDef {
  name: string;
  description: string;
  /** JSON Schema（OpenAI function-calling parameters）。 */
  parameters: Record<string, unknown>;
}

export interface ToolDef {
  type: 'function';
  function: ToolFunctionDef;
}

export interface ToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface CompleteOptions {
  tools?: ToolDef[];
  /** 'required' 强制选一个工具；'auto' 自由；'none' 不调用工具。 */
  toolChoice?: 'required' | 'auto' | 'none';
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionResult {
  /** 自然语言内容（叙事用；解析意图时通常为空）。 */
  content: string;
  /** 解析出的工具调用（function calling）。 */
  toolCalls: ToolCall[];
}

export interface Provider {
  readonly name: string;
  complete(messages: ChatMessage[], opts?: CompleteOptions): Promise<CompletionResult>;
}
