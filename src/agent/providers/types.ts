export interface ToolSpec {
  name: string;
  description?: string;
  inputSchema: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  thoughtSignature?: string;
  rawPart?: Record<string, unknown>;
}

export interface Message {
  role: "user" | "assistant" | "tool" | "system";
  content?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface ChatArgs {
  system: string;
  messages: Message[];
  tools: ToolSpec[];
}

export interface ChatResult {
  text?: string;
  toolCalls?: ToolCall[];
}

export interface LLMProvider {
  readonly name: string;
  isAvailable(): boolean;
  chat(args: ChatArgs): Promise<ChatResult>;
}
