create table folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  external_id text not null,
  name text not null,
  parent_folder_id uuid references folders(id) on delete set null,
  weight numeric,
  can_block boolean not null default false,
  default_block_minutes int check (default_block_minutes is null or default_block_minutes > 0),
  context_note text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_id)
);
create index folders_user_status_idx on folders(user_id, status);
create index folders_user_parent_idx on folders(user_id, parent_folder_id);

alter table tasks add column folder_id uuid references folders(id) on delete set null;
alter table tasks alter column domain_id drop not null;
create index tasks_user_folder_status_idx on tasks(user_id, folder_id, status);

alter table app_runtime_state add column folder_block_selections_json jsonb not null default '[]'::jsonb;
