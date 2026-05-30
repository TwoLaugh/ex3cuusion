# LLD: Web UI Behavior

## Goal

Build the V1 product as a web-first execution surface. Today is the only main page. Secondary areas live behind a burger menu. AI capture is always one click away via a bottom-right circular inbox overlay.

## App Shell

Persistent elements:

- top-left burger menu
- page title/date
- Today content
- bottom-right circular AI inbox button

Burger menu links:

- Domains
- Projects
- Tasks
- Routines
- Planning Preferences
- AI Activity

The menu is secondary navigation, not a competing dashboard.

## Today Page

Header:

- current date
- load level
- estimated minutes / available minutes
- replan action
- review day action when appropriate

Sections:

- Routines
- Main Blocks
- Quick Tasks
- Soft Invitations
- Later / Deferred collapsed by default

Item actions:

- complete
- defer
- expand details
- start/in progress optional

Rules:

- Do not show full backlogs on Today.
- Soft invitations use lighter visual weight.
- Overload warnings are terse and near the header.
- Empty Today offers "generate plan" and inbox capture.

## Project Block Drawer

Opened from a project block.

Shows:

- block focus
- selected subtasks with completion controls
- small project backlog list
- project note
- swap/add/remove selected subtasks
- ask AI to refine block
- complete block

Behavior:

- completing selected subtasks updates block progress
- completing the block asks whether to mark selected subtasks done
- adding backlog tasks does not automatically add them to Today unless selected

## Deferral Flow

Deferring any plan item opens a compact modal.

Required: reason.

Optional: note and move-to date.

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

After submit:

- item moves to Later / Deferred
- planner warning appears only if the reason creates a useful calibration signal

## AI Inbox Overlay

Opened by the persistent bottom-right circular button.

States:

- input ready
- thinking
- applied summary
- proposals needing confirmation
- clarification question
- validation error

Behavior:

- supports messy natural-language capture
- returns terse responses
- shows applied actions as compact rows
- confirmation proposals have confirm/reject controls
- overlay can be dismissed without losing pending proposals
- no long chat history by default

Examples:

- "Need back rehab daily" creates a routine proposal or safe routine.
- "Clean garage this weekend" creates a task or project depending on effort.
- "Work 4h tomorrow" schedules a block if explicit enough.
- "Finish diet app auth bug before Friday" creates or links project work.

## Daily Review

Entry point:

- Today header when day has completed/deferred items
- burger menu as secondary path

Questions stay short:

- energy level
- what slipped
- what was overplanned or vague
- anything to adjust tomorrow

Effects:

- stores review data
- updates planner context
- may generate AI proposals for task splits, stale work, or capacity adjustment

## Mobile Web

V1 must be usable on mobile web:

- Today remains the default page
- burger menu becomes full-height drawer
- inbox button remains bottom-right above safe area
- project drawer becomes bottom sheet
- primary item actions remain thumb-accessible

Native or wrapped Android should wait until the web interaction model settles.

