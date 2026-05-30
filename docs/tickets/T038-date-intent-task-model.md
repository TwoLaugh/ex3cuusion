# T038: Date Intent Task Model

Status: implemented in V1 foundation.

## Goal

Represent what the user meant by time wording separately from exact scheduling fields.

## Scope

- Add a `dateIntent` object to tasks.
- Distinguish today, tomorrow, exact scheduled dates, deadlines, week windows, someday, and recurring intent.
- Preserve the source wording and confidence where useful.
- Keep `scheduledDate` and `dueDate` for exact planner behavior only.

## Acceptance Criteria

- Done: "today" tasks carry today intent.
- Done: "by Tuesday" tasks carry deadline intent.
- Done: "on Tuesday" tasks carry specific-date intent.
- Done: "sometime next week" tasks carry week-window intent without inventing an exact date.
- Done: debug output exposes `dateIntent`.

## Implementation Notes

- `Task.dateIntent` stores the interpreted timing intent separately from exact `dueDate` and `scheduledDate`.
- AI capture derives intent from model output plus the relevant chunk of source text.
- Unit and fixture eval coverage lives in `src/lib/ai-actions.test.ts` and `scripts/run-ai-evals.mjs`.
