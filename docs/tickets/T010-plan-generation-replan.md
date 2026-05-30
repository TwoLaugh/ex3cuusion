# T010: Implement Today Plan Generation And Replan

## Goal

Generate and regenerate Today plans using planner primitives.

## Scope

- `POST /plans/today/generate`
- `POST /plans/today/replan`
- persistence of day plan and plan items
- overload pruning
- AI summary/rationale

## Requirements

- Preserve strict routines and due-today commitments where possible.
- Prune soft invitations first when overloaded.
- Replan requires confirmation for major current-day replacement.
- Persist generation in one transaction.

## Acceptance

- Empty Today can generate a realistic plan.
- Over-capacity inputs produce pruned or overloaded plan with warning.
- Replan keeps completed items intact and updates remaining items.

