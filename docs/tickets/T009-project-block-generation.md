# T009: Generate Project Blocks

## Goal

Create planner support for project blocks with selected subtasks.

## Scope

- project candidate selection
- subtask selection
- block duration assignment
- AI focus-line generation
- project drawer read data

## Requirements

- Select 1-4 clear, unblocked subtasks that fit the block.
- Avoid vague project tasks unless creating a split/clarify proposal.
- Store selected subtask IDs on `plan_items`.
- Ask AI only for short focus text/rationale after deterministic selection.

## Acceptance

- A project with clear tasks produces a block and selected subtasks.
- A project with only vague tasks produces a split proposal or soft invitation.
- Project drawer shows selected subtasks and backlog separately.

