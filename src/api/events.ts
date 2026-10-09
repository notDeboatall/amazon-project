import { Router } from "express";
import { subscribeToEvents, type AppEvent } from "../util/events.js";

export const eventsRouter = Router();

eventsRouter.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // Send initial ping to confirm stream connection
  res.write(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`);

  const unsubscribe = subscribeToEvents((event: AppEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on("close", () => {
    unsubscribe();
  });
});
