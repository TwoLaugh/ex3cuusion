# Testing Strategy

## Goal

`ex3cuusion` should be tested as an execution engine, not as a generic todo app.

The test suite should prove that messy input becomes safe structured state, state becomes a realistic Today plan, user execution feeds back into planner calibration, and the next plan improves.

The highest-confidence test is a realistic full-week end-to-end scenario with seeded tasks, routines, projects, AI fixtures, mocked time, completions, deferrals, daily reviews, and planner recalibration assertions.

## Test Principles

- Prefer deterministic fixtures over live AI calls.
- Treat planner output as a contract: selected items, load, rationale, pruning, and calibration should all be asserted.
- Test safety gates around AI actions before testing happy-path convenience.
- Keep unit tests fast and exhaustive around scoring, recurrence, capacity, and validation.
- Keep integration tests focused on persistence, API/server action boundaries, transactions, audit logs, and authorization.
- Keep component tests user-facing: Today, Inbox overlay, project drawer, deferral, review, and warning states.
- Keep E2E tests realistic and broad, but not brittle about exact prose.
- Freeze time in every planner, review, and E2E test.
- Never call external AI, email, calendar, notification, or mobile APIs in tests.

## Shared Test Infrastructure

### Test Clock

All code that reads the current date/time should use an injectable clock.

Required helpers:

- `freezeTime(isoInstant)`
- `travelTo(isoInstant)`
- `advanceTime(duration)`
- `todayInUserTimezone(userId)`

Tests should cover Europe/London and at least one non-UTC-negative timezone. The main week scenario should run in Europe/London because the current product assumptions are web-first personal planning.

### Seed Data

Use a small canonical fixture set shared across planner, API, component, and E2E tests.

Core domains:

- Foundations
- Health Repair
- Job Work
- Diet App
- Product Business
- House Work
- Driving Prep
- Social Maintenance
- Writing

Core projects:

- Diet App
  - default block: 120 minutes
  - domain: Diet App
  - context: auth bug blocks beta testing
- Product Business
  - default block: 90 minutes
  - domain: Product Business
  - context: needs steady progress but no hard deadline this week
- Garage Reset
  - default block: 90 minutes
  - domain: House Work
  - context: weekend cleanup project

Core routines:

- Back rehab
  - recurrence: daily
  - effort: 20 minutes
  - strictness: strict
  - preferred window: morning
- Walk
  - recurrence: weekdays
  - effort: 30 minutes
  - strictness: flexible
- Weekly review
  - recurrence: Sunday
  - effort: 35 minutes
  - strictness: strict

Core tasks:

- Fix Diet App auth bug
  - project: Diet App
  - due: Friday
  - effort: 90 minutes
  - importance: high
  - urgency: high
- Add optimizer tests
  - project: Diet App
  - due: Friday
  - effort: 60 minutes
  - importance: high
- Message Will
  - domain: Social Maintenance
  - effort: 10 minutes
  - due: Tuesday
- Book driving theory practice
  - domain: Driving Prep
  - effort: 20 minutes
  - due: Thursday
- Draft product landing copy
  - project: Product Business
  - effort: 75 minutes
  - due: next Monday
- Clean garage shelves
  - project: Garage Reset
  - effort: 60 minutes
  - scheduled: Saturday
- Take donation bags out
  - project: Garage Reset
  - effort: 25 minutes
  - scheduled: Sunday

### AI Fixtures

AI tests should use named structured response fixtures. Each fixture should include raw user input, structured model output, validation result, applied actions, and audit log expectations.

Required fixtures:

- `capture_monday_messy_week.json`
  - Creates back rehab routine, work blocks, Diet App deadline tasks, garage weekend tasks, and Message Will.
- `capture_ambiguous_deadline_requires_confirmation.json`
  - Proposes a due date change but requires confirmation before mutation.
- `project_block_subtask_selection.json`
  - Selects Diet App subtasks for a two-hour block.
- `deferral_interpretation_overplanned.json`
  - Interprets repeated "no time" and "overplanned" deferrals as reduced capacity evidence.
- `daily_review_low_energy.json`
  - Converts review input into planner calibration data without storing biography or journal prose.
- `weekly_review_recalibration.json`
  - Produces next-week preference updates and stale-task pruning suggestions.

Assertions should validate structured fields, not exact natural-language phrasing.

### Database Tests

Use disposable databases per test file or per worker. Migration tests should run from an empty database and from the previous migration state once migrations exist.

Minimum database assertions:

- Foreign keys prevent orphan plan items, tasks, projects, routines, and logs.
- Unique constraints prevent duplicate routine instances for the same date.
- Completion and deferral logs preserve historical evidence when tasks are edited later.
- AI action audit logs preserve proposed, rejected, confirmed, and applied actions.
- Day plans are reproducible for the same input state and planner version.

## Unit Tests

Unit tests should avoid the web framework and database unless the unit is specifically a persistence mapper.

### Domain Model

Test:

- task status transitions: active, completed, deferred, blocked, archived
- routine template validation and recurrence expansion
- project status and selected subtask invariants
- domain weight bounds
- plan item type-specific required fields
- deferral reason validation
- completion event duration validation
- date and timezone conversion

Examples:

- A routine due daily creates exactly one instance for `2026-06-01` in the user's timezone.
- A project block cannot reference completed, archived, blocked, or unrelated subtasks.
- A soft invitation cannot be strict or deadline-blocking.
- Deferring a plan item requires one of the allowed reasons.

### AI Action Validation

Test:

- safe auto-apply actions
- confirmation-required actions
- rejected malformed actions
- ambiguous dates
- destructive changes
- deadline movement
- recurrence changes
- attempted direct completion without clear user intent

Examples:

- "Delete all old tasks" produces a confirmation proposal, not a mutation.
- "Work 4h tomorrow" creates an explicit scheduled block if the date resolves deterministically.
- "Move Diet App to later" requires clarification or confirmation if "later" changes a deadline.

### Planner Units

Test deterministic planner helpers independently:

- recurrence expansion
- fixed-event subtraction
- available-minute calculation
- cognitive-capacity calculation
- candidate scoring
- due-date urgency
- domain balancing
- neglected-domain boost
- momentum boost
- blocked/vague penalties
- energy mismatch penalty
- overload detection
- pruning order
- selected subtask filtering
- load-level assignment

Examples:

- Repeated `overplanned` deferrals reduce next-day available minutes.
- A strict daily routine outranks a flexible soft invitation.
- A high-urgency Friday Diet App task outranks a no-deadline Product Business task on Thursday.
- Soft invitations are pruned before strict routines or urgent tasks.
- If a project has no clear unblocked subtasks, the planner emits a clarification/proposed split instead of inventing work.

## Domain And Planner Tests

Domain/planner tests should run the actual planner service with in-memory repositories or a test database and deterministic AI fixtures.

Required suites:

- `plans_today_generation`
- `planner_capacity_calibration`
- `planner_project_blocks`
- `planner_overload_pruning`
- `planner_deferral_feedback`
- `planner_weekly_update`

### Today Generation

Seed routines, tasks, projects, capacity, and fixed events.

Assert:

- strict routines due today are included
- urgent due tasks are included
- at most one or two main project blocks appear unless capacity is heavy
- project blocks include selected subtask IDs
- quick tasks are kept atomic
- soft invitations appear only after commitments
- later/deferred section contains pruned candidates
- estimated total minutes does not exceed available minutes unless explicitly marked overloaded
- planner rationale names pruning and priority reasons tersely

### Capacity Calibration

Seed recent completion and deferral history.

Assert:

- low completion yesterday lowers today's load
- repeated `no time` and `overplanned` deferrals lower available minutes or confidence
- `low energy` lowers high-energy selections
- strong completion history permits a slightly heavier plan
- calibration changes are bounded and explainable

### Project Blocks

Seed a project with clear, vague, blocked, completed, and urgent subtasks.

Assert:

- selected subtasks are unblocked, active, related to the project, and fit the block
- urgent subtasks are preferred near deadline
- vague subtasks are penalized or converted into a clarification proposal
- completing individual subtasks updates block progress
- swapping subtasks preserves block duration constraints

## API And Server Action Integration Tests

Integration tests should exercise the real routing/server action layer, validation, database transactions, authorization, and audit logging. Mock only external AI and third-party services.

Required route/action areas:

- `/auth`
- `/inbox`
- `/domains`
- `/projects`
- `/tasks`
- `/routines`
- `/plans/today`
- `/plan-items`
- `/reviews/daily`
- `/reviews/weekly`
- `/ai-actions`

### Inbox

Test:

- creating an inbox item stores raw input
- AI fixture output is validated before mutation
- safe actions are applied transactionally
- confirmation-required actions are stored as pending proposals
- rejected actions leave no partial domain mutations
- audit logs include input, proposed action, validation outcome, actor, and timestamp

### Plans

Test:

- `GET /plans/today` generates or returns the current day plan for the frozen date
- replanning creates a new planner version or plan revision without erasing completion history
- completing a plan item creates a completion event and updates display state
- deferring a plan item requires a reason and creates a deferral log
- deferred items move out of active Today sections
- authorization prevents one user reading another user's plan

### Reviews

Test:

- daily review accepts completion/deferral summary and optional energy
- daily review updates planning context only with planner-useful data
- weekly review can propose weight and capacity changes
- review proposals that prune/archive tasks require confirmation where appropriate

## Component Tests

Use component tests for UI behavior that is expensive or brittle in full E2E tests.

### Today

Assert:

- header shows date, load level, and available time estimate
- routines, main blocks, quick tasks, soft invitations, and later/deferred sections render separately
- completing an item updates its state optimistically and confirms with the server
- deferring opens a required reason flow
- overload warning is visible when plan exceeds capacity
- replan action preserves completed items visually
- mobile layout keeps Today primary and usable

### Inbox Overlay

Assert:

- bottom-right circular button opens the overlay
- input accepts messy natural language
- applied changes are summarized tersely
- clarification questions render with safe choices
- risky proposals require explicit confirmation
- long chat history is not shown by default

### Project Drawer

Assert:

- opening a project block shows selected subtasks, backlog, notes, and block notes
- subtasks can be completed individually
- swap/add/remove controls respect block constraints
- asking AI to refine the block uses a fixture and renders proposed changes

### Review Flow

Assert:

- daily review summarizes completions and deferrals
- energy/capacity input is saved
- calibration effects are previewed
- weekly review proposals are confirmable before mutation

## Playwright E2E Tests

E2E tests should run against a real app server, real test database, real migrations, mocked clock, and mocked AI fixture server.

Recommended projects:

- `chromium-desktop`
- `webkit-mobile`

Keep one broad full-week test and a small number of focused smoke tests.

Focused smoke tests:

- first-run seed and Today render
- inbox capture and safe apply
- defer requires reason
- project drawer subtask completion
- confirmation-required AI proposal

## Full-Week E2E Scenario

### Purpose

Prove that the whole product loop works across a realistic week:

```text
capture -> plan -> execute -> defer -> review -> recalibrate -> weekly update
```

The test should be broad enough to catch broken contracts between AI parsing, persistence, planner selection, UI rendering, completion/deferral flows, daily review, and weekly review.

### Environment

- User timezone: `Europe/London`
- Initial time: `2026-06-01T07:30:00+01:00` Monday
- AI responses: fixture server only
- External network: disabled except local app/test services
- Database: migrated empty test database
- Auth: seeded single user or test login helper
- Planner version: pinned in fixture snapshot
- Viewports: desktop required, mobile replay optional for the same seed

### Initial Seed

Before login, seed:

- domains listed in Shared Test Infrastructure
- planning preferences:
  - weekday available minutes: 300
  - Saturday available minutes: 240
  - Sunday available minutes: 180
  - normal load target: 80 percent of available minutes
  - preferred morning routine window
- fixed events:
  - Monday 13:00-14:00 lunch
  - Tuesday 10:00-12:00 work meeting
  - Wednesday 15:00-16:30 appointment
  - Friday 16:00-17:00 wrap-up
- no existing plan for the week

Then use the Inbox UI, not direct DB writes, to submit:

```text
Need back rehab daily, walk weekdays, clean garage this weekend, work 4h tomorrow,
finish Diet App auth bug before Friday, add optimizer tests, message Will by Tuesday,
book driving theory practice this week, and draft product landing copy.
```

The AI fixture should create routines, projects, tasks, and a Tuesday work block. The UI should show a terse applied summary.

Assert after capture:

- raw inbox item is stored
- AI action audit log exists
- back rehab daily routine exists
- walk weekday routine exists
- Diet App project has auth bug and optimizer test tasks
- Garage Reset project has weekend tasks
- Message Will due Tuesday exists
- Tuesday work block exists
- no confirmation-required proposals remain unresolved for safe actions

### Monday

Freeze time at `2026-06-01T08:00:00+01:00`.

Open Today.

Expected plan:

- Back rehab appears in routines
- Walk appears as a flexible routine
- Message Will appears as a quick task because it is due Tuesday
- Diet App appears as a main project block with auth bug selected
- Draft product landing copy may appear as a soft invitation or later item, depending on capacity
- Garage Reset does not appear in active Today sections

Actions:

- Complete Back rehab
- Complete Message Will
- Defer Walk with reason `low energy`
- Open Diet App project drawer
- Complete one selected auth-bug subtask
- Defer remaining Diet App block with reason `blocked`
- Run daily review and choose low energy

Assert:

- completion events exist for Back rehab, Message Will, and the subtask
- deferral logs exist for Walk and Diet App block with correct reasons
- daily review stores low-energy calibration data
- Tuesday planner input includes Monday's low-energy and blocked evidence

### Tuesday

Travel to `2026-06-02T08:00:00+01:00`.

Open Today.

Expected plan:

- Back rehab appears
- Fixed 10:00-12:00 meeting reduces capacity
- Explicit 4h work block appears or the day is marked overloaded if it cannot fit
- Diet App remains high priority because Friday deadline is near
- Walk may be pruned or moved later because Monday low energy reduced confidence
- Completed Message Will does not reappear

Actions:

- Complete Back rehab
- Complete 4h work block
- Defer Diet App block with reason `no time`
- Daily review marks the day as overplanned

Assert:

- Tuesday estimated minutes account for the fixed meeting
- repeated Diet App deferral increments calibration evidence
- Wednesday capacity target is reduced or confidence is lowered
- completed Message Will remains absent

### Wednesday

Travel to `2026-06-03T08:00:00+01:00`.

Open Today.

Expected plan:

- Plan is lighter than Tuesday
- Back rehab appears
- Diet App block is shorter or more focused
- Book driving theory practice appears because Thursday due date is near
- Soft invitations are pruned before committed items

Actions:

- Complete Back rehab
- Complete Book driving theory practice
- Complete focused Diet App auth bug block
- Daily review marks normal energy and confirms plan felt realistic

Assert:

- completion rate improves planner confidence
- Thursday does not overcorrect into a heavy day
- auth bug task or subtask status reflects completion

### Thursday

Travel to `2026-06-04T08:00:00+01:00`.

Open Today.

Expected plan:

- Back rehab appears
- Diet App optimizer tests are selected because Friday deadline remains
- Walk appears only if capacity allows
- Product Business remains secondary

Actions:

- Complete Back rehab
- Complete optimizer tests
- Defer Walk with reason `moved intentionally`
- Submit inbox text:

```text
Move the Diet App deadline to next month and clear the Friday work.
```

The AI fixture should require confirmation because this moves a deadline and clears scheduled work.

Assert:

- risky AI proposal is shown
- no deadline or Friday plan item changes before confirmation
- rejecting the proposal leaves Friday priorities intact
- audit log records rejected proposal

### Friday

Travel to `2026-06-05T08:00:00+01:00`.

Open Today.

Expected plan:

- Back rehab appears
- Remaining Diet App deadline work appears if any remains
- Friday wrap-up fixed event reduces capacity
- Planner does not show completed auth bug or optimizer tests as active
- If Diet App work is done, Product Business or neglected domain work may appear

Actions:

- Complete Back rehab
- Complete any remaining Diet App work
- Replan after completion
- Verify replanned Today fills only reasonable remaining capacity
- Daily review marks the deadline handled

Assert:

- replanning does not erase Friday completion events
- completed Diet App items do not return
- plan revision or planner version history exists
- planner rationale references deadline completion or reduced urgency

### Saturday

Travel to `2026-06-06T09:00:00+01:00`.

Open Today.

Expected plan:

- Back rehab appears
- Garage Reset main block appears
- Clean garage shelves appears as selected subtask
- Weekday Walk does not appear
- Job Work and Diet App do not dominate the weekend unless urgent

Actions:

- Complete Back rehab
- Complete Clean garage shelves
- Defer optional Product Business invitation, if present, with reason `not important`
- Daily review marks normal energy

Assert:

- weekend recurrence rules are respected
- Garage Reset gets domain balancing credit
- soft invitation deferral does not overly penalize capacity

### Sunday

Travel to `2026-06-07T09:00:00+01:00`.

Open Today.

Expected plan:

- Back rehab appears
- Weekly review appears
- Take donation bags out appears
- Remaining Garage Reset work appears if incomplete
- Plan is lighter than weekdays

Actions:

- Complete Back rehab
- Complete Take donation bags out
- Complete Weekly review
- Run weekly review flow

Weekly review AI fixture should propose:

- keep daily back rehab
- reduce weekday default load slightly because of repeated no-time/low-energy signals
- keep Diet App domain weight normal after deadline completion
- boost Driving Prep or Product Business next week if neglected
- suggest pruning stale vague tasks only as confirmable proposals

Assert:

- weekly review summary appears
- capacity preference change is previewed before applying
- applying accepted calibration updates planning context
- stale task pruning proposal requires confirmation
- next Monday plan uses updated capacity and neglected-domain evidence

### Final Week Assertions

At the end of the test, assert through API or database helpers:

- 7 daily plans exist or are reproducibly generated for Monday through Sunday
- every completed UI action has a completion event
- every deferred UI action has a deferral log with a reason
- all AI mutations have audit log records
- rejected AI proposal made no domain-state mutation
- planner capacity changed after repeated low-energy/no-time/overplanned evidence
- completed tasks are absent from later active plans
- routine recurrence generated expected instances without duplicates
- project block selected subtasks were always active, unblocked, and related to the project
- full-week plan never silently exceeded capacity
- overload, if present, was explicitly labeled with suggested cuts
- no personal biography or journal prose was stored in planning context

## Coverage Gates

Suggested minimum gates once implementation begins:

- Domain/planner unit coverage: 90 percent branch coverage
- API/server action coverage: 80 percent line coverage on route/service modules
- Component coverage: all critical Today, Inbox, Project Drawer, and Review states
- E2E: full-week scenario required on main branch
- Mutation testing or property tests for planner scoring when feasible

Coverage should not be used to excuse missing scenario assertions. Planner bugs often hide in plausible-looking output, so fixture-level assertions matter more than raw percentages.

## CI Strategy

Run on every pull request:

- lint and typecheck
- unit tests
- domain/planner tests
- API/server action integration tests
- component tests

Run before merge to main, or as a required slower job:

- Playwright smoke tests
- full-week Playwright E2E test
- migration tests

Nightly:

- full browser matrix
- randomized planner property tests
- timezone matrix
- performance budget checks for Today generation

## Performance Budgets

Initial budgets:

- Today plan generation with 500 active tasks: under 500 ms without AI
- Today API response: under 750 ms locally with warm database
- Inbox safe-action validation: under 300 ms excluding mocked AI latency
- Today first render after data load: under 1 second in E2E

The planner should degrade by pruning candidate sets, not by asking AI to reason over unbounded backlogs.

## Non-Goals

Do not test against live OpenAI in CI.

Do not snapshot exact AI prose unless the prose itself is a product contract.

Do not assert that the planner always chooses one exact soft invitation when several are equivalent.

Do not store or test long-form biography, journaling, therapy, coaching, values, or personality features as part of planner context.
