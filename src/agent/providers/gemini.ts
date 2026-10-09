import type { LLMProvider, ChatArgs, ChatResult, ToolCall, Message } from "./types.js";

/** Clean JSON Schema for Gemini v1beta function declarations. */
function cleanSchemaForGemini(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema, ...rest } = schema;
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rest)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      cleaned[key] = cleanSchemaForGemini(value as Record<string, unknown>);
    } else {
      cleaned[key] = value;
    }
  }

  // Ensure type is object if properties exist
  if (!cleaned.type && cleaned.properties) {
    cleaned.type = "object";
  }

  return cleaned;
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  isAvailable(): boolean {
    return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
  }

  async chat(args: ChatArgs): Promise<ChatResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set.");
    }

    const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Convert messages to Gemini contents format
    const contents: Array<{
      role: "user" | "model";
      parts: Array<Record<string, unknown>>;
    }> = [];

    for (let i = 0; i < args.messages.length; i++) {
      const msg = args.messages[i];
      if (msg.role === "system") {
        // System instruction is passed separately in systemInstruction
        continue;
      }

      if (msg.role === "user") {
        contents.push({
          role: "user",
          parts: [{ text: msg.content ?? "" }],
        });
      } else if (msg.role === "assistant") {
        const parts: Array<Record<string, unknown>> = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.arguments,
              },
            });
          }
        }
        if (parts.length > 0) {
          contents.push({ role: "model", parts });
        }
      } else if (msg.role === "tool") {
        // In Gemini, tool responses have role "user" with functionResponse.
        // Group consecutive tool responses to satisfy turn-alternation rules.
        const toolParts: Array<Record<string, unknown>> = [
          {
            functionResponse: {
              name: msg.name ?? "tool",
              response: { output: msg.content ?? "" },
            },
          },
        ];

        while (i + 1 < args.messages.length && args.messages[i + 1].role === "tool") {
          i++;
          const next = args.messages[i];
          toolParts.push({
            functionResponse: {
              name: next.name ?? "tool",
              response: { output: next.content ?? "" },
            },
          });
        }

        contents.push({ role: "user", parts: toolParts });
      }
    }

    const toolsConfig =
      args.tools.length > 0
        ? [
            {
              functionDeclarations: args.tools.map((t) => ({
                name: t.name,
                description: t.description ?? "",
                parameters: cleanSchemaForGemini(t.inputSchema),
              })),
            },
          ]
        : undefined;

    const body: Record<string, unknown> = {
      systemInstruction: {
        parts: [{ text: args.system }],
      },
      contents,
    };

    if (toolsConfig) {
      body.tools = toolsConfig;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const errText = await response.text();
      const err = new Error(`Gemini API error (${response.status}): ${errText}`);
      Object.assign(err, { status: response.status });
      throw err;
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            functionCall?: {
              name: string;
              args?: Record<string, unknown>;
            };
          }>;
        };
      }>;
    };

    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    let text: string | undefined;
    const toolCalls: ToolCall[] = [];

    for (const part of parts) {
      if (part.text) {
        text = text ? `${text}\n${part.text}` : part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          id: `call_${Math.random().toString(36).slice(2, 9)}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args ?? {},
        });
      }
    }

    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}
