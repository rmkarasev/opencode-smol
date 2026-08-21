---
description: Implement atomic task from .smol/plans/, using TDD or MANUAL according to task tag
agent: coder
---

# Steps
1. Locate the latest plan file under `.smol/plans/` (most recent date/time wins).
2. Find the first `- [ ]` atomic task in the checklist. Read its full description.
3. Implement that task, use the tag `[TDD]` or `[MANUAL]` to determine the execution mode.
4. Mark the task `- [x]` in the plan file.
5. Report which task was implemented and confirm the plan was updated.

If no plan exists or no unchecked tasks remain, tell the user and stop.

Optional task hint: $ARGUMENTS
