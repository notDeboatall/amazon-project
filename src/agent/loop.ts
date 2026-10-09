import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { chatWithProviders } from "./providers/index.js";
import type { Message, ToolSpec, ToolCall } from "./providers/types.js";
import { buildSystemPrompt } from "./prompt.js";

export interface ExecutedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export interface AgentLoopOptions {
  text: string;
  history?: Message[];
  mcpUrl?: string;
  client?: Client;
}

export interface AgentLoopResult {
  reply: string;
  toolCalls: ExecutedToolCall[];
  iterations: number;
}

/**
 * Creates and connects a standard MCP client over Streamable HTTP.
 */
export async function createMcpClient(mcpUrl?: string): Promise<Client> {
  const url = mcpUrl ?? process.env.MCP_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}/mcp`;
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const client = new Client({ name: "homebase-agent", version: "0.1.0" });
  await client.connect(transport);
  return client;
}

/**
 * Executes the agent loop:
 * 1. Connects to the MCP server over Streamable HTTP and fetches tool list.
 * 2. Prepares messages with injected system prompt and trimmed history (last 10 turns).
 * 3. Calls the LLM provider adapter.
 * 4. Executes any returned tool calls through the MCP client and loops (max 6 iterations).
 * 5. Returns final text reply and all executed tool calls.
 */
export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  let client = options.client;
  let shouldCloseClient = false;

  if (!client) {
    client = await createMcpClient(options.mcpUrl);
    shouldCloseClient = true;
  }

  try {
    // Fetch available tools from the MCP server
    const { tools: mcpTools } = await client.listTools();
    const tools: ToolSpec[] = mcpTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: (t.inputSchema as ToolSpec["inputSchema"]) ?? { type: "object", properties: {} },
    }));

    const systemPrompt = buildSystemPrompt();

    // Trim history to the last 10 turns (~20 messages) per RULES.md section 5
    const history = options.history ? options.history.slice(-20) : [];
    const messages: Message[] = [...history, { role: "user", content: options.text }];

    const executedToolCalls: ExecutedToolCall[] = [];
    let finalReply = "";
    let iterations = 0;
    const maxIterations = 6;

    while (iterations < maxIterations) {
      iterations++;

      const llmResult = await chatWithProviders({
        system: systemPrompt,
        messages,
        tools,
      });

      if (llmResult.toolCalls && llmResult.toolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: llmResult.text,
          toolCalls: llmResult.toolCalls,
        });

        for (const tc of llmResult.toolCalls) {
          try {
            const toolResult = await client.callTool({
              name: tc.name,
              arguments: tc.arguments,
            });

            // Extract readable text content from MCP ToolResult
            const contentArray = Array.isArray(toolResult.content) ? toolResult.content : [];
            const textParts = contentArray
              .filter((c: unknown): c is { type: "text"; text: string } => {
                return (
                  typeof c === "object" &&
                  c !== null &&
                  "type" in c &&
                  (c as { type: unknown }).type === "text" &&
                  "text" in c &&
                  typeof (c as { text: unknown }).text === "string"
                );
              })
              .map((c) => c.text);

            const resultSummary =
              textParts.length > 0 ? textParts.join("\n") : JSON.stringify(toolResult);

            const isError = Boolean(toolResult.isError);

            executedToolCalls.push({
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments,
              result: toolResult.structuredContent ?? resultSummary,
              error: isError ? resultSummary : undefined,
            });

            messages.push({
              role: "tool",
              toolCallId: tc.id,
              name: tc.name,
              content: resultSummary,
            });
          } catch (toolErr) {
            const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
            executedToolCalls.push({
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments,
              error: errMsg,
            });

            messages.push({
              role: "tool",
              toolCallId: tc.id,
              name: tc.name,
              content: `Error executing tool: ${errMsg}`,
            });
          }
        }
      } else {
        // Model answered with text and made no further tool calls
        finalReply = llmResult.text ?? "Done.";
        break;
      }
    }

    if (!finalReply) {
      finalReply = "I completed the requested actions.";
    }

    return {
      reply: finalReply,
      toolCalls: executedToolCalls,
      iterations,
    };
  } finally {
    if (shouldCloseClient && client) {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}
