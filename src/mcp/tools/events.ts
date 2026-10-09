import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, resolveMember } from "../../db/index.js";
import { tool } from "./helpers.js";

interface EventRow {
  id: number;
  title: string;
  start_at: string;
  end_at: string;
  location: string | null;
}

export function registerEventTools(server: McpServer): void {
  server.registerTool(
    "add_event",
    {
      description:
        "Add a calendar event for one or more household members. Use when someone mentions a new appointment, activity, or meeting.",
      inputSchema: {
        title: z.string().min(1).describe("Event name, e.g. Dentist appointment"),
        start: z.string().describe("Start date-time as ISO 8601 string"),
        end: z.string().describe("End date-time as ISO 8601 string"),
        location: z.string().optional().describe("Where the event takes place"),
        member_names: z
          .array(z.string())
          .min(1)
          .describe("Names of household members involved"),
      },
    },
    tool(
      "add_event",
      (args: {
        title: string;
        start: string;
        end: string;
        location?: string;
        member_names: string[];
      }) => {
        // Resolve all members first so a bad name fails before any insert
        const members = args.member_names.map((n) => resolveMember(n));

        const info = db
          .prepare("INSERT INTO events (title, start_at, end_at, location) VALUES (?, ?, ?, ?)")
          .run(args.title.trim(), args.start, args.end, args.location ?? null);
        const eventId = Number(info.lastInsertRowid);

        const link = db.prepare("INSERT INTO event_members (event_id, member_id) VALUES (?, ?)");
        for (const m of members) {
          link.run(eventId, m.id);
        }

        const who = members.map((m) => m.name).join(", ");
        return {
          summary: `Created event "${args.title.trim()}" for ${who}.`,
          data: { id: eventId, members: members.map((m) => m.name) },
        };
      },
    ),
  );

  server.registerTool(
    "list_events",
    {
      description:
        "List calendar events in a date range. Optionally filter to one household member. Use when someone asks what's happening this week.",
      inputSchema: {
        from: z.string().describe("Start of range, ISO 8601 date or datetime"),
        to: z.string().describe("End of range, ISO 8601 date or datetime"),
        member_name: z
          .string()
          .optional()
          .describe("Filter to events involving this member"),
      },
    },
    tool("list_events", (args: { from: string; to: string; member_name?: string }) => {
      let rows: EventRow[];

      if (args.member_name) {
        const member = resolveMember(args.member_name);
        rows = db
          .prepare(
            `SELECT e.* FROM events e
             JOIN event_members em ON em.event_id = e.id
             WHERE em.member_id = ? AND e.start_at >= ? AND e.start_at <= ?
             ORDER BY e.start_at`,
          )
          .all(member.id, args.from, args.to) as EventRow[];
      } else {
        rows = db
          .prepare(
            "SELECT * FROM events WHERE start_at >= ? AND start_at <= ? ORDER BY start_at",
          )
          .all(args.from, args.to) as EventRow[];
      }

      if (rows.length === 0) {
        return { summary: "No events found in that range.", data: { events: [] } };
      }

      // Attach member names to each event
      const memberStmt = db.prepare(
        `SELECT m.name FROM event_members em
         JOIN members m ON m.id = em.member_id
         WHERE em.event_id = ?`,
      );
      const events = rows.map((e) => ({
        ...e,
        members: (memberStmt.all(e.id) as { name: string }[]).map((r) => r.name),
      }));

      const lines = events.map(
        (e) => `${e.title} (${e.start_at} – ${e.end_at}, ${e.members.join(", ")})`,
      );
      return {
        summary: `${events.length} event(s): ${lines.join("; ")}.`,
        data: { events },
      };
    }),
  );
}
