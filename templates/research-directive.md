# Research Directive

> This is the human-controlled "program.md" for Netrunner's auto-research loop.
> Edit this file to steer experiment direction. The agent modifies code; you modify this.

## Goal

[What are you trying to optimize? Be specific about the desired outcome.]

Example: "Minimize validation bits-per-byte on the FineWeb-Edu dataset by modifying the GPT training pipeline"
Example: "Maximize Sharpe ratio of the momentum strategy by improving feature engineering"
Example: "Reduce bundle size below 200KB while maintaining all current functionality"

## Eval

```
EVAL_CMD: [shell command that prints a single number to stdout]
EVAL_METRIC: [human-readable name for the metric]
EVAL_DIR: [lower_is_better | higher_is_better]
TIME_BUDGET: [minutes per experiment run, default: 5]
```

Example:
```
EVAL_CMD: python train.py --eval-only 2>&1 | grep "val_bpb" | awk '{print $NF}'
EVAL_METRIC: val_bpb
EVAL_DIR: lower_is_better
TIME_BUDGET: 5
```

## Scope

### Mutable (agent CAN modify these)

```
MUTABLE:
  - [file paths or glob patterns]
```

Example:
```
MUTABLE:
  - src/train.py
  - src/model.py
```

### Immutable (agent MUST NOT touch these)

```
IMMUTABLE:
  - [file paths or glob patterns]
```

Example:
```
IMMUTABLE:
  - src/data.py
  - src/eval.py
  - tests/**
  - configs/production.yaml
```

## Experiment Budget

```
MAX_EXPERIMENTS: [number, default: 50]
STRATEGY_SHIFT_THRESHOLD: [consecutive failures before shifting strategy, default: 10]
```

## Research Direction

[Optional: guide the agent's experiment strategy. What approaches are promising?
What has already been tried? What should be avoided?]

### Promising Directions
- [Direction 1: why you think it might help]
- [Direction 2: why you think it might help]

### Avoid
- [Approach to skip: why it won't work or has been tried]

### Domain Signals
[Optional: list domain keywords to activate expert persona]
- [signal1, signal2, signal3]

## Constraints

[Optional: hard constraints beyond the immutable scope]

- [Constraint 1: e.g., "Model must fit in 8GB VRAM"]
- [Constraint 2: e.g., "Training must complete within TIME_BUDGET"]
- [Constraint 3: e.g., "No external API calls during eval"]
