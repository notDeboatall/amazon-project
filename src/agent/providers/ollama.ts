import type { LLMProvider, ChatArgs, ChatResult, ToolCall } from "./types.js";
import { formatOpenAIMessages } from "./groq.js";

/** Clean JSON Schema for Ollama function calling. */
function cleanSchemaForOllama(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema, ...rest } = schema;
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rest)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      cleaned[key] = cleanSchemaForOllama(value as Record<string, unknown>);
    } else {
      cleaned[key] = value;
    }
  }

  if (!cleaned.type && cleaned.properties) {
    cleaned.type = "object";
  }

  return cleaned;
}

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";

  isAvailable(): boolean {
    // Ollama does not require an API key; it's available if running locally or explicitly selected
    return process.env.LLM_PROVIDER === "ollama" || Boolean(process.env.OLLAMA_HOST);
  }

  async chat(args: ChatArgs): Promise<ChatResult> {
    const host = process.env.OLLAMA_HOST ?? "http://localhost:11434";
    const model = process.env.OLLAMA_MODEL ?? "llama3.2";
    const url = `${host.replace(/\/+$/, "")}/v1/chat/completions`;

    const messages = formatOpenAIMessages(args.system, args.messages);
    const tools =
      args.tools.length > 0
        ? args.tools.map((t) => ({
            type: "function" as const,
            function: {
              name: t.name,
              description: t.description ?? "",
              parameters: cleanSchemaForOllama(t.inputSchema),
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
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errText = await response.text();
      const err = new Error(`Ollama error (${response.status}): ${errText}`);
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
