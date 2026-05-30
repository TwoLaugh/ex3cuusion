# T019: Minimal UI For Rich Internal Structure

## Goal

Keep the app simple for the user while allowing the backend model to become much richer.

The user should not manage a database. The AI and planner should maintain structure behind a small set of human-friendly controls.

## User-Facing Controls

Primary:

- capture messy input
- answer clarification
- complete task
- defer with reason
- reject suggestion/proposal
- refine task/container

Secondary:

- inspect task details
- adjust estimate
- change repeat behavior
- archive
- split vague work

## Design Rules

- Hide advanced metadata by default.
- Show AI confidence/uncertainty only when it affects a decision.
- Use labels like "repeats", "suggest again", "one-off", and "soft idea" rather than database terms.
- Avoid turning task creation into a long form.
- Let power-editing live behind detail drawers or admin screens.

## Acceptance Criteria

- Today remains focused on execution, not metadata.
- Task/container detail views expose advanced structure progressively.
- AI-created fields can be reviewed without making the main flow busy.
- Repeatable suggestions and repeating tasks are understandable in plain language.
- Component/E2E tests cover the minimal path and the detail-edit path.

## Non-Goals

- visual redesign
- mobile launcher UI
- analytics dashboards
