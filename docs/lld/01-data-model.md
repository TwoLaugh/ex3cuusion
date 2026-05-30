# LLD: Data Model

## Goal

Persist the minimum state needed for an AI-assisted execution engine: capture messy input, organize it into work objects, generate a realistic Today plan, and learn from completion/deferral history.

V1 is web-first. Android-specific launcher/app-use data belongs to V2.

## Core Tables

## Candidate Direction: Tasks, Containers, And Repetition

This model is under active design. See `docs/product/task-project-structuring-todo.md`.

Current direction:

- The task is the executable unit.
- A project block on Today is a presentation/planning object, not the primary completion object.
- The user should usually complete individual selected tasks inside a block.
- `projects` may become a more general `containers` concept that can represent projects, areas, people, lists, maintenance buckets, and idea pools.
- Routines may become tasks with a `repeat_policy` instead of a separate user-facing concept.
- Some tasks should be repeatable or reusable suggestions, where completion creates an event but does not exhaust the underlying item.

Likely task additions before Postgres:

- `repeat_policy jsonb`
- `completion_behavior text check in ('exhaust_once','repeatable','keep_as_suggestion','regenerate_after_completion')`
- `completion_mode text check in ('simple_done','outcome_done','timebox','repeatable_checkoff','progress_accumulating','suggestion_used')`
- `definition_of_done text`
- `min_minutes int`
- `max_minutes int`
- `estimate_confidence numeric`
- `last_completed_at timestamptz`
- `blocked_json jsonb`
- `waiting_json jsonb`
- `delegation_json jsonb`

Likely event-model additions before Postgres:

- general `execution_events` replacing or wrapping narrow completion/deferral tables
- event types: completed, worked_on, partially_completed, deferred, blocked, waiting_on, skipped, canceled, marked_not_important
- optional event payload fields for reason, note, actual minutes, next action, blocked metadata, waiting metadata, and follow-up date

Likely project/container additions before Postgres:

- rename or alias `projects` to `containers`
- `kind text check in ('project','area','person','list','idea_pool','maintenance')`
- `default_block_minutes int`
- `planning_mode text check in ('deadline_driven','maintenance','suggestion_pool','relationship','open_backlog')`

The schema below is the current implementation target, not yet the final settled model.

### users

- `id uuid pk`
- `email text unique not null`
- `display_name text`
- `timezone text not null default 'Europe/London'`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

### domains

Broad balancing areas such as Health Repair, Job Work, Diet App, House Work, and Social Maintenance.

- `id uuid pk`
- `user_id uuid fk users`
- `name text not null`
- `description text`
- `weight numeric not null default 1.0`
- `status text not null check in ('active','paused','archived')`
- `last_planned_on date`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Indexes: `(user_id, status)`, unique `(user_id, lower(name))`.

### projects

Related work shown on Today as blocks, not full backlogs.

- `id uuid pk`
- `user_id uuid fk users`
- `domain_id uuid fk domains null`
- `name text not null`
- `status text not null check in ('active','paused','done','archived')`
- `priority_weight numeric not null default 1.0`
- `default_block_minutes int not null default 60`
- `ai_context_note text`
- `due_on date`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Indexes: `(user_id, status)`, `(user_id, domain_id, status)`.

### tasks

Single actionable items. Project subtasks are tasks with `project_id`; split tasks can use `parent_task_id`.

- `id uuid pk`
- `user_id uuid fk users`
- `domain_id uuid fk domains null`
- `project_id uuid fk projects null`
- `parent_task_id uuid fk tasks null`
- `source_inbox_item_id uuid fk inbox_items null`
- `title text not null`
- `description text`
- `type text not null check in ('atomic','project_task','routine_instance','soft_invitation')`
- `status text not null check in ('active','scheduled','done','deferred','blocked','archived')`
- `priority int not null default 3 check 1..5`
- `importance int not null default 3 check 1..5`
- `urgency int not null default 3 check 1..5`
- `effort_minutes int`
- `energy_required text check in ('low','medium','high')`
- `strictness text not null default 'flexible' check in ('strict','normal','flexible')`
- `due_on date`
- `scheduled_for date`
- `notes text`
- `blocked_reason text`
- `completed_at timestamptz`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Indexes: `(user_id, status, scheduled_for)`, `(user_id, due_on)`, `(user_id, project_id, status)`, `(user_id, domain_id, status)`.

### routine_templates

Repeatable work definitions. The planner expands these into plan items and optional routine-instance tasks.

- `id uuid pk`
- `user_id uuid fk users`
- `domain_id uuid fk domains null`
- `title text not null`
- `description text`
- `recurrence_rule text not null`
- `default_effort_minutes int not null`
- `energy_required text check in ('low','medium','high')`
- `strictness text not null check in ('strict','normal','flexible')`
- `preferred_window text check in ('morning','afternoon','evening','anytime')`
- `active boolean not null default true`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Indexes: `(user_id, active)`, `(user_id, domain_id, active)`.

### day_plans

Generated Today plan for one user/date.

- `id uuid pk`
- `user_id uuid fk users`
- `plan_date date not null`
- `status text not null check in ('draft','active','reviewed','archived')`
- `load_level text not null check in ('light','normal','heavy','overloaded')`
- `available_minutes int not null`
- `estimated_minutes int not null`
- `capacity_points int`
- `confidence numeric`
- `ai_summary text`
- `planner_version text not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Indexes: unique `(user_id, plan_date)`, `(user_id, status)`.

### plan_items

Items displayed on Today.

- `id uuid pk`
- `day_plan_id uuid fk day_plans`
- `user_id uuid fk users`
- `task_id uuid fk tasks null`
- `routine_template_id uuid fk routine_templates null`
- `project_id uuid fk projects null`
- `type text not null check in ('routine','atomic_task','project_block','soft_invitation','calendar_event','break')`
- `title text not null`
- `notes text`
- `sort_order int not null`
- `section text not null check in ('routines','main_blocks','quick_tasks','soft_invitations','later')`
- `status text not null check in ('planned','in_progress','done','deferred','removed')`
- `estimated_minutes int not null`
- `selected_task_ids uuid[] not null default '{}'`
- `defer_count int not null default 0`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Indexes: `(user_id, day_plan_id, sort_order)`, `(user_id, status)`.

### completion_events

- `id uuid pk`
- `user_id uuid fk users`
- `task_id uuid fk tasks null`
- `plan_item_id uuid fk plan_items null`
- `completed_at timestamptz not null`
- `actual_minutes int`
- `notes text`

### deferral_logs

- `id uuid pk`
- `user_id uuid fk users`
- `task_id uuid fk tasks null`
- `plan_item_id uuid fk plan_items null`
- `reason text not null check in ('no_time','low_energy','blocked','too_vague','overplanned','avoidance','not_important','moved_intentionally','other')`
- `note text`
- `deferred_from date not null`
- `deferred_to date`
- `created_at timestamptz not null`

Indexes: `(user_id, deferred_from)`, `(user_id, reason, created_at)`.

### inbox_items

- `id uuid pk`
- `user_id uuid fk users`
- `raw_text text not null`
- `status text not null check in ('received','needs_clarification','proposed','applied','failed')`
- `assistant_summary text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

### ai_action_logs

- `id uuid pk`
- `user_id uuid fk users`
- `inbox_item_id uuid fk inbox_items null`
- `action_type text not null`
- `risk_level text not null check in ('safe','confirmation_required','rejected')`
- `status text not null check in ('proposed','applied','rejected','failed')`
- `payload_json jsonb not null`
- `validation_errors jsonb`
- `applied_record_refs jsonb`
- `model text`
- `created_at timestamptz not null`

Indexes: `(user_id, created_at desc)`, `(user_id, status)`.

### planning_context

Small planner-useful preferences only; no biography or journal data.

- `user_id uuid pk fk users`
- `default_day_start time`
- `default_day_end time`
- `default_available_minutes int`
- `preferred_load_level text check in ('light','normal','heavy')`
- `current_focus_note text`
- `planning_preferences_json jsonb not null default '{}'`
- `recent_capacity_json jsonb not null default '{}'`
- `updated_at timestamptz not null`

## State Rules

- Completing a plan item creates a `completion_event`; if linked to a task, the task becomes `done`.
- Deferring a plan item requires a `deferral_log`; the plan item becomes `deferred`; linked tasks stay `active` or move to `scheduled` when `deferred_to` is set.
- Project block completion may complete selected subtasks individually or only log block completion, depending on user choice.
- AI never writes these tables directly. Server validation converts structured AI actions into normal mutations.

