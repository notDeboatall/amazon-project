---
name: homebase
description: Household Chief of Staff skill managing chores, groceries, calendar events, schedule conflicts, and fair effort rebalancing via MCP over Streamable HTTP.
---

# Homebase Agent Skill

Homebase serves as an AI Chief of Staff for a busy modern household. It connects voice-first surfaces (like Alexa+) to a local household state database through the Model Context Protocol (MCP) over Streamable HTTP.

## Capabilities

1. **Effort-Based Chore Balancing (`rebalance_chores`)**:
   - Analyzes total pending chore effort points.
   - Rebalances open chores across household members considering age roles (`kid` up to effort 2, `teen` up to effort 3, `parent` up to effort 5).
   - Minimizes variance in chore burden (e.g., redistributes Meera's heavy 14-point load evenly with Arjun).

2. **Proactive Conflict Detection (`find_conflicts`)**:
   - Detects calendar event overlaps where the same family member is double-booked.
   - Analyzes absence impacts (e.g., "Dad is traveling Thursday, what does that break?").
   - Identifies appointments losing drivers/supervision and proposes actionable solutions (e.g., "Meera drives Riya to football practice; reschedule Kabir's dentist appointment to Friday").

3. **Weekly Logistics Briefing (`weekly_summary`)**:
   - Aggregates events, pending chores with effort distributions, needed groceries by department, and active reminders into a single coherent briefing.

4. **Zero-Friction Pantry & Grocery Management (`add_grocery_item`, `list_groceries`)**:
   - Adds items, auto-categorizes, and merges quantities on duplicates.

5. **Voice-Friendly Timely Reminders (`create_reminder`)**:
   - Pinpoints who needs to be reminded, at what time, and for what purpose.

## Execution Model

- **Transport**: Streamable HTTP (`POST /mcp`)
- **Protocol**: MCP JSON-RPC 2.0 with tool calling
- **Safety**: Local SQLite database with strict parameter typing and activity logging.
