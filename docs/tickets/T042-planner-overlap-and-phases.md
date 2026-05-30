# T042: Planner Overlap And Phases

Status: implemented in V1 foundation.

## Goal

Make Today planning treat passive/background/concurrent work differently from exclusive blocks.

## Scope

- Give passive work visible clock duration without full attention cost.
- Allow compatible concurrent tasks to share time.
- Surface phased work as phased plan items with a clear rationale.

## Acceptance Criteria

- Passive background items can overlap with normal work.
- Concurrent partial-attention items use reduced blocking capacity.
- Planner tests cover laundry/background and concurrent side-work behavior.
