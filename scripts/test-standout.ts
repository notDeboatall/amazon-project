import { runAgentLoop } from "../src/agent/loop.js";

const standoutPrompts = [
  "Assign dishes and laundry fairly this week.",
  "Dad's traveling Thursday, what does that break?",
  "What's happening this week?",
];

console.log("=== Testing Standout Features (Phase 4) ===\n");

for (const prompt of standoutPrompts) {
  console.log(`Prompt: "${prompt}"`);
  try {
    const res = await runAgentLoop({ text: prompt });
    console.log(`Reply: ${res.reply}`);
    console.log(`Tools called: ${res.toolCalls.map((t) => t.name).join(", ") || "(none)"}`);
    console.log(`Iterations: ${res.iterations}\n`);
  } catch (err) {
    console.error(`Error:`, err);
  }
}
