import { runAgentLoop } from "../src/agent/loop.js";

const prompts = [
  "We're out of milk and eggs.",
  "Add sourdough bread to the grocery list.",
  "What's on our grocery list?",
  "Add a chore to wash the car with effort 3.",
  "Assign the vacuuming chore to Kabir.",
  "Mark clean bathroom as done.",
  "Who lives in this household?",
  "What events are happening this week?",
  "Schedule a soccer match on Friday from 4pm to 5pm for Kabir.",
  "What is Arjun doing this week?",
  "Remind Meera about the dentist on Thursday at 4.",
  "Remind Riya about math homework at 6pm.",
  "Buy 2 packs of batteries.",
  "Can you add a chore for walking the dog and assign it to Arjun?",
  "Dad's traveling Thursday, what does that break?",
];

console.log(`Running 15 realistic household prompts...\n`);

let passed = 0;
let failed = 0;

for (let i = 0; i < prompts.length; i++) {
  const prompt = prompts[i];
  console.log(`[${i + 1}/15] User: "${prompt}"`);
  try {
    const res = await runAgentLoop({ text: prompt });
    console.log(`  Reply: ${res.reply}`);
    console.log(`  Tools called: ${res.toolCalls.map((t) => t.name).join(", ") || "(none)"}`);
    console.log(`  Iterations: ${res.iterations}`);
    passed++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ Failed: ${msg}`);
    failed++;
  }
  console.log();
}

console.log(`Results: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
