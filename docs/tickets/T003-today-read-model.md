# T003: Build Today Page Read Model

## Goal

Implement `GET /plans/today` and the web Today page.

## Scope

- Today header
- Routines section
- Main Blocks section
- Quick Tasks section
- Soft Invitations section
- Later / Deferred collapsed section
- Empty state with generate-plan and inbox entry points

## Requirements

- Today is the default and only main page.
- The page must not show full task/project backlogs.
- Plan items are grouped by `section` and ordered by `sort_order`.
- Project blocks show selected subtask count and open the project drawer.
- Bottom-right circular AI inbox button is visible even before AI behavior is complete.

## Acceptance

- Existing day plan renders correctly on desktop and mobile web.
- Missing plan shows `can_generate` empty state.
- Burger menu is present for secondary pages.

