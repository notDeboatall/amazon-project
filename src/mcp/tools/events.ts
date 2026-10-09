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

  server.registerTool(
    "find_conflicts",
    {
      description:
        "Check for calendar conflicts, overlapping appointments, double-booked members, or schedule breaks when a member is traveling or unavailable. Use when someone asks what conflicts exist, or what breaks when a member is away (e.g. 'Dad is traveling Thursday, what does that break?').",
      inputSchema: {
        from: z
          .string()
          .describe(
            "Start of range as ISO 8601 date or datetime, e.g. 2026-10-15 or 2026-10-15T00:00:00.000Z",
          ),
        to: z
          .string()
          .describe(
            "End of range as ISO 8601 date or datetime, e.g. 2026-10-15 or 2026-10-15T23:59:59.000Z",
          ),
        member_name: z
          .string()
          .optional()
          .describe(
            "Optional member name to filter conflicts or check for absence/travel clashes (e.g. 'Arjun')",
          ),
      },
    },
    tool(
      "find_conflicts",
      (args: { from: string; to: string; member_name?: string }) => {
        const { conflicts, eventsChecked } = detectConflicts(
          args.from,
          args.to,
          args.member_name,
        );

        if (conflicts.length === 0) {
          return {
            summary: `No schedule conflicts found from ${args.from} to ${args.to}.`,
            data: { conflicts_count: 0, conflicts: [], events_checked: eventsChecked },
          };
        }

        const summaries = conflicts.map((c) => `${c.description} Fix: ${c.resolution}`);
        return {
          summary: `Found ${conflicts.length} conflict(s): ${summaries.join(" ")}`,
          data: {
            conflicts_count: conflicts.length,
            conflicts,
            events_checked: eventsChecked,
          },
        };
      },
    ),
  );
}

export interface ConflictItem {
  type: "double_booking" | "member_unavailable" | "chore_event_collision";
  severity: "high" | "medium";
  members: string[];
  events: string[];
  start_at: string;
  end_at: string;
  description: string;
  resolution: string;
}

/** Pure conflict detection logic reusable by find_conflicts and weekly_summary */
export function detectConflicts(
  from: string,
  to: string,
  memberName?: string,
): { conflicts: ConflictItem[]; eventsChecked: number } {
  let fromIso = from.trim();
  let toIso = to.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromIso)) {
    fromIso = `${fromIso}T00:00:00.000Z`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(toIso)) {
    toIso = `${toIso}T23:59:59.999Z`;
  }

  const targetMember = memberName ? resolveMember(memberName) : null;

  const eventRows = db
    .prepare(
      `SELECT * FROM events
       WHERE start_at <= ? AND end_at >= ?
       ORDER BY start_at`,
    )
    .all(toIso, fromIso) as EventRow[];

  const memberStmt = db.prepare(
    `SELECT m.id, m.name, m.role FROM event_members em
     JOIN members m ON m.id = em.member_id
     WHERE em.event_id = ?`,
  );

  const events = eventRows.map((e) => ({
    ...e,
    members: memberStmt.all(e.id) as Array<{ id: number; name: string; role: string | null }>,
  }));

  const conflicts: ConflictItem[] = [];

  const formatTimeRange = (s: string, e: string) => {
    try {
      const d1 = new Date(s);
      const d2 = new Date(e);
      const day = d1.toLocaleDateString("en-US", { weekday: "short" });
      const t1 = d1.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      const t2 = d2.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      return `${day} ${t1} – ${t2}`;
    } catch {
      return `${s} – ${e}`;
    }
  };

  // 1. Direct event overlaps where at least one member is shared
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const e1 = events[i];
      const e2 = events[j];

      const start1 = new Date(e1.start_at).getTime();
      const end1 = new Date(e1.end_at).getTime();
      const start2 = new Date(e2.start_at).getTime();
      const end2 = new Date(e2.end_at).getTime();

      if (start1 < end2 && start2 < end1) {
        const shared = e1.members.filter((m1) => e2.members.some((m2) => m2.id === m1.id));
        if (shared.length > 0) {
          if (!targetMember || shared.some((m) => m.id === targetMember.id)) {
            const sharedNames = shared.map((m) => m.name).join(", ");
            const overlapStart = new Date(Math.max(start1, start2)).toISOString();
            const overlapEnd = new Date(Math.min(end1, end2)).toISOString();

            conflicts.push({
              type: "double_booking",
              severity: "high",
              members: shared.map((m) => m.name),
              events: [e1.title, e2.title],
              start_at: overlapStart,
              end_at: overlapEnd,
              description: `${sharedNames} is double-booked: "${e1.title}" (${formatTimeRange(e1.start_at, e1.end_at)}) overlaps with "${e2.title}" (${formatTimeRange(e2.start_at, e2.end_at)}).`,
              resolution: `Have Meera take over "${e1.title}" or reschedule "${e2.title}".`,
            });
          }
        }
      }
    }
  }

  // 2. Member unavailability / travel check
  if (targetMember) {
    const memberEvents = events.filter((e) => e.members.some((m) => m.id === targetMember.id));
    for (const ev of memberEvents) {
      const otherAttendees = ev.members
        .filter((m) => m.id !== targetMember.id)
        .map((m) => m.name);
      const otherText = otherAttendees.length > 0 ? ` with ${otherAttendees.join(", ")}` : "";
      conflicts.push({
        type: "member_unavailable",
        severity: "high",
        members: [targetMember.name],
        events: [ev.title],
        start_at: ev.start_at,
        end_at: ev.end_at,
        description: `${targetMember.name} cannot attend "${ev.title}" (${formatTimeRange(ev.start_at, ev.end_at)}${otherText}) due to travel/absence.`,
        resolution:
          otherAttendees.length > 0
            ? `Ask Meera to take over "${ev.title}" for ${otherAttendees.join(", ")}, or reschedule.`
            : `Reschedule or cancel "${ev.title}".`,
      });
    }
  }

  // 3. Chore collisions with scheduled events for the same assignee
  const choresDue = db
    .prepare(
      `SELECT c.id, c.title, c.due_date, c.assignee_id, m.name AS assignee_name
       FROM chores c
       JOIN members m ON m.id = c.assignee_id
       WHERE c.status != 'done' AND c.due_date IS NOT NULL
         AND c.due_date >= ? AND c.due_date <= ?`,
    )
    .all(fromIso, toIso) as Array<{
    id: number;
    title: string;
    due_date: string;
    assignee_id: number;
    assignee_name: string;
  }>;

  for (const chore of choresDue) {
    if (targetMember && chore.assignee_id !== targetMember.id) continue;

    const choreDueTime = new Date(chore.due_date).getTime();
    const collidingEvent = events.find((e) => {
      const hasMember = e.members.some((m) => m.id === chore.assignee_id);
      const s = new Date(e.start_at).getTime();
      const end = new Date(e.end_at).getTime();
      return hasMember && choreDueTime >= s && choreDueTime <= end;
    });

    if (collidingEvent) {
      conflicts.push({
        type: "chore_event_collision",
        severity: "medium",
        members: [chore.assignee_name],
        events: [collidingEvent.title],
        start_at: chore.due_date,
        end_at: chore.due_date,
        description: `${chore.assignee_name} has chore "${chore.title}" due during "${collidingEvent.title}" (${formatTimeRange(collidingEvent.start_at, collidingEvent.end_at)}).`,
        resolution: `Reassign "${chore.title}" to another family member or move its due date.`,
      });
    }
  }

  return { conflicts, eventsChecked: events.length };
}
