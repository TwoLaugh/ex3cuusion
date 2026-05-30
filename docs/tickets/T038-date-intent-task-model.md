# T038: Date Intent Task Model

## Goal

Represent what the user meant by time wording separately from exact scheduling fields.

## Scope

- Add a `dateIntent` object to tasks.
- Distinguish today, tomorrow, exact scheduled dates, deadlines, week windows, someday, and recurring intent.
- Preserve the source wording and confidence where useful.
- Keep `scheduledDate` and `dueDate` for exact planner behavior only.

## Acceptance Criteria

- "today" tasks carry today intent.
- "by Tuesday" tasks carry deadline intent.
- "on Tuesday" tasks carry specific-date intent.
- "sometime next week" tasks carry week-window intent without inventing an exact date.
- Debug output exposes `dateIntent`.
