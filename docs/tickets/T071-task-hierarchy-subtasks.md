# T071: Task Hierarchy (Subtasks)

Status: planned.

## Goal

Support parent/child task hierarchy so users (and the AI) can nest subtasks under a task — not
only tasks under a project.

## Current state

`Task.parentTaskId` exists in the type but is unused. Grouping (T062) only does project → task.
There is no way to make one task a subtask of another, in the backend or the UI.

## Scope

- Backend: structure mutation to set/clear `parentTaskId` and to create a subtask under a parent;
  guard against cycles and cross-project mismatches.
- Rollups: a parent with subtasks should roll up effort and completion sensibly (e.g. parent is
  done when its subtasks are done / shows aggregate effort); planner and week-plan must treat
  subtasks without double-counting or breaking.
- UI: add/list/reorder subtasks under a task; move a task in/out of a parent; show nesting in the
  Tasks view and the project drawer.
- AI: allow the model to create subtasks (extend the split flow to nest under a parent task, not
  only a project), but keep it model-owned.

## Acceptance Criteria

- A user can create a subtask under a task, move tasks in/out of a parent, and see the hierarchy.
- Planner/rollups handle parents-with-subtasks without breaking or double-counting.

## Open decision

Depth: single level (task → subtasks) first, or arbitrary nesting? Recommend single level to start.
