# T075: Phased Multi-Step Scheduling

Status: planned.

Reintroduces (model-owned + manual) the phased mode removed during the de-overfit.

## Goal

Support multi-step tasks with active/passive/return phases (e.g. laundry: start -> running ->
fold), where the passive middle can overlap other work.

## Scope

- Add `phased` to the scheduling mode options (schema + manual editor + `schedulingForMode` needs
  phase data, so likely a small phases editor or sensible default phases).
- `SchedulingMetadata.phases` (TaskPhase[]) already exists in the type and the planner already
  has phase-aware cursor logic (`nextCursor`, phaseKind) — wire creation of phases.
- AI: allow the model to mark a task `phased` and (optionally) describe phases.

## Acceptance Criteria

- A phased task schedules its active start, allows overlap during the passive phase, and returns
  for the finish step, without breaking the planner.

## Open decision

Whether phases are user-defined or derived from a default 3-phase template for `phased` tasks.
