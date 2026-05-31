alter table app_runtime_state
  add column daily_reviews_json jsonb not null default '[]'::jsonb;
