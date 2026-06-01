# T067: Week & Backlog Quality Evals (Confidence Track)

Status: planned (continuous).

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
