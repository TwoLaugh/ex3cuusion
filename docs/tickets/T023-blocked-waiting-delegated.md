# T023: Blocked, Waiting, And Delegated Work

## Goal

Represent tasks that cannot currently move forward without pretending they are actionable.

Blocked and waiting tasks should remain visible in the system, but Today should show the unblock/follow-up action rather than scheduling impossible work.

## Concepts

Blocked by:

- person
- decision
- missing info
- materials
- money
- date
- external event
- emotional resistance

Waiting on:

- person or organization
- requested date
- expected response date
- follow-up cadence
- context/link/thread note

Delegated:

- outcome owner
- next-action owner
- check-in date
- monitoring responsibility

## Planner Rules

- Do not plan blocked work as normal executable work.
- If an unblock action exists, plan the unblock action.
- If a follow-up date is due, plan the follow-up.
- Keep blocked/waiting items visible in debug/admin/review surfaces.

## Acceptance Criteria

- Task model supports blocked, waiting, and delegated metadata.
- Planner excludes blocked tasks unless there is an actionable unblock/follow-up.
- Not Done reason flow can create blocked/waiting state.
- Tests cover blocked-by-person, blocked-by-decision, waiting follow-up, and delegated monitoring.

## Non-Goals

- sending messages automatically
- external calendar/email integrations
- multi-user assignment
