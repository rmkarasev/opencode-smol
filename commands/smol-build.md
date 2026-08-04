---
description: Implement atomic task from .smol/plans/, using strict TDD
agent: coder
---

## Steps:
1. Locate the latest plan file under `.smol/plans/` (most recent date wins).
2. Pick the first `- [ ]` atomic task from checklist and the task desciption.
3. Implement task using strict RED → GREEN TDD.
4. Mark the task `- [x]` in the plan file.
5. Report which task ran, files changed, test result.

If no plan exists or it's ambiguous which plan/task to implement, tell the user and stop.

Optional task hint: $ARGUMENTS
