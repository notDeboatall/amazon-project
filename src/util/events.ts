import { EventEmitter } from "node:events";

export interface AppEvent {
  type: "tool_call" | "tool_result" | "state_changed";
  data: unknown;
  timestamp: string;
}

const emitter = new EventEmitter();
// Increase listener limit for multiple SSE clients
emitter.setMaxListeners(50);

export function emitEvent(type: AppEvent["type"], data: unknown): void {
  const event: AppEvent = {
    type,
    data,
    timestamp: new Date().toISOString(),
  };
  emitter.emit("app_event", event);
}

export function subscribeToEvents(listener: (event: AppEvent) => void): () => void {
  emitter.on("app_event", listener);
  return () => {
    emitter.off("app_event", listener);
  };
}
