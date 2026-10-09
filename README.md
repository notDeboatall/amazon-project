# Homebase

A household chief of staff for the Amazon Developer Hackathon (Alexa+ track). Chores, groceries, schedules, and reminders are exposed as **MCP tools** over Streamable HTTP, so any compatible assistant can help run a home.

> Status: Phase 0 scaffold. The MCP server runs with `list_members`, `add_grocery_item`, and `list_groceries`. See `brain/TASKS.md` for what's next.

## Run it (no API keys or card needed yet)
```bash
npm install
npm run dev          # http://localhost:3000, MCP at http://localhost:3000/mcp
npm run smoke        # in a second terminal: calls every tool through a real MCP client
```

Requires Node 20+. The demo household is seeded automatically on first run (fictional data only). Reset it with `POST /api/reset` or `npm run seed`.

## Try it with MCP Inspector
```bash
npx @modelcontextprotocol/inspector
```
Choose transport **Streamable HTTP** and URL `http://localhost:3000/mcp`.

## Project map
- `brain/`: project docs (PRD, architecture, design, content, rules, tasks, memory)
- `src/mcp/`: MCP server and tools
- `src/db/`: SQLite schema and seed
- `src/server.ts`: Express app with `/mcp`, `/api/*`, and the static UI
- `web/`: UI (placeholder until Phase 3)
- `.env.example`: copy to `.env` when the agent phase adds LLM keys (free tiers)
