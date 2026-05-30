# LLD: Planner Engine

## Goal

Generate a realistic Today plan from routines, deadlines, projects, tasks, recent history, and capacity. The planner's main job is selection and pruning.

## Inputs

- user timezone and target date
- planning context
- active routine templates
- active/scheduled tasks
- active projects and project tasks
- domain weights and last planned dates
- completion events for the last 14 days
- deferral logs for the last 30 days
- fixed events when available
- optional user energy for the day

## Output

A `day_plan` plus ordered `plan_items` grouped into routines, main blocks, quick tasks, soft invitations, and later.

## Algorithm

1. Load inputs and normalize dates in the user's timezone.
2. Estimate capacity:
   - start with explicit `available_minutes` or planning-context default
   - subtract fixed events when available
   - reduce by 15-30% after poor completion or repeated overplanned deferrals
   - reduce high-energy selections when user energy is low
   - set load level: light, normal, heavy, overloaded
3. Expand due routines for the date.
4. Build task candidates from due tasks, scheduled tasks, unblocked project tasks, neglected-domain tasks, and low-cost atomic tasks.
5. Score candidates.
6. Place strict routines and fixed anchors first.
7. Select due/time-pressed tasks.
8. Create project block candidates from active projects.
9. Fill remaining capacity with quick tasks and maintenance.
10. Add soft invitations only when capacity remains.
11. Prune until estimated minutes fit available minutes.
12. Ask AI for terse rationale and project block focus text.
13. Validate all selected IDs and persist.

## Candidate Scoring

Base score is additive:

- due today: `+50`
- overdue: `+70`
- due within 3 days: `+30`
- scheduled today: `+35`
- strict routine: `+45`
- priority: `priority * 8`
- importance: `importance * 6`
- domain weight: `domain.weight * 10`
- neglected domain: `+10` to `+30`
- unlocks other tasks: `+15`
- recent momentum on same project: `+10`

Penalties:

- blocked: `-100`
- vague title without next action: `-30`
- effort unknown: `-10`
- high energy on low-energy day: `-25`
- repeated deferral for same reason: `-10` to `-30`
- same domain already dominates Today: `-15`

The exact weights can be tuned behind a planner version string.

## Project Block Generation

1. Find active, unblocked project tasks.
2. Drop vague tasks unless the block is explicitly "clarify/split project".
3. Score subtasks with the candidate scoring function.
4. Select subtasks that fit `project.default_block_minutes`.
5. Prefer 1-4 subtasks per block.
6. Generate block title: `{project.name} - {minutes}m`.
7. Ask AI for a short focus line only after deterministic subtask selection.

If a project has no clear next action, create a soft invitation or AI proposal to split the project rather than putting vague work on Today.

## Overload And Pruning

When estimated minutes exceed capacity:

1. Remove soft invitations.
2. Move flexible maintenance to later.
3. Shorten or remove lowest-scoring project block.
4. Defer low-urgency quick tasks.
5. Preserve strict routines and due-today commitments.

If overload remains, save the plan as `overloaded` and include overload minutes, items causing overload, and suggested cuts.

## Review Feedback

- `no_time` and `overplanned` deferrals lower future capacity.
- `low_energy` deferrals lower high-energy selection when energy is unknown.
- `too_vague` deferrals penalize similar tasks and trigger split proposals.
- consistently completed plans permit slightly heavier load.
- repeated `not_important` deferrals create archive/deprioritize proposals.

## Deterministic vs AI Responsibilities

Deterministic: recurrence expansion, capacity math, candidate scoring, pruning, selected IDs, conflict checks, and ownership validation.

AI: natural-language interpretation, terse plan rationale, project block focus text, task split proposals, and review interpretation.

AI output may influence scores only through validated structured fields, never by directly mutating records.

