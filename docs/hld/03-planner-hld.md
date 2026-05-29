# Planner HLD

## Planner Role

The planner turns routines, deadlines, projects, task metadata, history, and capacity into a realistic day.

Its primary value is selection and pruning.

It should often imply:

```text
These are the few things that matter today. Ignore the rest.
```

## Hybrid Planner

Use deterministic logic for:

- recurrence expansion
- due-date filtering
- capacity calculation
- candidate scoring
- conflict checks
- load validation

Use AI for:

- natural-language interpretation
- qualitative prioritization
- project block summaries
- subtask selection explanations
- deferral interpretation
- day-plan rationale

## Planning Inputs

- date
- routines due
- active tasks
- active projects
- domain weights
- recent completion history
- recent deferral history
- planning context
- available minutes
- fixed events
- user energy, if known
- optional weather/location later

## Planning Order

1. Fixed anchors
2. Strict routines
3. Due or time-pressed tasks
4. Main project/work blocks
5. Routine maintenance
6. Neglected but important domains
7. Soft invitations

## Task Scoring

Candidate score should consider:

- due urgency
- explicit priority
- importance
- domain weight
- recurrence due weight
- momentum
- neglect
- dependency unlocks
- time sensitivity
- blocked penalty
- vague task penalty
- energy mismatch
- overused domain penalty
- overload penalty

## Capacity Model

V1 capacity estimate:

- available minutes
- cognitive capacity points
- recommended load: light, normal, heavy
- confidence

Inputs:

- configured day window
- fixed events
- recent completion rate
- recent overload deferrals
- user energy
- previous day completion

Simple V1 rules:

- if yesterday completion was poor, reduce load
- if repeated overplanned deferrals, reduce load
- if energy is low, reduce total load and high-energy tasks
- if completion is consistently high, allow a slightly heavier plan

## Project Blocks

A project block is a high-level commitment with selected subtasks.

Example:

```text
Diet App - 2h
Focus: finish auth bug + add optimizer tests
Selected subtasks: 0/3
```

The planner must choose subtasks that are:

- unblocked
- clear
- high impact
- time-fit
- momentum-preserving
- deadline-relevant

If a project has no clear next action, the planner should ask for clarification or create a proposed split.

## Overload Handling

If a day exceeds capacity, the planner should not silently overfill.

It should:

- label the day overloaded
- identify overload minutes
- suggest cuts
- prioritize strict/urgent items
- downgrade soft invitations first

