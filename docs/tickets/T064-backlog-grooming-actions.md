# T064: Backlog Grooming Actions

Status: planned.

## Goal

Let the AI actively groom the general task backlog, not just hold undated tasks.

## Scope

- New AI write operation(s) to:
  - promote a backlog item into this week / today, or demote a dated task back to backlog/someday;
  - split a large/vague backlog item into concrete subtasks under a project (work block);
  - reprioritize items in bulk;
  - surface "ready to schedule" items (clear next action, fits upcoming capacity).
- Auto-apply with undo (each grooming op is one reversible changeset, T061).

## Acceptance Criteria

- "Split 'redo onboarding' into steps" creates concrete subtasks under a project.
- "What's ready to pull from my backlog?" surfaces actionable items.
- "Push these three down, they're not urgent" demotes them.
- Each op is a single undo (T061).
- Rubric scenarios added to the quality harness (T067).

## Implementation Notes

- Depends on T061 (undo). Pairs with T063 (week planning) — promotion feeds the week.
- Model-owned decisions; no phrase-specific branching (AGENTS.md).
