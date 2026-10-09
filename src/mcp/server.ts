import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMemberTools } from "./tools/members.js";
import { registerGroceryTools } from "./tools/groceries.js";
import { registerChoreTools } from "./tools/chores.js";
import { registerEventTools } from "./tools/events.js";
import { registerReminderTools } from "./tools/reminders.js";
import { registerSummaryTools } from "./tools/summary.js";

/** Builds a fresh MCP server with every Homebase tool registered. */
export function createHomebaseServer(): McpServer {
  const server = new McpServer({ name: "homebase", version: "0.1.0" });
  registerMemberTools(server);
  registerGroceryTools(server);
  registerChoreTools(server);
  registerEventTools(server);
  registerReminderTools(server);
  registerSummaryTools(server);
  return server;
}
