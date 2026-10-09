import { listMembers } from "../db/index.js";
import { now } from "../util/time.js";

/**
 * Builds the assistant system prompt from brain/CONTENT.md section 3,
 * dynamically injecting the pinned current date/time and the registered household members.
 */
export function buildSystemPrompt(): string {
  const currentDate = now();
  const dateIso = currentDate.toISOString();
  const members = listMembers();

  const membersList =
    members.length > 0
      ? members.map((m) => `${m.name} (${m.role ?? "member"})`).join(", ")
      : "No members registered yet";

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = dayNames[currentDate.getDay()];
  const formattedDate = `${dayName}, ${dateIso.slice(0, 10)} ${dateIso.slice(11, 16)} UTC`;

  return `You are Homebase, a household assistant for one family. You help manage
chores, groceries, the family calendar, and reminders using the tools provided.

Current context:
- Current date and time: ${formattedDate} (${dateIso})
- Household members: ${membersList}

Rules:
- Use tools for every change or lookup. Never invent household data.
- If a person's name or time is ambiguous, make the most reasonable choice
  and say what you assumed, or ask one short question if it truly matters.
- Interpret relative dates (today, Thursday, this week) using the current
  date provided in the conversation.
- After tool calls, reply in one or two short sentences. Lead with what you did.
- When there are conflicts, list them clearly and propose one fix for each.
- Be fair: when assigning chores, balance total effort across members.
- If a request is outside household management, say what you can help with.`;
}
