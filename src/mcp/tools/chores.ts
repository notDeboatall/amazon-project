import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, resolveMember, listMembers } from "../../db/index.js";
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

  server.registerTool(
    "rebalance_chores",
    {
      description:
        "Redistribute open chores fairly across all household members by effort points, taking into account age roles (parents, teens, kids). Returns the before and after effort breakdown and list of reassignments. Use when someone asks to rebalance chores, divide chores fairly, or assign chores fairly this week.",
      inputSchema: {
        week_start: z
          .string()
          .optional()
          .describe("Start of week ISO string (optional, defaults to current week)"),
      },
    },
    tool("rebalance_chores", (_args: { week_start?: string }) => {
      const members = listMembers();
      if (members.length === 0) {
        return { summary: "No household members registered to rebalance chores for.", data: {} };
      }

      const openChores = db
        .prepare("SELECT * FROM chores WHERE status != 'done' ORDER BY effort DESC, id ASC")
        .all() as ChoreRow[];

      if (openChores.length === 0) {
        return { summary: "No open chores to rebalance. All chores are completed!", data: {} };
      }

      const memberMap = new Map<number, (typeof members)[0]>(members.map((m) => [m.id, m]));
      const beforeStats = members.map((m) => {
        const assigned = openChores.filter((c) => c.assignee_id === m.id);
        return {
          member: m.name,
          role: m.role ?? "member",
          effort: assigned.reduce((sum, c) => sum + c.effort, 0),
          chores: assigned.map((c) => c.title),
        };
      });

      // Role limits and balancing weights:
      // - kid: max effort 2 per chore, weight 1.0 (light duties like watering plants, trash)
      // - teen: max effort 3 per chore, weight 2.0 (moderate chores like dishes, vacuuming)
      // - parent: max effort 5 per chore, weight 3.5 (heavy duties like cleaning bathroom, cooking)
      const getRoleConfig = (role: string | null) => {
        const r = (role ?? "").toLowerCase();
        if (r === "kid") return { maxChoreEffort: 2, weight: 1.0 };
        if (r === "teen") return { maxChoreEffort: 3, weight: 2.0 };
        if (r === "parent") return { maxChoreEffort: 5, weight: 3.5 };
        return { maxChoreEffort: 5, weight: 3.0 };
      };

      const memberConfigs = members.map((m) => ({
        member: m,
        ...getRoleConfig(m.role),
        assignedChores: [] as ChoreRow[],
        currentEffort: 0,
      }));

      const totalEffort = openChores.reduce((acc, c) => acc + c.effort, 0);

      // Greedy allocation by largest chore first
      for (const chore of openChores) {
        const eligible = memberConfigs.filter((mc) => chore.effort <= mc.maxChoreEffort);
        const candidates = eligible.length > 0 ? eligible : memberConfigs;

        candidates.sort((a, b) => {
          const ratioA = a.currentEffort / a.weight;
          const ratioB = b.currentEffort / b.weight;
          if (Math.abs(ratioA - ratioB) > 0.001) return ratioA - ratioB;
          return a.currentEffort - b.currentEffort;
        });

        const chosen = candidates[0];
        chosen.assignedChores.push(chore);
        chosen.currentEffort += chore.effort;
      }

      // Record reassignments and execute updates in DB
      const reassignments: Array<{
        chore_id: number;
        chore: string;
        effort: number;
        from: string;
        to: string;
      }> = [];

      const updateStmt = db.prepare("UPDATE chores SET assignee_id = ? WHERE id = ?");
      db.transaction(() => {
        for (const mc of memberConfigs) {
          for (const chore of mc.assignedChores) {
            if (chore.assignee_id !== mc.member.id) {
              const oldAssigneeName = chore.assignee_id
                ? (memberMap.get(chore.assignee_id)?.name ?? "unknown")
                : "unassigned";
              reassignments.push({
                chore_id: chore.id,
                chore: chore.title,
                effort: chore.effort,
                from: oldAssigneeName,
                to: mc.member.name,
              });
              updateStmt.run(mc.member.id, chore.id);
            }
          }
        }
      })();

      const afterStats = memberConfigs.map((mc) => ({
        member: mc.member.name,
        role: mc.member.role ?? "member",
        effort: mc.currentEffort,
        chores: mc.assignedChores.map((c) => c.title),
      }));

      const afterBreakdown = afterStats.map((s) => `${s.member}: ${s.effort} pts`).join(", ");
      const reassignSummary =
        reassignments.length > 0
          ? `Reassigned ${reassignments.length} chore(s). New distribution: ${afterBreakdown}.`
          : `Chores were already balanced. Distribution: ${afterBreakdown}.`;

      return {
        summary: `Rebalanced ${openChores.length} open chores (${totalEffort} total effort points) fairly across ${members.length} members. ${reassignSummary}`,
        data: {
          total_effort: totalEffort,
          open_chores_count: openChores.length,
          before: beforeStats,
          after: afterStats,
          reassignments,
        },
      };
    }),
  );
}
