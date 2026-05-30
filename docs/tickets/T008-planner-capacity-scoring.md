# T008: Implement Planner Capacity And Scoring

## Goal

Build deterministic planner primitives for capacity estimation and candidate scoring.

## Scope

- capacity estimator
- routine expansion for target date
- candidate builder
- scoring function
- debug output

## Requirements

- Use recent completion and deferral history.
- Penalize blocked, vague, over-deferred, and energy-mismatched tasks.
- Boost due, scheduled, strict, important, neglected-domain, and momentum-preserving work.
- Version the scoring weights.

## Acceptance

- Unit tests cover low-energy day, overload history, overdue task, neglected domain, and blocked task.
- Debug output explains top score components and penalties.
- No AI call is required for scoring.

