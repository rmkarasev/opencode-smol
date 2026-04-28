---
description: Multi-lens review of recent changes (correctness + security + minimalism in parallel)
agent: conductor
---

Dispatch three `reviewer` subagents **in parallel** (one assistant message,
three `task` calls), each with a distinct lens:
- `Lens: correctness`
- `Lens: security`
- `Lens: minimalism`

Then synthesize: merge overlapping issues, keep the highest severity per
issue, emit a single combined report in the reviewer's standard format.
Final verdict is `needs changes` if any lens reports `[C]` or unjustified `[I]`.

Scope hint: $ARGUMENTS
