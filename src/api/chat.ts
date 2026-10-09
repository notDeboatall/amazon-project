import { Router } from "express";
import { runAgentLoop } from "../agent/loop.js";
import type { Message } from "../agent/providers/types.js";

export const chatRouter = Router();

chatRouter.post("/chat", async (req, res) => {
  const text = (req.body?.text ?? req.body?.message ?? "") as string;
  const history = (req.body?.history ?? []) as Message[];

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    res.status(400).json({ error: "Missing or invalid 'text' in request body." });
    return;
  }

  try {
    const result = await runAgentLoop({
      text: text.trim(),
      history: Array.isArray(history) ? history : undefined,
    });

    res.json({
      reply: result.reply,
      toolCalls: result.toolCalls,
      iterations: result.iterations,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Chat error:", message);

    res.status(500).json({
      error: message,
      reply: message,
      toolCalls: [],
    });
  }
});
