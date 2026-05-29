# Backend HLD

## Backend Role

The backend owns:

- user auth and profiles
- task/routine/project/domain state
- daily and weekly plans
- completion and deferral history
- AI action validation and audit logs
- planner generation
- Android app request/timer state in V2

AI calls are server-side only. API keys must never be exposed to web or Android clients.

## Recommended Stack

Initial implementation should prefer:

- FastAPI or Node API
- Postgres for hosted/sync path
- SQL migrations
- server-side OpenAI structured outputs
- shared OpenAPI contract for web and Android

The existing `c3Ntr0l` FastAPI/Postgres work can likely be carried over after review.

## Core Entities

### Domain

Broad area used for balancing and neglected-area tracking.

Examples:

- Foundations
- Health Repair
- Job Work
- Diet App
- Product Business
- House Work
- Driving Prep
- Social Maintenance
- Dating
- Writing
- Miscellaneous

### Project

Collection of related tasks. Today normally shows a project as a block rather than exposing the whole backlog.

Important fields:

- domain id
- name
- status
- priority weight
- default block minutes
- short AI context note

### Task

A singular actionable item.

Important fields:

- title and description
- domain/project/parent task
- type: atomic, project task, routine instance, soft invitation
- status
- priority, importance, urgency
- due/scheduled dates
- effort minutes
- energy required
- strictness
- notes
- source inbox item

### Routine Template

Repeatable task definition.

Important fields:

- title
- recurrence rule
- default effort
- energy required
- strictness
- preferred time window
- active flag

### Day Plan

Generated plan for a date.

Important fields:

- date
- status
- load level
- estimated total minutes
- available minutes
- AI summary/rationale

### Plan Item

An item displayed on Today.

Types:

- routine
- atomic task
- project block
- soft invitation
- calendar event
- break

Project block plan items include selected subtask IDs.

### Deferral Log

Created whenever the user defers a plan item/task.

Reasons:

- no time
- low energy
- blocked
- task too vague
- overplanned
- avoidance
- not important
- moved intentionally
- other

Deferral logs are planner calibration data.

### Completion Event

Tracks completed work and actual time where available.

### Inbox Item

Raw user input plus structured proposed/applied actions.

### Planning Context

Minimal planner-useful state only:

- current focus notes
- planning preferences
- domain weights
- recent capacity assumptions

No biography or journal history.

## AI Safety Model

The LLM never directly mutates the database.

Flow:

```text
input -> structured AI output -> validation -> safe application or confirmation -> audit log
```

Safe auto-apply:

- create normal task
- create obvious routine
- assign domain/project
- schedule explicitly requested block
- add note

Require confirmation:

- destructive archive/delete
- moving deadlines
- drastic recurrence changes
- ambiguous dates
- marking tasks done without clear intent
- major replanning of the current day

## Main API Areas

```text
/auth
/inbox
/domains
/projects
/tasks
/routines
/plans/today
/plan-items
/reviews/daily
/reviews/weekly
/ai-actions
```

V2 Android additions:

```text
/android/today
/android/app-requests
/android/timers
/android/app-usage
```

