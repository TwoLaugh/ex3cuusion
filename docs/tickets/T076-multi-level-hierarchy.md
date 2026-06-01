# T076: Multi-Level Task Hierarchy

Status: implemented.

## Implementation

- Relaxed the single-level guard in `resolveParentForChild`: any task may now be a parent
  (including subtasks), with `isDescendantOf` preventing cycles (a task can't be parented under
  its own descendant).
- Container behavior and the planner exclusion already work recursively (each node with active
  children is excluded; only leaves schedule — no double-counting). `childStats` rollup is now
  recursive (counts all descendants). UI parent selector allows any non-self, non-descendant task.
- Verified: unit test (A->B->C three levels; cycle A-under-C rejected; container exclusion at each
  level). tsc + 56 unit tests green.

Extends T071 (single level only).

## Goal

Allow subtasks to have their own subtasks (arbitrary depth), not just one level.

## Scope

- Relax the single-level guard in `resolveParentForChild` (keep cycle prevention).
- Make `hasActiveChildren` / container behavior and rollups recursive (aggregate effort and
  done-counts up the tree) without double-counting.
- UI: nested display and parent selection across levels.

## Acceptance Criteria

- A subtask can contain subtasks; rollups and the planner-container behavior work recursively;
  no cycles.

## Notes

Lower priority than single-level (T071 covers the common case). Needs care in planner/week-plan
to avoid double-counting across levels.
