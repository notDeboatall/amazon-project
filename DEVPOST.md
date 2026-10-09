# Devpost Submission — Homebase: Household Chief of Staff

**Track:** Alexa+ Track — Amazon Developer Hackathon  
**Tagline:** A voice-first household assistant managing chores, groceries, calendars, and reminders via MCP over Streamable HTTP with intelligent chore rebalancing and conflict detection.

---

## 💡 Inspiration

Ask any busy parent what drains their energy most, and the answer is rarely the work itself—it is the mental overhead of tracking who needs what, when, and where. 

In a typical home, logistics are scattered across sticky notes, refrigerators, WhatsApp groups, and separate calendar apps. Parents carry an unfair mental burden, kids don't know what chores need doing, and schedule collisions (e.g. two kids needing rides in opposite directions at 5:30 PM) often only surface at the last minute.

We built **Homebase** to serve as a reliable Chief of Staff for modern families. By combining the **Model Context Protocol (MCP)** with voice-first interaction on the **Alexa+** architecture, Homebase provides a single source of truth that turns chaotic family logistics into calm, coordinated teamwork.

---

## ⚡ What It Does

Homebase coordinates household state through 12 dedicated MCP tools over Streamable HTTP:

1. **Effort-Balanced Chore Redistribution (`rebalance_chores`)**:
   Instead of simplistic one-for-one chore swapping, Homebase weights chores by difficulty (1 to 5 points) and redistributes open chores fairly according to age-appropriate roles (`kid` $\le 2$ pts, `teen` $\le 3$ pts, `parent` $\le 5$ pts). In our demo scenario, it redistributes a mother's heavy 14-point burden evenly across the household with zero friction.

2. **Proactive Schedule Conflict Detection (`find_conflicts`)**:
   Homebase detects calendar overlaps where family members are double-booked. When a parent mentions an upcoming absence (e.g., *"Dad's traveling Thursday, what does that break?"*), Homebase identifies every dependent event, spots conflicting appointments, and proposes specific actionable solutions (e.g. reassigning football practice pickup to Mom and rescheduling Kabir's dentist appointment).

3. **Weekly Family Briefings (`weekly_summary`)**:
   In response to queries like *"What's happening this week?"*, Homebase aggregates upcoming events, pending chores with effort distributions, grocery needs by department, and active reminders into a crisp briefing.

4. **Natural Voice Interaction & Real-Time Live Activity**:
   Family members can speak naturally using the Web Speech API or type into the search bar. Every tool invocation streams in real time via Server-Sent Events (SSE) into the "What Homebase just did" activity stream.

---

## 🛠️ How We Built It

- **MCP over Streamable HTTP (`/mcp`)**: Implemented using `@modelcontextprotocol/sdk` (1.32.1) using stateless HTTP streaming. Every tool call returns both human-readable spoken text summaries and rich `structuredContent` for the UI.
- **Agent Reasoning Loop (`src/agent/loop.ts`)**: Built-in multi-turn tool calling loop that dynamically inspects tools from the MCP endpoint, limits history to the last 10 turns, and enforces a maximum of 6 reasoning iterations.
- **Multi-Provider Fallback Engine (`src/agent/providers/`)**: Zero-cost free-tier resilience featuring Google Gemini Flash Lite, Groq Llama 3.3, local Ollama, and an emergency demo safety net.
- **Local-First SQLite Database (`src/db/`)**: Fast, atomic data storage using `better-sqlite3` with full activity logging, foreign keys, and repeatable seed resets (`POST /api/reset`).
- **Amazon-Inspired Web Surface (`web/`)**: Vanilla CSS design system built from curated tokens (`#131921` squid ink, `#232F3E` navy, `#FF9900` smile orange, `#067D62` status green), accessible aria labels, responsive layouts (375px / 768px / 1440px), and Web Speech voice recognition.

---

## 🥊 Challenges We Overcame

1. **Free-Tier LLM Tool Calling Nuances**: Free-tier models often reject schema fields like `$schema` or unconstrained `additionalProperties`. We built strict schema sanitizers (`cleanSchemaForGemini`) to ensure 100% first-pass tool acceptance.
2. **Gemini Thought Signature Preservation**: When calling consecutive tools across multiple turns, Gemini requires preserving internal thought signatures and grouping function responses into alternating turns. Our Gemini provider captures and replays these faithfully.
3. **Strict Free-Tier Rate Limits (15 RPM)**: When hammering the free tier with multi-step reasoning, quota delays can happen. We implemented exponential backoff and a graceful fallback chain to ensure the user experience never crashes.
4. **Zero-Budget Strict Constraint**: Adhered 100% to a $0 budget with zero credit card requirements, validating that sophisticated voice agent systems can be built without costly enterprise APIs.

---

## 🏆 Accomplishments We're Proud Of

- **100% Smoke & Rehearsal Test Passes**: Our automated test suite ran 3 full rounds of 5-prompt demo rehearsals without a single manual fix needed.
- **True Open Standards**: Homebase is fully accessible to any external MCP client or inspector, and packaged with an open Agent Skill specification (`skill/skill.json`, `skill/SKILL.md`).
- **Visually Stunning & Accessible**: An interface with responsive cards, micro-animations, high-contrast badges, and full keyboard navigation.

---

## 📝 DX Feedback for the Amazon Alexa+ Team

Building with the Model Context Protocol for an Alexa+ surface was an exciting and instructive experience. Here is key developer feedback:

1. **Streamable HTTP as the Standard**: Using Streamable HTTP (`POST /mcp`) is vastly superior to standard stdio transports for web services and cloud-hosted assistants. It makes debugging with curl and browser dev tools intuitive.
2. **Standardized Fallback Schemas**: Having an official Amazon validator or schema linting tool for MCP tool definitions would help developers catch subtle provider incompatibilities early.
3. **Agent Skill Manifest Convergence**: Standardizing the manifest structure between open Agent Skills (`skill.json`) and Alexa+ developer skill manifests will make cross-platform agent packaging seamless.

---

## 🚀 What's Next for Homebase

- **Shared Household Invites**: QR-code and magic link invites for grandparents, babysitters, and house sitters with role-based permission tiers.
- **Recurring Chore Streaks**: Gamified chore completions with streak tracking and celebratory audio cues.
- **Real Alexa+ Device Testing**: Direct deployment to physical Echo Show hardware once developer preview access is available.
- **Smart Aisle Grouping**: Auto-sorting grocery lists by local supermarket layout and store sections.
