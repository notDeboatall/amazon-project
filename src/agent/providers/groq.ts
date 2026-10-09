import type { LLMProvider, ChatArgs, ChatResult, ToolCall, Message } from "./types.js";

/** Clean JSON Schema for OpenAI-compatible function calling. */
function cleanSchemaForOpenAI(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema, ...rest } = schema;
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rest)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      cleaned[key] = cleanSchemaForOpenAI(value as Record<string, unknown>);
    } else {
      cleaned[key] = value;
    }
  }

  if (!cleaned.type && cleaned.properties) {
    cleaned.type = "object";
  }

  return cleaned;
}

export function formatOpenAIMessages(system: string, messages: Message[]): Array<Record<string, unknown>> {
  const formatted: Array<Record<string, unknown>> = [
    { role: "system", content: system },
  ];

  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
      formatted.push({
        role: "assistant",
        content: msg.content ?? null,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      });
    } else if (msg.role === "tool") {
      formatted.push({
        role: "tool",
        tool_call_id: msg.toolCallId ?? "call_default",
        content: msg.content ?? "",
      });
    } else {
      formatted.push({
        role: msg.role,
        content: msg.content ?? "",
      });
    }
  }

  return formatted;
}

export class GroqProvider implements LLMProvider {
  readonly name = "groq";

  isAvailable(): boolean {
    return Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim().length > 0);
  }

  async chat(args: ChatArgs): Promise<ChatResult> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not set.");
    }

    const model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
    const url = "https://api.groq.com/openai/v1/chat/completions";

    const messages = formatOpenAIMessages(args.system, args.messages);
    const tools =
      args.tools.length > 0
        ? args.tools.map((t) => ({
            type: "function" as const,
            function: {
              name: t.name,
              description: t.description ?? "",
              parameters: cleanSchemaForOpenAI(t.inputSchema),
            },
          }))
        : undefined;

    const body: Record<string, unknown> = {
      model,
      messages,
      ...(tools ? { tools, tool_choice: "auto" } : {}),
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const errText = await response.text();
      const err = new Error(`Groq API error (${response.status}): ${errText}`);
      Object.assign(err, { status: response.status });
      throw err;
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: {
              name: string;
              arguments: string;
            };
          }>;
        };
      }>;
    };

    const choice = data.choices?.[0];
    const message = choice?.message;
    const text = message?.content ?? undefined;

    const toolCalls: ToolCall[] = [];
    if (message?.tool_calls && message.tool_calls.length > 0) {
      for (const tc of message.tool_calls) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments || "{}");
        } catch {
          parsedArgs = {};
        }
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: parsedArgs,
        });
      }
    }

    return {
      text: text ?? undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}
