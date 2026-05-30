# Task And Project Structuring TODO

## Current Direction

The product should remain a task planner with strong structure, not a generic notes system.

The core executable unit is the task. Projects/categories organize tasks. Today may show a block of work for a project/category, but the user should complete the individual tasks inside that block, not treat the block itself as the real work.

## Recommended Build Order

1. Tighten task and project/category design.
2. Redesign AI prompt and response schemas around that structure.
3. Add capture sessions and clarifying AI inbox chat.
4. Expand realistic usage tests around messy capture and multi-turn clarification.
5. Add durable Postgres storage once the model is stable.
6. Do a UI pass once the behavior stops shifting.

Auth and multi-user behavior can wait until a later version. A single-user local/default profile is enough for now.

## Product Concepts To Settle

## User Experience Principle

The internal model can be rich because AI does most of the structure work.

The user-facing experience should stay minimal:

- capture messy input
- answer occasional clarifying questions
- complete, defer, reject, or refine
- see Today without being exposed to every internal field

The backend can store many typed fields, confidence scores, planner signals, and tags. The user should not have to manually maintain those fields.

Preferred split:

- typed fields for things the planner needs to reason over
- planner signals for soft scoring and prioritization
- free tags for search, grouping, and loose association

The AI inbox should become a short structured chat/intake surface, not a permanent general chat transcript. Chat exists to convert ambiguity into durable structured state.

### Task

A task is the thing the user may actually do, defer, complete, repeat, split, or schedule.

Questions to resolve:

- Is `routine` a task behavior flag rather than a separate first-class object?
- Does every task need a `repeat_policy`, even if it is null for one-off tasks?
- Should tasks support both `estimated_minutes` and rolling historical actuals?
- How should tasks represent things that can be completed repeatedly but should not disappear forever?
- What is the difference between `completed`, `done_for_today`, `snoozed`, `deferred`, and `archived`?
- Should vague work become a clarification/splitting task instead of an executable task?
- Should partial completion be recorded as an event rather than a task status?
- How should blocked, waiting, and delegated work stay visible without being planned as normal work?
- When should the AI ask for a definition of done, and when should it infer silently?

Likely fields:

- title
- notes/context
- status
- container/project/category id
- repeat policy
- completion behavior
- estimated minutes
- energy
- priority/importance/urgency
- due date
- scheduled date/time
- blocked reason
- source inbox item
- typed planner fields
- planner signal scores
- free tags
- field confidence
- optional definition of done
- blocked/waiting/delegated metadata

### Routine / Repeating Task

Routines should probably be represented as tasks with recurrence rather than a totally separate user concept.

Important cases:

- daily routine, such as back rehab
- weekly/monthly routine
- flexible recurring task, such as clean room weekly
- recurring suggestion, such as read together or do an activity together
- habit-like task that is completed today but returns later

Open design question:

Should recurrence generate separate task instances, or should Today show virtual instances backed by one repeating task definition?

Preferred direction:

- Store one repeating task definition.
- Generate Today instances or plan items from it.
- Completion creates a completion event for the date.
- The parent repeating task stays active unless explicitly paused/archived.

### Project / Category / Container

The current word `project` may be too narrow. It needs to cover:

- real projects, such as Diet App
- domains of work, such as Job Work
- people or relationships, such as a girlfriend's name
- maintenance buckets, such as House Work
- idea pools or suggestions, such as date ideas or activities to try

Open naming question:

Should the product call this a `project`, `category`, `area`, `list`, or `container`?

Preferred model:

- Use a general `container` concept internally.
- Give each container a `kind`, such as project, area, person, list, idea_pool, maintenance.
- Let the UI label depend on the kind.
- Keep tasks as children of containers.

### Project/Container Block On Today

A Today block is a planning/presentation object, not the real unit of completion.

Wrong behavior:

- "Diet App - 2h" appears.
- User checks off the block.
- Selected subtasks remain ambiguous.

Preferred behavior:

- "Diet App - 2h" appears as a block.
- The block expands to ordered selected tasks.
- User checks off individual tasks within the block.
- The block can be marked reviewed/closed, but that should not imply all selected tasks are done.
- AI may suggest the order of tasks inside the block.

Questions to resolve:

- Should a block have its own status, or only derive status from child task completion?
- Should the block close automatically when all selected tasks are completed?
- Should the user be able to reorder tasks inside a block?
- Should AI choose task order deterministically from scores, or return an ordered rationale after deterministic selection?

### Suggestions And Repeatable Non-Exhausting Ideas

Some items are not one-off tasks:

- read together
- do a specific activity together
- cook a meal idea
- date ideas
- nice-to-have social ideas
- creative prompts

If checked off, these should not necessarily be exhausted forever.

Possible model:

- `completion_behavior = exhaust_once | repeatable | keep_as_suggestion | regenerate_after_completion`
- `suggestion_weight`
- `last_done_at`
- `cooldown_days`
- optional `repeat_policy`

Planner behavior:

- Suggestions should usually appear as soft invitations.
- Suggestions should not compete too aggressively with deadline work.
- Repeatedly ignored suggestions should cool down.
- Completed repeatable suggestions should remain available unless archived.

### Time And Estimates

Timing needs to handle uncertainty rather than pretending estimates are exact.

Cases:

- fixed anchors with exact start/end, such as appointments or sleep
- estimated work, such as "finish auth bug, probably 90m"
- expandable work, such as "work on product for 2h"
- tasks that may need follow-up if unfinished
- recurring tasks whose duration changes over time
- tasks completed faster/slower than expected

Likely fields:

- estimated_minutes
- min_minutes
- max_minutes
- actual_minutes history through completion events
- fixed_start_time
- time_window
- confidence

Planner behavior:

- Use estimates for planning.
- Track actuals separately.
- Learn from repeated underestimation.
- Let project/container blocks have a duration budget while child tasks retain their own estimates.

### Background, Phased, And Concurrent Work

Some work should not be treated as one exclusive block of attention.

Examples:

- laundry: load washer, wait, hang/dry, later fold or put away
- cooking: active prep plus passive waiting
- travel: occupied clock time but possible phone/audio/admin overlap
- AI side work: the user starts an AI-assisted task, then it runs while they do something else

Preferred direction:

- Keep the user-facing capture simple.
- Let AI infer when a task is phased/background/concurrent.
- Store explicit scheduling semantics internally.
- Generate follow-up plan items for return points.

Possible fields:

- `scheduling_mode = exclusive | background | concurrent | phased`
- `attention_load = full | partial | passive`
- `can_overlap`
- `overlap_kinds`
- `phases`
- `follow_up_after_minutes`
- `requires_return_by`

Planner behavior:

- exclusive active phases block time
- passive phases do not block the day
- partial-attention tasks can overlap only with compatible tasks
- phased completion should happen at the phase level where useful
- follow-up phases should surface at the right time without becoming stale

### Execution Outcomes

The system should distinguish what happened from what the task is.

Task status should stay relatively simple. Rich execution detail should live in events:

- completed
- worked on
- partially completed
- deferred
- blocked
- waiting on someone
- skipped
- canceled
- marked not important

This lets tasks remain active while still preserving real progress.

Examples:

- "Clean house" can receive a `worked_on` event without pretending the whole house is clean.
- "Finish auth bug" can receive a `partially_completed` event and generate a next action.
- "Read together" can receive a `completed` event but stay available as a reusable suggestion.

### Not Done Flow

The main UI should not ask for all completion nuance upfront.

Preferred flow:

1. User sees task/block.
2. User taps Done or Not done.
3. Not done opens a small reason sheet.
4. Reason and optional note create an execution event.
5. AI/backend updates task state or proposes a refinement.

Useful reasons:

- no energy
- no time
- blocked
- waiting on someone
- too vague
- did part
- not important
- moved intentionally
- other

### Definition Of Done

Definition of done should be optional and AI-assisted.

Do not ask for it on obvious tasks like "cut nails".

Ask or infer when:

- a task is too vague to plan safely
- the task repeatedly gets partial completion
- completion has consequences for dependencies or deadlines
- the user uses broad phrasing like "clean house" or "work on product"

Candidate completion modes:

- simple done
- outcome done
- timebox
- repeatable checkoff
- progress accumulating
- suggestion used

## Near-Term Implementation TODO

Done in the current V1 foundation:

1. Added `container.kind` while keeping the user-facing project language.
2. Added task `repeatPolicy`.
3. Added task `completionBehavior`.
4. Added typed planner fields, planner signals, free tags, and field confidence.
5. Added capture sessions with clarifying questions.
6. Changed Today project blocks so child tasks are the primary completion controls.
7. Made block status derive from selected task completion.
8. Added support for repeatable suggestions that survive completion.
9. Added actual-vs-estimated completion history through execution events.
10. Updated AI action handling for containers, repeating tasks, one-off tasks, timeboxes, and suggestions.
11. Added planner tests around blocks, repeatables, suggestions, anchors, and time uncertainty.
12. Added execution outcome events.
13. Added Not Done reason flow.
14. Added blocked/waiting/delegated state.
15. Added optional definition-of-done support.
16. Added capture session storage.
17. Added clarification question generation.
18. Added answer/apply APIs for pending AI actions.
19. Upgraded AI prompt and response handling for the richer model.
20. Added compact AI inbox chat behavior through capture sessions.
21. Added realistic AI capture tests for multi-turn, messy user behavior.
22. Added date-intent task structure.
23. Added week-level read model and `/api/week`.
24. Added week-aware AI capture and eval coverage.

Still open for V1:

1. Decide whether to rename `Project` to `Container` internally, or keep `Project` as the storage name with `kind`.
2. Collapse routine templates into repeating-task semantics, or document exactly why they stay separate.
3. Add background/phased/concurrent work semantics.
4. Add a UI surface for the week read model.
5. Add durable Postgres storage after the task/week model settles.
6. Run live-model evals whenever `OPENAI_API_KEY` is present in the local environment.

## V2: Proactive AI Structure Hygiene

V2 should likely include a daily or periodic AI-generated question flow that inspects the backlog, containers, stale tasks, repeatables, and suggestion pools.

Goal:

- prevent task/category rot
- keep containers meaningful
- split vague tasks before they become useless
- detect stale or repeatedly deferred tasks
- ask the user for just enough information to preserve planner quality

Examples:

- "You have 7 tasks in House Work with no next action. Should I split or archive any?"
- "Diet App has no clear next task after the auth bug. Want to define the next action?"
- "You keep deferring garage work as overplanned. Should I reduce its suggested block size?"
- "You completed 'read together' twice. Should I keep it as a recurring relationship suggestion?"
- "These 5 ideas have never been suggested. Are they still worth keeping?"

This should not feel like homework. It should be a small daily maintenance question or batch review only when there is useful uncertainty.

## Design Principle

Do not let the UI convenience of a block corrupt the data model.

The block is how Today presents a focused slice of a project/category. The task is still the thing that gets done.
