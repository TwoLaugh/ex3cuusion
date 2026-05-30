# T037: Background, Phased, And Concurrent Work

## Goal

Represent work that does not fit a single neat time block.

Examples include laundry, cooking with passive wait time, travel plus phone/admin work, and AI-assisted side work that can run alongside a primary task.

## Product Model

Some work has phases:

- active setup
- passive/background wait
- follow-up action
- completion/cleanup

Some work can overlap:

- cooking while doing admin
- travelling while messaging or reading
- running an AI side task while doing focused work
- laundry drying while other work continues

## Suggested Fields

Tasks or generated plan items may need:

- `schedulingMode`: `exclusive | background | concurrent | phased`
- `attentionLoad`: `full | partial | passive`
- `canOverlap`: boolean
- `overlapKinds`: `travel | cooking | waiting | ai_running | household_machine`
- `phases`: active/passive/follow-up segments
- `followUpAfterMinutes`
- `requiresReturnBy`

## Planner Rules

- Exclusive tasks should not overlap.
- Passive/background phases can overlap with normal work.
- Partial-attention tasks can overlap only with compatible low-attention tasks.
- Follow-up phases should create later prompts or plan items.
- Completion should happen at the phase/task level, not just the parent label.

## Acceptance Criteria

- Laundry can be represented as load washer, wait, hang/dry, fold/put away.
- The planner can show passive wait time without blocking the whole day.
- Travel can allow compatible phone/admin tasks.
- AI-running side work can be tracked without pretending the user is actively working on it the whole time.
- Tests cover phased laundry, cooking plus admin, travel plus message, and AI background work.
