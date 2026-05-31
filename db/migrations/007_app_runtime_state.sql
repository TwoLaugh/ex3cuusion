create table app_runtime_state (
  user_id uuid primary key references users(id) on delete cascade,
  current_day date not null,
  current_clock time not null,
  available_minutes int not null check (available_minutes >= 0),
  deferrals_json jsonb not null default '[]'::jsonb,
  completions_json jsonb not null default '[]'::jsonb,
  entity_order_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
