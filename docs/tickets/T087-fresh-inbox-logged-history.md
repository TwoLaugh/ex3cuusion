# T087: Fresh Inbox + Logged AI History

Status: implemented.

## Implementation

- The inbox now renders only the most-recent exchange (composer stays clean); older sessions are
  reachable via a 'View N earlier sessions in AI activity' link that opens the AI activity log
  (which already lists all capture sessions). No data change — purely how much the inbox shows.

## Problem

The AI inbox stacks all previous sessions below the composer, so it never feels fresh.

## Scope

- The inbox opens clean (just the composer + the current/most-recent exchange).
- Past sessions are logged to a separate history surface (extend the existing "AI activity" page)
  rather than piling up in the inbox.
- On close, the current exchange is archived to that log.

## Acceptance Criteria

- Opening the inbox shows a fresh composer; prior AI sessions are viewable on the AI activity page.
