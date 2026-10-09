import express from "express";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createHomebaseServer } from "./mcp/server.js";
import { getState, listMembers } from "./db/index.js";
import { seed } from "./db/seed.js";
import { chatRouter } from "./api/chat.js";
import { eventsRouter } from "./api/events.js";

const here = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// Seed the demo household on first run.
if (listMembers().length === 0) seed();

// --- MCP endpoint (Streamable HTTP, stateless: one server + transport per request) ---
app.post("/mcp", async (req, res) => {
  const server = createHomebaseServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

const methodNotAllowed = (_req: express.Request, res: express.Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. Use POST." },
    id: null,
  });
};
app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

// --- REST API for the web UI ---
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/state", (_req, res) => res.json(getState()));
app.post("/api/reset", (_req, res) => {
  seed();
  res.json({ ok: true, message: "Demo data reset." });
});
app.use("/api", chatRouter);
app.use("/api", eventsRouter);

// --- Static web UI ---
app.use(express.static(resolve(here, "../web")));

const port = Number(process.env.PORT ?? 3000);
// Bind to localhost only: no auth in the demo (brain/RULES.md section 7).
app.listen(port, "127.0.0.1", () => {
  console.log(`Homebase running on http://localhost:${port}`);
  console.log(`MCP endpoint:      http://localhost:${port}/mcp`);
});
