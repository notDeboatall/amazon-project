# Homebase (Household Chief of Staff)

A voice-first household assistant for the Amazon Developer Hackathon (Alexa+ track). Chores, groceries, schedules, and reminders are exposed as **MCP tools over Streamable HTTP**, allowing any compatible assistant or the included Amazon-inspired web interface to manage a family home.

---

## Quickstart (Under 3 Commands)

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment (Optional)
```bash
# If you have free API keys from Google AI Studio or Groq:
cp .env.example .env
# Edit .env and set GEMINI_API_KEY or GROQ_API_KEY.
# Note: If no keys are provided, Homebase automatically runs with its built-in demo safety net!
```

### 3. Start the server
```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.
- **Web UI:** [http://localhost:3000](http://localhost:3000)
- **MCP Endpoint (Streamable HTTP):** [http://localhost:3000/mcp](http://localhost:3000/mcp)
- **REST API:** `/api/chat`, `/api/state`, `/api/events` (SSE), `/api/reset`

---

## Testing Tools and Agent

In another terminal while the server is running:

### Run the MCP Tools Smoke Test
Tests all 10 MCP tools (happy and error paths) via a real MCP client:
```bash
npm run smoke
```

### Run the 15 Realistic Household Prompts
Tests the agent loop, multi-turn tool calling, and activity logging:
```bash
npm run test:prompts
```

### Validate TypeScript
```bash
npm run typecheck
```

---

## Connect with MCP Inspector
Inspect and test all 10 tools directly from an external MCP client:
```bash
npx @modelcontextprotocol/inspector
```
1. Select Transport: **Streamable HTTP**
2. URL: `http://localhost:3000/mcp`
3. Click **Connect** to list and call any Homebase tool (`add_grocery_item`, `add_chore`, `list_events`, etc.)

---

## Key Features

- **Voice & Chat Assistant:** Click the microphone icon for Web Speech API recognition or type in the top search bar.
- **Dynamic Household Dashboard:** Real-time chore board, category-grouped grocery list, calendar with conflict detection, and pending reminders.
- **Live MCP Activity Stream:** The "What Homebase just did" panel highlights every tool invocation in real time via Server-Sent Events (SSE).
- **Zero Cost & Privacy:** $0 setup, no credit card required, runs entirely on free-tier LLMs (Gemini / Groq / Ollama) using fake demo household data (Sharma-Rao family).
