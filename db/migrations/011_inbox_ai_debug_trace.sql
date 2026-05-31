alter table inbox_items
  add column if not exists ai_debug_trace jsonb;
