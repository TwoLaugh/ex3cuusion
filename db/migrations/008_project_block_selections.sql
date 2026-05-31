alter table app_runtime_state
  add column project_block_selections_json jsonb not null default '[]'::jsonb;
