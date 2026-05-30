# T012: Apply Planner Calibration

## Goal

Use deferral logs, completion events, and daily reviews to improve future plans.

## Scope

- capacity adjustment rules
- vague-task penalty updates
- stale-task/prune proposal generation
- domain neglect recalculation

## Requirements

- Repeated `overplanned` or `no_time` lowers future load.
- Repeated `too_vague` triggers split proposals.
- Repeated `not_important` triggers deprioritize/archive proposals.
- Consistently completed plans can slightly increase allowed load.

## Acceptance

- Tests show future capacity changes after repeated overload deferrals.
- Vague tasks are less likely to appear on Today.
- Prune proposals require user confirmation.

