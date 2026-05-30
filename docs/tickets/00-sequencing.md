# Implementation Ticket Sequencing

## Guiding Order

Build the execution engine in this order:

1. Task/project/category structuring
2. Rich task metadata
3. Execution outcome events
4. Not Done reason flow
5. Blocked, waiting, and delegated work
6. Area/container dual belonging
7. Definition of done
8. Capture session storage
9. Clarification question engine
10. Capture answer/apply API
11. AI capture prompt and response schema upgrade
12. AI inbox clarifying chat UI
13. Realistic AI capture tests
14. Static live AI capture evals
15. Simulated day AI evals
16. Week and date-intent AI evals
17. Date intent task model
18. Week planning read model
19. Week-aware AI capture
20. Blind scenario generation
21. AI eval reporting and regression thresholds
22. Background, phased, and concurrent work
23. Minimal UI for rich internal structure
24. Database schema and migrations
25. Manual CRUD/admin resources
26. Today page with manual plan generation
27. Completion and deferral loop
28. AI inbox structured actions
29. Planner scoring and project blocks
30. Daily review calibration
31. Mobile web polish
32. Android V1 wrapper/native decision
33. V2 proactive structure hygiene

V1 is web-first. Do not begin Android implementation until Today, AI inbox, planner, and review flows are usable on web.

## Milestones

### M1: Manual Execution Skeleton

Tickets: T016, T017, T021, T022, T023, T024, T025, T019, T001, T002, T003, T004.

Outcome: user can manually maintain work and execute Today without AI.

### M2: AI Capture And Clarification

Tickets: T018, T026, T027, T028, T029, T030, T031, T032, T033, T034, T038, T039, T040, T035, T036, T037, T005, T006, T007.

Outcome: messy input becomes validated tasks/routines/projects/proposals, with clarifying chat and eval coverage for static, day-context, and week/date-intent behavior.

### M3: Planner

Tickets: T008, T009, T010.

Outcome: planner produces a realistic Today plan with pruning.

### M4: Review Loop

Tickets: T011, T012.

Outcome: deferrals and reviews improve future plans.

### M5: Web Polish Before Android

Tickets: T013, T014, T015.

Outcome: web interaction model is stable enough to reuse or wrap.

### V2: Structure Hygiene

Tickets: T020.

Outcome: AI periodically probes stale/vague/overloaded structure and proposes small maintenance actions.

