# T062: Multi-Task Capture to Work-Block Grouping

Status: planned.

## Goal

When the user lists several related tasks at once, the AI groups them into a work block
(project/container) with the tasks nested inside, instead of creating flat, unrelated tasks.

## Scope

- Detect (model-side) when an inbox message contains multiple tasks that belong to one piece of
  work or one session, and group them: create or reuse a project/work-block and attach the
  tasks to it, optionally scheduling a block for the day or week.
- Emit this as a single grouped changeset (one undo reverts the whole grouping).
- Prompt the model to prefer grouping over flat tasks when items clearly share a goal/project;
  do NOT force grouping for unrelated errands.

## Acceptance Criteria

- "For the launch: write copy, design banner, schedule emails" produces one project/block with
  the three tasks nested, not three loose tasks.
- Unrelated multi-item input (e.g. "milk, bins, call dentist") stays as separate simple tasks.
- The grouping is one reversible changeset (T061).
- A rubric scenario for grouping is added to the quality harness (T067).

## Implementation Notes

- `create_project` and `create_task` (with `projectName`) already exist; this is mainly prompt
  guidance plus ensuring the grouped tasks attach to the new/edited project and (optionally) a
  block. Keep it model-owned — no phrase-specific branching (AGENTS.md).
- Auto-apply with undo (T061).
