# T089 — Calm-dark redesign: app shell + Now/Next home

User decision (2026-06-10): the calm-minimal direction's vibe — generous space,
soft contrast, hairlines over boxes, one accent — but on a warm dark palette
("dark paper", not blue-black). Home screen = Now + Next focus.

## Design tokens (globals.css custom properties)
- bg #161410 · surface #1D1A15 · raised #24201A
- ink #ECE7DC · muted #A39C8C · faint #6B6557
- hairline rgba(236,231,220,0.08)
- accent terracotta #E0683A (+ soft rgba(224,104,58,0.15)) — used sparingly:
  Now card emphasis, primary action, streaks. Everything else neutral.
- type: 15-16px base, weights 400/500 only, headings 500, line-height 1.5+
- radius 12-16, pill buttons, no heavy borders, elevation via surface steps

## Layout
- Left nav rail (~210px): Today / Tasks / Folders / AI activity / Preferences.
  Views render in the main column (no more slide-over for these).
- Main column (max ~760px): Today home =
  1. header: date (large), capacity left, committed-at (T090 later), Replan + Review
  2. NOW card: current plan item (by clock) — title, folder, time left,
     progress, Done / Defer / Details
  3. NEXT: following 3 planned items as clean rows
  4. LATER: collapsed rest-of-day + the full drag timeline inside a
     collapsible section (all T081 behavior preserved)
  5. docked capture input; AI session/chat as a summonable drawer
     (must surface itself when a clarification is pending)
- Task detail + folder block drawers stay as right slide-overs, restyled.

## Constraints
Zero behavior change to mutations/flows; tsc + vitest green; all existing
functionality reachable.
