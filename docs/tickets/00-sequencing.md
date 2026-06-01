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
23. Task scheduling semantics
24. Planner overlap and phases
25. AI background work capture
26. Overlap UX pass
27. Burger task backlog sections
28. Project panel task rollups
29. Day navigator as week UX
30. Minimal UI for rich internal structure
31. Database schema and migrations
32. Manual CRUD/admin resources
33. Today page with manual plan generation
34. Completion and deferral loop
35. AI inbox structured actions
36. Planner scoring and project blocks
37. Daily review calibration
38. Mobile web polish
39. Android V1 wrapper/native decision
40. V2 proactive structure hygiene
41. Postgres schema and migrations
42. Postgres AppState repository
43. Manual structure CRUD
44. Project block drawer
45. Daily review and planner calibration
46. V1 release gate

V1 is web-first. Do not begin Android implementation until Today, AI inbox, planner, and review flows are usable on web.

## Milestones

### M1: Manual Execution Skeleton

Tickets: T016, T017, T021, T022, T023, T024, T025, T019, T001, T002, T003, T004.

Outcome: user can manually maintain work and execute Today without AI.

### M2: AI Capture And Clarification

Tickets: T018, T026, T027, T028, T029, T030, T031, T032, T033, T034, T038, T039, T040, T035, T036, T037, T041, T042, T043, T044, T045, T046, T047, T005, T006, T007.

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

### Current V1 Completion Path

Tickets: T053, T054, T055, T056, T057, T058.

Outcome: the web-first V1 has durable storage, manual correction paths, project block execution, planner learning, and release hygiene.

### M6: Multi-Altitude AI Organizer (day -> week -> backlog)

Goal: move the AI from a day-level command interpreter to a multi-altitude organizer that
structures work on capture, plans and rebalances full weeks, grooms a durable backlog, and keeps
the system organized over time.

Apply model: **auto-apply with undo** (decided). Larger reorganizations are applied immediately
but are fully reversible (T061), rather than gated behind confirm-before-apply.

Execution order:

1. T060 - Live current time (foundation; unblocks correct day/week reasoning)
2. T061 - AI change history and undo (foundation; prerequisite for auto-applied reorgs)
3. T062 - Multi-task capture to work-block grouping
4. T063 - Week-level planning actions
5. T064 - Backlog grooming actions
6. T065 - Week + backlog reasoning altitude (ties the new actions into the one interpreter)
7. T066 - Proactive structure / hygiene organizer (extends T020)
8. T067 - Week & backlog quality evals (continuous; each feature lands with its rubric scenarios)

Dependencies: T061 precedes T063, T064, and T066. T065 follows T063 and T064. T067 runs
alongside -- every feature ticket adds its quality scenarios as it lands.

Outcome: the AI structures work on capture, plans full weeks, grooms the backlog, and keeps the
system organized -- every change reversible, every behavior measured by the quality harness.

