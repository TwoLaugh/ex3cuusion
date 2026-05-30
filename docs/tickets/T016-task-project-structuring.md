# T016: Task And Project Structuring

## Goal

Settle the core work model before Postgres, deeper AI prompt work, or a major UI pass.

The task is the executable unit. Projects/categories/containers organize tasks. Today blocks present focused slices of a container, but users complete the individual tasks inside the block.

## Inputs

- `docs/product/task-project-structuring-todo.md`
- current `Task`, `Project`, `RoutineTemplate`, `PlanItem`, and planner implementation
- realistic scenarios from existing E2E tests

## Decisions To Make

- whether `Project` should become a general `Container`
- whether routines become tasks with `repeat_policy`
- how to represent repeatable suggestions that do not disappear after completion
- how block status derives from selected child tasks
- how to store estimated time, actual time, time windows, and confidence

## Acceptance Criteria

- Data model doc describes the chosen structure clearly.
- TypeScript domain types match the doc.
- Project/container blocks no longer imply task completion by default.
- Child tasks inside a block are the primary completion controls.
- Repeating tasks and repeatable suggestions have explicit completion behavior.
- Planner tests cover one-off tasks, repeating tasks, repeatable suggestions, and container blocks.
- AI schema TODOs are updated to match the chosen structure.

## Non-Goals

- multi-user auth
- full Postgres migration
- final UI polish
- launcher work
