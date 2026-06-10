# T093 — Intelligent tray (undated-task brain)

Accepted ideas 1-8 with constraints. All ranking lives server-side in
day-list tray building.

- Gap-aware suggestion: know minutes until the next pinned anchor; prefer
  tasks that fit the gap.
- Acceptance learning: tray add/ignore/eject adjusts per-task+folder
  propensity. FLOOR: never suppress to zero; every active task resurfaces
  at a minimum frequency (e.g. at least once per week in the tray).
- Aging -> question: after ~5 ignored surfacings, the AI asks once:
  someday / split / let go. Never silently drops.
- TMT scoring: rank = value x expectancy / delay-sensitivity; small clear
  tasks rise when recent behavior shows avoidance; big vague ones get
  split-suggestions.
- Energy + time-of-day matching from completion-time history.
- Spaced resurfacing for someday items (1w -> 2w -> 1m -> 3m).
- Calibrated capacity: gauges use actual-vs-estimate ratios per folder.
- Unblocker-first boost ("frees N tasks" tag).
