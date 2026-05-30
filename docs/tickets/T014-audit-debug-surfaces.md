# T014: Add Audit And Planner Debug Surfaces

## Goal

Provide secondary debugging/trust screens behind the burger menu.

## Scope

- AI Activity screen
- Planner debug endpoint
- Planner debug screen or developer-only panel

## Requirements

- AI Activity shows action type, status, risk, validation errors, and applied refs.
- Planner debug shows capacity, candidate scores, pruning decisions, and selected project subtasks.
- These surfaces stay secondary and do not clutter Today.

## Acceptance

- Developer can explain why an item appeared or was pruned.
- User can inspect AI-applied changes and rejected proposals.

