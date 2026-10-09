import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, resolveMember } from "../../db/index.js";
import { tool } from "./helpers.js";

interface GroceryRow {
  id: number;
  name: string;
  quantity: string | null;
  category: string | null;
  status: string;
}

export function registerGroceryTools(server: McpServer): void {
  server.registerTool(
    "add_grocery_item",
    {
      description:
        "Add an item to the shared grocery list. Use when someone says they need or are out of something. Duplicates are merged.",
      inputSchema: {
        name: z.string().min(1).describe("Item name, e.g. milk"),
        quantity: z.string().optional().describe("Amount, e.g. 2 liters"),
        category: z.string().optional().describe("e.g. dairy, produce, pantry, school"),
        added_by: z.string().optional().describe("Name of the household member asking"),
      },
    },
    tool("add_grocery_item", (args: { name: string; quantity?: string; category?: string; added_by?: string }) => {
      const memberId = args.added_by ? resolveMember(args.added_by).id : null;
      const name = args.name.trim();

      const existing = db
        .prepare("SELECT * FROM grocery_items WHERE lower(name) = lower(?) AND status = 'needed'")
        .get(name) as GroceryRow | undefined;

      if (existing) {
        if (args.quantity) {
          db.prepare("UPDATE grocery_items SET quantity = ? WHERE id = ?").run(args.quantity, existing.id);
        }
        return {
          summary: `${existing.name} is already on your grocery list.`,
          data: { id: existing.id, merged: true },
        };
      }

      const info = db
        .prepare("INSERT INTO grocery_items (name, quantity, category, added_by) VALUES (?, ?, ?, ?)")
        .run(name, args.quantity ?? null, args.category ?? null, memberId);

      return {
        summary: `Added ${name}${args.quantity ? ` (${args.quantity})` : ""} to your grocery list.`,
        data: { id: Number(info.lastInsertRowid), merged: false },
      };
    }),
  );

  server.registerTool(
    "list_groceries",
    {
      description: "Show the grocery list, grouped by category. Defaults to items still needed.",
      inputSchema: {
        status: z.enum(["needed", "bought"]).optional().describe("Filter by status; default needed"),
      },
    },
    tool("list_groceries", (args: { status?: "needed" | "bought" }) => {
      const status = args.status ?? "needed";
      const items = db
        .prepare("SELECT * FROM grocery_items WHERE status = ? ORDER BY category, name")
        .all(status) as GroceryRow[];

      if (items.length === 0) {
        return { summary: "Your grocery list is empty.", data: { items: [], grouped: {} } };
      }
      const grouped: Record<string, string[]> = {};
      for (const i of items) {
        const key = i.category ?? "other";
        (grouped[key] ??= []).push(i.quantity ? `${i.name} (${i.quantity})` : i.name);
      }
      const lines = Object.entries(grouped).map(([cat, names]) => `${cat}: ${names.join(", ")}`);
      return { summary: `${items.length} items needed. ${lines.join("; ")}.`, data: { items, grouped } };
    }),
  );
}
