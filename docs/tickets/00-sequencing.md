# Implementation Ticket Sequencing

## Guiding Order

Build the execution engine in this order:

1. Database schema and migrations
2. Manual CRUD/admin resources
3. Today page with manual plan generation
4. Completion and deferral loop
5. AI inbox structured actions
6. Planner scoring and project blocks
7. Daily review calibration
8. Mobile web polish
9. Android V1 wrapper/native decision

V1 is web-first. Do not begin Android implementation until Today, AI inbox, planner, and review flows are usable on web.

## Milestones

### M1: Manual Execution Skeleton

Tickets: T001, T002, T003, T004.

Outcome: user can manually maintain work and execute Today without AI.

### M2: AI Capture

Tickets: T005, T006, T007.

Outcome: messy input becomes validated tasks/routines/projects/proposals.

### M3: Planner

Tickets: T008, T009, T010.

Outcome: planner produces a realistic Today plan with pruning.

### M4: Review Loop

Tickets: T011, T012.

Outcome: deferrals and reviews improve future plans.

### M5: Web Polish Before Android

Tickets: T013, T014, T015.

Outcome: web interaction model is stable enough to reuse or wrap.

