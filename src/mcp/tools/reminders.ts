import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, resolveMember } from "../../db/index.js";
import { tool } from "./helpers.js";

export function registerReminderTools(server: McpServer): void {
  server.registerTool(
    "create_reminder",
    {
      description:
        "Set a reminder for a household member. Use when someone asks to be reminded about something at a specific time.",
      inputSchema: {
        member_name: z.string().min(1).describe("Name of the person to remind"),
        message: z.string().min(1).describe("What to remind them about"),
        remind_at: z.string().describe("When to remind, ISO 8601 datetime"),
      },
    },
    tool(
      "create_reminder",
      (args: { member_name: string; message: string; remind_at: string }) => {
        const member = resolveMember(args.member_name);

        const info = db
          .prepare("INSERT INTO reminders (member_id, message, remind_at) VALUES (?, ?, ?)")
          .run(member.id, args.message.trim(), args.remind_at);

        return {
          summary: `Reminder set for ${member.name}: "${args.message.trim()}" at ${args.remind_at}.`,
          data: { id: Number(info.lastInsertRowid), member: member.name },
        };
      },
    ),
  );
}
