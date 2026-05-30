# Web App HLD

## Role

The web app is the primary V1 interface for planning and execution.

It should feel calm, minimal, and execution-focused.

## Primary Interface

The interface should feel like one main page, not a multi-page productivity suite.

The user lands on Today. Other areas are available through a burger menu, but they should feel secondary.

### Today

Default and primary screen.

Sections:

- header with date, current time, load level, and available time estimate
- ordered day plan with start/end timings
- routines, project blocks, quick tasks, and soft invitations integrated into the timeline
- deferred/completed state shown inline

Important actions:

- complete, with second press undoing accidental completion
- defer, with immediate visible deferred state
- expand details
- replan
- review day

### Inbox Overlay / Command Chat

Opened from a persistent circular button in the bottom-right corner.

The inbox should support:

- terse AI responses
- clarifying questions
- proposed changes
- summary of applied changes

It should not show a long visible chat history by default.

### Project Drawer

Opened from a project block.

Shows:

- selected subtasks
- project backlog
- notes
- block notes
- swap/add/remove selected subtasks
- ask AI to refine block
- complete block or individual subtasks

### Admin Screens

Secondary, not daily-use surfaces:

- domains
- projects
- tasks
- routines
- planning preferences
- AI activity/audit log

These screens should be accessed from the burger menu.

## UX Rules

- Today must not become a giant backlog.
- The main interface is Today; secondary pages should not compete with it.
- The AI inbox is an overlay launched from a bottom-right circular button.
- Admin and setup screens live behind the burger menu.
- Project detail lives behind expansion/drawer.
- Defer requires a reason.
- Soft invitations should feel low-pressure.
- Planner warnings should be clear and terse.
- Avoid gamification and productivity theater.

## Desktop And Mobile

V1 web should be desktop-first but usable on mobile.

Android V1 may wrap or reuse the same backend concepts, but native/launcher behavior is V2.

