import { logActivity } from "../../db/index.js";
import { emitEvent } from "../../util/events.js";

export interface ToolResult {
  summary: string;
  data?: Record<string, unknown>;
}

/**
 * Wraps a tool handler so that every call is logged to activity_log (RULES.md section 3)
 * and errors come back as readable tool errors instead of crashing the request.
 */
export function tool<A>(name: string, handler: (args: A) => ToolResult) {
  return async (args: A) => {
    emitEvent("tool_call", { tool: name, args });
    try {
      const result = handler(args);
      logActivity(name, args, result);
      emitEvent("tool_result", { tool: name, result });
      return {
        content: [{ type: "text" as const, text: result.summary }],
        structuredContent: { summary: result.summary, ...(result.data ?? {}) },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logActivity(name, args, { error: message });
      emitEvent("tool_result", { tool: name, error: message });
      return {
        isError: true,
        content: [{ type: "text" as const, text: message }],
      };
    }
  };
}
