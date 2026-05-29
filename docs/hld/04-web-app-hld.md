# Web App HLD

## Role

The web app is the primary V1 interface for planning and administration.

It should feel calm, minimal, and execution-focused.

## Primary Screens

### Today

Default screen.

Sections:

- header with date, load level, available time estimate
- routines
- main blocks
- quick tasks
- soft invitations
- later/deferred collapsed section

Important actions:

- complete
- defer
- expand details
- replan
- review day

### Inbox Overlay / Command Chat

Floating or easily accessible assistant input.

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

## UX Rules

- Today must not become a giant backlog.
- Project detail lives behind expansion/drawer.
- Defer requires a reason.
- Soft invitations should feel low-pressure.
- Planner warnings should be clear and terse.
- Avoid gamification and productivity theater.

## Desktop And Mobile

V1 web should be desktop-first but usable on mobile.

Android V1 may wrap or reuse the same backend concepts, but native/launcher behavior is V2.

