import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.HOMEBASE_DB ?? resolve(here, "../../data/homebase.db");

mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(readFileSync(resolve(here, "schema.sql"), "utf8"));

export interface Member {
  id: number;
  name: string;
  role: string | null;
  color: string | null;
  emoji: string | null;
}

export function listMembers(): Member[] {
  return db.prepare("SELECT * FROM members ORDER BY id").all() as Member[];
}

/** Resolve a member by name, case-insensitively. Throws an error that lists valid names. */
export function resolveMember(name: string): Member {
  const row = db
    .prepare("SELECT * FROM members WHERE lower(name) = lower(?)")
    .get(name.trim()) as Member | undefined;
  if (!row) {
    const names = listMembers().map((m) => m.name).join(", ");
    throw new Error(`No one named "${name}" lives here. Members: ${names}.`);
  }
  return row;
}

export function logActivity(tool: string, args: unknown, result: unknown): void {
  db.prepare("INSERT INTO activity_log (tool, args_json, result_json) VALUES (?, ?, ?)").run(
    tool,
    JSON.stringify(args ?? {}),
    JSON.stringify(result ?? {}),
  );
}

export function getState() {
  return {
    members: listMembers(),
    chores: db
      .prepare(
        `SELECT c.*, m.name AS assignee FROM chores c
         LEFT JOIN members m ON m.id = c.assignee_id ORDER BY c.id`,
      )
      .all(),
    groceries: db
      .prepare(
        `SELECT g.*, m.name AS added_by_name FROM grocery_items g
         LEFT JOIN members m ON m.id = g.added_by ORDER BY g.id`,
      )
      .all(),
    events: db
      .prepare(
        `SELECT e.*, COALESCE(group_concat(m.name, ', '), '') AS members
         FROM events e
         LEFT JOIN event_members em ON em.event_id = e.id
         LEFT JOIN members m ON m.id = em.member_id
         GROUP BY e.id ORDER BY e.start_at`,
      )
      .all(),
    reminders: db.prepare("SELECT * FROM reminders ORDER BY remind_at").all(),
    activity: db.prepare("SELECT * FROM activity_log ORDER BY id DESC LIMIT 20").all(),
  };
}
