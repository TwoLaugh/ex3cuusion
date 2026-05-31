# T056: Project Block Drawer

Status: implemented.

## Goal

Make project blocks behave like focused work sessions with individual selected subtasks, not checklist-less blocks.

## Scope

- Add a drawer/detail view for project blocks.
- Show selected subtasks, project backlog, notes, and block rationale.
- Allow completing individual selected subtasks.
- Allow swapping, adding, and removing selected subtasks.
- Keep block completion distinct from child task completion.

## Acceptance Criteria

- Opening a project block shows the exact selected child tasks.
- Completing a child task updates the underlying task and the block progress.
- Misclick recovery remains possible.
- The planner can regenerate or refine selected subtasks.

## Implementation Notes

- Project blocks now open a drawer with rationale, block progress, selected subtasks, and project backlog.
- Selected subtasks can be completed and undone individually without completing the whole block.
- Selected subtasks can be removed, added back from backlog, or regenerated to planner defaults.
- Block-level completion is stored separately from child task completion.
- Manual block selections persist through AppState and the normalized Postgres repository.
