// Calls the running server through a real MCP client, exactly like an external assistant would.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.MCP_URL ?? "http://localhost:3000/mcp";
const client = new Client({ name: "smoke-test", version: "0.0.1" });
await client.connect(new StreamableHTTPClientTransport(new URL(url)));

const { tools } = await client.listTools();
console.log("Tools:", tools.map((t) => t.name).join(", "));

const show = (label: string, r: unknown) => console.log(`\n${label}\n`, JSON.stringify(r, null, 2));

// --- Members ---
show("list_members", await client.callTool({ name: "list_members", arguments: {} }));

// --- Groceries ---
show("add_grocery_item (milk)", await client.callTool({ name: "add_grocery_item", arguments: { name: "milk", quantity: "2 liters", category: "dairy", added_by: "riya" } }));
show("add_grocery_item (duplicate)", await client.callTool({ name: "add_grocery_item", arguments: { name: "Milk" } }));
show("add_grocery_item (bad member)", await client.callTool({ name: "add_grocery_item", arguments: { name: "eggs", added_by: "Bob" } }));
show("list_groceries", await client.callTool({ name: "list_groceries", arguments: {} }));

// --- Chores ---
show("add_chore (unassigned)", await client.callTool({ name: "add_chore", arguments: { title: "Mop kitchen", effort: 3 } }));
show("add_chore (assigned)", await client.callTool({ name: "add_chore", arguments: { title: "Fold laundry", effort: 2, assignee: "Meera" } }));
show("add_chore (bad member)", await client.callTool({ name: "add_chore", arguments: { title: "Sweep", effort: 1, assignee: "Nobody" } }));

// Grab a known chore id from seed data — chore 1 should exist after seed.
show("assign_chore", await client.callTool({ name: "assign_chore", arguments: { chore_id: 1, member_name: "Arjun" } }));
show("assign_chore (bad id)", await client.callTool({ name: "assign_chore", arguments: { chore_id: 9999, member_name: "Riya" } }));
show("complete_chore", await client.callTool({ name: "complete_chore", arguments: { chore_id: 1 } }));
show("complete_chore (already done)", await client.callTool({ name: "complete_chore", arguments: { chore_id: 1 } }));
show("complete_chore (bad id)", await client.callTool({ name: "complete_chore", arguments: { chore_id: 9999 } }));

// --- Events ---
show("add_event", await client.callTool({ name: "add_event", arguments: {
  title: "Piano lesson",
  start: "2026-10-14T16:00:00.000Z",
  end: "2026-10-14T17:00:00.000Z",
  location: "Music school",
  member_names: ["Riya"],
} }));
show("add_event (bad member)", await client.callTool({ name: "add_event", arguments: {
  title: "Ghost meeting",
  start: "2026-10-14T10:00:00.000Z",
  end: "2026-10-14T11:00:00.000Z",
  member_names: ["Nobody"],
} }));
show("list_events (full range)", await client.callTool({ name: "list_events", arguments: {
  from: "2026-01-01T00:00:00.000Z",
  to: "2027-01-01T00:00:00.000Z",
} }));
show("list_events (by member)", await client.callTool({ name: "list_events", arguments: {
  from: "2026-01-01T00:00:00.000Z",
  to: "2027-01-01T00:00:00.000Z",
  member_name: "Arjun",
} }));
show("list_events (empty range)", await client.callTool({ name: "list_events", arguments: {
  from: "2020-01-01T00:00:00.000Z",
  to: "2020-01-02T00:00:00.000Z",
} }));

// --- Reminders ---
show("create_reminder", await client.callTool({ name: "create_reminder", arguments: {
  member_name: "Riya",
  message: "Dentist at 4pm",
  remind_at: "2026-10-14T16:00:00.000Z",
} }));
show("create_reminder (bad member)", await client.callTool({ name: "create_reminder", arguments: {
  member_name: "Ghost",
  message: "Boo",
  remind_at: "2026-10-14T12:00:00.000Z",
} }));

// --- Standout Features (Phase 4) ---
// Rebalance chores
show("rebalance_chores", await client.callTool({ name: "rebalance_chores", arguments: {} }));

// Find conflicts (detects Thursday overlap: Football practice pickup vs Dentist appointment)
show("find_conflicts (all members)", await client.callTool({ name: "find_conflicts", arguments: {
  from: "2026-10-12T00:00:00.000Z",
  to: "2026-10-18T23:59:59.000Z",
} }));

// Find conflicts (specifically Dad / Arjun traveling Thursday)
show("find_conflicts (Arjun traveling Thursday)", await client.callTool({ name: "find_conflicts", arguments: {
  from: "2026-10-15T00:00:00.000Z",
  to: "2026-10-15T23:59:59.000Z",
  member_name: "Arjun",
} }));

// Weekly summary
show("weekly_summary", await client.callTool({ name: "weekly_summary", arguments: {} }));

await client.close();
console.log("\n✅ Smoke test complete.");
