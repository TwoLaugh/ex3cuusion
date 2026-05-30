# Product HLD

## Product Definition

`ex3cuusion` is an AI-assisted execution engine.

It turns messy personal obligations into a realistic daily execution plan.

It is not:

- a life coach
- a journal
- a self-understanding system
- a second brain
- a philosophy or identity product

The app should know only what helps it choose, schedule, split, defer, prioritize, or prune work.

## Core Question

```text
Given my routines, deadlines, projects, neglected areas, and current capacity,
what should I actually do today?
```

## Core Loop

```text
Capture mess
-> AI parses and organizes
-> System stores tasks, routines, domains, and projects
-> Planner builds a realistic Today
-> User executes
-> User completes or defers
-> Daily review calibrates planner assumptions
-> Tomorrow improves
```

## Primary Surfaces

### Today

Today is the main interface.

The default experience should be a focused execution surface for the current day.

Other product areas should be available from a burger menu, not exposed as competing top-level pages.

The AI inbox overlay should also be available from a persistent circular button in the bottom-right corner, so capture is always one action away.

### AI Inbox / Command Chat

The user enters messy natural language:

```text
Need back rehab daily, clean garage this weekend, work 4h tomorrow,
finish diet app auth bug before Friday, and message Will.
```

The AI returns structured actions. The application validates and applies safe actions.

The inbox can:

- create tasks
- create routines
- create projects
- add project notes
- schedule blocks
- ask clarification
- propose risky changes for confirmation

### Today / Planner Detail

Today is the primary execution surface and should default to an ordered day plan.

It shows:

- timed routines, tasks, project blocks, and soft invitations
- current load and remaining capacity
- clear completion/defer controls
- deferred/completed state without removing the item from view

The user should not normally need to browse backlogs.

## Product Principles

- The day view shows commitments, not entire backlogs.
- Project work appears as blocks, with subtasks available behind expansion.
- Deferral must produce useful information.
- The planner should prune more often than it adds.
- AI should reduce organization burden, not create more prose.
- Context is planner context only.

## V1 Scope

Required:

- AI inbox/chat
- task database
- routine database
- domain and project task lists
- daily planner
- project blocks with expandable subtasks
- completion flow
- deferral reason capture
- daily review
- basic weekly planning/update
- web app
- web-first interface and interaction model

Not required:

- full biography
- long-form journaling
- philosophical reflection
- self-understanding prompts
- full Android launcher
- native or wrapped Android app before the web design is settled
- app blocking
- complex analytics
- gamification

## V2 Scope

V2 is the Android attention layer:

- minimalist launcher
- app request system
- AI/system-mediated app opening
- task-linked app launching
- timers
- reminders
- app-use logging
- post-use reflection

V2 should create friction and intentionality, not attempt adversarial lockdown.

