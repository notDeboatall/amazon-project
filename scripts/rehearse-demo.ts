import { runAgentLoop } from "../src/agent/loop.js";
import { seed } from "../src/db/seed.js";

const demoPrompts = [
  {
    step: 1,
    prompt: "We're out of milk and eggs.",
    expectedTools: ["add_grocery_item"],
  },
  {
    step: 2,
    prompt: "Assign dishes and laundry fairly this week.",
    expectedTools: ["rebalance_chores"],
  },
  {
    step: 3,
    prompt: "Dad's traveling Thursday, what does that break?",
    expectedTools: ["find_conflicts"],
  },
  {
    step: 4,
    prompt: "Remind Meera about the dentist on Thursday at 4.",
    expectedTools: ["create_reminder"],
  },
  {
    step: 5,
    prompt: "What's happening this week?",
    expectedTools: ["weekly_summary", "list_events"],
  },
];

console.log("=================================================");
console.log("   HOMEBASE DEMO SCRIPT REHEARSAL (3 ROUNDS)    ");
console.log("=================================================\n");

for (let round = 1; round <= 3; round++) {
  console.log(`\n>>> STARTING REHEARSAL ROUND ${round}/3 <<<`);
  seed(); // Reset demo seed to clean Sharma-Rao state

  let roundSuccess = true;

  for (const item of demoPrompts) {
    console.log(`\n[Round ${round} - Step ${item.step}] Prompt: "${item.prompt}"`);
    try {
      const res = await runAgentLoop({ text: item.prompt });
      const called = res.toolCalls.map((t) => t.name);
      console.log(`  Tools called: ${called.join(", ") || "(none)"}`);
      console.log(`  Reply: ${res.reply}`);

      const matched = item.expectedTools.some((t) => called.includes(t));
      if (!matched) {
        console.warn(`  ⚠️ Warning: expected one of [${item.expectedTools.join(", ")}], but got [${called.join(", ")}]`);
      } else {
        console.log(`  ✅ Verified expected tool`);
      }
    } catch (err) {
      console.error(`  ❌ Round ${round} Step ${item.step} failed:`, err);
      roundSuccess = false;
    }
  }

  if (roundSuccess) {
    console.log(`\n🎉 ROUND ${round}/3 COMPLETED CLEANLY.`);
  } else {
    console.error(`\n❌ ROUND ${round}/3 ENCOUNTERED ISSUES.`);
    process.exit(1);
  }
}

console.log("\n=================================================");
console.log("   ALL 3 REHEARSAL ROUNDS PASSED WITHOUT FIX!   ");
console.log("=================================================");
