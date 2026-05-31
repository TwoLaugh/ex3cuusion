# T057: Daily Review And Planner Calibration

Status: implemented.

## Goal

Close the execution loop so completion, partial completion, deferrals, blockers, and overplanning improve future plans.

## Scope

- Add a daily review surface.
- Summarize completed, partially completed, deferred, blocked, and skipped work.
- Capture review notes without turning the product into a journal.
- Update planner assumptions from recent execution events.
- Reduce future load after repeated overplanning or low-energy deferrals.

## Acceptance Criteria

- The user can review a day and confirm what should affect future planning.
- Planner output changes after meaningful deferral/completion patterns.
- Tests cover capacity reduction, vague-task penalty, blocked-task pruning, and estimate calibration.

## Implementation Notes

- Added a compact Daily review dialog on Today with completion, partial, deferred, blocked, and skipped summaries.
- Reviews store energy, plan-fit, optional short planning note, and whether the review should tune future plans.
- Planner capacity now reads daily review calibration alongside deferral history.
- Planner scoring penalizes repeatedly vague tasks and lightly accounts for low-energy patterns.
- Future estimates can calibrate from actual completion minutes.
- Daily reviews persist through AppState and the Postgres snapshot projection.
