import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listMembers } from "../../db/index.js";
import { tool } from "./helpers.js";

export function registerMemberTools(server: McpServer): void {
  server.registerTool(
    "list_members",
    {
      description: "List the people in the household with their roles. Use this to check who lives here.",
      inputSchema: {},
    },
    tool("list_members", () => {
      const members = listMembers();
      return {
        summary: `Household members: ${members.map((m) => `${m.name} (${m.role})`).join(", ")}.`,
        data: { members },
      };
    }),
  );
}
