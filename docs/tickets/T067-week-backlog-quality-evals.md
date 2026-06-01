# T067: Week & Backlog Quality Evals (Confidence Track)

Status: implemented (and continuous).

## Implementation

- Dev set (12) now covers: overlap split, multi-task grouping, week planning, backlog demote,
  mixed-altitude decomposition, deadline-not-schedule, reusable list, recurring habit, broad
  outcome, vague window, obvious simple, ambiguous blob.
- Held-out set (8) covers generalization for the new M6 behaviors (grouping, week planning,
  backlog demote) plus overlap, deadline, broad outcome, vague relationship, two-simple.
- Demonstrated the loop working: the held-out run caught a deadline-capture regression from
  prompt growth; it was fixed with a GENERAL principle tuned on the dev `deadline-not-schedule`
  scenario, and re-checking held-out confirmed the fix generalized (ho-hard-deadline 3/3) —
  without tuning to the held-out case.
- Final: dev 12/12 and held-out 8/8 met their pass-rate thresholds.

## Note

Continuous by design: every future behavior ticket adds its rubric scenarios. Keep the held-out
set sacred (never tune toward it).

## Goal

Give high confidence that the AI structures the day, week, and backlog well — by measuring it,
not guessing. Extends the quality harness (`scripts/run-ai-quality.mjs`) to the new altitudes.

## Scope

- Add rubric scenarios (dev + held-out) for:
  - time-awareness (plan reflects real current time);
  - multi-task grouping (T062);
  - week planning / rebalancing (T063);
  - backlog grooming (T064);
  - altitude selection (T065);
  - organizer maintenance (T066).
- Support multi-turn scenarios where needed (e.g. "plan my week" then "I'm behind, rebalance").
- Keep pass-rate thresholds per scenario; keep the held-out set sacred (AGENTS.md).

## Acceptance Criteria

- Each feature ticket (T062-T066) lands together with its rubric scenarios.
- `npm run eval:quality` exercises day/week/backlog behavior, not just single-message day cases.
- Held-out generalization is checked (`eval:quality:heldout`).

## Implementation Notes

- This is a continuous track, not a final step: every feature ticket adds its scenarios as it
  lands. This ticket is the umbrella that tracks coverage.
- Per AGENTS.md: tune toward pass-rate on realistic inputs; never tune toward the held-out set;
  do not chase single samples with phrase-specific hacks.
