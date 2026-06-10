# T092 — List-first Today: the List, the Tray, the Habit strip

Problem statement (user, 2026-06-11): "I want something that feels as natural
and easy as listing things in Google Keep — basic list, moving tasks around
manually, quickly typing to add — but that solves Keep's problems: recurring/
long-horizon tasks get missed, no capacity awareness (day too big/small), and
no built-in balance between productivity and self-care/nourishment."

Root insight: agency inversion. The system must stop AUTHORING the day
(generated schedule) and start ADVISING a hand-authored list.

## Decisions (user-confirmed)
- Due recurring tasks AUTO-ADD to the list each morning, clearly marked,
  one-click remove to tray.
- Time: pinned times only (sort + display); capacity problem solved by the
  effort-sum gauge, not scheduling. Slim "now" emphasis on the top unticked
  item; big Now card removed; timeline demoted to a secondary view.
- Habit = explicit per-task flag (pre-flag the obvious micro-dailies).
- Unfinished list entries carry over to the next day's list, marked carried.

## Model
- Task.habit?: boolean (+ mutation/editor support).
- DayList { date; committedAt; entries: [{ taskId; order; pinnedTime?;
  source: "recurring"|"manual"|"tray"|"ai"|"carried" }] } in
  AppState.dayLists. This SUPERSEDES T090's committedPlans as the day's
  commitment (the commitment is now the user's list). Keep T090 principles:
  auto-build on first view of a date; new tasks never barge in; explicit,
  undoable mutations only.
- Morning build: due recurring non-habit tasks + tasks dated today +
  carried unfinished manual entries from the previous list.
- Habit strip: tasks with habit=true due today; tick = normal completion;
  streaks computed from completions (folds T091 in here).
- Tray: due-but-removed + deadline-near + top-scored backlog + soft
  suggestions, with balance-filler tagging (pillar missing from the list).
- Gauges: capacity = sum(list entry effort) vs calculateCapacity;
  balance = pillar mix of list+habits (top-ancestor folder), nudge line.

## Mutations / API (all undoable)
addToDayList, removeFromDayList (to tray), reorderDayList(orderedTaskIds),
pinDayListTime, tick (existing completion paths), instant inline add
(create task immediately + add to list; AI enrichment runs async and
toasts what it decided — never blocks the add).

## UI (Today view rebuild)
Header (date · committed · gauges) → habit chip strip → THE LIST (drag
reorder, tick, slim now-emphasis on top unticked, pinned times right-
aligned, inline type-to-add at bottom) → TRAY (grouped: due / balance /
backlog; one-tap add; "draft my day" = AI proposes list adds) →
timeline as a collapsed secondary section.
