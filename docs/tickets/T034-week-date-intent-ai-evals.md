# T034: Week And Date-Intent AI Evals

## Goal

Evaluate how the AI interprets today, tomorrow, this week, next week, this Tuesday, next Tuesday, by Tuesday, and mixed-date messages.

The current app is day-plan-first, so these evals should expose where a week/date-intent model is needed.

## Scope

- Run date-sensitive strings from several simulated current dates.
- Compare `scheduledDate`, `dueDate`, recurrence, and plan visibility.
- Include mixed messages with one task for today and another task for next week.

## Acceptance Criteria

- "today" appears in Today.
- "tomorrow" does not pollute Today.
- "by Tuesday" is treated as a deadline, not necessarily a scheduled Tuesday task.
- "on Tuesday" is treated as a scheduled/intended date.
- "sometime next week" does not become a fake exact date without a deliberate rule or clarification.
- Mixed messages split into separate actions.
