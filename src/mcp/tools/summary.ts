import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { tool } from "./helpers.js";
import { now, upcomingWeekStart } from "../../util/time.js";
import { detectConflicts } from "./events.js";

export function registerSummaryTools(server: McpServer): void {
  server.registerTool(
    "weekly_summary",
    {
      description:
        "Get a comprehensive weekly summary of the household: upcoming events, open chores by member, needed grocery items, active reminders, and detected conflicts. Use when someone asks 'What's happening this week?', 'Give me a weekly summary', or asks for an overview of household logistics.",
      inputSchema: {
        week_start: z
          .string()
          .optional()
          .describe("Start of week ISO string (optional, defaults to upcoming week Monday)"),
      },
    },
    tool("weekly_summary", (args: { week_start?: string }) => {
      const startDate = args.week_start ? new Date(args.week_start) : upcomingWeekStart(now());
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 7);

      const startIso = startDate.toISOString();
      const endIso = endDate.toISOString();

      // 1. Events for the week
      const eventRows = db
        .prepare(
          `SELECT e.*, COALESCE(group_concat(m.name, ', '), '') AS members
           FROM events e
           LEFT JOIN event_members em ON em.event_id = e.id
           LEFT JOIN members m ON m.id = em.member_id
           WHERE e.start_at >= ? AND e.start_at <= ?
           GROUP BY e.id
           ORDER BY e.start_at`,
        )
        .all(startIso, endIso) as Array<{
        id: number;
        title: string;
        start_at: string;
        end_at: string;
        location: string | null;
        members: string;
      }>;

      // 2. Chores breakdown
      const choreRows = db
        .prepare(
          `SELECT c.*, COALESCE(m.name, 'Unassigned') AS assignee_name
           FROM chores c
           LEFT JOIN members m ON m.id = c.assignee_id
           ORDER BY c.effort DESC`,
        )
        .all() as Array<{
        id: number;
        title: string;
        effort: number;
        status: string;
        assignee_name: string;
      }>;

      const openChores = choreRows.filter((c) => c.status !== "done");
      const doneChores = choreRows.filter((c) => c.status === "done");
      const totalEffort = openChores.reduce((sum, c) => sum + c.effort, 0);

      const choresByMember: Record<
        string,
        { count: number; effort: number; chores: string[] }
      > = {};

      for (const chore of openChores) {
        if (!choresByMember[chore.assignee_name]) {
          choresByMember[chore.assignee_name] = { count: 0, effort: 0, chores: [] };
        }
        choresByMember[chore.assignee_name].count += 1;
        choresByMember[chore.assignee_name].effort += chore.effort;
        choresByMember[chore.assignee_name].chores.push(chore.title);
      }

      // 3. Groceries needed
      const groceryRows = db
        .prepare("SELECT * FROM grocery_items WHERE status = 'needed' ORDER BY category, id")
        .all() as Array<{
        id: number;
        name: string;
        quantity: string | null;
        category: string | null;
      }>;

      const groceriesByCategory: Record<string, string[]> = {};
      for (const g of groceryRows) {
        const cat = g.category ?? "other";
        if (!groceriesByCategory[cat]) groceriesByCategory[cat] = [];
        const label = g.quantity ? `${g.name} (${g.quantity})` : g.name;
        groceriesByCategory[cat].push(label);
      }

      // 4. Pending reminders
      const reminderRows = db
        .prepare(
          `SELECT r.*, m.name AS member_name
           FROM reminders r
           JOIN members m ON m.id = r.member_id
           WHERE r.status = 'pending'
           ORDER BY r.remind_at`,
        )
        .all() as Array<{
        id: number;
        message: string;
        remind_at: string;
        member_name: string;
      }>;

      // 5. Conflicts
      const { conflicts } = detectConflicts(startIso, endIso);

      const conflictNote =
        conflicts.length > 0
          ? ` Warning: ${conflicts.length} schedule conflict(s) detected.`
          : "";

      const choreSummaryParts = Object.entries(choresByMember)
        .map(
          ([name, data]) =>
            `${name}: ${data.effort} pts (${data.count} chore${data.count === 1 ? "" : "s"})`,
        )
        .join(", ");

      const summary = `Weekly summary: ${eventRows.length} event(s), ${openChores.length} open chore(s) (${totalEffort} effort pts: ${choreSummaryParts}), and ${groceryRows.length} grocery item(s) needed.${conflictNote}`;

      return {
        summary,
        data: {
          week: { start: startIso, end: endIso },
          events_count: eventRows.length,
          events: eventRows.map((e) => ({
            id: e.id,
            title: e.title,
            start_at: e.start_at,
            end_at: e.end_at,
            location: e.location,
            members: e.members ? e.members.split(", ") : [],
          })),
          chores: {
            total: choreRows.length,
            open_count: openChores.length,
            completed_count: doneChores.length,
            total_effort: totalEffort,
            by_member: choresByMember,
          },
          groceries: {
            needed_count: groceryRows.length,
            by_category: groceriesByCategory,
          },
          reminders: reminderRows.map((r) => ({
            id: r.id,
            member: r.member_name,
            message: r.message,
            remind_at: r.remind_at,
          })),
          conflicts_count: conflicts.length,
          conflicts,
        },
      };
    }),
  );
}
