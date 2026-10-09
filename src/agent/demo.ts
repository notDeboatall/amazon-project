import type { ChatArgs, ChatResult } from "./providers/types.js";

/**
 * Scripted demo safety net (RULES.md section 5, ARCHITECTURE.md section 9).
 * Used only when DEMO_MODE=true or as a safety net if all providers fail.
 */
export function getDemoResponse(args: ChatArgs): ChatResult | null {
  // Extract the latest user message
  const lastUserMsg = [...args.messages].reverse().find((m) => m.role === "user");
  const text = (lastUserMsg?.content ?? "").toLowerCase().trim();

  // If there are tool messages already in history, the model should summarize the tool result
  const lastMsg = args.messages[args.messages.length - 1];
  if (lastMsg && lastMsg.role === "tool") {
    if (text.includes("milk") || text.includes("eggs")) {
      return { text: "Added milk and eggs to your grocery list." };
    }
    if (text.includes("fairly") || text.includes("rebalance")) {
      return {
        text: "I've rebalanced all open chores fairly across the family: Arjun (7 pts), Meera (7 pts), Riya (4 pts), and Kabir (2 pts).",
      };
    }
    if (text.includes("traveling") || text.includes("break") || text.includes("conflict")) {
      return {
        text: "Dad's travel on Thursday creates schedule conflicts: he is double-booked between Kabir's dentist appointment and Riya's football practice pickup, and won't be able to attend either due to travel. Proposed fix: Have Meera take over both the football pickup and dentist appointment.",
      };
    }
    if (text.includes("happening this week") || text.includes("weekly summary")) {
      return {
        text: "Here is your weekly summary: 5 events scheduled (including Thursday's conflict for Arjun between football pickup and the dentist), 8 open chores totaling 20 effort points, and 5 grocery items needed.",
      };
    }
    if (text.includes("chore") || text.includes("dishes") || text.includes("laundry") || text.includes("wash")) {
      return { text: "I've updated your chores on the board." };
    }
    if (text.includes("remind") || text.includes("dentist")) {
      return { text: "I've set that reminder for you." };
    }
    if (text.includes("event") || text.includes("schedule") || text.includes("happening")) {
      return { text: "Here is your household schedule." };
    }
    return { text: "All done!" };
  }

  // Scripted Demo Prompt 1: "We're out of milk and eggs."
  if (text.includes("milk") && text.includes("eggs")) {
    return {
      toolCalls: [
        {
          id: "demo_call_milk",
          name: "add_grocery_item",
          arguments: { name: "milk", quantity: "2 liters", category: "dairy" },
        },
        {
          id: "demo_call_eggs",
          name: "add_grocery_item",
          arguments: { name: "eggs", quantity: "1 dozen", category: "dairy" },
        },
      ],
    };
  }

  // Single grocery addition / buy
  if (
    text.includes("sourdough") ||
    text.includes("batteries") ||
    (text.includes("add") && text.includes("grocery")) ||
    text.startsWith("buy ") ||
    text.includes("need to buy")
  ) {
    let itemName = "sourdough bread";
    let quantity: string | undefined;

    if (text.includes("batteries")) {
      itemName = "batteries";
      quantity = "2 packs";
    } else {
      const itemMatch = text.match(/(?:add|buy) (?:a |some |[0-9]+ [a-z]+ of )?([a-z0-9 ]+?)(?: to (?:the )?grocery|$)/i);
      if (itemMatch) itemName = itemMatch[1].trim();
    }

    return {
      toolCalls: [
        {
          id: "demo_call_grocery",
          name: "add_grocery_item",
          arguments: {
            name: itemName,
            ...(quantity ? { quantity } : {}),
            category: itemName.includes("batteries") ? "household" : "bakery",
          },
        },
      ],
    };
  }

  // Grocery list query
  if (text.includes("grocery list") || text.includes("groceries")) {
    return {
      toolCalls: [
        {
          id: "demo_call_list_groceries",
          name: "list_groceries",
          arguments: {},
        },
      ],
    };
  }

  // Scripted Demo Prompt 2: "Assign dishes and laundry fairly this week."
  if (
    (text.includes("dishes") || text.includes("laundry") || text.includes("fairly") || text.includes("rebalance")) &&
    (text.includes("assign") || text.includes("rebalance") || text.includes("fairly"))
  ) {
    return {
      toolCalls: [
        {
          id: "demo_call_rebalance_chores",
          name: "rebalance_chores",
          arguments: {},
        },
      ],
    };
  }

  // Add chore
  if (text.includes("add") && (text.includes("chore") || text.includes("wash the car"))) {
    return {
      toolCalls: [
        {
          id: "demo_call_add_chore",
          name: "add_chore",
          arguments: { title: "Wash the car", effort: 3, frequency: "weekly" },
        },
      ],
    };
  }

  // Assign chore to member
  if (text.includes("assign") && text.includes("kabir")) {
    return {
      toolCalls: [
        {
          id: "demo_call_assign_chore_kabir",
          name: "assign_chore",
          arguments: { chore_id: 3, member_name: "Kabir" },
        },
      ],
    };
  }

  // Complete chore
  if (text.includes("mark") || text.includes("finished") || text.includes("complete")) {
    return {
      toolCalls: [
        {
          id: "demo_call_complete_chore",
          name: "complete_chore",
          arguments: { chore_id: 1 },
        },
      ],
    };
  }

  // List members
  if (text.includes("who lives") || text.includes("members")) {
    return {
      toolCalls: [
        {
          id: "demo_call_members",
          name: "list_members",
          arguments: {},
        },
      ],
    };
  }

  // Scripted Demo Prompt 4: "Remind Meera about the dentist on Thursday at 4."
  if (text.includes("remind") && text.includes("dentist")) {
    return {
      toolCalls: [
        {
          id: "demo_call_remind_meera",
          name: "create_reminder",
          arguments: {
            member_name: "Meera",
            message: "Dentist appointment",
            remind_at: "2026-10-15T16:00:00.000Z",
          },
        },
      ],
    };
  }

  // Other reminder
  if (text.includes("remind")) {
    const member = text.includes("riya") ? "Riya" : text.includes("meera") ? "Meera" : "Arjun";
    return {
      toolCalls: [
        {
          id: "demo_call_reminder",
          name: "create_reminder",
          arguments: {
            member_name: member,
            message: "Task reminder",
            remind_at: "2026-10-16T10:00:00.000Z",
          },
        },
      ],
    };
  }

  // Events query for specific member (e.g. "What is Arjun doing this week?")
  if (text.includes("doing") || text.includes("schedule for") || text.includes("calendar for")) {
    const member = text.includes("arjun")
      ? "Arjun"
      : text.includes("meera")
        ? "Meera"
        : text.includes("riya")
          ? "Riya"
          : text.includes("kabir")
            ? "Kabir"
            : undefined;

    if (member) {
      return {
        toolCalls: [
          {
            id: "demo_call_member_events",
            name: "list_events",
            arguments: {
              from: "2026-10-01T00:00:00.000Z",
              to: "2026-10-31T23:59:59.000Z",
              member_name: member,
            },
          },
        ],
      };
    }
  }

  // Scripted Demo Prompt 5: "What's happening this week?"
  if (text.includes("happening this week") || text.includes("weekly summary")) {
    return {
      toolCalls: [
        {
          id: "demo_call_weekly_summary",
          name: "weekly_summary",
          arguments: {},
        },
      ],
    };
  }

  // General events or schedule query
  if (text.includes("events") || text.includes("schedule")) {
    return {
      toolCalls: [
        {
          id: "demo_call_events",
          name: "list_events",
          arguments: {
            from: "2026-10-01T00:00:00.000Z",
            to: "2026-10-31T23:59:59.000Z",
          },
        },
      ],
    };
  }

  // Add event
  if (text.includes("soccer match")) {
    return {
      toolCalls: [
        {
          id: "demo_call_add_event",
          name: "add_event",
          arguments: {
            title: "Soccer match",
            start: "2026-10-16T16:00:00.000Z",
            end: "2026-10-16T17:00:00.000Z",
            member_names: ["Kabir"],
          },
        },
      ],
    };
  }

  // Scripted Demo Prompt 3: "Dad's traveling Thursday, what does that break?"
  if (text.includes("traveling thursday") || text.includes("dad's traveling") || text.includes("break")) {
    return {
      toolCalls: [
        {
          id: "demo_call_find_conflicts_thursday",
          name: "find_conflicts",
          arguments: {
            from: "2026-10-15T00:00:00.000Z",
            to: "2026-10-15T23:59:59.000Z",
            member_name: "Arjun",
          },
        },
      ],
    };
  }

  return null;
}
