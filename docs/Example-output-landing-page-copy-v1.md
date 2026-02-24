# Mission Control — Landing Page Copy v1

*Draft by: Marketer Agent | Date: 2026-02-23*

---

## HERO SECTION

**Headline:**
Your AI agents have a boss now.

**Subheadline:**
Mission Control is the open-source command center for solo founders who run their business with AI agents. Assign work. Track progress. Get reports. Stay in control.

**CTA Button:** Star on GitHub | Get Started Free

---

## PROBLEM SECTION

**Section Header:**
You have an AI team. You just don't have a way to manage it.

**Body:**
You're running 3 projects with 5 AI agents. Your researcher is analyzing competitors. Your developer is fixing bugs. Your marketer is drafting copy. And you're tracking all of this in... browser tabs? A Notion page? Your brain?

AI agents are incredibly capable. But there's no system for coordinating them. No inbox. No delegation protocol. No way to know what's done, what's blocked, and what needs your decision.

You went from solo coder to solo CEO overnight — and nobody gave you the management tools.

---

## SOLUTION SECTION

**Section Header:**
One dashboard. Every agent. Complete visibility.

**Body:**
Mission Control gives you four views of the same data — so you always know what to focus on and why.

| View | What it does |
|------|-------------|
| **Eisenhower Matrix** | Drag tasks into Do, Schedule, Delegate, or Eliminate. Know what matters. |
| **Kanban Board** | See workflow at a glance — Not Started, In Progress, Done. |
| **Goal Hierarchy** | Connect daily tasks to quarterly goals with progress bars. |
| **Brain Dump** | Capture ideas fast. Triage them later into real tasks. |

---

## FEATURES SECTION

**Section Header:**
Built for the agentic era. Not adapted for it.

### Your AI team, managed like a real team.
Five built-in agent roles — researcher, developer, marketer, business analyst, and you. Create unlimited custom agents with unique instructions. Assign a lead and collaborators to every task. Your agents pick up work, report to your inbox, and ask you when they need a decision.

### Autopilot mode. Your agents work while you sleep.
The autonomous daemon runs in the background — polling tasks, spawning Claude Code sessions on a schedule, handling retries and concurrency. Toggle Autopilot from the sidebar and monitor everything on the live /daemon dashboard. Daily standup at 8am. Weekly review on Monday. You set it and walk away.

### Token-efficient by design. Not by accident.
Your agents checking status on Linear: ~5,000 tokens. On Mission Control: ~50 tokens. That's a **92% reduction** in context costs. Filtered queries, sparse field selection, and pagination across all 9 API endpoints. Because token costs are real money — and your agents shouldn't burn it just to read their task list.

### Skills Library. Teach your agents once.
Create reusable knowledge modules and inject them into any agent's prompt. Bidirectional sync keeps skills and commands up to date automatically. Build institutional knowledge that compounds across every session.

### Inbox & Decisions. The human-in-the-loop layer.
Agents delegate, report, ask questions, and request approvals — through a structured JSON protocol. You see everything in one inbox. Answer a decision, and the unblocked agent picks up where it left off. You're the boss, not the bottleneck.

### Cmd+K search. Find anything instantly.
Global search across tasks, projects, goals, and brain dump entries. One keystroke. Zero friction.

---

## CREDIBILITY SECTION

**Section Header:**
This is not a weekend project.

- **168 automated tests** including 42 daemon-specific tests for scheduling, concurrency, retry, and security
- **CI pipeline** — typecheck, lint, build, and full test suite on every push and PR
- **Error boundaries** on every page with retry + global crash recovery
- **API pagination** across all 9 GET endpoints with limit/offset and metadata
- **Security hardened** — credential scrubbing, prompt fencing, binary whitelist, safe environment isolation
- **Zod validation** on all API writes with mutex locking for concurrent agents
- **ARIA accessibility** — live regions for drag-and-drop, focus trapping, keyboard navigation

---

## LOCAL-FIRST SECTION

**Section Header:**
Your data stays on your machine. Period.

**Body:**
No cloud. No API keys. No vendor lock-in. No account to create.

Mission Control stores everything in plain JSON files on your local filesystem. It works with any AI agent that can read files — Claude Code, Cursor, Windsurf, or a custom script. Clone the repo, run `pnpm install && pnpm dev`, and you're operational in under 2 minutes.

**MIT licensed.** Free forever. Fork it, modify it, ship it.

---

## SOCIAL PROOF / MARKET CONTEXT SECTION

**Section Header:**
The management layer the agentic era has been waiting for.

**Body:**
- AI assistant market: **$3.35B** and growing 15% annually
- **81% of developers** are concerned about AI privacy — local-first matters
- **38% of organizations** use human-in-the-loop as their primary AI management approach
- Existing local AI tools (Open WebUI, AnythingLLM) are **chat interfaces** — not agent management
- No dominant tool combines local-first + human oversight + task management + agent communication

Mission Control fills the gap.

---

## COMPARISON SECTION

**Section Header:**
Why not just use Linear? Or Notion? Or Asana?

| | Mission Control | Linear / Asana | Notion | Raw JSON files |
|---|---|---|---|---|
| Agent-readable API | 50 tokens | 5,000+ tokens | No API for agents | Entire file (bloated) |
| Built-in agent roles | 5 + custom | None | None | None |
| Autonomous daemon | Yes | No | No | No |
| Local-first | Yes | Cloud-only | Cloud-only | Yes |
| Eisenhower Matrix | Built-in | No | Manual template | No |
| Human-in-the-loop protocol | Inbox + Decisions | No | No | No |
| Price | Free (MIT) | $8-16/user/mo | $8-10/user/mo | Free |

---

## TECH STACK SECTION

**Section Header:**
For developers, by a developer.

**Body:**
Next.js 15 App Router. TypeScript strict. Tailwind CSS v4. shadcn/ui. Vitest. Local JSON storage with mutex-locked API routes. No external databases. No Docker. No environment variables. Clone and go.

---

## CTA SECTION

**Primary CTA:**
**Stop managing tasks. Start managing agents.**

[Star on GitHub] [Read the Docs] [Join Discord]

**Secondary CTA (below fold):**
Open-source. Local-first. 168 tests. Zero excuses.
Get Mission Control →

---

## ALTERNATIVE HEADLINES (for A/B testing)

1. **"Your AI agents have a boss now."** — Best for: first impressions, social media
2. **"The command center for one-person companies."** — Best for: broader audience, Product Hunt
3. **"Stop managing tasks. Start managing agents."** — Best for: category-reframing
4. **"168 tests. 5 agents. Autonomous daemon. Zero cloud dependency."** — Best for: Hacker News, dev credibility
5. **"Open-source task management for the agentic era."** — Best for: SEO, long-term positioning
6. **"Your AI team is running. Who's managing it?"** — Best for: problem-aware audience

---

## SEO META

**Title tag:** Mission Control — Open-Source AI Agent Task Management
**Meta description:** The open-source command center for managing AI coding agents. Eisenhower matrix, Kanban, agent delegation, autonomous daemon, 168 tests. Local-first, MIT licensed.
**Primary keywords:** AI agent task management, open source task manager, AI agent orchestration, local-first productivity
**Secondary keywords:** Eisenhower matrix app, Claude Code task management, AI agent dashboard, solo founder tools

---

*Notes for implementation:*
- Each section should have a supporting screenshot or GIF
- Hero section needs a product screenshot showing the dashboard with real data
- Feature sections benefit from short animated demos (Autopilot toggle, Cmd+K search, agent inbox)
- Comparison table is a strong conversion element — make it visually prominent
- The "168 tests" and "92% token savings" numbers should be rendered as large callout stats
- Consider a "How it works" 3-step section: 1. Create a task → 2. Agent picks it up → 3. Get a report in your inbox
