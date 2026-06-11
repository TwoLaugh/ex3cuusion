# T110 — Plan tomorrow (the evening ritual)

User (2026-06-11): "there needs to be a better way to plan the next day,
as ofc this is a normal thing to do at the end of a day — at the moment
there isn't really."

## Design
- Entry points: "Plan tomorrow" on the close-out card + in the Today
  overflow.
- Planning mode = the Today surface pointed at tomorrow: header
  "Planning <weekday d month>" + a clear back-to-today affordance.
  Same list interactions (reorder/remove/add-from-tray/inline capture/
  pins) — capture during planning lands on TOMORROW's list.
- Pre-seed: buildMorningList(state, tomorrow) = due recurring for
  tomorrow + live carryover preview of today's unfinished entries.
- Gauges for a future date use FULL-day capacity (baseline available
  minutes, no current-clock subtraction); tray computed for tomorrow
  (due/deadline-near/backlog/balance).
- Midnight reconcile: on first view of a date whose stored list was
  built earlier (planned ahead), RECONCILE not rebuild — keep authored
  order, drop entries completed late the prior evening, append newly
  unfinished carryovers and newly-due recurring not present.
- Because all variants render DayListView via the same contract,
  planning mode works in every skin automatically. Timer bar/close-out
  chrome hidden while planning.

## Engine
ensureDayList/date-aware mutations (add/remove/reorder/pin/capture take
a target date), renderDayList future-date gauges, reconcileDayList,
DayList.plannedAhead marker (or committedAt-before-date inference).

## Tests
plan-ahead build; tomorrow mutations isolated from today; reconcile
(order kept, late-completed dropped, new carryover appended); full
capacity gauges for future dates; capture-to-tomorrow.
