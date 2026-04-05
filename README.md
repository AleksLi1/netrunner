# Netrunner

**Tell Claude Code what to build. Walk away. Come back to working code.**

Netrunner is a skill for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that turns it into an autonomous software engineer. It scopes projects, creates phased roadmaps, spawns specialized agents, executes plans, verifies results, debugs failures, and learns from every action through a persistent brain.

```
/nr:run "build a REST API with JWT auth, rate limiting, and PostgreSQL"
```

That's it. Netrunner handles the rest.

---

## Install

```bash
npm install -g netrunner-cc
```

Verify it works:
```
/nr:run "hello"
```

<details>
<summary>Manual install (without npm)</summary>

```bash
git clone https://github.com/netrunner-cc/netrunner.git
cd netrunner
bash install.sh          # macOS/Linux
powershell -File install.ps1  # Windows
```
</details>

---

## Three commands. That's all.

### `/nr:run` — The engine

Autonomous execution. Describe what you want, Netrunner figures out the how.

```bash
/nr:run "build a real-time chat app"     # New project from scratch
/nr:run                                   # Resume exactly where you left off
/nr:run "add dark mode"                   # Extend an existing project
/nr:run "fix the login bug"              # Debug with full project context
/nr:run overnight                         # 8-hour autonomous session
```

**What happens under the hood:**

```
Your description
  → SCOPE (classify, ask 2-3 questions, create roadmap)
  → PLAN (constraint-aware, builds on prior phases)
  → EXECUTE (parallel agents, atomic commits)
  → VERIFY (success criteria, integration tests)
  → TRANSITION (brain learns, next phase)
  → ... repeats until done
```

Every action is preceded by a brain assessment that checks constraints, avoids repeated failures, and stays aligned with the project hypothesis.

### `/nr` — The expert

Diagnostic Q&A. Ask anything about your project — Netrunner loads your project's full context before answering.

```bash
/nr why is my test coverage dropping
/nr what's the highest-leverage thing to do next
/nr explain how the auth middleware works
```

It classifies your query, activates a domain-specific expert persona, and produces constraint-aware answers that never repeat failed approaches.

### `/nr:update` — Self-update

```bash
/nr:update
```

---

## The brain

Every project gets a `.planning/` directory with a **brain** (`CONTEXT.md`) that persists across sessions:

- **Hard constraints** — what can't change
- **What's been tried** — approaches with outcomes (never re-suggested)
- **Diagnostic hypothesis** — the brain's current understanding of the project state
- **Decision log** — every significant decision with reasoning

The brain is consulted before every action. It gets smarter with every session.

---

## 9 specialized agents

| Agent | Role |
|-------|------|
| **Planner** | Creates executable plans with dependency graphs and constraint frames |
| **Executor** | Implements tasks with atomic commits and deviation tracking |
| **Verifier** | Checks results against success criteria, constraints, and hypothesis |
| **Researcher** | Investigates unknowns, fills knowledge gaps |
| **Synthesizer** | Distills research into actionable findings |
| **Debugger** | Scientific method: hypothesize, test, narrow, fix |
| **Mapper** | Analyzes codebase architecture and patterns |
| **Roadmapper** | Creates phased execution plans from requirements |
| **Quant Auditor** | Scans trading code for temporal contamination and anti-patterns |

Agents run in parallel when tasks are independent. A 5-task phase can dispatch 5 executors simultaneously.

---

## 8 domain specializations

Netrunner detects your project's domain and activates a specialized expert persona — with domain-specific reasoning triggers, code pattern libraries, and quality gates.

| Domain | Persona |
|--------|---------|
| **Quantitative Finance** | Head of quant research. Every result is an artifact until proven otherwise. |
| **Web / Frontend** | Senior frontend architect. Performance is measured, not assumed. |
| **API / Backend** | Senior backend architect. Contracts are sacred. |
| **Systems / Infra** | Senior SRE. Everything fails — how gracefully? |
| **Mobile** | Senior mobile architect. Offline is the default state. |
| **Desktop** | Senior desktop architect. Memory is finite. |
| **Data Analysis** | Senior data scientist. Correlation is not causation. |
| **Data Engineering** | Senior data platform engineer. Idempotency is non-negotiable. |

Each domain includes: expert reasoning file, 10+ correct/incorrect code pattern pairs, 800+ line deep reference, build workflow with quality gates, and example interactions.

---

## Extended sessions

For big projects, let Netrunner run for hours:

```bash
/nr:run overnight              # 8 hours
/nr:run for 3 hours            # Custom duration
/nr:run extended               # 4 hours
```

Extended sessions:
- Suppress confirmation prompts (autonomous decisions logged)
- Increase cycle cap from 50 to 500
- When planned work finishes early, proactively improve test coverage, code quality, docs, and performance
- Gracefully wind down when time expires — no broken state

---

## Crash recovery

State is written to disk after every cycle. If Claude Code crashes mid-session:

```bash
/nr:run    # Picks up exactly where it left off
```

---

## Project artifacts

```
.planning/
├── PROJECT.md          # Identity and classification
├── ROADMAP.md          # Phased execution plan
├── REQUIREMENTS.md     # Tracked requirements
├── CONTEXT.md          # Brain (constraints, history, hypothesis)
├── STATE.md            # Current position + crash recovery
└── phases/
    └── 01-setup/
        ├── 01-01-PLAN.md
        ├── 01-01-SUMMARY.md
        └── VERIFICATION.md
```

---

## License

MIT
