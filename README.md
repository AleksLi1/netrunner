# Netrunner

A [Claude Code](https://claude.ai/code) skill that transforms vague queries into precise, constraint-aware questions — collapsing the LLM solution space to the right answer before generating one.

---

## The problem

LLMs have latent knowledge that is frame-dependent. The same question asked from different angles activates entirely different knowledge. A query like *"make this better"* or *"do a deep dive"* produces a probability distribution over answers weighted toward generic responses — because nothing has ruled out the wrong ones.

The solution isn't better prompts. It's **surfacing binding constraints before answering**:
- What's the concrete failure mode? (not "it's not working" — actual numbers)
- What can't change? (architecture locked, retraining too expensive, must be causal-only)
- What's already been tried? (don't suggest what's been ruled out)

Once these are known, the solution space collapses from "all of ML / all of software engineering" to a small, targeted set.

Netrunner automates this process for any project.

---

## How it works

```
/nr <query>
      │
      ▼
 Load .claude/netrunner/context.md
 (project constraints, current state, what's been tried)
      │
      ▼
 Classify query type
 (training / evaluation / architecture / debugging / research / ...)
      │
      ▼
 Ask 2–3 targeted UI questions
 (options generated from context.md — specific, not generic)
      │
      ▼
 Produce structured response:
   • Active Constraint Frame (reframed query + active constraints)
   • Current State Analysis (why the problem exists)
   • 2–3 Avenues (mechanism / expected gain / risk / effort)
   • Recommendation
      │
      ▼
 Update context.md with new knowledge
```

The context file is a living knowledge base — it gets updated after every session that surfaces new information. Over time, each session starts closer to the right answer.

---

## Installation

**macOS / Linux:**
```bash
curl -sL https://raw.githubusercontent.com/your-username/netrunner/main/install.sh | bash
```

Or manually:
```bash
mkdir -p ~/.claude/commands
cp nr.md ~/.claude/commands/nr.md
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/your-username/netrunner/main/install.ps1 | iex
```

Or manually:
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude\commands" | Out-Null
Copy-Item nr.md "$env:USERPROFILE\.claude\commands\nr.md"
```

---

## Usage

### Initialise a project

Run once per project to build the context file from your repo:

```
/nr init
```

This reads your README, CLAUDE.md, git history, and key source files to extract:
- Project goal
- Current metrics and targets
- Architecture summary
- Hard constraints
- What's been tried (including reverted/removed approaches)
- Open questions

Output: `.claude/netrunner/context.md` in your project root.

### Ask a question

```
/nr <your query>
```

Examples:
```
/nr make this better
/nr why is my accuracy stuck at 55%
/nr i need you to do a deep dive and figure this out
/nr improve throughput
```

Netrunner will ask 2–3 UI questions (failure mode, binding constraint, classification-specific), then produce a structured response with avenues to explore.

### Bypass permissions mode

If you're running Claude Code with `--dangerously-skip-permissions`, UI question cards are suppressed. Netrunner will output the questions as plain text and stop — requiring you to re-run with answers:

```
/nr improve accuracy -- Q1: hit rate stuck at 55% | Q2: no retraining | Q3: high_hit first
```

For the best experience, use **default** or **acceptEdits** permissions mode with `/nr`.

---

## Context files

Each project gets its own context file at `.claude/netrunner/context.md`. The file tracks:

| Section | Purpose |
|---------|---------|
| **Project Goal** | What you're actually trying to achieve |
| **Current State** | Metrics, architecture, active work |
| **Hard Constraints** | What can't change and why |
| **What Has Been Tried** | Approaches with outcomes — prevents re-suggestion |
| **Open Questions** | Active frontiers and hypotheses |
| **Update Log** | Timestamped record of changes |

The file is updated automatically at the end of sessions that surface new knowledge. You can also edit it manually.

See [`context-template.md`](./context-template.md) for the full template, and [`examples/`](./examples/) for real-world examples.

---

## Query classification

Netrunner classifies queries into one of:

| Type | Triggers |
|------|---------|
| `TRAINING` | loss, convergence, epochs, hyperparameters, learning rate |
| `EVALUATION` | metrics, backtesting, validation, numbers |
| `FEATURE_ENGINEERING` | new or modified features, normalisation |
| `ARCHITECTURE` | model structure, components, design decisions |
| `DEBUGGING` | broken behaviour, unexpected numbers, regressions |
| `RESEARCH` | "what if", new approaches, exploring ideas |
| `TOOLING` | dev tooling, scripts, workflow, performance |

Classification determines which third question is asked and what expert frame is activated in the response.

---

## Why this works

> *"I don't have a single right answer waiting to be unlocked. I have a probability distribution over answers, shaped by context. Better context shifts that distribution toward higher-quality responses."*

The constraint frame does three things:
1. **Rules out already-tried approaches** — eliminates suggestions the project has already exhausted
2. **Activates the right domain knowledge** — "causal features only + financial regulations + regime change" is a very different activation than "improve model"
3. **Makes failure modes concrete** — "high_hit stuck at 55%" is more specific than "not working well enough"

---

## License

MIT
