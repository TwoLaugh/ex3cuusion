# T036: AI Eval Reporting And Regression Thresholds

## Goal

Make AI eval results readable enough to guide prompt/backend changes.

The eval runner should be a product-design debugging tool, not just a pass/fail script.

## Scope

- Console summary grouped by static/day/week phases.
- Per-scenario failures with expected vs observed state.
- Optional JSON report artifact.
- Thresholds for live eval mode so known exploratory failures can be tracked without hiding regressions.

## Acceptance Criteria

- Fixture evals fail hard on any regression.
- Live evals print model name and semantic failures.
- Reports include action types, task titles, key task fields, pending questions, execution events, and plan visibility.
- No secrets are printed.
