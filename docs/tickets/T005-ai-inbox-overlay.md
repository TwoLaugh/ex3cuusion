# T005: Build AI Inbox Overlay UI

## Goal

Add the bottom-right circular AI inbox overlay as the always-available capture surface.

## Scope

- Floating circular button
- Overlay panel
- Input box
- Thinking state
- Applied summary state
- Proposal confirm/reject rows
- Clarification question state
- Validation error state

## Requirements

- Overlay appears above Today and secondary screens.
- The UI shows terse AI responses, not a long visible chat history.
- Pending proposals persist after closing/reopening the overlay.
- Button remains usable on mobile web above the safe area.

## Acceptance

- User can submit messy text to a stub endpoint.
- Overlay can render applied actions, proposals, and clarification questions from fixture responses.
- The rest of Today remains intact when overlay opens/closes.

