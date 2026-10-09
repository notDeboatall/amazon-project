import type { LLMProvider, ChatArgs, ChatResult } from "./types.js";
import { GeminiProvider } from "./gemini.js";
import { GroqProvider } from "./groq.js";
import { OllamaProvider } from "./ollama.js";
import { getDemoResponse } from "../demo.js";

export * from "./types.js";
export * from "./gemini.js";
export * from "./groq.js";
export * from "./ollama.js";

const gemini = new GeminiProvider();
const groq = new GroqProvider();
const ollama = new OllamaProvider();

/**
 * Returns providers sorted according to configuration and fallback order.
 * Primary: process.env.LLM_PROVIDER (defaults to gemini).
 * Fallback order: Gemini -> Groq -> Ollama.
 */
export function getProvidersInOrder(): LLMProvider[] {
  const primaryName = (process.env.LLM_PROVIDER ?? "gemini").toLowerCase();
  const allProviders = [gemini, groq, ollama];

  const primary = allProviders.find((p) => p.name === primaryName) ?? gemini;
  const rest = allProviders.filter((p) => p !== primary);

  return [primary, ...rest];
}

/** Check if an error indicates rate limiting (429) or timeout. */
function isRateLimitOrTimeout(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  const status = (err as Record<string, unknown>).status;

  return (
    status === 429 ||
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("aborterror") ||
    msg.includes("econnrefused")
  );
}

/** Helper sleep function. */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calls providers in failover order. Retries once with backoff on 429/timeout,
 * then falls through to the next configured provider.
 */
export async function chatWithProviders(args: ChatArgs): Promise<ChatResult> {
  const isDemoExplicit = process.env.DEMO_MODE === "true";

  if (isDemoExplicit) {
    const demoRes = getDemoResponse(args);
    if (demoRes) return demoRes;
  }

  const providers = getProvidersInOrder();
  const availableProviders = providers.filter((p) => p.isAvailable());

  let lastError: Error | null = null;

  for (const provider of availableProviders) {
    // Attempt with retry
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await provider.chat(args);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (isRateLimitOrTimeout(err)) {
          console.warn(`[Agent] ${provider.name} error details: ${lastError.message}`);
          if (attempt === 0) {
            console.warn(`[Agent] ${provider.name} rate-limited or timed out. Retrying with backoff...`);
            await sleep(1000);
            continue;
          }
          console.warn(`[Agent] Homebase is busy. Trying another model after ${provider.name} failed.`);
        } else {
          // Non-retryable error on this provider, move to next
          console.warn(`[Agent] ${provider.name} error: ${lastError.message}`);
          break;
        }
      }
    }
  }

  // If all live providers failed or none configured, check demo safety net
  const demoFallback = getDemoResponse(args);
  if (demoFallback) {
    console.info("[Agent] Used demo safety net response.");
    return demoFallback;
  }

  if (availableProviders.length === 0) {
    throw new Error("Can't reach the assistant right now. Check your API keys in .env and try again.");
  }

  throw new Error(
    `Can't reach the assistant right now. Check your API keys in .env and try again. (${lastError?.message ?? "All providers failed"})`,
  );
}
