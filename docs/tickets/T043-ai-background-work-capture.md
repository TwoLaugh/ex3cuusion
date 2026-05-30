# T043: AI Background Work Capture

Status: implemented in V1 foundation.

## Goal

Teach AI capture to infer background, phased, and concurrent scheduling semantics from natural user wording.

## Scope

- Laundry-style input becomes phased/background work.
- Cooking/travel/AI-side-work wording can create overlap-compatible tasks.
- Prompt tells the live model to preserve these semantics.
- Fixture tests cover messy examples.

## Acceptance Criteria

- "do laundry" creates phased scheduling metadata.
- "AI can run the report while I cook" creates concurrent/passive overlap metadata.
- Debug and task panels expose the resulting scheduling shape.
