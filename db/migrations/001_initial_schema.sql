create extension if not exists pgcrypto;

create table if not exists schema_migrations (
  version text primary key,
  name text not null,
  applied_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,
  timezone text not null default 'Europe/London',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  description text,
  weight numeric not null default 1.0,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  last_planned_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table containers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  domain_id uuid references domains(id) on delete set null,
  name text not null,
  kind text not null default 'project' check (kind in ('project', 'area', 'person', 'list', 'idea_pool', 'maintenance')),
  planning_mode text not null default 'open_backlog' check (planning_mode in ('deadline_driven', 'maintenance', 'suggestion_pool', 'relationship', 'open_backlog')),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  priority_weight numeric not null default 1.0,
  default_block_minutes int not null default 60 check (default_block_minutes > 0),
  context_note text not null default '',
  due_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  domain_id uuid not null references domains(id) on delete restrict,
  container_id uuid references containers(id) on delete set null,
  parent_task_id uuid references tasks(id) on delete set null,
  source_inbox_item_id uuid,
  title text not null,
  description text,
  type text not null check (type in ('atomic', 'project_task', 'routine_instance', 'soft_invitation')),
  status text not null default 'active' check (status in ('active', 'scheduled', 'completed', 'deferred', 'blocked', 'waiting', 'archived')),
  repeat_policy jsonb not null default '{"type":"none"}'::jsonb,
  completion_behavior text not null default 'exhaust_once' check (completion_behavior in ('exhaust_once', 'repeatable', 'keep_as_suggestion', 'regenerate_after_completion')),
  completion_mode text check (completion_mode in ('simple_done', 'outcome_done', 'timebox', 'repeatable_checkoff', 'progress_accumulating', 'suggestion_used')),
  definition_of_done text,
  planner_fields jsonb not null default '{}'::jsonb,
  planner_signals jsonb,
  tags text[],
  field_confidence jsonb,
  priority int not null default 3 check (priority between 1 and 9),
  importance int not null default 3 check (importance between 1 and 9),
  urgency int not null default 3 check (urgency between 1 and 9),
  due_on date,
  scheduled_for date,
  scheduled_time time,
  date_intent jsonb,
  scheduling jsonb,
  effort_minutes int not null default 15 check (effort_minutes > 0),
  min_minutes int check (min_minutes is null or min_minutes > 0),
  max_minutes int check (max_minutes is null or max_minutes > 0),
  estimate_confidence numeric check (estimate_confidence is null or estimate_confidence between 0 and 1),
  energy text not null default 'medium' check (energy in ('low', 'medium', 'high')),
  strictness text not null default 'normal' check (strictness in ('flexible', 'normal', 'strict')),
  notes text,
  blocked_reason text,
  blocked_json jsonb,
  waiting_json jsonb,
  delegation_json jsonb,
  completed_at timestamptz,
  last_completed_at timestamptz,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table routine_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  domain_id uuid not null references domains(id) on delete restrict,
  title text not null,
  description text,
  recurrence jsonb not null,
  default_effort_minutes int not null check (default_effort_minutes > 0),
  energy text not null default 'medium' check (energy in ('low', 'medium', 'high')),
  strictness text not null default 'normal' check (strictness in ('flexible', 'normal', 'strict')),
  preferred_window text check (preferred_window in ('morning', 'afternoon', 'evening')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, title)
);

create table day_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  plan_date date not null,
  status text not null default 'active' check (status in ('draft', 'active', 'reviewed', 'archived')),
  load_level text not null check (load_level in ('light', 'normal', 'heavy', 'overloaded')),
  estimated_total_minutes int not null default 0 check (estimated_total_minutes >= 0),
  available_minutes int not null check (available_minutes >= 0),
  capacity_points int,
  confidence numeric check (confidence is null or confidence between 0 and 1),
  summary text not null default '',
  planner_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create table plan_items (
  id uuid primary key default gen_random_uuid(),
  day_plan_id uuid not null references day_plans(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  routine_template_id uuid references routine_templates(id) on delete set null,
  container_id uuid references containers(id) on delete set null,
  type text not null check (type in ('routine', 'atomic_task', 'project_block', 'soft_invitation', 'calendar_event', 'break')),
  title text not null,
  notes text,
  sort_order int not null default 0,
  section text not null check (section in ('routines', 'main_blocks', 'quick_tasks', 'soft_invitations', 'later')),
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed', 'deferred', 'removed', 'unscheduled')),
  start_time time,
  end_time time,
  estimated_minutes int not null check (estimated_minutes >= 0),
  clock_minutes int,
  blocking_minutes int,
  selected_task_ids uuid[] not null default '{}',
  scheduling jsonb,
  reason text not null default '',
  defer_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table execution_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_date date not null,
  type text not null check (type in ('completed', 'worked_on', 'partially_completed', 'deferred', 'blocked', 'waiting_on', 'skipped', 'canceled', 'marked_not_important')),
  task_id uuid references tasks(id) on delete set null,
  task_ids uuid[],
  plan_item_id uuid references plan_items(id) on delete set null,
  reason text,
  note text,
  actual_minutes int,
  next_action text,
  blocked_json jsonb,
  waiting_json jsonb,
  delegation_json jsonb,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  raw_text text not null,
  status text not null default 'received' check (status in ('received', 'needs_clarification', 'proposed', 'applied', 'failed', 'dismissed')),
  assistant_summary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table tasks
  add constraint tasks_source_inbox_item_fk
  foreign key (source_inbox_item_id) references inbox_items(id) on delete set null;

create table ai_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  inbox_item_id uuid references inbox_items(id) on delete cascade,
  capture_session_id uuid,
  action_type text not null,
  label text not null,
  risk_level text not null check (risk_level in ('safe', 'confirmation_required', 'rejected')),
  status text not null check (status in ('proposed', 'applied', 'rejected', 'failed')),
  payload_json jsonb not null,
  validation_errors jsonb,
  applied_record_refs jsonb,
  model text,
  skipped_reason text,
  created_at timestamptz not null default now()
);

create table capture_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  inbox_item_id uuid references inbox_items(id) on delete set null,
  status text not null check (status in ('open', 'waiting_for_user', 'applied', 'dismissed')),
  source text not null default 'inbox' check (source in ('inbox', 'not_done', 'daily_review')),
  summary text not null default '',
  action_ids uuid[] not null default '{}',
  draft_action_ids uuid[] not null default '{}',
  applied_entity_ids uuid[] not null default '{}',
  answered_fields text[] not null default '{}',
  unresolved_fields text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ai_actions
  add constraint ai_actions_capture_session_fk
  foreign key (capture_session_id) references capture_sessions(id) on delete set null;

create table capture_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references capture_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table clarification_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references capture_sessions(id) on delete cascade,
  action_id uuid references ai_actions(id) on delete set null,
  question text not null,
  kind text not null check (kind in ('definition_of_done', 'completion_behavior', 'container_kind', 'repeat_policy', 'date', 'split', 'next_action')),
  mode text not null check (mode in ('blocking', 'optional', 'batch', 'refinement')),
  status text not null check (status in ('pending', 'answered', 'dismissed')),
  options text[],
  materiality text check (materiality in ('low', 'medium', 'high')),
  rationale text,
  answer text,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create table capture_revision_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references capture_sessions(id) on delete cascade,
  source text not null check (source in ('clarification_answer', 'follow_up', 'fallback')),
  task_id uuid references tasks(id) on delete set null,
  action_id uuid references ai_actions(id) on delete set null,
  model text,
  confidence numeric check (confidence is null or confidence between 0 and 1),
  summary text not null,
  changes text[] not null default '{}',
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

create table planning_context (
  user_id uuid primary key references users(id) on delete cascade,
  default_day_start time,
  default_day_end time,
  default_available_minutes int,
  preferred_load_level text check (preferred_load_level in ('light', 'normal', 'heavy')),
  current_focus_note text,
  planning_preferences_json jsonb not null default '{}'::jsonb,
  recent_capacity_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index domains_user_status_idx on domains(user_id, status);
create index containers_user_status_idx on containers(user_id, status);
create index containers_user_domain_status_idx on containers(user_id, domain_id, status);
create index tasks_user_status_scheduled_idx on tasks(user_id, status, scheduled_for);
create index tasks_user_due_idx on tasks(user_id, due_on);
create index tasks_user_container_status_idx on tasks(user_id, container_id, status);
create index tasks_user_domain_status_idx on tasks(user_id, domain_id, status);
create index tasks_date_intent_gin_idx on tasks using gin(date_intent);
create index tasks_scheduling_gin_idx on tasks using gin(scheduling);
create index routine_templates_user_active_idx on routine_templates(user_id, active);
create index day_plans_user_status_idx on day_plans(user_id, status);
create index plan_items_user_day_sort_idx on plan_items(user_id, day_plan_id, sort_order);
create index plan_items_user_status_idx on plan_items(user_id, status);
create index execution_events_user_date_idx on execution_events(user_id, event_date desc);
create index execution_events_user_type_created_idx on execution_events(user_id, type, created_at desc);
create index inbox_items_user_created_idx on inbox_items(user_id, created_at desc);
create index ai_actions_user_created_idx on ai_actions(user_id, created_at desc);
create index ai_actions_user_status_idx on ai_actions(user_id, status);
create index capture_sessions_user_created_idx on capture_sessions(user_id, created_at desc);
create index capture_messages_session_created_idx on capture_messages(session_id, created_at);
create index clarification_questions_session_status_idx on clarification_questions(session_id, status);
create index capture_revision_events_session_created_idx on capture_revision_events(session_id, created_at);

