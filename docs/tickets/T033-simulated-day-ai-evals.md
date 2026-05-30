# T033: Simulated Day AI Evals

## Goal

Evaluate AI behavior across a changing day, not just isolated inbox strings.

The runner should move system time, submit realistic interruptions, record done/not-done outcomes, and inspect whether the plan remains coherent.

## Scope

- Morning, midday, afternoon, evening, and late-night steps.
- Inputs that include interruption, fatigue, changed priorities, partial progress, blocked/waiting work, and hard sleep anchors.
- Assertions over final tasks, execution events, capture sessions, and visible Today plan.

## Acceptance Criteria

- Late-day inputs do not create impossible plans.
- Hard anchors override flexible work.
- Urgent interruptions can bump lower-priority work.
- Partial progress records an event without completing the task.
- Tired/low-energy inputs reduce or defer work where possible.
- Blocked/waiting work exits normal planning flow.
