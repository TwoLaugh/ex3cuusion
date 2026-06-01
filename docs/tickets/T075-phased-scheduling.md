# T075: Phased Multi-Step Scheduling

Status: implemented (default-template phases).

Reintroduces (model-owned + manual) the phased mode removed during the de-overfit.

## Implementation

- `schedulingForMode` now supports `phased`, deriving a default 3-phase template from the task's
  effort (active start ~20% / passive middle that can overlap / active finish ~20%). Added
  `phased` to the action-schema enum, the manual mutation type, the editor overlap select, and a
  prompt note (laundry / dishwasher / long-bake style).
- The planner already expands a phased task into per-phase plan items (passive phase overlaps),
  so no planner change was needed.
- Decision taken: default template (not user-defined phases) to start.
- Verified: unit test (phased → 3 phases active/passive/return → planner emits phase items with an
  overlappable passive phase). tsc + 55 unit tests green.

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
