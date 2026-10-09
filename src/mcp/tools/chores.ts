import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, resolveMember } from "../../db/index.js";
import { tool } from "./helpers.js";

interface ChoreRow {
  id: number;
  title: string;
  effort: number;
  frequency: string;
  assignee_id: number | null;
  due_date: string | null;
  status: string;
  completed_at: string | null;
}

export function registerChoreTools(server: McpServer): void {
  server.registerTool(
    "add_chore",
    {
      description:
        "Add a new chore to the household chore board. Use when someone mentions a task that needs doing around the house.",
      inputSchema: {
        title: z.string().min(1).describe("Short name of the chore, e.g. Dishes"),
        effort: z.number().int().min(1).max(5).describe("Effort points 1 (easy) to 5 (hard)"),
        frequency: z
          .enum(["daily", "weekly", "once"])
          .optional()
          .describe("How often; default weekly"),
        assignee: z.string().optional().describe("Name of household member to assign to"),
        due_date: z
          .string()
          .optional()
          .describe("Due date as ISO 8601 string, e.g. 2026-10-12T20:00:00.000Z"),
      },
    },
    tool(
      "add_chore",
      (args: {
        title: string;
        effort: number;
        frequency?: string;
        assignee?: string;
        due_date?: string;
      }) => {
        const assigneeId = args.assignee ? resolveMember(args.assignee).id : null;
        const title = args.title.trim();

        const info = db
          .prepare(
            "INSERT INTO chores (title, effort, frequency, assignee_id, due_date) VALUES (?, ?, ?, ?, ?)",
          )
          .run(
            title,
            args.effort,
            args.frequency ?? "weekly",
            assigneeId,
            args.due_date ?? null,
          );

        const assigneeName = args.assignee ?? "unassigned";
        return {
          summary: `Added chore "${title}" (effort ${args.effort}) — ${assigneeName}.`,
          data: { id: Number(info.lastInsertRowid) },
        };
      },
    ),
  );

  server.registerTool(
    "assign_chore",
    {
      description:
        "Assign an existing chore to a household member by name. Use when someone should take over a task.",
      inputSchema: {
        chore_id: z.number().int().describe("ID of the chore to assign"),
        member_name: z.string().min(1).describe("Name of the household member"),
      },
    },
    tool("assign_chore", (args: { chore_id: number; member_name: string }) => {
      const chore = db.prepare("SELECT * FROM chores WHERE id = ?").get(args.chore_id) as
        | ChoreRow
        | undefined;
      if (!chore) {
        throw new Error(
          `No chore with id ${args.chore_id}. Use list_members or check the chore board.`,
        );
      }
      const member = resolveMember(args.member_name);
      db.prepare("UPDATE chores SET assignee_id = ? WHERE id = ?").run(member.id, chore.id);

      return {
        summary: `Assigned "${chore.title}" to ${member.name}.`,
        data: { chore_id: chore.id, assignee: member.name },
      };
    }),
  );

  server.registerTool(
    "complete_chore",
    {
      description:
        "Mark a chore as done. Use when someone says they finished a task.",
      inputSchema: {
        chore_id: z.number().int().describe("ID of the chore to complete"),
      },
    },
    tool("complete_chore", (args: { chore_id: number }) => {
      const chore = db.prepare("SELECT * FROM chores WHERE id = ?").get(args.chore_id) as
        | ChoreRow
        | undefined;
      if (!chore) {
        throw new Error(`No chore with id ${args.chore_id}.`);
      }
      if (chore.status === "done") {
        return {
          summary: `"${chore.title}" is already marked done.`,
          data: { chore_id: chore.id, already_done: true },
        };
      }
      const completedAt = new Date().toISOString();
      db.prepare("UPDATE chores SET status = 'done', completed_at = ? WHERE id = ?").run(
        completedAt,
        chore.id,
      );

      return {
        summary: `Marked "${chore.title}" as done.`,
        data: { chore_id: chore.id, completed_at: completedAt },
      };
    }),
  );
}
