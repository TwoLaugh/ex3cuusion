# Realistic Character Test Results

Date run: 2026-05-29

Scenario: Maya Chen, a senior product designer with a high-pressure health-tech work project, a personal recipe zine, health anchors, dinner plans, home admin, and social follow-through.

Agent support: a QA explorer agent produced the coverage checklist and risk list. The highest-value recommendation was to verify that flexible work does not overrun dentist, dinner, shutdown, or sleep anchors.

Screenshot: [realistic-character-timeline.png](./realistic-character-timeline.png)

## What Was Tested

- Loaded the scenario through `POST /api/scenario/realistic-character`.
- Verified the Today page opens on Wednesday, 3 June 2026 at 06:45.
- Verified fixed anchors render: medication, standup, stakeholder critique, dentist travel/appointment, dinner, shutdown, and sleep.
- Verified the work project appears as a project block and its drawer contains the selected subtasks: analytics notes, screen polish, and rationale bullets.
- Verified flexible work does not cross the 14:00 critique, 16:30 dentist, 19:30 dinner, or 23:00 sleep boundaries.
- Verified the social goal "Confirm dinner with Leo" is scheduled before dinner.
- Verified completion can be toggled on and then undone.
- Verified the personal zine project can be deferred.
- Sent a live AI inbox request to add extra critique-slide prep and verified the task action was applied and logged with an entity ID.
- Ran the existing full-week E2E, simple AI add, vague AI capture, and sleep-anchor E2Es.

## Results

Pass:

- The day loads with 21 tasks, 4 routines, and a full timeline from early morning through sleep.
- The main work project now gets the realistic deep-work slot from 10:35 to 13:05.
- Lunch lands after the work block at 13:25, immediately before the 14:00 critique.
- Dentist, dinner, shutdown, and sleep remain fixed.
- Overrun checks passed for critique, dentist, dinner, and sleep.
- Zine work is still present, but lower priority than the main work project.
- Excess work is moved to unscheduled/later instead of being silently pushed past sleep.
- AI inbox actions are applied/logged using the real OpenAI path.

Observed gaps:

- The load total includes sleep minutes, so the badge reads more overloaded than a human would expect.
- The zine block still fits into 17:50-19:05; this may be okay, but after prior low-energy deferral it might be better as a softer invitation.
- Some social/home tasks land quite late in the evening. The system needs a stronger sense of "this is technically possible but not humane."
- AI-created tasks are logged and applied, but overloaded-day surfacing needs a clearer review path when a new item cannot confidently enter the visible plan.
- The side-nav pages are still placeholders, so this only tests Today, project drawer, actions, and AI inbox.

## Verification

- `npm.cmd test`: 9 passed.
- `npm.cmd run test:e2e`: 5 passed.
- `npm.cmd run build`: passed.

