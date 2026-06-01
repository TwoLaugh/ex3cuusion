# T080: Task Detail Drawer

Status: implemented.

## Implementation

- Today task cards now have a 'Details' button (project blocks keep 'Open'); it opens a task
  detail drawer showing time, effort, status, badges (date intent, energy, P/I/U, overlap mode,
  tags), subtask rollup, definition-of-done, notes, and Reschedule / Mark done actions. The
  existing project drawer is now scoped to blocks; a separate task drawer handles tasks.

## Goal

Replace the cramped inline `<details>` task editor with a proper detail drawer/panel showing all
fields, subtasks, history, and quick actions.
