# T064: Backlog Grooming Actions

Status: implemented.

## Implementation

- New `update_task` action (schema enum + `dateIntent` field added to the action schema). It
  changes an existing task's priority/importance/urgency and/or moves it between today,
  tomorrow, this_week, next_week, someday, specific_date, deadline (`unchanged` leaves dates
  alone). `applyTaskDateIntent` (state.ts) maps the intent onto scheduledDate/dueDate/pressure
  and the task's DateIntent. Promote = schedule_task (existing); split = create_project +
  create_task per step + archive_task (reuses T062 grouping); reprioritize/demote = update_task.
- Validation requires a real targetTaskId; auto-applies (undoable via T061).
- Prompt guidance for grooming + split added.
- Verified: unit test (demote-to-someday + reprioritize) and live `backlog-demote` scenario
  3/3; full dev set 11/11. tsc + 47 unit tests green.
- Side finding: the `recurring-habit` scenario was flawed (asked for a habit already in seed, so
  the model correctly deduped) — fixed the scenario, not the model.

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
